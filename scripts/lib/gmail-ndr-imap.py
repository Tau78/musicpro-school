#!/usr/bin/env python3
"""IMAP bounce NDR su Gmail (mailer-daemon). Credenziali da env, mai in stdout."""
from __future__ import annotations

import argparse
import email
import imaplib
import json
import os
import sys
from email.header import decode_header
from pathlib import Path

IMAP_HOST = "imap.gmail.com"
TRASH_CANDIDATES = ("[Gmail]/Cestino", "[Gmail]/Trash", "[Google Mail]/Trash")

# Gmail X-GM-RAW: cattura anche delay IT infilati nella conversazione
# (subject resta quello della campagna, body = "Consegna non completata").
GMAIL_NDR_RAW = (
    '(from:(mailer-daemon OR postmaster) OR '
    'subject:("delivery status notification" OR "consegna non completata" OR '
    '"undelivered mail" OR "failure notice") OR '
    '"consegna non completata" OR '
    '"delivery status notification (failure)" OR '
    '"delivery status notification (delay)")'
)


def load_dotenv_files() -> None:
    root = Path(__file__).resolve().parents[2]
    for p in (root / "musicpro" / ".env", root / ".env"):
        if not p.exists():
            continue
        for line in p.read_text(encoding="utf-8").splitlines():
            t = line.strip()
            if not t or t.startswith("#") or "=" not in t:
                continue
            k, v = t.split("=", 1)
            k, v = k.strip(), v.strip().strip('"').strip("'")
            os.environ.setdefault(k, v)


def decode_mime(value: str | None) -> str:
    if not value:
        return ""
    out: list[str] = []
    for part, enc in decode_header(value):
        if isinstance(part, bytes):
            out.append(part.decode(enc or "utf-8", "replace"))
        else:
            out.append(part)
    return "".join(out)


def message_text(msg: email.message.Message) -> str:
    chunks: list[str] = []
    if msg.is_multipart():
        for part in msg.walk():
            if part.get_content_type() == "text/plain":
                payload = part.get_payload(decode=True) or b""
                chunks.append(payload.decode(part.get_content_charset() or "utf-8", "replace"))
    else:
        payload = msg.get_payload(decode=True) or b""
        chunks.append(payload.decode(msg.get_content_charset() or "utf-8", "replace"))
    return "\n".join(chunks)


def connect() -> imaplib.IMAP4_SSL:
    user = (
        os.environ.get("NOTIFICHE_IMAP_USER")
        or os.environ.get("GOOGLE_SMTP_USER")
        or ""
    ).strip()
    password = (
        os.environ.get("NOTIFICHE_IMAP_APP_PASSWORD")
        or os.environ.get("GOOGLE_SMTP_APP_PASSWORD")
        or ""
    ).strip()
    if not user or not password:
        raise SystemExit("Missing NOTIFICHE_IMAP_* / GOOGLE_SMTP_USER + GOOGLE_SMTP_APP_PASSWORD")
    client = imaplib.IMAP4_SSL(IMAP_HOST, 993)
    client.login(user, password)
    return client


def find_trash(client: imaplib.IMAP4_SSL) -> str:
    typ, boxes = client.list()
    if typ == "OK" and boxes:
        for raw in boxes:
            if not raw:
                continue
            line = raw.decode("utf-8", "replace") if isinstance(raw, bytes) else str(raw)
            for cand in TRASH_CANDIDATES:
                if cand in line:
                    return cand
    for cand in TRASH_CANDIDATES:
        typ, _ = client.select(cand, readonly=True)
        if typ == "OK":
            return cand
    raise SystemExit("Cestino Gmail non trovato")


def _search_ok(client: imaplib.IMAP4_SSL, *args: str) -> list[bytes]:
    try:
        typ, data = client.uid("SEARCH", *args)
    except imaplib.IMAP4.error as exc:
        print(f"[imap] SEARCH fallita ({exc})", file=sys.stderr)
        return []
    if typ == "OK" and data and data[0]:
        return data[0].split()
    return []


def uid_search_ndr(client: imaplib.IMAP4_SSL) -> list[bytes]:
    """Preferisci X-GM-RAW; fallback IMAP classico (FROM + subject IT)."""
    quoted_raw = '"' + GMAIL_NDR_RAW.replace("\\", "\\\\").replace('"', '\\"') + '"'
    found = _search_ok(client, "X-GM-RAW", quoted_raw)
    if found:
        return found
    found = _search_ok(
        client,
        '(OR OR OR FROM "mailer-daemon" FROM "postmaster" SUBJECT "Consegna non completata" SUBJECT "Delivery Status Notification")',
    )
    if found:
        return found
    found = _search_ok(client, "FROM", "mailer-daemon")
    if found:
        return found
    return _search_ok(client, "FROM", "postmaster")


def cmd_fetch() -> None:
    client = connect()
    mailboxes = ("INBOX", "[Gmail]/Cestino")
    rows = []
    for mailbox in mailboxes:
        select_name = f'"{mailbox}"' if " " in mailbox else mailbox
        typ, _ = client.select(select_name, readonly=True)
        if typ != "OK":
            print(f"[imap] skip {mailbox}", file=sys.stderr)
            continue
        uids = uid_search_ndr(client)
        print(f"[imap] {mailbox}: {len(uids)} NDR", file=sys.stderr)
        for i, uid in enumerate(uids, start=1):
            if i % 50 == 0:
                print(f"[imap] {mailbox} fetch {i}/{len(uids)}", file=sys.stderr)
            typ, fetched = client.uid("FETCH", uid, "(RFC822)")
            if typ != "OK" or not fetched or not fetched[0]:
                continue
            raw = fetched[0][1]
            msg = email.message_from_bytes(raw)
            rows.append(
                {
                    "uid": uid.decode(),
                    "mailbox": mailbox,
                    "subject": decode_mime(msg.get("Subject")),
                    "date": msg.get("Date") or "",
                    "from": decode_mime(msg.get("From")),
                    "body": message_text(msg),
                }
            )
    client.logout()
    json.dump(rows, sys.stdout, ensure_ascii=False)


def cmd_trash(uids: list[str]) -> None:
    if not uids:
        print(json.dumps({"trashed": 0}))
        return
    client = connect()
    trash = find_trash(client)
    typ, _ = client.select("INBOX")
    if typ != "OK":
        raise SystemExit("INBOX non selezionabile")
    trashed = 0
    for uid in uids:
        copied = client.uid("COPY", uid, trash)
        if copied[0] == "OK":
            client.uid("STORE", uid, "+FLAGS", r"(\Deleted)")
            trashed += 1
    client.expunge()
    client.logout()
    print(json.dumps({"trashed": trashed, "trash": trash}))


def main() -> None:
    load_dotenv_files()
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=("fetch", "trash"))
    parser.add_argument("uids", nargs="*")
    args = parser.parse_args()
    if args.command == "fetch":
        cmd_fetch()
        return
    cmd_trash(args.uids)


if __name__ == "__main__":
    main()
