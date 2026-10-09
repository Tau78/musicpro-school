# ScuolaSemplice — Rette studenti (audit 2026-10-09)

## File archiviati

| | Canonicale | Variante `(1)` |
| --- | --- | --- |
| Path locale | `docs/scuola-semplice/archivio/Rette_studenti.xls` | `…/Rette_studenti__1__.xls` |
| Upload | `Rette_studenti_2a72.xls` | `Rette_studenti__1__450c.xls` |
| Righe dati | **82** | 75 (sottoinsieme) |
| SHA-256 | `archivio/Rette_studenti.xls.sha256` | `…__1__.xls.sha256` |
| Git | xls **gitignored**; doc + hash in repo |

Usare sempre il file **più grande** (`Rette_studenti.xls`): la variante `(1)` non ha righe extra.

## Decisione prodotto (2026-10-09)

**Non importare ora in School.**

- Non è fonte quote → vedi Ordini / [ORDINI_IMPORT.md](./ORDINI_IMPORT.md).
- Non mappare ancora su `lesson_pack_dues` / wallet lezioni senza piano di cutover SS → School lezioni.
- Conservare come snapshot **«da ricevere»** (solleciti / debito aperto in SS).

## Struttura export

Sheet `Docenti`. Header riga 0:

| Colonna | Contenuto |
| --- | --- |
| Iscritto / Referente | allievo o `allievo/tutore` |
| Contatti | email, cell |
| Ordine n. | `Ordine n. NNN/YYYY` |
| Rata | `Rata 1 di 1`, nome corso (`Batteria`, …), o `Quota Associativa` |
| Scadenza rata / Emesso il / Scadenza pagamento | `DD/MM/YYYY` |
| Rata da pagare | importo € |
| Stato | nel campione: tutte **`DA RICEVERE`** |
| Metodo di pagamento | spesso vuoto |
| Sede | es. A.C. MusicPro |
| Docente | nomi + colore sala (Rossa / Arancio / …) |

## Volumi (canonical)

| Metrica | Valore |
| --- | --- |
| Righe | 82 |
| Stato | 82 × DA RICEVERE |
| Anni ordine | 2025: 6 · 2026: 76 |
| Somma «Rata da pagare» | € 6 860 |
| Di cui `Quota Associativa` | 9 × €15 |
| Tipi rata (es.) | Rata 1 di 1 (44), Batteria (18), Chitarra (6), … |

Differenza vs `(1)`: +7 righe (5 quote 2026 + 2 rate lezione).

## Incrocio Ordini / quote School

- Chiave: `Ordine n. N/YYYY` ↔ Ordini `Numero ordine` + `Anno`.
- Le 9 quote in Rette sono **non pagate in SS**; Ordini le ha comunque (alcune con `Da saldare > 0`). L’import quote le ha potenzialmente scritte come pagate — vedi caveat in [ORDINI_IMPORT.md](./ORDINI_IMPORT.md).
- Il resto sono **rette / pacchetti lezione** (30–120 €), fuori da `member_annual_quotas`.

## Suggerimento schema futuro (`ss_tuition_installments` / simile)

Solo se si vuole storico o solleciti SS in School (o bootstrap `lesson_pack_dues`). Matching: ordine SS → membro; docente/sala come testo libero.

```sql
-- Bozza (non applicata).
CREATE TABLE IF NOT EXISTS public.ss_tuition_installments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ss_order_number INTEGER NOT NULL,
  ss_order_year INTEGER NOT NULL,
  student_raw TEXT NOT NULL,           -- Iscritto / Referente
  student_name TEXT NOT NULL,          -- prima parte slash
  tutor_name TEXT,                     -- seconda parte se presente
  contacts TEXT,
  installment_label TEXT NOT NULL,     -- Rata 1 di 1 | Batteria | Quota Associativa | …
  due_at DATE,
  issued_at DATE,
  payment_due_at DATE,
  amount_eur NUMERIC(12,2) NOT NULL,
  status TEXT NOT NULL,                -- DA RICEVERE, …
  payment_method TEXT,
  venue TEXT,
  teacher_raw TEXT,                    -- Docente + eventuali colori sala
  is_quota_associativa BOOLEAN NOT NULL DEFAULT false,
  member_id UUID REFERENCES public.members(id),
  source_file TEXT,
  source_row INTEGER,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ss_order_year, ss_order_number, installment_label, amount_eur, due_at)
);

CREATE INDEX IF NOT EXISTS ss_tuition_member_idx
  ON public.ss_tuition_installments (member_id)
  WHERE member_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ss_tuition_open_idx
  ON public.ss_tuition_installments (status)
  WHERE status ILIKE '%RICEVERE%';
```

Note:

1. **Non** scrivere queste righe in `member_annual_quotas`.
2. Eventuale bridge verso `lesson_pack_dues` solo dopo mappa corsi SS → `courses` School.
3. Preferire re-export SS aggiornato prima di un import (snapshot «da ricevere» decade in fretta).

## Riferimenti

- Quote: [ORDINI_IMPORT.md](./ORDINI_IMPORT.md)
- Ricevute (pagato): [RICEVUTE_IMPORT.md](./RICEVUTE_IMPORT.md)
- Piano rette native School: `docs/PIANO_LEZIONI.md` (§ rette / `lesson_pack_dues`)
