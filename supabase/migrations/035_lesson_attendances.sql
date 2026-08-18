-- MusicPro School — Fetta 7: presenze + parcheggio da recuperare
-- Timezone: Europe/Rome in app; timestamptz UTC in DB.
-- Wallet / consumo pack = fetta 9. Mese notula chiuso = fetta 11.

-- ---------------------------------------------------------------------------
-- lessons — kind / recupero / placement da_recuperare
-- ---------------------------------------------------------------------------
ALTER TABLE public.lessons
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'regular',
  ADD COLUMN IF NOT EXISTS recovered_from_lesson_id UUID REFERENCES public.lessons (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS makeup_member_id UUID REFERENCES public.members (id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS parked_reason TEXT,
  ADD COLUMN IF NOT EXISTS original_starts_at TIMESTAMPTZ;

ALTER TABLE public.lessons
  DROP CONSTRAINT IF EXISTS lessons_placement_check;

ALTER TABLE public.lessons
  ADD CONSTRAINT lessons_placement_check
    CHECK (placement IN ('scheduled', 'da_piazzare', 'da_recuperare'));

ALTER TABLE public.lessons
  DROP CONSTRAINT IF EXISTS lessons_kind_check;

ALTER TABLE public.lessons
  ADD CONSTRAINT lessons_kind_check
    CHECK (kind IN ('regular', 'recupero'));

ALTER TABLE public.lessons
  DROP CONSTRAINT IF EXISTS lessons_parked_reason_check;

ALTER TABLE public.lessons
  ADD CONSTRAINT lessons_parked_reason_check
    CHECK (
      parked_reason IS NULL
      OR parked_reason IN (
        'giustificato',
        'cancellata_scuola',
        'docente_assente'
      )
    );

COMMENT ON COLUMN public.lessons.kind IS
  'regular = occorrenza del corso; recupero = slot 1:1 extra (assente giustificato in collettivo).';
COMMENT ON COLUMN public.lessons.recovered_from_lesson_id IS
  'Lezione origine se kind=recupero (collettivo, un allievo).';
COMMENT ON COLUMN public.lessons.makeup_member_id IS
  'Allievo del recupero 1:1. NULL = recupero dell''intera lezione (individuale / cancellata scuola).';
COMMENT ON COLUMN public.lessons.parked_reason IS
  'Perché è da_recuperare: giustificato | cancellata_scuola | docente_assente.';
COMMENT ON COLUMN public.lessons.original_starts_at IS
  'Orario originale (UTC) quando si parcheggia; utile in coda.';
COMMENT ON COLUMN public.lessons.placement IS
  'scheduled | da_piazzare (generazione) | da_recuperare (presenza/assenza docente).';

CREATE INDEX IF NOT EXISTS idx_lessons_placement_kind
  ON public.lessons (placement, kind);

CREATE INDEX IF NOT EXISTS idx_lessons_recovered_from
  ON public.lessons (recovered_from_lesson_id)
  WHERE recovered_from_lesson_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- lesson_attendances — una riga per allievo per lezione
-- cancellata_scuola è a livello lezione (placement + parked_reason), non qui.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lesson_attendances (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id   UUID NOT NULL REFERENCES public.lessons (id) ON DELETE CASCADE,
  member_id   UUID NOT NULL REFERENCES public.members (id) ON DELETE RESTRICT,
  status      TEXT NOT NULL,
  marked_by   UUID REFERENCES public.members (id) ON DELETE SET NULL,
  marked_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT lesson_attendances_unique UNIQUE (lesson_id, member_id),
  CONSTRAINT lesson_attendances_status_check
    CHECK (status IN ('presente', 'assente', 'assente_giustificato'))
);

CREATE INDEX IF NOT EXISTS idx_lesson_attendances_lesson
  ON public.lesson_attendances (lesson_id);

CREATE INDEX IF NOT EXISTS idx_lesson_attendances_member
  ON public.lesson_attendances (member_id);

COMMENT ON TABLE public.lesson_attendances IS
  'Registro allievi. Default UI = tutti presenti (si toglie chi manca). Nessuna riga = da inserire.';
COMMENT ON COLUMN public.lesson_attendances.status IS
  'presente | assente (consuma pack, fetta 9) | assente_giustificato (parcheggia recupero, no pack).';

CREATE TRIGGER trg_lesson_attendances_updated_at
  BEFORE UPDATE ON public.lesson_attendances
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS — stesso perimetro delle lessons
-- ---------------------------------------------------------------------------
ALTER TABLE public.lesson_attendances ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.lesson_attendances TO authenticated;

CREATE POLICY "lesson_attendances_select_docente"
  ON public.lesson_attendances FOR SELECT
  TO authenticated
  USING (
    public.has_member_role('docente'::public.member_role)
    AND EXISTS (
      SELECT 1
      FROM public.lessons l
      WHERE l.id = lesson_id
        AND public.is_course_teacher(l.course_id)
    )
  );

CREATE POLICY "lesson_attendances_write_docente"
  ON public.lesson_attendances FOR ALL
  TO authenticated
  USING (
    public.has_member_role('docente'::public.member_role)
    AND EXISTS (
      SELECT 1
      FROM public.lessons l
      WHERE l.id = lesson_id
        AND public.is_course_titular(l.course_id)
    )
  )
  WITH CHECK (
    public.has_member_role('docente'::public.member_role)
    AND EXISTS (
      SELECT 1
      FROM public.lessons l
      WHERE l.id = lesson_id
        AND public.is_course_titular(l.course_id)
    )
  );

CREATE POLICY "lesson_attendances_manage_staff"
  ON public.lesson_attendances FOR ALL
  TO authenticated
  USING (public.is_admin_or_segreteria())
  WITH CHECK (public.is_admin_or_segreteria());
