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

## Elenco ricevute (non quote)

Export SS «Elenco ricevute»: audit 2026-10-09 in [`docs/scuola-semplice/RICEVUTE_IMPORT.md`](../../../docs/scuola-semplice/RICEVUTE_IMPORT.md).  
File locale: `docs/scuola-semplice/archivio/Elenco_ricevute_2023-01-01-2026-10-09.xls` (gitignored).  
**Non** usare per backfill `member_annual_quotas`; eventuale futuro `ss_receipts` (storico fiscale / metodo pagamento).
