# ScuolaSemplice — Ordini (quote associative)

## File archiviato

| | |
| --- | --- |
| Path locale (Mac mini) | `docs/scuola-semplice/archivio/Ordini_2023-2026.xls` |
| Origine upload | Cursor uploads `Ordini_183c.xls` (2026-10-09) |
| SHA-256 | vedi `archivio/Ordini_2023-2026.xls.sha256` |
| Identico a | upload precedente `Ordini_66d2.xls` (stesso hash) |
| Git | **xls gitignored** (PII); in repo restano doc + hash |

## Destinazione

`member_annual_quotas` via `scripts/import-scuola-semplice-quotas.mjs` + skill `#ss-import`.

## Stato backfill (2026-10-09)

Dry-run sullo stesso file:

| Metrica | Valore |
| --- | --- |
| Persone quota (dopo split multi-allievo) | 254 |
| Matched members | 254 |
| Unmatched | 0 |
| Already in DB | 254 |
| Would insert / update | **0 / 0** |

**Nessun ulteriore write necessario.** Quote 2023–2026 già scritte nella sessione precedente (alias + create-missing + merge anagrafica).

## Caveat vs Rette «DA RICEVERE»

L’import Ordini tratta ogni riga con «Quota Associativa» come quota pagata (`Data ordine` → `paid_at`), **senza filtrare** `Da saldare > 0`.

In Rette studenti compaiono ~9 quote 2026 ancora `DA RICEVERE`; alcune risultano già in `member_annual_quotas` come pagate da Ordini. Non correggere indietro senza decisione esplicita (cancellare / flag `unpaid`).

Miglioramento futuro opzionale: in `parse_ordini.py` escludere (o marcare) righe con `Da saldare` che copre ancora i 15 € di quota.

## Riferimenti

- Skill: `.cursor/skills/scuola-semplice-import/`
- Parser: `scripts/scuola-semplice/parse_ordini.py`
- Cross-check fiscale: [RICEVUTE_IMPORT.md](./RICEVUTE_IMPORT.md)
