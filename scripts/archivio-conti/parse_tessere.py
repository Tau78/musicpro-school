#!/usr/bin/env python3
"""Estrae quote pagate dai fogli soci di Archivio Conti (ODS).

Regole (Mauro, 2026-10-16):
- 2018 Tessere 2018: colonna Quota = importo in euro
- 2019–2020 TESSERE: Quota valorizzata = pagato; € 1 è un flag → importo 10 €
- 2021 TESSERE e 2022 ASSOCIATI 2022: Quota = importo in euro (> 0)
- 2023 QUOTE 2023 e LIBRO ASSOCIATI, 2024 LIBRO ASSOCIATI:
  colonna «Quota ANNO» = data di pagamento, importo 15 €

Stdout: JSON {count, quotas}.
"""
from __future__ import annotations

import json
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

NS = {
    "table": "urn:oasis:names:tc:opendocument:xmlns:table:1.0",
    "text": "urn:oasis:names:tc:opendocument:xmlns:text:1.0",
}
T = "{urn:oasis:names:tc:opendocument:xmlns:table:1.0}"
O = "{urn:oasis:names:tc:opendocument:xmlns:office:1.0}"
TEXT = "{urn:oasis:names:tc:opendocument:xmlns:text:1.0}p"

SOURCES = [
    ("2018 Conti MP.ods", "Tessere 2018", 2018, "amount"),
    ("2019 Conti MP.ods", "TESSERE", 2019, "flag10"),
    ("2020 Conti MP.ods", "TESSERE", 2020, "flag10"),
    ("2021 Conti MP.ods", "TESSERE", 2021, "amount"),
    ("2022 Conti MP.ods", "ASSOCIATI 2022", 2022, "amount"),
    ("2023 Conti MP.ods", "QUOTE 2023", 2023, "date15"),
    ("2023 Conti MP.ods", "LIBRO ASSOCIATI", 2023, "date15"),
    ("2024 Conti MP.ods", "LIBRO ASSOCIATI", 2024, "date15"),
]


def cell_text(cell) -> str:
    parts = []
    for t in cell.iter(TEXT):
        bits = []
        if t.text:
            bits.append(t.text)
        for c in t:
            if c.text:
                bits.append(c.text)
            if c.tail:
                bits.append(c.tail)
        if bits:
            parts.append("".join(bits))
    return " ".join(p.strip() for p in parts if p and p.strip()).strip()


def parse_cell(cell) -> dict:
    kind = cell.get(O + "value-type") or ""
    raw = cell.get(O + "value")
    date = cell.get(O + "date-value")
    text = cell_text(cell)
    number = None
    if kind in ("currency", "float") and raw not in (None, ""):
        try:
            number = float(raw)
        except ValueError:
            number = None
    if date:
        date = date[:10]
    elif text and re.match(r"\d{1,2}/\d{1,2}/\d{2,4}", text):
        d, m, y = text.split("/")[:3]
        y = int(y)
        if y < 100:
            y += 2000
        date = f"{y:04d}-{int(m):02d}-{int(d):02d}"
    return {"text": text, "number": number, "date": date, "kind": kind}


def row_cells(row) -> list[dict]:
    cells = []
    for cell in row.findall("table:table-cell", NS):
        rep = int(cell.get(T + "number-columns-repeated") or 1)
        parsed = parse_cell(cell)
        empty = not parsed["text"] and parsed["number"] is None and not parsed["date"]
        if rep > 40 and empty:
            break
        for _ in range(min(rep, 40)):
            cells.append(parsed)
    return cells


def header_index(cells: list[dict]) -> dict[str, int]:
    idx = {}
    for i, c in enumerate(cells):
        key = re.sub(r"\s+", " ", c["text"].strip().lower())
        if key and key not in idx:
            idx[key] = i
    return idx


def col(idx: dict[str, int], *names: str) -> int:
    for n in names:
        if n in idx:
            return idx[n]
    return -1


def get(cells: list[dict], i: int) -> dict:
    if i < 0 or i >= len(cells):
        return {"text": "", "number": None, "date": None, "kind": ""}
    return cells[i]


def find_header(rows: list[list[dict]]) -> tuple[int, dict[str, int]]:
    for i, cells in enumerate(rows[:8]):
        idx = header_index(cells)
        if "nome" in idx and "cognome" in idx:
            return i, idx
    return 0, header_index(rows[0] if rows else [])


def load_sheet(path: Path, sheet_name: str) -> list[list[dict]]:
    root = ET.fromstring(zipfile.ZipFile(path).read("content.xml"))
    for sh in root.findall(".//table:table", NS):
        if sh.get(T + "name") == sheet_name:
            return [row_cells(r) for r in sh.findall("table:table-row", NS)]
    raise SystemExit(f"Foglio assente: {path.name} / {sheet_name}")


def extract(base: Path) -> list[dict]:
    out = []
    for filename, sheet, year, mode in SOURCES:
        rows = load_sheet(base / filename, sheet)
        hi, idx = find_header(rows)
        i_nome = col(idx, "nome")
        i_cog = col(idx, "cognome")
        i_cf = col(idx, "cf", "codice fiscale")
        i_data = col(idx, "data")
        i_quota = col(idx, "quota")
        i_year = col(idx, f"quota {year}")
        if i_nome < 0 or i_cog < 0:
            raise SystemExit(f"Header nome/cognome assente in {filename} {sheet}")
        if mode == "date15" and i_year < 0:
            raise SystemExit(f"Colonna Quota {year} assente in {filename} {sheet}")
        if mode != "date15" and i_quota < 0:
            raise SystemExit(f"Colonna Quota assente in {filename} {sheet}")

        for n, cells in enumerate(rows[hi + 1 :], start=hi + 2):
            nome = get(cells, i_nome)["text"].strip()
            cognome = get(cells, i_cog)["text"].strip()
            if not nome and not cognome:
                continue
            cf = re.sub(r"\s+", "", get(cells, i_cf)["text"]).upper()
            paid_at = None
            amount = None
            raw = None
            if mode == "date15":
                paid_at = get(cells, i_year)["date"]
                if not paid_at:
                    continue
                amount = 15.0
            else:
                q = get(cells, i_quota)
                raw = q["number"]
                if raw is None or raw <= 0:
                    continue
                if mode == "flag10" and raw == 1:
                    amount = 10.0
                else:
                    amount = raw
                paid_at = get(cells, i_data)["date"]
            out.append(
                {
                    "fiscal_year": year,
                    "first_name": nome,
                    "last_name": cognome,
                    "full_name": f"{nome} {cognome}".strip(),
                    "tax_code": cf,
                    "paid_at": paid_at,
                    "amount_eur": amount,
                    "raw_quota": raw,
                    "source_file": filename,
                    "source_sheet": sheet,
                    "source_row": n,
                }
            )
    return out


def dedupe(rows: list[dict]) -> list[dict]:
    best: dict[tuple, dict] = {}
    for r in rows:
        who = r["tax_code"] or re.sub(r"\s+", " ", r["full_name"].casefold())
        key = (r["fiscal_year"], who)
        prev = best.get(key)
        if not prev:
            best[key] = r
            continue
        a = prev.get("paid_at") or "9999"
        b = r.get("paid_at") or "9999"
        if b < a:
            best[key] = r
    return list(best.values())


def main():
    base = Path(sys.argv[1]).expanduser() if len(sys.argv) > 1 else Path(
        "/Users/mauroandreoni/Library/CloudStorage/GoogleDrive-andreoni.mauro@gmail.com/Drive condivisi/MusicPro/MusicPro/Documenti/Archivio Conti"
    )
    rows = dedupe(extract(base))
    rows.sort(key=lambda r: (r["fiscal_year"], r["last_name"], r["first_name"]))
    json.dump({"count": len(rows), "quotas": rows}, sys.stdout, ensure_ascii=False)
    print(file=sys.stdout)


if __name__ == "__main__":
    main()
