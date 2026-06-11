# MusicPro School — Supabase Schema

PostgreSQL schema for the migration from Google Apps Script (Spreadsheet-backed) to Supabase project **MusicProSchool**.

Apply migrations in order:

```bash
supabase db push
# or locally:
psql -f supabase/migrations/001_initial_schema.sql
psql -f supabase/migrations/002_rls_policies.sql
psql -f supabase/migrations/003_seed_data.sql
```

**Timezone:** `Europe/Rome` (application layer; all timestamps stored as `timestamptz` in UTC).

**Auth:** GAS `_LOGIN_TOKENS` magic links are replaced by Supabase Auth. Link `auth.users.id` → `members.user_id`.

---

## Sheet → Table Mapping

| GAS Sheet / Constant | PostgreSQL Table | Notes |
|----------------------|------------------|-------|
| `ASSOCIATI` | `members` | All `COL_INDEX` fields; `legacy_row_number` preserves sheet row |
| _(new)_ | `member_roles` | Many-to-many roles: admin, docente, associato, segreteria, social, tutore |
| Tutor columns on ASSOCIATI | `tutor_links` | Normalized tutor ↔ minor; legacy manual tutor fields stay on `members` |
| `NOTULE` | `reimbursements` | `LOG_COL_INDEX`; `pdf_url` nullable (historical PDFs not migrated) |
| `ISCRIZIONI` | `enrollments` | `ISCR_COL`; Stripe amounts in **centesimi** (integer) |
| `IMPOSTAZIONI_QUOTE` | `annual_quota_settings` | Year + amount (euros `numeric(10,2)`) |
| `QUOTE` | `member_annual_quotas` | Member × year × paid_at / amount; keyed by `member_id` not name |
| `TEMPLATE` | `message_templates` | NomeModello, Oggetto, TestoMessaggio |
| _(new)_ | `message_campaigns` | Campaigns with audience filters |
| _(new)_ | `message_campaign_recipients` | Per-member delivery tracking |
| _(new)_ | `rooms` | 3–5 practice rooms (sale prova) |
| _(new)_ | `bookings` | `UNIQUE(room_id, start_at)`; Realtime-enabled |
| GAS constants + drive paths | `app_settings` | Key-value (folder IDs, template IDs, emails) |
| `_LOGIN_TOKENS` | _(removed)_ | Use Supabase Auth + `members.user_id` |
| _(new)_ | `audit_log` | GDPR: who, what, when, entity |

---

## Column Mapping Detail

### `members` ← ASSOCIATI (`COL_INDEX`)

| GAS Column | DB Column |
|------------|-----------|
| A Numero | `member_number` |
| B Data Iscrizione | `enrolled_at` |
| D Nome | `first_name` |
| E Cognome | `last_name` |
| F Luogo Nascita | `birth_place` |
| G Prov. Nascita | `birth_province` |
| H Data Nascita | `birth_date` |
| I Indirizzo | `address_street` |
| J CAP | `address_postal_code` |
| K Città | `address_city` |
| L Prov. Residenza | `address_province` |
| M Codice Fiscale | `tax_code` |
| N Cellulare | `phone` |
| O Email | `email` |
| P Numero Tutore | `legacy_tutor_member_number` |
| Q Nome Completo Tutore | `legacy_tutor_full_name` |
| R–V Tutore manuale | `manual_tutor_*` |
| W Telegram Chat ID | `telegram_chat_id` |
| X Consenso GDPR | `gdpr_consent` |

### `reimbursements` ← NOTULE (`LOG_COL_INDEX`)

| GAS Column | DB Column | Type |
|------------|-----------|------|
| A Anno | `fiscal_year` | integer |
| B Data Generazione | `generated_at` | timestamptz |
| C Progressivo | `progressive` | text |
| D Importo Lordo | `gross_amount_eur` | numeric(10,2) |
| E Ritenuta | `withholding_eur` | numeric(10,2) |
| F Importo Netto | `net_amount_eur` | numeric(10,2) |
| G Nome Associato | `member_id` | FK (was free text) |
| H URL PDF | `pdf_url` | text, nullable |
| I Metodo Pagamento | `payment_method` | text |
| J Data Pagamento | `payment_date` | date |
| K Importo Ricevute | `receipts_amount_eur` | numeric(10,2) |
| L Ricevute | `receipts_notes` + `receipts_status` | text + enum |

Additional: `signature_required`, `signed_at`, `signature_storage_path` (product requirement).

### `enrollments` ← ISCRIZIONI (`ISCR_COL`)

| GAS Column | DB Column | Type |
|------------|-----------|------|
| ID_Iscrizione | `legacy_enrollment_id` | text |
| Nome / Cognome / Email / CF / Telefono | `first_name`, `last_name`, `email`, `tax_code`, `phone` | text |
| Anno_Societario | `fiscal_year` | integer |
| Importo_Centesimi | `amount_centesimi` | **integer** |
| Pagamento_Stato | `payment_status` | text |
| Pagamento_Link_* | `payment_link_url`, `payment_link_id` | text |
| Pagamento_Totale_Centesimi | `payment_total_centesimi` | integer |
| Pagamento_Stripe_* | `stripe_*_centesimi`, `stripe_payment_intent_id` | integer / text |
| Pagamento_Pagato_At | `paid_at` | timestamptz |
| Created_At | `created_at` | timestamptz |
| Payload_JSON | `form_payload` | jsonb |
| PDF_URL | `pdf_url` | text |
| Email_Conferma_Inviata | `confirmation_email_sent` | boolean |

### `annual_quota_settings` ← IMPOSTAZIONI_QUOTE

| GAS Column | DB Column |
|------------|-----------|
| A Anno | `fiscal_year` |
| B Importo | `amount_eur` |

### `member_annual_quotas` ← QUOTE

| GAS Column | DB Column |
|------------|-----------|
| A Nome Cognome | `member_id` (resolved at migration) |
| B Anno | `fiscal_year` |
| C Data Pagamento | `paid_at` |
| D Importo Pagato | `amount_paid_eur` |

### `message_templates` ← TEMPLATE

| GAS Column | DB Column |
|------------|-----------|
| A NomeModello | `name` |
| B Oggetto | `subject` |
| C TestoMessaggio | `body` |

---

## Roles & Access (RLS)

| Role | Typical access |
|------|----------------|
| **admin** | Full CRUD on all tables; audit_log read |
| **segreteria** | Members, quotas, enrollments; no reimbursement create |
| **docente** | Reimbursements create/read; room booking; member read |
| **associato** | Own profile, quotas, reimbursements; book rooms if quota OK |
| **tutore** | Own + ward members (via `tutor_links`) |
| **social** | Message templates & campaigns |

**Room booking:** `can_book_rooms()` = admin OR docente OR (associato AND current-year quota paid).

**Reimbursements:** `can_manage_reimbursements()` = admin OR docente.

Public enrollment inserts bypass RLS via Edge Function / `service_role`.

---

## Money Conventions

| Context | Storage |
|---------|---------|
| ISCRIZIONI / Stripe | **Integer centesimi** |
| NOTULE lordo/netto/ritenuta/ricevute | **numeric(10,2)** euros |
| QUOTE / IMPOSTAZIONI_QUOTE | **numeric(10,2)** euros |

---

## Realtime

`bookings` is added to `supabase_realtime` publication for live room availability.

---

## Not Migrated

- Historical reimbursement PDF URLs (Drive) — `pdf_url` left null; only new PDFs in Supabase Storage
- `_LOGIN_TOKENS` sheet — replaced by Supabase Auth
- `_ISCRIZIONE_TOKENS` — replaced by Supabase Auth / signed URLs in app layer

---

## Files

| File | Purpose |
|------|---------|
| `migrations/001_initial_schema.sql` | Tables, enums, indexes, constraints, helper functions, RLS enable |
| `migrations/002_rls_policies.sql` | Row Level Security policies per role |
| `migrations/003_seed_data.sql` | Rooms, quota years, app_settings keys |
