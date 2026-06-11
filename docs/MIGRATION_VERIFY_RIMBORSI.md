# Verifica import rimborsi storici (NOTULE → Supabase)

**Data verifica:** 11 giugno 2026  
**Script:** `scripts/verify-reimbursements-import.mjs`  
**Progetto Supabase:** `mlsiagbrejjylqvcnfbe`  
**Foglio sorgente:** `NOTULE` (spreadsheet GAS, vedi `scripts/migrate-from-sheets/config.js`)

---

## Riepilogo esecutivo

| Metrica | Foglio NOTULE | Supabase `reimbursements` | Esito |
|---------|---------------|---------------------------|-------|
| Righe dati totali | 136 | — | — |
| Righe importabili (nome + anno + progressivo + lordo > 0) | **135** | **135** | ✅ Allineato |
| Righe scartate (dati incompleti) | 1 | — | Atteso |
| Match associato fallito | 0 | — | ✅ (vs 7 segnalati in migrazione precedente) |
| Mancanti in DB | 0 | — | ✅ |
| Disallineamenti importi (lordo / ricevute) | 0 | — | ✅ |
| Righe extra in DB (non nel foglio) | 0 | — | ✅ |

**Conclusione:** l'import storico dei rimborsi è **completo e coerente** con il foglio NOTULE al momento della verifica. Non è necessaria una re-esecuzione di `npm run migrate:sheets -- --only=reimbursements`.

> **Nota sulla migrazione precedente:** un run precedente riportava ~128 inserimenti e 7 errori di match nome. Al 11/06/2026 tutte le 135 righe valide hanno un associato risolvibile e sono presenti in Supabase — probabilmente grazie a un re-run dopo il fix anagrafica o allineamento nomi.

---

## Conteggi dettagliati

### Foglio NOTULE

- **136** righe dati (esclusa intestazione)
- **135** righe valide per import
- **1** riga scartata dal mapper (campi obbligatori mancanti)

#### Riga scartata

| Riga foglio | Anno | Nome | Progressivo | Lordo | Motivo |
|-------------|------|------|-------------|-------|--------|
| 8 | 2026 | *(vuoto)* | *(vuoto)* | *(vuoto)* | Riga incompleta / bozza |

### Supabase `reimbursements`

| Campo | Valore |
|-------|--------|
| Totale righe | **135** |
| `fiscal_year` min / max | **2025** – **2026** |
| `pdf_url` NULL | **135 / 135** (100%) — atteso per storico |
| `receipts_amount_eur` > 0 | **132** |
| `receipts_notes` non vuote | **61** |
| `legacy_sheet_row` valorizzato | Sì (tracciabilità verso NOTULE) |

---

## Spot-check (5 righe casuali)

Confronto foglio vs DB su importo lordo e importo ricevute:

| Riga | Associato | Anno/Prog. | Lordo | Ricevute | Note | Esito |
|------|-----------|------------|-------|----------|------|-------|
| 40 | Marco Pendola | 2025/7 | 297,50 | 297,50 | — | ✅ |
| 20 | Davide Garbarino | 2025/11 | 320,00 | 320,00 | — | ✅ |
| 114 | Marco Pendola | 2026/2 | 770,00 | 770,00 | — | ✅ |
| 65 | Mauro Andreoni | 2025/9 | 1500,00 | 1500,00 | "allegate" | ✅ |
| 64 | Mauro Andreoni | 2025/8 | 1500,00 | 1500,00 | "allegate" | ✅ |

---

## Campioni DB (prime 5 righe per anno/progressivo)

| Anno | Prog. | Associato | Lordo € | Ricevute € | pdf_url |
|------|-------|-----------|---------|------------|---------|
| 2025 | 4 | Dario Sgueglia | 125,00 | 125,00 | NULL |
| 2025 | 1 | Davide Garbarino | 520,00 | 520,00 | NULL |
| 2025 | 2 | Davide Garbarino | 405,00 | 405,00 | NULL |
| 2025 | 3 | Davide Garbarino | 460,00 | 460,00 | NULL |
| 2025 | 4 | Davide Garbarino | 700,00 | 700,00 | NULL |

---

## Qualità dati

### Atteso e corretto

- **`pdf_url` NULL** su tutte le righe storiche — i PDF restano su Google Drive; il mapper imposta sempre `pdf_url: null` (vedi `scripts/migrate-from-sheets/mappers/reimbursements.js`).
- **`receipts_amount_eur`** importato dalla colonna K (`IMPORTO_RICEVUTE`); 132 righe con valore > 0.
- **`receipts_notes`** importato dalla colonna L (`RICEVUTE`); 61 righe con testo.
- **`receipts_status`** calcolato lato DB (enum `mancante` / `parziale` / `completo`) in base agli importi.
- **`member_id`** risolto da nome associato normalizzato (colonna G).

### Righe mancanti

Nessuna riga valida del foglio risulta assente in Supabase.

### Errori match associato

Nessuno al momento della verifica. In caso di nuove righe NOTULE con nomi non presenti in `members`, il mapper segnala `member not found` — eseguire prima `--only=members` o correggere l'anagrafica.

---

## Come ripetere la verifica

```bash
cd "/Users/mauroandreoni/Cursor/MusicPro School"

# Output leggibile
node scripts/verify-reimbursements-import.mjs

# Report JSON completo
node scripts/verify-reimbursements-import.mjs --json
```

**Prerequisiti** (in `musicpro/.env`):

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GOOGLE_SERVICE_ACCOUNT_JSON` (path al file service account con accesso in lettura al foglio)

---

## Azioni consigliate

1. **Nessuna azione urgente** sull'import storico — i dati sono allineati.
2. **PDF storici:** se servono link ai PDF Drive legacy, valutare un passaggio opzionale che copi gli URL dalla colonna H NOTULE in `pdf_url` (oggi volutamente escluso).
3. **Nuovi rimborsi:** registrare solo tramite il pannello Next.js `/admin/rimborsi` (Supabase), non più via GAS/NOTULE dopo il cutover.
4. **Monitoraggio:** rieseguire lo script di verifica dopo eventuali import manuali o re-run parziali.

---

## Riferimenti

- Mapping colonne: `supabase/README.md` § `reimbursements` ← NOTULE
- Mapper: `scripts/migrate-from-sheets/mappers/reimbursements.js`
- Costanti GAS: `LOG_COL_INDEX` in `scripts/migrate-from-sheets/config.js` (mirror di `Codice.js`)
