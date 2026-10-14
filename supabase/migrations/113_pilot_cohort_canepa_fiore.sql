-- Pilot lezioni reali — Annalia Canepa, Anita Fiore; tutori Maria Vita Lucchetti, Fabio Fiore (login).

ALTER TABLE public.pilot_cohort_members
  DROP CONSTRAINT IF EXISTS pilot_cohort_members_role_in_cohort_check;

ALTER TABLE public.pilot_cohort_members
  ADD CONSTRAINT pilot_cohort_members_role_in_cohort_check
  CHECK (role_in_cohort IN ('teacher', 'student', 'tutor', 'other'));

INSERT INTO public.pilot_cohort_members (member_id, cohort_key, role_in_cohort, notes)
VALUES
  (
    '93f1c95a-a43d-4452-9e46-756449bd5339',
    'pilot_2026-10',
    'student',
    'Annalia Canepa — allieva'
  ),
  (
    '90bf0d5c-8c06-483e-90b2-56367594fbb6',
    'pilot_2026-10',
    'student',
    'Anita Isabella Fiore — allieva'
  ),
  (
    'a8ab156e-9288-4f68-8500-7779a4eb69bf',
    'pilot_2026-10',
    'tutor',
    'Maria Vita Lucchetti — tutore Annalia (mariavitalucchetti@gmail.com)'
  ),
  (
    '462ec54a-4e5d-40aa-9ac9-c0111b786fd6',
    'pilot_2026-10',
    'tutor',
    'Fabio Fiore — tutore Anita (fiore.fab@libero.it)'
  )
ON CONFLICT (member_id) DO UPDATE
SET
  cohort_key = EXCLUDED.cohort_key,
  role_in_cohort = EXCLUDED.role_in_cohort,
  notes = EXCLUDED.notes;
