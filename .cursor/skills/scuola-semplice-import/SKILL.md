---
name: scuola-semplice-import
description: >-
  Import quote associative (e anagrafica parziale) da export Ordini
  ScuolaSemplice verso MusicPro School Supabase. Use when the user says
  #ss-import, ScuolaSemplice, Ordini.xls, backfill quote, or drops an
  Ordini export for quota import on Mac mini.
---

# ScuolaSemplice → School (`#ss-import`)

**Invocazione:** `#ss-import` (o “import ScuolaSemplice” / file Ordini).  
Casa: `~/.cursor/skills/scuola-semplice-import/`. Copia repo: `MusicPro School/.cursor/skills/scuola-semplice-import/`.  
Gira sul **Mac mini** (`.env` + service role locali). Non è VAI.

## Quando usare

Mauro esporta da ScuolaSemplice **Gestione finanziaria → Ordini** (span date lungo, colonne ricche) e passa il file. L’agente fa dry-run, report match, poi write solo a conferma.

## Target DB

| Destinazione | Chiave | Note |
| --- | --- | --- |
| `member_annual_quotas` | `(member_id, fiscal_year)` | Solo righe con «Quota Associativa»; importo tipico **15 €** |
| `members` / `tutor_links` | match nome (+ CF se affidabile) | Solo se manca il membro o il link tutore — non sostituire ASSOCIATI GAS |

Riusa matching di `scripts/migrate-from-sheets/` (`resolveMemberIdFromQuoteName`, CF, fuzzy cognome).

## Parsing obbligatorio

1. Filtra dettagli che contengono `Quota Associativa` (anche in bundle con lezioni: conta comunque **una** quota 15 €).
2. `Studente / Genitore`:
   - `Nome Cognome` → associato adulto (= member della quota)
   - `Nome Cognome/Nome Cognome` → **allievo / tutore** (quota sull’**allievo**)
3. Su righe slash: email/cell = tutore. **CF su slash = spesso CF tutore**, non allievo — non attribuirlo all’allievo.
4. Dedup: una quota per `(allievo, fiscal_year)`; se più ordini, tieni `paid_at` più vecchio.
5. `Anno` = `fiscal_year`; `Data ordine` = `paid_at`.

Dettaglio colonne note + trappole: [reference.md](reference.md).

## Workflow agente

```
- [ ] 1. Ricevi file (xls/xlsx/csv) — path assoluto o uploads/
- [ ] 2. Dry-run parse + match (default, nessuna scrittura)
- [ ] 3. Mostra report: matched / unmatched / dubbi CF / tutor da creare
- [ ] 4. Attendi OK esplicito di Mauro per --write
- [ ] 5. Write quote; opzionale --create-missing / --tutor-links solo se chiesto
- [ ] 6. Verifica count member_annual_quotas per gli anni toccati
```

### Comandi (repo MusicPro School)

```bash
cd "/Users/mauroandreoni/Cursor/MusicPro School"

# Parse + match, zero write
node scripts/import-scuola-semplice-quotas.mjs --file "/path/Ordini.xls" --dry-run

# Dopo OK Mauro
node scripts/import-scuola-semplice-quotas.mjs --file "/path/Ordini.xls" --write

# Opzionali (solo se Mauro lo chiede)
node scripts/import-scuola-semplice-quotas.mjs --file "…" --write --create-missing
node scripts/import-scuola-semplice-quotas.mjs --file "…" --write --tutor-links
```

Requisiti: `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` in `.env` o `musicpro/.env`.  
XLS corrotti ScuolaSemplice: il parser Python usa `xlrd` con `ignore_workbook_corruption=True` (venv sotto `scripts/scuola-semplice/.venv` se manca).

## Cosa non fare

- Non fare VAI / deploy solo per questo import.
- Non overwrite quote già pagate in DB salvo `--update-existing` esplicito.
- Non inventare CF allievo da righe slash.
- Non importare rette/lezioni (Batteria 120 € ecc.) come quote.
- Non chiedere conferma se Mauro ha già detto `#ss-import` + `--write` / «scrivi».

## File nuovi / più colonne

Se l’export ha colonne extra (CF allievo separato, CF tutore, indirizzi, anni 2023–2026): mappa le nuove header in `scripts/scuola-semplice/parse_ordini.py` + aggiorna [reference.md](reference.md). Non rompere i nomi header già noti.
