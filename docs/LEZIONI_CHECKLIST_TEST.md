# Checklist test lezioni (15 passi)

**Account:** docente `andreoni.mauro@gmail.com` · allievo test `mauro.andreoni@gmail.com` (`is_test_account`)  
**Sala:** solo **Sala test lezioni** (`sandbox-test`)  
**Smoke:** `npm run smoke:lezioni` · live: `npm run smoke:lezioni -- --live`

| # | Step | Esito |
|---|------|-------|
| 1 | `supabase db push` (096–098) + deploy web | ☐ |
| 2 | Rubrica: allievo test con flag **Account test** attivo | ☐ |
| 3 | Crea corso individuale test (docente Andreoni, sala test, prezzo > 0) | ☐ |
| 4 | Iscrivi solo `mauro.andreoni@gmail.com` | ☐ |
| 5 | Approva corso (staff) o crea come staff già attivo | ☐ |
| 6 | Piazza 4 lezioni in calendario sulla sala test | ☐ |
| 7 | Primo pacchetto: incasso contanti o crediti lezione (+4 ledger) | ☐ |
| 8 | Lezioni 1–3: presenza **Presente** → consumo −1 ciascuna | ☐ |
| 9 | Lezione 4: **Presente** → saldo 0, retta pack **aperta**, email link Nexi all'allievo | ☐ |
| 10 | Rette: verifica riga pack; link `/api/lezioni/checkout` → pagina Nexi (test) | ☐ |
| 11 | Dopo pagamento Nexi test: +4 crediti, retta chiusa/allocata | ☐ |
| 12 | Sollecito: imposta scadenza passata + cron o invio manuale → mail su mauro.andreoni | ☐ |
| 13 | Ricevuta incasso: codice **TEST/n/anno** (non S/) | ☐ |
| 14 | Notula mese docente test: serie **TEST** in bozza | ☐ |
| 15 | Fine test: elimina righe `fiscal_receipts` section TEST + notule `document_series=TEST` | ☐ |

## Automazione

- Alla **4ª presenza** confermata: RPC wallet apre retta + UI chiama `/api/lezioni/pack-payment/request` (link Nexi + email).
- Prenotazioni sala live **non** usano la sala test (associati non la vedono).

## Pulizia dati test

```sql
DELETE FROM public.fiscal_receipt_lines
WHERE receipt_id IN (SELECT id FROM public.fiscal_receipts WHERE section = 'TEST');
DELETE FROM public.fiscal_receipts WHERE section = 'TEST';
DELETE FROM public.lesson_payroll_lines
WHERE payroll_id IN (SELECT id FROM public.lesson_payrolls WHERE document_series = 'TEST');
DELETE FROM public.lesson_payrolls WHERE document_series = 'TEST';
```
