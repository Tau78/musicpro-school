# Google Sheets → Supabase migration

One-time (idempotent) import of historical data from the MusicPro School Google Spreadsheet into Supabase PostgreSQL.

## Prerequisites

1. **Supabase schema applied** — run migrations in `supabase/migrations/` first (`supabase db push` or `psql -f …`).
2. **Google Cloud service account** with access to the spreadsheet:
   - Create a service account in [Google Cloud Console](https://console.cloud.google.com/).
   - Enable **Google Sheets API**.
   - Download the JSON key file.
   - Share the spreadsheet with the service account email (Viewer is enough).
3. **Node.js 18+**

## Environment variables

Create or extend `.env` in the project root:

```env
# Path to service account JSON (required)
GOOGLE_SERVICE_ACCOUNT_JSON=/absolute/path/to/service-account.json

# Spreadsheet ID (default: GAS SPREADSHEET_ID from Codice.js)
SPREADSHEET_ID=1vwyCTqXJDe0IKr_tIH2Dgz5ewlTo-OCnTxH2WNSYAOU

# Supabase project (service role bypasses RLS)
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

| Variable | Required | Description |
|----------|----------|-------------|
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Yes | Filesystem path to Google service account credentials JSON |
| `SPREADSHEET_ID` | No | Source spreadsheet ID (defaults to legacy GAS ID) |
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Service role key (not anon key) |

## Install

From the project root:

```bash
npm install
```

Adds `@supabase/supabase-js` and `googleapis` (see root `package.json`).

## Run

**Dry run** (read sheets, log counts, no database writes):

```bash
npm run migrate:sheets -- --dry-run
```

**Live migration** (upsert all sheets):

```bash
npm run migrate:sheets
```

**Partial migration** (re-run a single entity):

```bash
npm run migrate:sheets -- --only=members
npm run migrate:sheets -- --only=quotas
npm run migrate:sheets -- --only=reimbursements
npm run migrate:sheets -- --only=enrollments
npm run migrate:sheets -- --only=templates
```

## Migration order

The orchestrator runs steps in FK-safe order:

| Step | GAS sheet | PostgreSQL table(s) |
|------|-----------|---------------------|
| 1 | `ASSOCIATI` | `members`, `tutor_links` |
| 2 | `IMPOSTAZIONI_QUOTE`, `QUOTE` (+ legacy cols on ASSOCIATI) | `annual_quota_settings`, `member_annual_quotas` |
| 3 | `NOTULE` | `reimbursements` |
| 4 | `ISCRIZIONI` | `enrollments` |
| 5 | `TEMPLATE` | `message_templates` |

## Idempotency

Upserts use unique keys:

- `members` — `tax_code`, else `member_number`, else match on `legacy_row_number`
- `member_annual_quotas` — `(member_id, fiscal_year)`
- `annual_quota_settings` — `fiscal_year`
- `reimbursements` — `(member_id, fiscal_year, progressive)`
- `enrollments` — `legacy_enrollment_id`
- `message_templates` — `name`

## Traceability fields

- `members.legacy_row_number` — original ASSOCIATI row (1-based, data rows start at 2)
- `reimbursements.legacy_sheet_row` — original NOTULE row
- `enrollments.legacy_enrollment_id` — GAS `ID_Iscrizione`

## Special handling

- **NOTULE `pdf_url`** — always `NULL` for historical rows (Drive URLs not imported).
- **Legacy quota columns** — ASSOCIATI columns from col S (`START_COL_QUOTE`) with year headers are merged into `member_annual_quotas` when not already present in `QUOTE`.
- **Member resolution** — reimbursements and quotas match members by normalized full name (`nome cognome`), then tax code / member number / legacy row.
- **Money** — enrollments in centesimi (integer); quotas and reimbursements in euros (`numeric`).

## Output

Each sheet logs inserted/upserted counts, skipped rows, and up to 20 error lines. Exit code `1` if any errors occurred.

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `403` from Google Sheets | Share spreadsheet with service account email |
| `member not found` on NOTULE/QUOTE | Run `--only=members` first; check name spelling in sheet |
| Duplicate tax_code | Resolve duplicates in ASSOCIATI before re-run |
| `gross_amount_eur` constraint | NOTULE rows with zero/empty gross amount are skipped |

See also `supabase/README.md` for full column mapping.

## QUOTE name matching (2025-06-11)

Enhanced `resolveMemberIdFromQuoteName()` recovers quota rows where the QUOTE sheet name differs slightly from ASSOCIATI/DB:

| Strategy | Example |
|----------|---------|
| Exact / whitespace-normalized | double spaces trimmed |
| Accent-stripped full name | `Callà` ↔ `Calla` |
| Cognome + initial | `A Caruso` → Alessandro Caruso |
| Unique cognome + compatible nome | `Franco Senes` → Francesco Senes |
| Fuzzy cognome (Levenshtein) + compatible nome | `Petralia` → Petrolio, `Cannigia` → Caniggia |

**Last run:** QUOTE sheet 97 rows — **4 unresolved** (not in `members`: Michela Terrosi, Giovanni Pegoraro, Tony Carta, Nicola Parma). **91** rows in `member_annual_quotas` (was 86 before fix). Verify: `node scripts/verify-quota-import.mjs`.
