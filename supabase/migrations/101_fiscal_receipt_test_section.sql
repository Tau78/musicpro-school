-- Sezionale TEST per ricevute didattica (associati is_test_account o sezione esplicita).

CREATE TABLE IF NOT EXISTS public.fiscal_receipt_counters_v2 (
  year     INTEGER NOT NULL,
  section  TEXT NOT NULL DEFAULT 'S',
  next_n   INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (year, section),
  CONSTRAINT fiscal_receipt_counters_v2_n_check CHECK (next_n >= 1)
);

INSERT INTO public.fiscal_receipt_counters_v2 (year, section, next_n)
SELECT year, 'S', next_n
FROM public.fiscal_receipt_counters
ON CONFLICT (year, section) DO NOTHING;

ALTER TABLE public.fiscal_receipts
  ADD COLUMN IF NOT EXISTS section TEXT NOT NULL DEFAULT 'S';

UPDATE public.fiscal_receipts
SET section = 'S'
WHERE section IS NULL OR section = '';

CREATE OR REPLACE FUNCTION public.next_fiscal_receipt_number(
  p_year INTEGER,
  p_section TEXT DEFAULT 'S'
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_section TEXT := upper(trim(COALESCE(p_section, 'S')));
  v_n INTEGER;
BEGIN
  IF v_section = '' THEN
    v_section := 'S';
  END IF;

  INSERT INTO public.fiscal_receipt_counters_v2 (year, section, next_n)
  VALUES (p_year, v_section, 1)
  ON CONFLICT (year, section) DO UPDATE
    SET next_n = public.fiscal_receipt_counters_v2.next_n + 1
  RETURNING next_n INTO v_n;

  RETURN v_n;
END;
$$;

ALTER TABLE public.lesson_payrolls
  ADD COLUMN IF NOT EXISTS document_series TEXT NOT NULL DEFAULT 'S';

COMMENT ON COLUMN public.lesson_payrolls.document_series IS
  'Serie documento notula: S produzione, TEST prove (svuotabile a fine test).';
