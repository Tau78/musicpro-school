-- Sezionali ricevuta a 3 lettere: SCH QUO SER SAL EST (+ TEST invariato).
-- I documenti già emessi restano con il codice storico (QU/SA/LE/…).

COMMENT ON TABLE public.fiscal_receipts IS
  'Ricevute fiscali sezionali: SCH lezioni, QUO quota, SER commerciale, SAL sala, EST esterni non associati, TEST prove. '
  'Codice {section}/{n}/{anno}. Stati emessa, sostituita, annullata.';

INSERT INTO public.fiscal_receipt_counters_v2 (year, section, next_n)
SELECT DISTINCT y.year, s.section, 1
FROM (
  SELECT year FROM public.fiscal_receipt_counters_v2
  UNION
  SELECT year FROM public.fiscal_receipts
  UNION
  SELECT EXTRACT(YEAR FROM (now() AT TIME ZONE 'Europe/Rome'))::INTEGER
) AS y(year)
CROSS JOIN (
  VALUES ('SCH'), ('QUO'), ('SER'), ('SAL'), ('EST')
) AS s(section)
ON CONFLICT (year, section) DO NOTHING;

UPDATE public.fiscal_receipt_counters_v2 AS c
SET next_n = GREATEST(c.next_n, o.next_n)
FROM public.fiscal_receipt_counters_v2 AS o
WHERE c.section = 'SCH' AND o.section = 'LE' AND c.year = o.year;

UPDATE public.fiscal_receipt_counters_v2 AS c
SET next_n = GREATEST(c.next_n, o.next_n)
FROM public.fiscal_receipt_counters_v2 AS o
WHERE c.section = 'QUO' AND o.section = 'QU' AND c.year = o.year;

UPDATE public.fiscal_receipt_counters_v2 AS c
SET next_n = GREATEST(c.next_n, o.next_n)
FROM public.fiscal_receipt_counters_v2 AS o
WHERE c.section = 'SAL' AND o.section = 'SA' AND c.year = o.year;

-- Massimi da ricevute già emesse (se contatori legacy assenti)
UPDATE public.fiscal_receipt_counters_v2 AS c
SET next_n = GREATEST(c.next_n, b.next_n)
FROM (
  SELECT year, MAX(number_n) + 1 AS next_n
  FROM public.fiscal_receipts
  WHERE section IN ('LE', 'S', 'SCH')
  GROUP BY year
) AS b
WHERE c.section = 'SCH' AND c.year = b.year;

UPDATE public.fiscal_receipt_counters_v2 AS c
SET next_n = GREATEST(c.next_n, b.next_n)
FROM (
  SELECT year, MAX(number_n) + 1 AS next_n
  FROM public.fiscal_receipts
  WHERE section IN ('QU', 'QUO')
  GROUP BY year
) AS b
WHERE c.section = 'QUO' AND c.year = b.year;

UPDATE public.fiscal_receipt_counters_v2 AS c
SET next_n = GREATEST(c.next_n, b.next_n)
FROM (
  SELECT year, MAX(number_n) + 1 AS next_n
  FROM public.fiscal_receipts
  WHERE section IN ('SA', 'SAL')
  GROUP BY year
) AS b
WHERE c.section = 'SAL' AND c.year = b.year;
