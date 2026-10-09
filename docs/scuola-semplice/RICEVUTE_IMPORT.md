# ScuolaSemplice — Elenco ricevute (audit 2026-10-09)

## File archiviato

| | |
| --- | --- |
| Path locale (Mac mini) | `docs/scuola-semplice/archivio/Elenco_ricevute_2023-01-01-2026-10-09.xls` |
| Origine upload | Cursor uploads `Elenco_ricevute_2023-01-01-2026-10-09_6652.xls` |
| Span | 01/01/2023 → 09/10/2026 |
| Società | Associazione Culturale M.P. (02535720995) |
| SHA-256 | vedi `archivio/Elenco_ricevute_2023-01-01-2026-10-09.sha256` |
| Git | **xls gitignored** (PII); in repo restano doc + hash |

L’xls **non** va committato. Per un futuro import: file sul Mac mini al path sopra (o re-export SS con stesso span).

## Decisione prodotto (2026-10-09)

**Non importare ora per le quote associative.**  
Fonte quote = `Ordini.xls` → `member_annual_quotas` (già fatto).

Le ricevute hanno senso in seguito solo come **storico documentale / fiscale** (n. ricevuta, data emissione, metodo di pagamento, importo incassato), in tabella dedicata — non come secondo backfill quote.

## Struttura export

Sheet `Ricevute.xls`. Righe 0–5 = metadati report; **header riga 6**:

| Colonna | Contenuto |
| --- | --- |
| Numero ricevuta | intero SS |
| Data emissione | `DD/MM/YYYY` |
| Destinatario | **chi paga** (spesso tutore, a volte allievo) |
| Importo totale | può essere bundle (quota + lezioni) |
| Descrizione | blocchi `- Ordine n/YYYY del DD/MM/YYYY` + voci |
| Stato | nel campione: tutte `Pagato` |
| Metodo di pagamento | Contanti, Bonifico, Stripe, Paypal, Nexi, Carta, Bancomat |

## Volumi (audit)

| Metrica | Valore |
| --- | --- |
| Ricevute dati | 1259 |
| Con testo «Quota Associativa» | 261 |
| Solo quota (≈ €15, senza altre voci) | ~107 a €15; molte altre sono saldi/bundle |
| Senza quota (rette/corsi) | 998 |
| Anni (da `Ordine n/YYYY` in descrizione) | 2023–2026 |

## Incrocio con Ordini (conferma quote)

Chiave naturale: **`Ordine {numero}/{anno}`** in descrizione ricevuta ↔ colonna `Numero ordine` + `Anno` in Ordini (solo righe con Quota Associativa).

Risultato audit:

- **264/264** blocchi quota+ordine nelle ricevute matchano un ordine quota in Ordini → **0 orfani**
- Destinatario ≈ tutore Ordini: ~176; ≈ allievo: ~87; dubbio: 1

Quindi le ricevute **confermano** Ordini; non le migliorano per attributire l’allievo (in ~173/264 blocchi quota manca il nome allievo in descrizione).

### Allievo–Tutore

- Fonte primaria: Ordini `Studente / Genitore` (già usato + `tutor_links`).
- Ricevute: utili in **conferma** quando Destinatario = tutore Ordini; da sole deboli (slash `Corso / Allievo` rumoroso).

## Suggerimento schema futuro (`ss_receipts` / simile)

Solo se Mauro chiede storico fiscale. Matching consigliato: `ss_order_number` + `ss_order_year` → quota/membro già in School.

```sql
-- Bozza (non applicata). Nome tabella da confermare.
CREATE TABLE IF NOT EXISTS public.ss_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ss_receipt_number INTEGER NOT NULL,
  issued_at DATE NOT NULL,
  payee_name TEXT NOT NULL,              -- Destinatario (chi paga)
  amount_eur NUMERIC(12,2) NOT NULL,     -- importo ricevuta (può includere rette)
  description TEXT,
  payment_status TEXT,                   -- es. Pagato
  payment_method TEXT,                   -- Contanti, Bonifico, Stripe, …
  ss_order_number INTEGER,               -- da descrizione, se presente
  ss_order_year INTEGER,
  ss_order_date DATE,
  has_quota_associativa BOOLEAN NOT NULL DEFAULT false,
  member_id UUID REFERENCES public.members(id),           -- match soft (destinatario o allievo)
  quota_member_id UUID REFERENCES public.members(id),     -- allievo della quota se noto via Ordini
  fiscal_year INTEGER,                   -- anno quota se has_quota
  source_file TEXT,
  source_row INTEGER,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ss_receipt_number, issued_at)  -- o solo ss_receipt_number se univoco in SS
);

CREATE INDEX IF NOT EXISTS ss_receipts_order_idx
  ON public.ss_receipts (ss_order_year, ss_order_number)
  WHERE ss_order_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS ss_receipts_member_idx
  ON public.ss_receipts (member_id)
  WHERE member_id IS NOT NULL;
```

Note implementazione:

1. Parser dedicato (header riga 6; split blocchi `Ordine`).
2. `has_quota_associativa` da regex su descrizione; **non** usare `amount_eur` come 15 € fissi se bundle.
3. Join a Ordini/quota già importata per riempire `quota_member_id` / `fiscal_year`.
4. Non overwrite `member_annual_quotas` da questo file.
5. Dry-run + report match prima di `--write`.

## Riferimenti

- Import quote: `scripts/import-scuola-semplice-quotas.mjs`, skill `.cursor/skills/scuola-semplice-import/`
- Ordini export correlato: upload `Ordini_66d2.xls` (2026-10-08), già scritto in `member_annual_quotas`
