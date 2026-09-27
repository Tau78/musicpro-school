-- Docente: spostare e annullare lezioni è il default.
-- Creare corsi e chiudere restano spenti.

ALTER TABLE public.teacher_profiles
  ALTER COLUMN can_reschedule SET DEFAULT true;

UPDATE public.teacher_profiles
SET can_reschedule = true
WHERE can_reschedule = false;

COMMENT ON COLUMN public.teacher_profiles.can_reschedule IS
  'Sposta e annulla lezioni del proprio corso, e piazza i recuperi. Default sì. Se false: lo spostamento diventa una richiesta.';
