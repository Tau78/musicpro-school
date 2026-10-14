-- Tutore Anita Fiore: scheda ex import (Vera Cordano) → Fabio Fiore, telefono aggiornato.

UPDATE public.members
SET
  first_name = 'Fabio',
  last_name = 'Fiore',
  phone = '393471184637',
  updated_at = now()
WHERE id = '462ec54a-4e5d-40aa-9ac9-c0111b786fd6'
  AND lower(trim(email)) = 'fiore.fab@libero.it';

UPDATE public.pilot_cohort_members
SET notes = 'Fabio Fiore — tutore Anita (fiore.fab@libero.it)'
WHERE member_id = '462ec54a-4e5d-40aa-9ac9-c0111b786fd6';
