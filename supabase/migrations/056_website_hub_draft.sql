-- Bozza CMS sito hub (www.musicproeventi.it). Il live resta website_hub_content.

INSERT INTO public.app_settings (key, value, description)
VALUES (
  'website_hub_draft',
  '{}',
  'Bozza JSON del sito hub musicproeventi.it. Pubblica copia su website_hub_content.'
)
ON CONFLICT (key) DO NOTHING;
