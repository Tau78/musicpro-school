-- Testi e link del sito hub www.musicproeventi.it (editabili da /admin/website)

INSERT INTO public.app_settings (key, value, description)
VALUES (
  'website_hub_content',
  '{}',
  'JSON del sito hub musicproeventi.it. I campi vuoti usano i default del codice.'
)
ON CONFLICT (key) DO NOTHING;
