-- MusicPro School — Fetta 8: prova gratuita (is_trial) + lezione kind=prova
-- Bozza anagrafica già in members (029). Magic link = app_settings iscrizione_token (30g in app).
-- Checkout quota+pack in conversione = fetta 9.

ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS is_trial BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS trial_reschedule_used BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS converted_to_course_id UUID REFERENCES public.courses (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_courses_is_trial
  ON public.courses (is_trial)
  WHERE is_trial = true;

COMMENT ON COLUMN public.courses.is_trial IS
  'Prova gratuita: una lezione, attivo subito, niente hold. 0 € famiglia e notula.';
COMMENT ON COLUMN public.courses.trial_reschedule_used IS
  'True dopo la unica riprogrammazione no-show.';
COMMENT ON COLUMN public.courses.converted_to_course_id IS
  'Corso vero creato dalla conversione (già attivo).';

ALTER TABLE public.lessons
  DROP CONSTRAINT IF EXISTS lessons_kind_check;

ALTER TABLE public.lessons
  ADD CONSTRAINT lessons_kind_check
    CHECK (kind IN ('regular', 'recupero', 'prova'));

COMMENT ON COLUMN public.lessons.kind IS
  'regular | recupero (1:1 extra collettivo) | prova (singolo slot gratuito).';
