#!/usr/bin/env bash
# Apply Supabase booking migrations 006–009 for MusicPro School.
# Project ref: mlsiagbrejjylqvcnfbe
#
# Use when `supabase db push` fails with:
#   tenant/user postgres.mlsiagbrejjylqvcnfbe not found (SQLSTATE XX000)
# Typical causes: paused project, pooler/tenant routing, or network restrictions.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PROJECT_REF="mlsiagbrejjylqvcnfbe"
DASHBOARD="https://supabase.com/dashboard/project/${PROJECT_REF}/sql/new"
BUNDLE="scripts/sql/booking_migrations_006_008_bundle.sql"

echo "MusicPro School — booking migrations 006–009"
echo "Project: ${PROJECT_REF}"
echo ""

try_cli_push() {
  local pass=""
  if [[ -f musicpro/.env ]]; then
    pass="$(grep -E '^SUPABASE_PASS=' musicpro/.env | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")"
  fi
  if [[ -z "${pass}" ]]; then
    echo "SUPABASE_PASS not found in musicpro/.env — skipping CLI push."
    return 1
  fi
  echo "Attempting: supabase migration list --linked ..."
  if supabase migration list --linked -p "${pass}"; then
    echo ""
    echo "Attempting: supabase db push --linked --yes ..."
    supabase db push --linked --yes -p "${pass}"
    echo "CLI push succeeded."
    return 0
  fi
  return 1
}

if try_cli_push; then
  exit 0
fi

echo ""
echo "CLI push failed or unavailable. Manual steps:"
echo ""
echo "1. Open Supabase Dashboard and confirm the project is ACTIVE (not Paused):"
echo "   https://supabase.com/dashboard/project/${PROJECT_REF}"
echo ""
echo "2. SQL Editor → New query:"
echo "   ${DASHBOARD}"
echo ""
echo "3. Paste and run the combined bundle (recommended):"
echo "   ${BUNDLE}"
echo ""
echo "   Or run individual files in order:"
echo "   - supabase/migrations/006_booking_config.sql (enum pending_approval)"
echo "   - supabase/migrations/007_booking_config.sql"
echo "   - supabase/migrations/008_booking_admin_review.sql"
echo "   - supabase/migrations/009_stripe_room_booking.sql"
echo ""
echo "4. Optional — sync migration history for future CLI pushes (if 006–009 not listed):"
echo "   INSERT INTO supabase_migrations.schema_migrations (version)"
echo "   VALUES"
echo "     ('006_booking_config'),"
echo "     ('007_booking_config'),"
echo "     ('008_booking_admin_review'),"
echo "     ('009_stripe_room_booking')"
echo "   ON CONFLICT DO NOTHING;"
echo ""
echo "5. Verify in SQL Editor, e.g.:"
echo "   SELECT version FROM supabase_migrations.schema_migrations ORDER BY version;"
echo ""
echo "6. Re-run this script later to retry CLI:"
echo "   ./scripts/apply-booking-migrations.sh"
