-- Pilot lezioni (ott 2026): eventi UX client + cohort monitorata per analisi post-uso.

CREATE TABLE public.pilot_cohort_members (
  member_id       UUID PRIMARY KEY REFERENCES public.members (id) ON DELETE CASCADE,
  cohort_key      TEXT NOT NULL DEFAULT 'pilot_2026-10',
  role_in_cohort  TEXT NOT NULL CHECK (role_in_cohort IN ('teacher', 'student', 'tutor', 'other')),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.pilot_cohort_members IS
  'Membri nel pilot da monitorare (timeline eventi). Aggiungere gli allievi reali quando noti.';

CREATE INDEX idx_pilot_cohort_members_cohort
  ON public.pilot_cohort_members (cohort_key);

INSERT INTO public.pilot_cohort_members (member_id, cohort_key, role_in_cohort, notes)
SELECT m.id, 'pilot_2026-10', 'teacher', 'Docente pilot — andreoni.mauro@gmail.com'
FROM public.members m
WHERE lower(trim(m.email)) = 'andreoni.mauro@gmail.com'
ON CONFLICT (member_id) DO NOTHING;

-- ---------------------------------------------------------------------------
CREATE TABLE public.product_usage_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id   UUID NOT NULL REFERENCES public.members (id) ON DELETE CASCADE,
  event_type  TEXT NOT NULL CHECK (event_type IN ('screen_view', 'action', 'error', 'session')),
  event_name  TEXT NOT NULL,
  route       TEXT,
  properties  JSONB NOT NULL DEFAULT '{}'::jsonb,
  session_id  TEXT,
  client      TEXT NOT NULL DEFAULT 'web',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.product_usage_events IS
  'Eventi prodotto (navigazione, azioni) per migliorare UX; retention limitata al pilot.';

CREATE INDEX idx_product_usage_events_member_created
  ON public.product_usage_events (member_id, created_at DESC);

CREATE INDEX idx_product_usage_events_created
  ON public.product_usage_events (created_at DESC);

CREATE INDEX idx_product_usage_events_name_created
  ON public.product_usage_events (event_name, created_at DESC);

ALTER TABLE public.pilot_cohort_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_usage_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pilot_cohort_select_staff"
  ON public.pilot_cohort_members FOR SELECT
  USING (public.is_admin_or_segreteria());

CREATE POLICY "pilot_cohort_mutate_staff"
  ON public.pilot_cohort_members FOR ALL
  USING (public.is_admin_or_segreteria())
  WITH CHECK (public.is_admin_or_segreteria());

CREATE POLICY "product_usage_events_select_staff"
  ON public.product_usage_events FOR SELECT
  USING (public.is_admin_or_segreteria());

-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_product_usage_event(
  p_event_name  TEXT,
  p_event_type  TEXT DEFAULT 'action',
  p_route       TEXT DEFAULT NULL,
  p_properties  JSONB DEFAULT '{}'::jsonb,
  p_session_id  TEXT DEFAULT NULL,
  p_client      TEXT DEFAULT 'web'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member_id UUID;
  v_id UUID;
  v_type TEXT;
BEGIN
  v_member_id := public.current_member_id();
  IF v_member_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.pilot_cohort_members pcm WHERE pcm.member_id = v_member_id
  ) THEN
    RETURN NULL;
  END IF;

  v_type := lower(trim(coalesce(p_event_type, 'action')));
  IF v_type NOT IN ('screen_view', 'action', 'error', 'session') THEN
    RAISE EXCEPTION 'invalid_event_type';
  END IF;

  INSERT INTO public.product_usage_events (
    member_id,
    event_type,
    event_name,
    route,
    properties,
    session_id,
    client
  ) VALUES (
    v_member_id,
    v_type,
    left(trim(p_event_name), 200),
    left(trim(p_route), 500),
    coalesce(p_properties, '{}'::jsonb),
    left(trim(p_session_id), 80),
    left(coalesce(nullif(trim(p_client), ''), 'web'), 40)
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.log_product_usage_event IS
  'Append evento UX per utente autenticato (client web/mobile).';

REVOKE ALL ON FUNCTION public.log_product_usage_event(TEXT, TEXT, TEXT, JSONB, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_product_usage_event(TEXT, TEXT, TEXT, JSONB, TEXT, TEXT) TO authenticated;

GRANT SELECT ON TABLE public.pilot_cohort_members TO authenticated;
GRANT SELECT ON TABLE public.product_usage_events TO authenticated;

-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_pilot_usage_events(
  p_since TIMESTAMPTZ DEFAULT (now() - interval '14 days'),
  p_limit INT DEFAULT 1000
)
RETURNS TABLE (
  event_id UUID,
  created_at TIMESTAMPTZ,
  member_id UUID,
  email TEXT,
  display_name TEXT,
  role_in_cohort TEXT,
  event_type TEXT,
  event_name TEXT,
  route TEXT,
  properties JSONB,
  session_id TEXT,
  client TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    e.id AS event_id,
    e.created_at,
    e.member_id,
    m.email,
    trim(coalesce(m.first_name, '') || ' ' || coalesce(m.last_name, '')) AS display_name,
    pcm.role_in_cohort,
    e.event_type,
    e.event_name,
    e.route,
    e.properties,
    e.session_id,
    e.client
  FROM public.product_usage_events e
  INNER JOIN public.pilot_cohort_members pcm ON pcm.member_id = e.member_id
  INNER JOIN public.members m ON m.id = e.member_id
  WHERE public.is_admin_or_segreteria()
    AND e.created_at >= coalesce(p_since, now() - interval '14 days')
  ORDER BY e.created_at DESC
  LIMIT greatest(1, least(coalesce(p_limit, 1000), 5000));
$$;

REVOKE ALL ON FUNCTION public.list_pilot_usage_events(TIMESTAMPTZ, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_pilot_usage_events(TIMESTAMPTZ, INT) TO authenticated;
