-- Soglia spostamento prenotazione associato: 12 ore prima dell'inizio (V1)
UPDATE public.app_settings
SET
  value = '12',
  description = 'Hours before start: minimum for associate self-service booking modification',
  updated_at = now()
WHERE key = 'booking_modify_min_hours';

INSERT INTO public.app_settings (key, value, description)
VALUES (
  'booking_modify_min_hours',
  '12',
  'Hours before start: minimum for associate self-service booking modification'
)
ON CONFLICT (key) DO NOTHING;
