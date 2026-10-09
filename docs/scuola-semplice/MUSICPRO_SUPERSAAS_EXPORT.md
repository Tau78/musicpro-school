# SuperSaaS — export calendario «MusicPro.xls» (audit 2026-10-09)

## File archiviato

| | |
| --- | --- |
| Path locale (Mac mini) | `docs/scuola-semplice/archivio/MusicPro_supersaas.xls` |
| Origine upload | Cursor uploads `MusicPro_9ba7.xls` |
| Formato | SpreadsheetML XML (`<?mso-application progid="Excel.Sheet"?>`), non OLE `.xls` binario |
| SHA-256 | `archivio/MusicPro_supersaas.xls.sha256` |
| Git | **xls gitignored** (PII); doc + hash in repo |

Nonostante la cartella `scuola-semplice/`, questo file **non** è un export ScuolaSemplice: è lo scarico calendario **SuperSaaS** (schedule sale MusicPro).

## Decisione prodotto (2026-10-09)

**Non backfill massivo in `bookings`.**

- Prenotazioni **future** SuperSaaS: già gestite da `scripts/import-supersaas-bookings.mjs` + mirror (poche righe live in DB).
- Questo export è quasi tutto **storico** (ultima `Inizio` nel file: 2026-10-05; 0 righe ≥ 2026-10-09).
- Importare 900+ passate gonfierebbe il calendario School senza bisogno operativo immediato.

Conservare per audit, conteggi storici, e eventuale tabella dedicata / import selettivo.

## Struttura

Sheet `MusicPro`. Header riga 0:

| Colonna | Contenuto |
| --- | --- |
| MusicPro | slot prodotto (es. `Rossa 2h`, `Arancio 2,5h`) |
| Inizio / Fine | ISO DateTime UTC |
| Creato da / Aggiornato da | email operatore |
| ID | id prenotazione SuperSaaS (univoco) |
| Nome e cognome | intestatario |
| Provi da solo? | numerico / flag compagni |
| Iscrizione e Quota Associativa | testo stato quota gruppo |
| Stato | esito pagamento SS |
| Creato il / Aggiornato il | timestamp |
| Prezzo | importo |
| Risorse | sala (`Rossa` / `Arancio` / `Blu`) |

## Volumi (audit)

| Metrica | Valore |
| --- | --- |
| Prenotazioni | 934 (ID univoci) |
| Span Inizio | 2024-12-19 → 2026-10-05 |
| Persone distinte | 71 |
| Sale (Risorse) | Rossa 423 · Arancio 294 · Blu 217 |
| Top slot | Rossa 2h (266), Arancio 2h (235), Blu 2h (125) |
| Stati | Pagamento ricevuto 513 · con crediti 384 · crediti illimitati 27 · admin 8 · altri |

Campo quota (non usare come fonte `member_annual_quotas`):

- «Siamo tutti in regola con la quota» ≈ 829
- vuoto / da iscrivere / quota da versare ≈ 105

## Incrocio School

- Chiave naturale: colonna `ID` ↔ `bookings.external_id` con `external_source = 'supersaas'`.
- Al 2026-10-09 School ha solo il mirror recente (ordine di poche unità), non lo storico 934.

## Suggerimento schema futuro (`ss_room_bookings` / simile)

Solo se serve storico sale senza mischiarlo al calendario operativo, oppure staging prima di un backfill selettivo.

```sql
-- Bozza (non applicata).
CREATE TABLE IF NOT EXISTS public.ss_room_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supersaas_id TEXT NOT NULL UNIQUE,   -- colonna ID
  slot_label TEXT,                     -- es. Rossa 2h
  room_name TEXT,                      -- Risorse
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  booker_name TEXT,
  created_by_email TEXT,
  updated_by_email TEXT,
  companions_flag TEXT,                -- Provi da solo?
  quota_group_status TEXT,             -- Iscrizione e Quota Associativa
  payment_status_raw TEXT,             -- Stato
  price_eur NUMERIC(12,2),
  supersaas_created_at TIMESTAMPTZ,
  supersaas_updated_at TIMESTAMPTZ,
  member_id UUID REFERENCES public.members(id),
  booking_id UUID REFERENCES public.bookings(id), -- se promosso in live
  source_file TEXT,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ss_room_bookings_starts_idx
  ON public.ss_room_bookings (starts_at);
```

Note:

1. Parser: XML SpreadsheetML (non `xlrd` OLE).
2. Non promuovere in `bookings` senza filtro date + dedup su `external_id`.
3. Quota gruppo nel file è informativa; fonte quote resta Ordini.

## Riferimenti

- Import live SuperSaaS: `scripts/import-supersaas-bookings.mjs`, `scripts/lib/supersaas-mirror-sync.mjs`
- Migration: `supabase/migrations/086_supersaas_booking_import.sql`
