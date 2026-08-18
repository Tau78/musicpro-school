-- Ensure get_booking_setting_bool exists (026 may have been applied without helper).

CREATE OR REPLACE FUNCTION public.get_booking_setting_bool(p_key text, p_default boolean)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT CASE lower(trim(s.value))
        WHEN 'true' THEN true
        WHEN '1' THEN true
        WHEN 'yes' THEN true
        WHEN 'on' THEN true
        WHEN 'false' THEN false
        WHEN '0' THEN false
        WHEN 'no' THEN false
        WHEN 'off' THEN false
        ELSE p_default
      END
      FROM public.app_settings s
      WHERE s.key = p_key
    ),
    p_default
  );
$$;

INSERT INTO public.app_settings (key, value, description)
VALUES (
  'booking_band_required',
  'false',
  'When true, non-PROVI bookings require an active band. When false, associates may book individually if quota is paid.'
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
WHERE public.app_settings.value IS DISTINCT FROM EXCLUDED.value;

NOTIFY pgrst, 'reload schema';
