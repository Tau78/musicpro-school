-- MusicPro School — Libro cespiti (documenti segreteria)

-- ---------------------------------------------------------------------------
-- fixed_assets — inventario beni strumentali / attrezzature
-- ---------------------------------------------------------------------------
CREATE TABLE public.fixed_assets (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quantity            INTEGER NOT NULL DEFAULT 1,
  name                TEXT NOT NULL,
  brand               TEXT,
  model               TEXT,
  serial              TEXT,
  accessories         TEXT[] NOT NULL DEFAULT '{}',
  purchased_at        DATE,
  location_preset     TEXT,
  location_custom     TEXT,
  notes               TEXT,
  disposed_at         TIMESTAMPTZ,
  deleted_at          TIMESTAMPTZ,
  photo_storage_path  TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by          UUID REFERENCES public.members (id) ON DELETE SET NULL,
  updated_by          UUID REFERENCES public.members (id) ON DELETE SET NULL,

  CONSTRAINT fixed_assets_quantity_check CHECK (quantity >= 1),
  CONSTRAINT fixed_assets_location_preset_check CHECK (
    location_preset IS NULL
    OR location_preset IN (
      'sala_arancio',
      'sala_blu',
      'sala_verde',
      'sala_rossa',
      'ingresso',
      'magazzino',
      'box',
      'altro'
    )
  )
);

COMMENT ON TABLE public.fixed_assets IS
  'Libro cespiti — beni strumentali e attrezzature della scuola.';
COMMENT ON COLUMN public.fixed_assets.serial IS
  'Numero di serie (es. (21)75281YDA01422).';
COMMENT ON COLUMN public.fixed_assets.accessories IS
  'Chiavi tag accessori inclusi (es. cavo, custodia).';
COMMENT ON COLUMN public.fixed_assets.location_preset IS
  'Ubicazione predefinita (sala, magazzino, box, altro).';
COMMENT ON COLUMN public.fixed_assets.location_custom IS
  'Dettaglio ubicazione quando preset = altro o note aggiuntive.';
COMMENT ON COLUMN public.fixed_assets.deleted_at IS
  'Soft delete — escluso dalle liste salvo flag includeDeleted.';

CREATE INDEX idx_fixed_assets_location_preset
  ON public.fixed_assets (location_preset);

CREATE INDEX idx_fixed_assets_deleted_at
  ON public.fixed_assets (deleted_at)
  WHERE deleted_at IS NOT NULL;

CREATE INDEX idx_fixed_assets_disposed_at
  ON public.fixed_assets (disposed_at)
  WHERE disposed_at IS NOT NULL;

CREATE INDEX idx_fixed_assets_name
  ON public.fixed_assets (name);

CREATE TRIGGER trg_fixed_assets_updated_at
  BEFORE UPDATE ON public.fixed_assets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- fixed_asset_events — storico eventi (acquisto, donazione, perdita, …)
-- ---------------------------------------------------------------------------
CREATE TABLE public.fixed_asset_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id     UUID NOT NULL REFERENCES public.fixed_assets (id) ON DELETE CASCADE,
  event_type   TEXT NOT NULL,
  event_date   DATE,
  notes        TEXT,
  verbale_ref  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by   UUID REFERENCES public.members (id) ON DELETE SET NULL,

  CONSTRAINT fixed_asset_events_type_check CHECK (
    event_type IN (
      'acquisto',
      'donazione',
      'perdita',
      'smarrimento',
      'rottura',
      'trasferimento'
    )
  )
);

COMMENT ON TABLE public.fixed_asset_events IS
  'Eventi del libro cespiti collegati a un bene.';
COMMENT ON COLUMN public.fixed_asset_events.verbale_ref IS
  'Riferimento futuro a verbale assemblea (stub).';

CREATE INDEX idx_fixed_asset_events_asset
  ON public.fixed_asset_events (asset_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- app_settings — abilitazione moduli documenti segreteria
-- ---------------------------------------------------------------------------
INSERT INTO public.app_settings (key, value, description)
VALUES
  (
    'documenti_segreteria_libro_associati',
    'true',
    'Abilita Libro associati in Documenti segreteria'
  ),
  (
    'documenti_segreteria_verbali',
    'false',
    'Abilita Verbali in Documenti segreteria'
  ),
  (
    'documenti_segreteria_libro_cespiti',
    'true',
    'Abilita Libro cespiti in Documenti segreteria'
  )
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.fixed_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fixed_asset_events ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.fixed_assets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.fixed_asset_events TO authenticated;

CREATE POLICY "fixed_assets_select_staff"
  ON public.fixed_assets FOR SELECT
  TO authenticated
  USING (public.is_admin_or_segreteria());

CREATE POLICY "fixed_assets_insert_staff"
  ON public.fixed_assets FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin_or_segreteria());

CREATE POLICY "fixed_assets_update_staff"
  ON public.fixed_assets FOR UPDATE
  TO authenticated
  USING (public.is_admin_or_segreteria())
  WITH CHECK (public.is_admin_or_segreteria());

CREATE POLICY "fixed_assets_delete_admin"
  ON public.fixed_assets FOR DELETE
  TO authenticated
  USING (public.has_member_role('admin'::public.member_role));

CREATE POLICY "fixed_asset_events_select_staff"
  ON public.fixed_asset_events FOR SELECT
  TO authenticated
  USING (public.is_admin_or_segreteria());

CREATE POLICY "fixed_asset_events_insert_staff"
  ON public.fixed_asset_events FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin_or_segreteria());

CREATE POLICY "fixed_asset_events_update_staff"
  ON public.fixed_asset_events FOR UPDATE
  TO authenticated
  USING (public.is_admin_or_segreteria())
  WITH CHECK (public.is_admin_or_segreteria());

CREATE POLICY "fixed_asset_events_delete_admin"
  ON public.fixed_asset_events FOR DELETE
  TO authenticated
  USING (public.has_member_role('admin'::public.member_role));
