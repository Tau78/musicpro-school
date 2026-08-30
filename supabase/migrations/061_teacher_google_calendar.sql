-- MusicPro School — GCal personale docente (OAuth)
-- Token OAuth per sync lezioni sul calendario primario del docente.

CREATE TABLE public.teacher_google_calendars (
  member_id     UUID PRIMARY KEY REFERENCES public.members (id) ON DELETE CASCADE,
  refresh_token TEXT NOT NULL,
  calendar_id   TEXT NOT NULL DEFAULT 'primary',
  google_email  TEXT,
  connected_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.teacher_google_calendars IS
  'OAuth Google Calendar del docente (calendario primario). Refresh token per upsert eventi lezione.';

CREATE TRIGGER trg_teacher_google_calendars_updated_at
  BEFORE UPDATE ON public.teacher_google_calendars
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.lessons
  ADD COLUMN IF NOT EXISTS teacher_google_event_id TEXT;

COMMENT ON COLUMN public.lessons.teacher_google_event_id IS
  'ID evento sul GCal personale del titolare (OAuth docente).';

ALTER TABLE public.teacher_google_calendars ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.teacher_google_calendars
  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.teacher_google_calendars
  TO service_role;

CREATE POLICY "teacher_google_calendars_select_own"
  ON public.teacher_google_calendars FOR SELECT
  TO authenticated
  USING (
    public.is_admin_or_segreteria()
    OR member_id = public.current_member_id()
  );

CREATE POLICY "teacher_google_calendars_manage_own"
  ON public.teacher_google_calendars FOR ALL
  TO authenticated
  USING (member_id = public.current_member_id())
  WITH CHECK (member_id = public.current_member_id());

CREATE POLICY "teacher_google_calendars_manage_staff"
  ON public.teacher_google_calendars FOR ALL
  TO authenticated
  USING (public.is_admin_or_segreteria())
  WITH CHECK (public.is_admin_or_segreteria());
