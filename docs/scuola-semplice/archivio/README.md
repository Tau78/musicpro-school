# Archivio export ScuolaSemplice / SuperSaaS (locale)

File `.xls` / `.xlsx` / SpreadsheetML con dati personali: **gitignored**.

| File atteso | Doc |
| --- | --- |
| `Elenco_ricevute_2023-01-01-2026-10-09.xls` | [../RICEVUTE_IMPORT.md](../RICEVUTE_IMPORT.md) |
| `Ordini_2023-2026.xls` | [../ORDINI_IMPORT.md](../ORDINI_IMPORT.md) |
| `Rette_studenti.xls` (canonical) | [../RETTE_IMPORT.md](../RETTE_IMPORT.md) |
| `Rette_studenti__1__.xls` (sottoinsieme) | [../RETTE_IMPORT.md](../RETTE_IMPORT.md) |
| `MusicPro_supersaas.xls` | [../MUSICPRO_SUPERSAAS_EXPORT.md](../MUSICPRO_SUPERSAAS_EXPORT.md) |

Hash SHA-256: `*.sha256` (committati) per verificare che il file locale non sia stato sostituito.

## Regola

- **Backfill quote** solo da Ordini (`#ss-import`).
- Ricevute / Rette / MusicPro: archivio + doc; tabelle dedicate solo a richiesta.
