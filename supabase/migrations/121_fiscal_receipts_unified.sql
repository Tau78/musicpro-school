-- Ricevute fiscali unificate: sezionali QU / SA / LE oltre a S (didattica).
-- Riferimento generico source_type + source_id; payment_id resta per lesson_pack_payments.

-- ---------------------------------------------------------------------------
-- Unicità progressivo per sezionale
-- ---------------------------------------------------------------------------
ALTER TABLE public.fiscal_receipts
  DROP CONSTRAINT IF EXISTS fiscal_receipts_year_n_unique;

ALTER TABLE public.fiscal_receipts
  ADD CONSTRAINT fiscal_receipts_year_section_n_unique
  UNIQUE (year, section, number_n);

-- ---------------------------------------------------------------------------
-- Stato: annullata (numero_n resta assegnato, buco in sequenza)
-- ---------------------------------------------------------------------------
ALTER TABLE public.fiscal_receipts
  DROP CONSTRAINT IF EXISTS fiscal_receipts_status_check;

ALTER TABLE public.fiscal_receipts
  ADD CONSTRAINT fiscal_receipts_status_check
  CHECK (status IN ('emessa', 'sostituita', 'annullata'));

-- ---------------------------------------------------------------------------
-- Origine pagamento / prenotazione (oltre a payment_id per pack lezioni)
-- ---------------------------------------------------------------------------
ALTER TABLE public.fiscal_receipts
  ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'lesson_pack';

ALTER TABLE public.fiscal_receipts
  ADD COLUMN IF NOT EXISTS source_id UUID NULL;

ALTER TABLE public.fiscal_receipts
  DROP CONSTRAINT IF EXISTS fiscal_receipts_source_type_check;

ALTER TABLE public.fiscal_receipts
  ADD CONSTRAINT fiscal_receipts_source_type_check
  CHECK (
    source_type IN (
      'lesson_pack',
      'room_booking',
      'quota_payment',
      'credit_shop',
      'manual'
    )
  );

-- payment_id già nullable; esplicito per ambienti che lo avessero NOT NULL
ALTER TABLE public.fiscal_receipts
  ALTER COLUMN payment_id DROP NOT NULL;

UPDATE public.fiscal_receipts
SET
  source_type = 'lesson_pack',
  source_id = COALESCE(source_id, payment_id)
WHERE payment_id IS NOT NULL;

-- Una ricevuta emessa per sorgente (sostituita / annullata non occupa lo slot)
CREATE UNIQUE INDEX IF NOT EXISTS fiscal_receipts_source_emessa_uidx
  ON public.fiscal_receipts (source_type, source_id)
  WHERE status = 'emessa' AND source_id IS NOT NULL;

COMMENT ON TABLE public.fiscal_receipts IS
  'Ricevute fiscali sezionali: S didattica, QU quota associativa, SA sala, LE altro. '
  'Codice {section}/{n}/{anno}. Stati emessa, sostituita, annullata (il numero non si riusa). '
  'source_type + source_id per quota, sala, shop crediti; payment_id per pack lezioni.';

-- ---------------------------------------------------------------------------
-- Contatori QU / SA / LE anno solare corrente (Roma)
-- ---------------------------------------------------------------------------
INSERT INTO public.fiscal_receipt_counters_v2 (year, section, next_n)
SELECT
  EXTRACT(YEAR FROM (now() AT TIME ZONE 'Europe/Rome'))::INTEGER,
  s.section,
  1
FROM (VALUES ('QU'), ('SA'), ('LE')) AS s(section)
ON CONFLICT (year, section) DO NOTHING;
