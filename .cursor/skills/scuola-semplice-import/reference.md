# ScuolaSemplice Ordini — reference

## Export atteso

Fonte: ScuolaSemplice → ordini (export XLS/XLSX/CSV).  
Primo campione (2026-09-29): `Ordini_a5be.xls`, sheet `Ordini`, 345 righe, solo anno 2026.  
Export successivo: Mauro allarga lo span (da ~2023) e aggiunge dettagli — aggiorna questa tabella se cambiano le header.

## Colonne note (sample 2026)

| Header SS | Uso import |
| --- | --- |
| Anno | `fiscal_year` |
| Prezzo | totale ordine (può essere 15 o 15+lezioni) |
| Dettagli ordine | filtro `Quota Associativa`; ignora solo lezioni |
| Studente / Genitore | allievo **o** `allievo/tutore` |
| Indirizzo e-mail | contatto (su slash = tutore) |
| Cellulare / Telefono | contatto |
| Codice Fiscale | solo se riga **senza** slash → CF associato; con slash → sospetto CF tutore |
| Data di nascita / Luogo / Prov. | anagrafica (spesso vuota su minori) |
| CAP / Città / Provincia / Indirizzo | residenza (sparse) |
| Data ordine | `paid_at` |
| Genere / Partita IVA / Paese | opzionali |

## Regole prodotto

- Quota associativa School = **15 €** (`QUOTA_ASSOCIATIVA_CENTESIMI = 1500`).
- Bundle es.: `Quota Associativa - 15 €` + `Batteria - 120 €` → Prezzo 135, ma `amount_paid_eur` quota = **15**.
- Una riga `member_annual_quotas` per `(member_id, fiscal_year)`.
- Member della quota = **allievo** (prima parte dello slash), non il tutore.

## Match members (ordine)

1. CF affidabile (solo non-slash, CF normalizzato uppercase)
2. `resolveMemberIdFromQuoteName` (exact → accent-strip → cognome+nome → fuzzy)
3. Report unmatched: non creare membri senza `--create-missing`

## Tutori

Da `allievo/tutore`:

- Match/crea tutore come `members` solo con `--create-missing` / `--tutor-links`
- `tutor_links`: `(tutor_member_id, ward_member_id)`
- Contatti email/cell sulla riga → campi tutore, non allievo

## Dedup

Chiave logica: `normalize(allievo) + fiscal_year`.  
Più ordini quota stesso anno → tieni `paid_at` minimo; notes possono citare `ss_ordini_row=…`.

## Script

| File | Ruolo |
| --- | --- |
| `scripts/scuola-semplice/parse_ordini.py` | XLS/XLSX/CSV → JSON normalizzato (solo quote) |
| `scripts/import-scuola-semplice-quotas.mjs` | Match Supabase + dry-run / write |

## Verifica post-write

```bash
node scripts/verify-quota-import.mjs   # se ancora allineato a sheet GAS
# oppure query ad-hoc: count member_annual_quotas per fiscal_year in (2023..2026)
```

## Altri export (non quote) — archivio 2026-10-09

| Export | Doc | Archivio locale | Backfill? |
| --- | --- | --- | --- |
| Ordini (quota) | [`ORDINI_IMPORT.md`](../../../docs/scuola-semplice/ORDINI_IMPORT.md) | `Ordini_2023-2026.xls` | Già fatto (254/254); re-run dry-run = 0 insert |
| Elenco ricevute | [`RICEVUTE_IMPORT.md`](../../../docs/scuola-semplice/RICEVUTE_IMPORT.md) | `Elenco_ricevute_….xls` | No → futuro `ss_receipts` |
| Rette studenti | [`RETTE_IMPORT.md`](../../../docs/scuola-semplice/RETTE_IMPORT.md) | `Rette_studenti.xls` | No → futuro `ss_tuition_installments` |
| MusicPro.xls (SuperSaaS) | [`MUSICPRO_SUPERSAAS_EXPORT.md`](../../../docs/scuola-semplice/MUSICPRO_SUPERSAAS_EXPORT.md) | `MusicPro_supersaas.xls` | No storico massivo; live = mirror SuperSaaS |

Tutti gli xls sotto `docs/scuola-semplice/archivio/` sono **gitignored** (PII); in git restano doc + `*.sha256`.
