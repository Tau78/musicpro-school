#!/usr/bin/env python3
"""Parse ScuolaSemplice Ordini export → JSON list of quota rows (stdout).

Supports .xls (xlrd, ignore corruption), .xlsx (openpyxl if present), .csv.
Filters rows whose "Dettagli ordine" contains "Quota Associativa".

Usage:
  python3 parse_ordini.py /path/Ordini.xls > quotas.json
"""
from __future__ import annotations

import csv
import json
import re
import sys
from pathlib import Path


QUOTA_MARKER = "Quota Associativa"
QUOTA_AMOUNT = 15.0
ANNO_RE = re.compile(r"Anno:\s*(\d{4})", re.IGNORECASE)
ROLE_PREFIX_RE = re.compile(r"^(Cliente|Docente|Studente)\s*-\s*", re.IGNORECASE)
QUOTA_CLAUSE_RE = re.compile(
    r"quota associativa\s*\(anno:\s*\d{4}[^)]*\)",
    re.IGNORECASE,
)


def nonempty(v) -> bool:
    if v is None:
        return False
    s = str(v).strip()
    return s not in ("", "0", "0.0")


def split_student_parent(raw: str) -> tuple[str, str, str]:
    name = " ".join(str(raw or "").split())
    if "/" in name:
        left, right = name.split("/", 1)
        return left.strip(), right.strip(), "allievo/tutore"
    return name, "", "associato_solo"


def xldate_to_iso(value, datemode: int = 0):
    if not value:
        return None
    try:
        import xlrd

        return xlrd.xldate_as_datetime(value, datemode).date().isoformat()
    except Exception:
        s = str(value).strip()
        return s or None


def normalize_row(headers: list[str], values: list, *, datemode: int = 0, row_num: int):
    d = {headers[i]: values[i] if i < len(values) else "" for i in range(len(headers))}
    # tolerant header aliases
    def get(*names):
        for n in names:
            if n in d:
                return d[n]
        lower = {str(k).strip().lower(): v for k, v in d.items()}
        for n in names:
            if n.lower() in lower:
                return lower[n.lower()]
        return ""

    dettagli = str(get("Dettagli ordine", "Dettagli", "Descrizione") or "")
    if QUOTA_MARKER not in dettagli:
        return None

    student_raw = get("Studente / Genitore", "Studente/Genitore", "Studente", "Cliente")
    allievo, tutore, kind = split_student_parent(student_raw)

    anno = get("Anno", "Anno fiscale", "Fiscal year")
    try:
        fiscal_year = int(float(anno)) if nonempty(anno) else None
    except (TypeError, ValueError):
        fiscal_year = None

    prezzo = get("Prezzo", "Importo", "Totale")
    try:
        order_total = float(prezzo) if nonempty(prezzo) else None
    except (TypeError, ValueError):
        order_total = None

    data_ordine = get("Data ordine", "Data Ordine", "Data")
    if isinstance(data_ordine, float):
        paid_at = xldate_to_iso(data_ordine, datemode)
    else:
        paid_at = str(data_ordine).strip()[:10] if nonempty(data_ordine) else None

    nascita = get("Data di nascita", "Data nascita")
    if isinstance(nascita, float):
        birth = xldate_to_iso(nascita, datemode)
    else:
        birth = str(nascita).strip()[:10] if nonempty(nascita) else None

    cf = str(get("Codice Fiscale", "CF", "Codice fiscale") or "").strip()
    # slash rows: CF is usually the tutor's — do not treat as student CF
    cf_student = cf if kind == "associato_solo" and cf else ""
    cf_suspect_tutor = cf if kind == "allievo/tutore" and cf else ""

    cell = get("Cellulare", "Telefono cellulare", "Mobile")
    if isinstance(cell, float) and cell:
        cell = str(int(cell))
    else:
        cell = str(cell or "").strip()

    lines = [ln.strip() for ln in dettagli.splitlines() if ln.strip()]
    pure = lines == [f"{QUOTA_MARKER} - 15 €"] or lines == [f"{QUOTA_MARKER} - 15€"]

    return {
        "source_row": row_num,
        "fiscal_year": fiscal_year,
        "paid_at": paid_at,
        "quota_amount_eur": QUOTA_AMOUNT,
        "order_total_eur": order_total,
        "bundled_with_lessons": not pure,
        "kind": kind,
        "allievo": allievo,
        "tutore": tutore,
        "email": str(get("Indirizzo e-mail", "Email", "E-mail") or "").strip(),
        "phone": cell,
        "cf_student": cf_student.upper() if cf_student else "",
        "cf_suspect_tutor": cf_suspect_tutor.upper() if cf_suspect_tutor else "",
        "birth_date": birth,
        "birth_place": str(get("Luogo di nascita") or "").strip(),
        "address_street": str(get("Indirizzo") or "").strip(),
        "address_city": str(get("Città", "Citta") or "").strip(),
        "address_postal_code": (
            str(int(get("CAP")))
            if isinstance(get("CAP"), float) and get("CAP")
            else str(get("CAP") or "").strip()
        ),
        "address_province": str(get("Provincia") or "").strip(),
        "gender": str(get("Genere") or "").strip(),
        "dettagli": " | ".join(lines),
        "raw_headers_present": headers,
    }


def strip_role(name: str) -> str:
    return ROLE_PREFIX_RE.sub("", " ".join(str(name or "").split())).strip()


def parse_it_date(value, datemode: int = 0):
    if isinstance(value, float) and value > 20000:
        return xldate_to_iso(value, datemode)
    s = str(value or "").strip()
    m = re.match(r"(\d{1,2})/(\d{1,2})/(\d{4})", s)
    if m:
        day, month, year = m.groups()
        return f"{int(year):04d}-{int(month):02d}-{int(day):02d}"
    return s[:10] if s else None


def is_prima_nota(headers: list[str]) -> bool:
    lower = {h.strip().lower() for h in headers}
    return "studente beneficiario" in lower and "descrizione" in lower


def find_header(sh):
    for r in range(min(30, sh.nrows)):
        headers = [str(sh.cell_value(r, c)).strip() for c in range(sh.ncols)]
        blob = " | ".join(headers).lower()
        if "dettagli ordine" in blob or (
            "studente beneficiario" in blob and "descrizione" in blob
        ):
            return r, headers
    headers = [str(sh.cell_value(0, c)).strip() for c in range(sh.ncols)]
    return 0, headers


def normalize_prima_nota(headers: list[str], values: list, *, datemode: int, row_num: int):
    d = {headers[i]: values[i] if i < len(values) else "" for i in range(len(headers))}

    def get(*names):
        lower = {str(k).strip().lower(): v for k, v in d.items()}
        for n in names:
            if n.lower() in lower:
                return lower[n.lower()]
        return ""

    causale = str(get("Causale") or "")
    if causale.strip().lower().startswith("pagamento docente"):
        return []

    dettagli = str(get("Descrizione") or "")
    if QUOTA_MARKER.lower() not in dettagli.lower():
        return []

    years = []
    for year in ANNO_RE.findall(dettagli):
        y = int(year)
        if y not in years:
            years.append(y)
    if not years:
        return []

    allievo = strip_role(get("Studente beneficiario"))
    cliente = strip_role(get("Cliente"))
    if not allievo:
        allievo = cliente
    if not allievo:
        return []

    if cliente and cliente.casefold() != allievo.casefold():
        kind, tutore = "allievo/tutore", cliente
    else:
        kind, tutore = "associato_solo", ""

    paid_at = None
    for key in ("Data Reg.", "Data Doc.", "Data ordine"):
        paid_at = parse_it_date(get(key), datemode)
        if paid_at:
            break

    rest = QUOTA_CLAUSE_RE.sub(" ", dettagli)
    rest = re.sub(r"\bsaldo\b", " ", rest, flags=re.IGNORECASE)
    rest = re.sub(r"[^0-9A-Za-zÀ-ÿ]", "", rest)
    bundled = bool(rest)

    out = []
    for year in years:
        out.append(
            {
                "source_row": row_num,
                "fiscal_year": year,
                "paid_at": paid_at,
                "quota_amount_eur": QUOTA_AMOUNT,
                "order_total_eur": None,
                "bundled_with_lessons": bundled,
                "kind": kind,
                "allievo": allievo,
                "tutore": tutore,
                "email": "",
                "phone": "",
                "cf_student": "",
                "cf_suspect_tutor": "",
                "birth_date": None,
                "birth_place": "",
                "address_street": "",
                "address_city": "",
                "address_postal_code": "",
                "address_province": "",
                "gender": "",
                "dettagli": " ".join(dettagli.split()),
                "raw_headers_present": headers,
            }
        )
    return out


def read_xls(path: Path):
    import xlrd

    wb = xlrd.open_workbook(str(path), ignore_workbook_corruption=True)
    sh = wb.sheet_by_index(0)
    header_row, headers = find_header(sh)
    prima = is_prima_nota(headers)
    rows = []
    for r in range(header_row + 1, sh.nrows):
        values = [sh.cell_value(r, c) for c in range(sh.ncols)]
        if prima:
            recs = normalize_prima_nota(
                headers, values, datemode=wb.datemode, row_num=r + 1
            )
        else:
            rec = normalize_row(headers, values, datemode=wb.datemode, row_num=r + 1)
            recs = [rec] if rec else []
        rows.extend(recs)
    return rows, "prima_nota" if prima else "ordini"


def read_xlsx(path: Path):
    try:
        import openpyxl
    except ImportError as e:
        raise SystemExit("openpyxl required for .xlsx — pip install openpyxl") from e
    wb = openpyxl.load_workbook(str(path), read_only=True, data_only=True)
    sh = wb.active
    it = sh.iter_rows(values_only=True)
    headers = [str(h or "").strip() for h in next(it)]
    rows = []
    for i, values in enumerate(it, start=2):
        rec = normalize_row(headers, list(values or []), row_num=i)
        if rec:
            rows.append(rec)
    return rows, "ordini"


def read_csv(path: Path):
    with path.open(newline="", encoding="utf-8-sig") as f:
        reader = csv.reader(f)
        headers = [str(h or "").strip() for h in next(reader)]
        rows = []
        for i, values in enumerate(reader, start=2):
            rec = normalize_row(headers, values, row_num=i)
            if rec:
                rows.append(rec)
        return rows, "ordini"


def main():
    if len(sys.argv) < 2:
        print("Usage: parse_ordini.py <Ordini.xls|xlsx|csv>", file=sys.stderr)
        sys.exit(2)
    path = Path(sys.argv[1]).expanduser().resolve()
    if not path.exists():
        print(f"File not found: {path}", file=sys.stderr)
        sys.exit(1)
    suf = path.suffix.lower()
    if suf == ".xls":
        rows, fmt = read_xls(path)
    elif suf in (".xlsx", ".xlsm"):
        rows, fmt = read_xlsx(path)
    elif suf == ".csv":
        rows, fmt = read_csv(path)
    else:
        print(f"Unsupported extension: {suf}", file=sys.stderr)
        sys.exit(1)

    # dedup allievo+year → earliest paid_at
    best: dict[tuple[str, int | None], dict] = {}
    for r in rows:
        key = (r["allievo"].casefold(), r["fiscal_year"])
        prev = best.get(key)
        if not prev:
            best[key] = r
            continue
        a, b = prev.get("paid_at") or "9999", r.get("paid_at") or "9999"
        if b < a:
            best[key] = r

    out = sorted(best.values(), key=lambda x: (x.get("paid_at") or "", x["allievo"]))
    json.dump(
        {"source": str(path), "format": fmt, "count": len(out), "quotas": out},
        sys.stdout,
        ensure_ascii=False,
        indent=2,
    )
    print(file=sys.stdout)


if __name__ == "__main__":
    main()
