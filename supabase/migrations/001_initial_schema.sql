-- MusicPro School — initial PostgreSQL schema
-- Migrated from Google Apps Script (ASSOCIATI, NOTULE, QUOTE, ISCRIZIONI, TEMPLATE)
-- Timezone convention: Europe/Rome (application layer; timestamptz stored in UTC)

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
CREATE TYPE public.member_role AS ENUM (
  'admin',
  'docente',
  'associato',
  'segreteria',
  'social',
  'tutore'
);

CREATE TYPE public.booking_status AS ENUM (
  'pending',
  'confirmed',
  'cancelled'
);

CREATE TYPE public.campaign_status AS ENUM (
  'draft',
  'scheduled',
  'sending',
  'sent',
  'cancelled'
);

CREATE TYPE public.campaign_audience AS ENUM (
  'associati',
  'docenti',
  'room_users',
  'tutors'
);

CREATE TYPE public.receipts_status AS ENUM (
  'mancante',
  'parziale',
  'completo'
);

-- ---------------------------------------------------------------------------
-- Utility: updated_at trigger
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- members (GAS: ASSOCIATI / COL_INDEX)
-- ---------------------------------------------------------------------------
CREATE TABLE public.members (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID UNIQUE REFERENCES auth.users (id) ON DELETE SET NULL,

  -- GAS COL_INDEX.NUMERO_ASSOCIATO (Col A)
  member_number           INTEGER UNIQUE,
  -- GAS COL_INDEX.DATA_ISCRIZIONE (Col B)
  enrolled_at           TIMESTAMPTZ,
  -- GAS COL_INDEX.NOME (Col D)
  first_name            TEXT NOT NULL,
  -- GAS COL_INDEX.COGNOME (Col E)
  last_name             TEXT NOT NULL,
  -- GAS COL_INDEX.LUOGO_NASCITA (Col F)
  birth_place             TEXT,
  -- GAS COL_INDEX.PROVINCIA_NASCITA (Col G)
  birth_province          TEXT,
  -- GAS COL_INDEX.DATA_NASCITA (Col H)
  birth_date              DATE,
  -- GAS COL_INDEX.INDIRIZZO (Col I)
  address_street          TEXT,
  -- GAS COL_INDEX.CAP (Col J)
  address_postal_code     TEXT,
  -- GAS COL_INDEX.CITTA (Col K)
  address_city            TEXT,
  -- GAS COL_INDEX.PROVINCIA_RESIDENZA (Col L)
  address_province        TEXT,
  -- GAS COL_INDEX.CODICE_FISCALE (Col M)
  tax_code                TEXT,
  -- GAS COL_INDEX.TELEFONO (Col N)
  phone                   TEXT,
  -- GAS COL_INDEX.EMAIL (Col O)
  email                   TEXT,
  -- GAS COL_INDEX.NUMERO_TUTORE (Col P) — legacy sheet reference to tutor member_number
  legacy_tutor_member_number INTEGER,
  -- GAS COL_INDEX.NOME_COMPLETO_TUTORE (Col Q)
  legacy_tutor_full_name  TEXT,
  -- GAS COL_INDEX.TUTORE_NOME_MANUALE (Col R)
  manual_tutor_first_name TEXT,
  -- GAS COL_INDEX.TUTORE_COGNOME_MANUALE (Col S)
  manual_tutor_last_name  TEXT,
  -- GAS COL_INDEX.TUTORE_CELLULARE_MANUALE (Col T)
  manual_tutor_phone      TEXT,
  -- GAS COL_INDEX.TUTORE_EMAIL_MANUALE (Col U)
  manual_tutor_email      TEXT,
  -- GAS COL_INDEX.TUTORE_CF_MANUALE (Col V)
  manual_tutor_tax_code   TEXT,
  -- GAS COL_INDEX.TELEGRAM_CHAT_ID (Col W)
  telegram_chat_id        TEXT,
  -- GAS COL_INDEX.CONSENSO_GDPR (Col X)
  gdpr_consent            BOOLEAN NOT NULL DEFAULT false,
  gdpr_consent_at         TIMESTAMPTZ,

  -- Migration aid: original ASSOCIATI sheet row number (1-based, excluding header)
  legacy_row_number       INTEGER,

  is_active               BOOLEAN NOT NULL DEFAULT true,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT members_tax_code_unique UNIQUE (tax_code),
  CONSTRAINT members_name_check CHECK (
    length(trim(first_name)) > 0 AND length(trim(last_name)) > 0
  )
);

COMMENT ON TABLE public.members IS 'Anagrafica associati — migrated from GAS sheet ASSOCIATI';
COMMENT ON COLUMN public.members.member_number IS 'GAS COL_INDEX.NUMERO_ASSOCIATO (Col A)';
COMMENT ON COLUMN public.members.enrolled_at IS 'GAS COL_INDEX.DATA_ISCRIZIONE (Col B)';
COMMENT ON COLUMN public.members.first_name IS 'GAS COL_INDEX.NOME (Col D)';
COMMENT ON COLUMN public.members.last_name IS 'GAS COL_INDEX.COGNOME (Col E)';
COMMENT ON COLUMN public.members.birth_place IS 'GAS COL_INDEX.LUOGO_NASCITA (Col F)';
COMMENT ON COLUMN public.members.birth_province IS 'GAS COL_INDEX.PROVINCIA_NASCITA (Col G)';
COMMENT ON COLUMN public.members.birth_date IS 'GAS COL_INDEX.DATA_NASCITA (Col H)';
COMMENT ON COLUMN public.members.address_street IS 'GAS COL_INDEX.INDIRIZZO (Col I)';
COMMENT ON COLUMN public.members.address_postal_code IS 'GAS COL_INDEX.CAP (Col J)';
COMMENT ON COLUMN public.members.address_city IS 'GAS COL_INDEX.CITTA (Col K)';
COMMENT ON COLUMN public.members.address_province IS 'GAS COL_INDEX.PROVINCIA_RESIDENZA (Col L)';
COMMENT ON COLUMN public.members.tax_code IS 'GAS COL_INDEX.CODICE_FISCALE (Col M)';
COMMENT ON COLUMN public.members.phone IS 'GAS COL_INDEX.TELEFONO (Col N)';
COMMENT ON COLUMN public.members.email IS 'GAS COL_INDEX.EMAIL (Col O)';
COMMENT ON COLUMN public.members.legacy_tutor_member_number IS 'GAS COL_INDEX.NUMERO_TUTORE (Col P)';
COMMENT ON COLUMN public.members.legacy_tutor_full_name IS 'GAS COL_INDEX.NOME_COMPLETO_TUTORE (Col Q)';
COMMENT ON COLUMN public.members.manual_tutor_first_name IS 'GAS COL_INDEX.TUTORE_NOME_MANUALE (Col R)';
COMMENT ON COLUMN public.members.manual_tutor_last_name IS 'GAS COL_INDEX.TUTORE_COGNOME_MANUALE (Col S)';
COMMENT ON COLUMN public.members.manual_tutor_phone IS 'GAS COL_INDEX.TUTORE_CELLULARE_MANUALE (Col T)';
COMMENT ON COLUMN public.members.manual_tutor_email IS 'GAS COL_INDEX.TUTORE_EMAIL_MANUALE (Col U)';
COMMENT ON COLUMN public.members.manual_tutor_tax_code IS 'GAS COL_INDEX.TUTORE_CF_MANUALE (Col V)';
COMMENT ON COLUMN public.members.telegram_chat_id IS 'GAS COL_INDEX.TELEGRAM_CHAT_ID (Col W)';
COMMENT ON COLUMN public.members.gdpr_consent IS 'GAS COL_INDEX.CONSENSO_GDPR (Col X)';
COMMENT ON COLUMN public.members.user_id IS 'Supabase Auth link — replaces GAS _LOGIN_TOKENS magic links';
COMMENT ON COLUMN public.members.legacy_row_number IS 'Original ASSOCIATI sheet row for migration scripts';

CREATE INDEX idx_members_email ON public.members (lower(email)) WHERE email IS NOT NULL;
CREATE INDEX idx_members_legacy_row ON public.members (legacy_row_number) WHERE legacy_row_number IS NOT NULL;
CREATE INDEX idx_members_name ON public.members (lower(last_name), lower(first_name));

CREATE TRIGGER trg_members_updated_at
  BEFORE UPDATE ON public.members
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- member_roles (many-to-many; replaces implicit single-role model)
-- ---------------------------------------------------------------------------
CREATE TABLE public.member_roles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id   UUID NOT NULL REFERENCES public.members (id) ON DELETE CASCADE,
  role        public.member_role NOT NULL,
  granted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  granted_by  UUID REFERENCES public.members (id) ON DELETE SET NULL,
  revoked_at  TIMESTAMPTZ,
  UNIQUE (member_id, role)
);

COMMENT ON TABLE public.member_roles IS 'Account roles — admin, docente, associato, segreteria, social, tutore';

CREATE INDEX idx_member_roles_member ON public.member_roles (member_id) WHERE revoked_at IS NULL;
CREATE INDEX idx_member_roles_role ON public.member_roles (role) WHERE revoked_at IS NULL;

-- ---------------------------------------------------------------------------
-- tutor_links — tutor manages minors (normalized from tutor columns)
-- ---------------------------------------------------------------------------
CREATE TABLE public.tutor_links (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_member_id   UUID NOT NULL REFERENCES public.members (id) ON DELETE CASCADE,
  ward_member_id    UUID NOT NULL REFERENCES public.members (id) ON DELETE CASCADE,
  is_primary        BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tutor_member_id, ward_member_id),
  CONSTRAINT tutor_links_no_self CHECK (tutor_member_id <> ward_member_id)
);

COMMENT ON TABLE public.tutor_links IS 'Tutor–minor relationships; tutore role manages ward members';

CREATE INDEX idx_tutor_links_tutor ON public.tutor_links (tutor_member_id);
CREATE INDEX idx_tutor_links_ward ON public.tutor_links (ward_member_id);

-- ---------------------------------------------------------------------------
-- annual_quota_settings (GAS: IMPOSTAZIONI_QUOTE — Anno, Importo)
-- ---------------------------------------------------------------------------
CREATE TABLE public.annual_quota_settings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fiscal_year     INTEGER NOT NULL UNIQUE,
  -- GAS Col B Importo (euros, not centesimi)
  amount_eur      NUMERIC(10, 2) NOT NULL CHECK (amount_eur >= 0),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.annual_quota_settings IS 'GAS sheet IMPOSTAZIONI_QUOTE — annual membership fee per year';
COMMENT ON COLUMN public.annual_quota_settings.fiscal_year IS 'GAS IMPOSTAZIONI_QUOTE Col A (Anno)';
COMMENT ON COLUMN public.annual_quota_settings.amount_eur IS 'GAS IMPOSTAZIONI_QUOTE Col B (Importo)';

CREATE TRIGGER trg_annual_quota_settings_updated_at
  BEFORE UPDATE ON public.annual_quota_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- member_annual_quotas (GAS: QUOTE — Nome, Anno, Data Pagamento, Importo)
-- ---------------------------------------------------------------------------
CREATE TABLE public.member_annual_quotas (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id       UUID NOT NULL REFERENCES public.members (id) ON DELETE CASCADE,
  fiscal_year     INTEGER NOT NULL,
  -- GAS QUOTE Col C Data Pagamento
  paid_at         TIMESTAMPTZ,
  -- GAS QUOTE Col D Importo Pagato
  amount_paid_eur NUMERIC(10, 2) CHECK (amount_paid_eur IS NULL OR amount_paid_eur >= 0),
  -- Snapshot of due amount at payment time
  amount_due_eur  NUMERIC(10, 2) CHECK (amount_due_eur IS NULL OR amount_due_eur >= 0),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (member_id, fiscal_year)
);

COMMENT ON TABLE public.member_annual_quotas IS 'GAS sheet QUOTE — per-member annual quota payment records';
COMMENT ON COLUMN public.member_annual_quotas.fiscal_year IS 'GAS QUOTE Col B (Anno)';
COMMENT ON COLUMN public.member_annual_quotas.paid_at IS 'GAS QUOTE Col C (Data Pagamento)';
COMMENT ON COLUMN public.member_annual_quotas.amount_paid_eur IS 'GAS QUOTE Col D (Importo Pagato)';

CREATE INDEX idx_member_annual_quotas_year ON public.member_annual_quotas (fiscal_year);
CREATE INDEX idx_member_annual_quotas_member_year ON public.member_annual_quotas (member_id, fiscal_year);
CREATE INDEX idx_member_annual_quotas_unpaid ON public.member_annual_quotas (member_id)
  WHERE paid_at IS NULL;

CREATE TRIGGER trg_member_annual_quotas_updated_at
  BEFORE UPDATE ON public.member_annual_quotas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- reimbursements (GAS: NOTULE / LOG_COL_INDEX)
-- ---------------------------------------------------------------------------
CREATE TABLE public.reimbursements (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id             UUID NOT NULL REFERENCES public.members (id) ON DELETE RESTRICT,
  created_by_member_id  UUID REFERENCES public.members (id) ON DELETE SET NULL,

  -- GAS LOG_COL_INDEX.ANNO (Col A)
  fiscal_year           INTEGER NOT NULL,
  -- GAS LOG_COL_INDEX.DATA_GENERAZIONE (Col B)
  generated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- GAS LOG_COL_INDEX.PROGRESSIVO (Col C)
  progressive           TEXT NOT NULL,
  -- GAS LOG_COL_INDEX.IMPORTO_LORDO (Col D)
  gross_amount_eur      NUMERIC(10, 2) NOT NULL CHECK (gross_amount_eur > 0),
  -- GAS LOG_COL_INDEX.RITENUTA (Col E)
  withholding_eur       NUMERIC(10, 2),
  -- GAS LOG_COL_INDEX.IMPORTO_NETTO (Col F)
  net_amount_eur        NUMERIC(10, 2),
  -- GAS LOG_COL_INDEX.METODO_PAGAMENTO (Col I)
  payment_method        TEXT,
  -- GAS LOG_COL_INDEX.DATA_PAGAMENTO (Col J)
  payment_date          DATE,
  -- GAS LOG_COL_INDEX.IMPORTO_RICEVUTE (Col K) — paper receipts amount, no photo upload
  receipts_amount_eur   NUMERIC(10, 2) DEFAULT 0 CHECK (receipts_amount_eur IS NULL OR receipts_amount_eur >= 0),
  -- GAS LOG_COL_INDEX.RICEVUTE (Col L) — textual status / notes
  receipts_notes        TEXT,
  receipts_status       public.receipts_status NOT NULL DEFAULT 'mancante',

  -- GAS LOG_COL_INDEX.URL_PDF (Col H) — nullable; historical PDFs not migrated
  pdf_url               TEXT,
  pdf_storage_path      TEXT,

  -- Product: signature required on reimbursements
  signature_required    BOOLEAN NOT NULL DEFAULT true,
  signed_at             TIMESTAMPTZ,
  signature_storage_path TEXT,

  legacy_sheet_row      INTEGER,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (member_id, fiscal_year, progressive)
);

COMMENT ON TABLE public.reimbursements IS 'GAS sheet NOTULE — expense reimbursements (notule)';
COMMENT ON COLUMN public.reimbursements.fiscal_year IS 'GAS LOG_COL_INDEX.ANNO (Col A)';
COMMENT ON COLUMN public.reimbursements.generated_at IS 'GAS LOG_COL_INDEX.DATA_GENERAZIONE (Col B)';
COMMENT ON COLUMN public.reimbursements.progressive IS 'GAS LOG_COL_INDEX.PROGRESSIVO (Col C)';
COMMENT ON COLUMN public.reimbursements.gross_amount_eur IS 'GAS LOG_COL_INDEX.IMPORTO_LORDO (Col D)';
COMMENT ON COLUMN public.reimbursements.withholding_eur IS 'GAS LOG_COL_INDEX.RITENUTA (Col E)';
COMMENT ON COLUMN public.reimbursements.net_amount_eur IS 'GAS LOG_COL_INDEX.IMPORTO_NETTO (Col F)';
COMMENT ON COLUMN public.reimbursements.pdf_url IS 'GAS LOG_COL_INDEX.URL_PDF (Col H); new PDFs only in Supabase Storage';
COMMENT ON COLUMN public.reimbursements.payment_method IS 'GAS LOG_COL_INDEX.METODO_PAGAMENTO (Col I)';
COMMENT ON COLUMN public.reimbursements.payment_date IS 'GAS LOG_COL_INDEX.DATA_PAGAMENTO (Col J)';
COMMENT ON COLUMN public.reimbursements.receipts_amount_eur IS 'GAS LOG_COL_INDEX.IMPORTO_RICEVUTE (Col K)';
COMMENT ON COLUMN public.reimbursements.receipts_notes IS 'GAS LOG_COL_INDEX.RICEVUTE (Col L)';

CREATE INDEX idx_reimbursements_member ON public.reimbursements (member_id);
CREATE INDEX idx_reimbursements_year ON public.reimbursements (fiscal_year);
CREATE INDEX idx_reimbursements_member_year ON public.reimbursements (member_id, fiscal_year);
CREATE INDEX idx_reimbursements_generated ON public.reimbursements (generated_at DESC);

CREATE TRIGGER trg_reimbursements_updated_at
  BEFORE UPDATE ON public.reimbursements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto-compute receipts_status from amounts (mirrors GAS getReimbursementDataForDisplay)
CREATE OR REPLACE FUNCTION public.compute_receipts_status(
  p_gross NUMERIC,
  p_receipts NUMERIC
)
RETURNS public.receipts_status
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN COALESCE(p_receipts, 0) >= (COALESCE(p_gross, 0) - 0.001) AND COALESCE(p_gross, 0) > 0
      THEN 'completo'::public.receipts_status
    WHEN COALESCE(p_receipts, 0) > 0
      THEN 'parziale'::public.receipts_status
    ELSE 'mancante'::public.receipts_status
  END;
$$;

CREATE OR REPLACE FUNCTION public.reimbursements_set_receipts_status()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.receipts_status := public.compute_receipts_status(NEW.gross_amount_eur, NEW.receipts_amount_eur);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_reimbursements_receipts_status
  BEFORE INSERT OR UPDATE OF gross_amount_eur, receipts_amount_eur ON public.reimbursements
  FOR EACH ROW EXECUTE FUNCTION public.reimbursements_set_receipts_status();

-- ---------------------------------------------------------------------------
-- enrollments (GAS: ISCRIZIONI / ISCR_COL)
-- ---------------------------------------------------------------------------
CREATE TABLE public.enrollments (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- GAS ISCR_COL.ID — preserved as external reference
  legacy_enrollment_id            TEXT UNIQUE,

  member_id                       UUID REFERENCES public.members (id) ON DELETE SET NULL,

  -- GAS ISCR_COL.NOME
  first_name                      TEXT NOT NULL,
  -- GAS ISCR_COL.COGNOME
  last_name                       TEXT NOT NULL,
  -- GAS ISCR_COL.EMAIL
  email                           TEXT NOT NULL,
  -- GAS ISCR_COL.CF
  tax_code                        TEXT,
  -- GAS ISCR_COL.TELEFONO
  phone                           TEXT,
  -- GAS ISCR_COL.ANNO_SOCIETARIO
  fiscal_year                     INTEGER NOT NULL,
  -- GAS ISCR_COL.IMPORTO_CENTESIMI
  amount_centesimi                INTEGER NOT NULL CHECK (amount_centesimi >= 0),
  -- GAS ISCR_COL.PAGAMENTO_STATO (e.g. PAGATO)
  payment_status                  TEXT NOT NULL DEFAULT 'pending',
  -- GAS ISCR_COL.PAGAMENTO_LINK_URL
  payment_link_url                TEXT,
  -- GAS ISCR_COL.PAGAMENTO_LINK_ID
  payment_link_id                 TEXT,
  -- GAS ISCR_COL.PAGAMENTO_TOTALE_CENTESIMI
  payment_total_centesimi         INTEGER CHECK (payment_total_centesimi IS NULL OR payment_total_centesimi >= 0),
  -- GAS ISCR_COL.PAGAMENTO_STRIPE_LORDO
  stripe_gross_centesimi          INTEGER CHECK (stripe_gross_centesimi IS NULL OR stripe_gross_centesimi >= 0),
  -- GAS ISCR_COL.PAGAMENTO_STRIPE_FEE
  stripe_fee_centesimi            INTEGER CHECK (stripe_fee_centesimi IS NULL OR stripe_fee_centesimi >= 0),
  -- GAS ISCR_COL.PAGAMENTO_STRIPE_NETTO
  stripe_net_centesimi            INTEGER CHECK (stripe_net_centesimi IS NULL OR stripe_net_centesimi >= 0),
  -- GAS ISCR_COL.PAGAMENTO_STRIPE_PI
  stripe_payment_intent_id        TEXT,
  -- GAS ISCR_COL.PAGAMENTO_PAGATO_AT
  paid_at                         TIMESTAMPTZ,
  -- GAS ISCR_COL.CREATED_AT
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- GAS ISCR_COL.PAYLOAD_JSON
  form_payload                    JSONB,
  -- GAS ISCR_COL.PDF_URL
  pdf_url                         TEXT,
  pdf_storage_path                TEXT,
  -- GAS ISCR_COL.EMAIL_CONFERMA_INVIATA
  confirmation_email_sent         BOOLEAN NOT NULL DEFAULT false,
  confirmation_email_sent_at      TIMESTAMPTZ,

  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.enrollments IS 'GAS sheet ISCRIZIONI — membership enrollment with Stripe payment';
COMMENT ON COLUMN public.enrollments.legacy_enrollment_id IS 'GAS ISCR_COL.ID (ID_Iscrizione)';
COMMENT ON COLUMN public.enrollments.first_name IS 'GAS ISCR_COL.NOME';
COMMENT ON COLUMN public.enrollments.last_name IS 'GAS ISCR_COL.COGNOME';
COMMENT ON COLUMN public.enrollments.email IS 'GAS ISCR_COL.EMAIL';
COMMENT ON COLUMN public.enrollments.tax_code IS 'GAS ISCR_COL.CF';
COMMENT ON COLUMN public.enrollments.phone IS 'GAS ISCR_COL.TELEFONO';
COMMENT ON COLUMN public.enrollments.fiscal_year IS 'GAS ISCR_COL.ANNO_SOCIETARIO';
COMMENT ON COLUMN public.enrollments.amount_centesimi IS 'GAS ISCR_COL.IMPORTO_CENTESIMI';
COMMENT ON COLUMN public.enrollments.payment_status IS 'GAS ISCR_COL.PAGAMENTO_STATO';
COMMENT ON COLUMN public.enrollments.payment_link_url IS 'GAS ISCR_COL.PAGAMENTO_LINK_URL';
COMMENT ON COLUMN public.enrollments.payment_link_id IS 'GAS ISCR_COL.PAGAMENTO_LINK_ID';
COMMENT ON COLUMN public.enrollments.payment_total_centesimi IS 'GAS ISCR_COL.PAGAMENTO_TOTALE_CENTESIMI';
COMMENT ON COLUMN public.enrollments.stripe_gross_centesimi IS 'GAS ISCR_COL.PAGAMENTO_STRIPE_LORDO';
COMMENT ON COLUMN public.enrollments.stripe_fee_centesimi IS 'GAS ISCR_COL.PAGAMENTO_STRIPE_FEE';
COMMENT ON COLUMN public.enrollments.stripe_net_centesimi IS 'GAS ISCR_COL.PAGAMENTO_STRIPE_NETTO';
COMMENT ON COLUMN public.enrollments.stripe_payment_intent_id IS 'GAS ISCR_COL.PAGAMENTO_STRIPE_PI';
COMMENT ON COLUMN public.enrollments.paid_at IS 'GAS ISCR_COL.PAGAMENTO_PAGATO_AT';
COMMENT ON COLUMN public.enrollments.form_payload IS 'GAS ISCR_COL.PAYLOAD_JSON';
COMMENT ON COLUMN public.enrollments.pdf_url IS 'GAS ISCR_COL.PDF_URL';
COMMENT ON COLUMN public.enrollments.confirmation_email_sent IS 'GAS ISCR_COL.EMAIL_CONFERMA_INVIATA (SI/true)';

CREATE INDEX idx_enrollments_email ON public.enrollments (lower(email));
CREATE INDEX idx_enrollments_tax_code ON public.enrollments (upper(tax_code)) WHERE tax_code IS NOT NULL;
CREATE INDEX idx_enrollments_fiscal_year ON public.enrollments (fiscal_year);
CREATE INDEX idx_enrollments_payment_status ON public.enrollments (payment_status);
CREATE INDEX idx_enrollments_created ON public.enrollments (created_at DESC);

CREATE TRIGGER trg_enrollments_updated_at
  BEFORE UPDATE ON public.enrollments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- rooms & bookings (new — sale prova; realtime-critical)
-- ---------------------------------------------------------------------------
CREATE TABLE public.rooms (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL UNIQUE,
  slug          TEXT NOT NULL UNIQUE,
  description   TEXT,
  capacity      INTEGER CHECK (capacity IS NULL OR capacity > 0),
  is_active     BOOLEAN NOT NULL DEFAULT true,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.rooms IS 'Practice rooms (sale prova) — 3–5 rooms';

CREATE TRIGGER trg_rooms_updated_at
  BEFORE UPDATE ON public.rooms
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.bookings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id         UUID NOT NULL REFERENCES public.rooms (id) ON DELETE RESTRICT,
  member_id       UUID NOT NULL REFERENCES public.members (id) ON DELETE RESTRICT,
  start_at        TIMESTAMPTZ NOT NULL,
  end_at          TIMESTAMPTZ NOT NULL,
  status          public.booking_status NOT NULL DEFAULT 'pending',
  title           TEXT,
  notes           TEXT,
  cancelled_at    TIMESTAMPTZ,
  cancelled_by    UUID REFERENCES public.members (id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT bookings_time_order CHECK (end_at > start_at),
  CONSTRAINT bookings_unique_slot UNIQUE (room_id, start_at)
);

COMMENT ON TABLE public.bookings IS 'Room bookings — UNIQUE(room_id, start_at) prevents double-booking; enable Realtime';
COMMENT ON COLUMN public.bookings.status IS 'pending | confirmed | cancelled';

CREATE INDEX idx_bookings_room_start ON public.bookings (room_id, start_at);
CREATE INDEX idx_bookings_member ON public.bookings (member_id);
CREATE INDEX idx_bookings_active ON public.bookings (room_id, start_at)
  WHERE status <> 'cancelled';

CREATE TRIGGER trg_bookings_updated_at
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- message_templates (GAS: TEMPLATE sheet)
-- ---------------------------------------------------------------------------
CREATE TABLE public.message_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- GAS TEMPLATE Col A NomeModello
  name        TEXT NOT NULL UNIQUE,
  -- GAS TEMPLATE Col B Oggetto
  subject     TEXT NOT NULL,
  -- GAS TEMPLATE Col C TestoMessaggio
  body        TEXT NOT NULL,
  channel     TEXT NOT NULL DEFAULT 'email' CHECK (channel IN ('email', 'telegram', 'sms')),
  created_by  UUID REFERENCES public.members (id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.message_templates IS 'GAS sheet TEMPLATE — reusable message templates';
COMMENT ON COLUMN public.message_templates.name IS 'GAS TEMPLATE Col A (NomeModello)';
COMMENT ON COLUMN public.message_templates.subject IS 'GAS TEMPLATE Col B (Oggetto)';
COMMENT ON COLUMN public.message_templates.body IS 'GAS TEMPLATE Col C (TestoMessaggio)';

CREATE TRIGGER trg_message_templates_updated_at
  BEFORE UPDATE ON public.message_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- message_campaigns & recipients
-- ---------------------------------------------------------------------------
CREATE TABLE public.message_campaigns (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id     UUID REFERENCES public.message_templates (id) ON DELETE SET NULL,
  name            TEXT NOT NULL,
  subject         TEXT NOT NULL,
  body            TEXT NOT NULL,
  -- Audience filters: associati, docenti, room_users, tutors (future)
  audiences       public.campaign_audience[] NOT NULL DEFAULT '{}',
  audience_filter JSONB NOT NULL DEFAULT '{}',
  status          public.campaign_status NOT NULL DEFAULT 'draft',
  scheduled_at    TIMESTAMPTZ,
  sent_at         TIMESTAMPTZ,
  created_by      UUID REFERENCES public.members (id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.message_campaigns IS 'Outbound messaging campaigns with audience filters';
COMMENT ON COLUMN public.message_campaigns.audiences IS 'Target groups: associati, docenti, room_users, tutors';

CREATE INDEX idx_message_campaigns_status ON public.message_campaigns (status);

CREATE TRIGGER trg_message_campaigns_updated_at
  BEFORE UPDATE ON public.message_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.message_campaign_recipients (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id     UUID NOT NULL REFERENCES public.message_campaigns (id) ON DELETE CASCADE,
  member_id       UUID NOT NULL REFERENCES public.members (id) ON DELETE CASCADE,
  email           TEXT,
  telegram_chat_id TEXT,
  sent_at         TIMESTAMPTZ,
  delivered_at    TIMESTAMPTZ,
  error_message   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, member_id)
);

COMMENT ON TABLE public.message_campaign_recipients IS 'Per-recipient delivery tracking for campaigns';

CREATE INDEX idx_campaign_recipients_campaign ON public.message_campaign_recipients (campaign_id);
CREATE INDEX idx_campaign_recipients_member ON public.message_campaign_recipients (member_id);

-- ---------------------------------------------------------------------------
-- app_settings (GAS: drive paths, template IDs, etc.)
-- ---------------------------------------------------------------------------
CREATE TABLE public.app_settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  description TEXT,
  updated_by  UUID REFERENCES public.members (id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.app_settings IS 'Key-value settings — replaces GAS constants and IMPOSTAZIONI drive path rows';
COMMENT ON COLUMN public.app_settings.key IS 'e.g. root_reimbursements_folder_id, enrollment_template_id';

-- ---------------------------------------------------------------------------
-- audit_log (GDPR)
-- ---------------------------------------------------------------------------
CREATE TABLE public.audit_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id   UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  actor_member_id UUID REFERENCES public.members (id) ON DELETE SET NULL,
  action          TEXT NOT NULL,
  entity_type     TEXT NOT NULL,
  entity_id       UUID,
  entity_legacy_id TEXT,
  old_values      JSONB,
  new_values      JSONB,
  ip_address      INET,
  user_agent      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.audit_log IS 'GDPR audit trail — who, what, when, entity';

CREATE INDEX idx_audit_log_created ON public.audit_log (created_at DESC);
CREATE INDEX idx_audit_log_entity ON public.audit_log (entity_type, entity_id);
CREATE INDEX idx_audit_log_actor_member ON public.audit_log (actor_member_id) WHERE actor_member_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Auth helper: link auth.users → members
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_member_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.id
  FROM public.members m
  WHERE m.user_id = auth.uid()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.has_member_role(p_role public.member_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.member_roles mr
    WHERE mr.member_id = public.current_member_id()
      AND mr.role = p_role
      AND mr.revoked_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin_or_segreteria()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_member_role('admin'::public.member_role)
      OR public.has_member_role('segreteria'::public.member_role);
$$;

CREATE OR REPLACE FUNCTION public.can_manage_reimbursements()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_member_role('admin'::public.member_role)
      OR public.has_member_role('docente'::public.member_role);
$$;

CREATE OR REPLACE FUNCTION public.member_quota_ok(
  p_member_id UUID,
  p_fiscal_year INTEGER DEFAULT EXTRACT(YEAR FROM (now() AT TIME ZONE 'Europe/Rome'))::INTEGER
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.member_annual_quotas q
    WHERE q.member_id = p_member_id
      AND q.fiscal_year = p_fiscal_year
      AND q.paid_at IS NOT NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.can_book_rooms()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_member_role('admin'::public.member_role)
    OR public.has_member_role('docente'::public.member_role)
    OR (
      public.has_member_role('associato'::public.member_role)
      AND public.member_quota_ok(public.current_member_id())
    );
$$;

CREATE OR REPLACE FUNCTION public.is_tutor_of(p_ward_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tutor_links tl
    WHERE tl.tutor_member_id = public.current_member_id()
      AND tl.ward_member_id = p_ward_id
  );
$$;

-- ---------------------------------------------------------------------------
-- Enable RLS on all tables
-- ---------------------------------------------------------------------------
ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tutor_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.annual_quota_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_annual_quotas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reimbursements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_campaign_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Realtime: enable on bookings (critical for room scheduling)
ALTER PUBLICATION supabase_realtime ADD TABLE public.bookings;
