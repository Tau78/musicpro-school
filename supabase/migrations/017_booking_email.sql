-- MusicPro School — Phase 2.4: booking confirmation email log

-- ---------------------------------------------------------------------------
-- booking_email_log — outbound booking emails (Resend / dev skip)
-- ---------------------------------------------------------------------------
CREATE TABLE public.booking_email_log (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id       UUID NOT NULL REFERENCES public.bookings (id) ON DELETE CASCADE,
  recipient_email  TEXT NOT NULL,
  subject          TEXT NOT NULL,
  status           TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'skipped')),
  error            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.booking_email_log IS
  'Log of booking confirmation / modification emails sent via Edge Function.';

CREATE INDEX idx_booking_email_log_booking_created
  ON public.booking_email_log (booking_id, created_at DESC);

CREATE INDEX idx_booking_email_log_status
  ON public.booking_email_log (status, created_at DESC);

ALTER TABLE public.booking_email_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "booking_email_log_select_staff"
  ON public.booking_email_log FOR SELECT
  TO authenticated
  USING (public.is_admin_or_segreteria());

GRANT SELECT ON TABLE public.booking_email_log TO authenticated;
