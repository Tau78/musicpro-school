#!/usr/bin/env bash
# MusicPro School — VAI
# Allinea il repo, salva il lavoro, mergia le PR su main e manda tutto in produzione:
#   git → PR → main → Supabase migrations → Edge Functions → Vercel → FTP iscrizione → smoke HTTP
#
# Uso:
#   ./scripts/vai.sh
#   ./scripts/vai.sh --dry-run
#   npm run vai
#
# Non fa: clasp/GAS (deprecato), import Sheets, creazione webhook Stripe.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

DRY_RUN=0
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=1
fi

PRODUCTION_HOST="school.musicproeventi.it"
ISCRIZIONE_HOST="iscrizione.musicproeventi.it"
PROJECT_REF="mlsiagbrejjylqvcnfbe"
EDGE_FUNCTIONS=(
  stripe-room-webhook
  stripe-credit-shop-webhook
  stripe-quota-webhook
  booking-calendar-sync
  calendar-availability
  send-booking-email
  external-calendar-sync
)

STAMP="$(date +%Y%m%d-%H%M)"
START_TS="$(date +%s)"
STEP=0
SUMMARY=()
CREATED_PR=""
MERGED_PRS=()
VERCEL_URL=""
DEPLOY_SHA=""

note() { printf '    %s\n' "$*"; }
ok()   { printf '    OK  %s\n' "$*"; SUMMARY+=("OK  $*"); }
warn() { printf '    !!  %s\n' "$*"; SUMMARY+=("!!  $*"); }
die()  { printf '\nERRORE: %s\n' "$*" >&2; exit 1; }

step() {
  STEP=$((STEP + 1))
  printf '\n[%02d] %s\n' "$STEP" "$*"
}

run() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    note "dry-run: $*"
    return 0
  fi
  "$@"
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Manca il comando: $1"
}

read_env_value() {
  local file="$1" key="$2"
  [[ -f "$file" ]] || return 0
  grep -E "^${key}=" "$file" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'"
}

http_code() {
  local url="$1"
  curl -sS -o /dev/null -w '%{http_code}' --max-time 30 -L "$url" || echo "000"
}

on_exit() {
  local code=$?
  local elapsed=$(( $(date +%s) - START_TS ))
  printf '\n========== VAI %s (%ss) ==========\n' \
    "$([[ $code -eq 0 ]] && echo OK || echo FALLITO)" "$elapsed"
  if [[ ${#SUMMARY[@]} -gt 0 ]]; then
    printf '%s\n' "${SUMMARY[@]}"
  fi
  if [[ -n "$CREATED_PR" ]]; then
    printf 'PR: %s\n' "$CREATED_PR"
  fi
  if [[ ${#MERGED_PRS[@]} -gt 0 ]]; then
    printf 'Merge: %s\n' "${MERGED_PRS[*]}"
  fi
  if [[ -n "$DEPLOY_SHA" ]]; then
    printf 'main: %s\n' "$DEPLOY_SHA"
  fi
  if [[ -n "$VERCEL_URL" ]]; then
    printf 'Vercel: %s\n' "$VERCEL_URL"
  fi
  printf 'App: https://%s\n' "$PRODUCTION_HOST"
  printf 'Iscrizione: https://%s/\n' "$ISCRIZIONE_HOST"
  exit "$code"
}
trap on_exit EXIT

if [[ "$DRY_RUN" -eq 1 ]]; then
  note "Modalità dry-run: nessuna modifica, nessun deploy."
fi

# --- 01 preflight -----------------------------------------------------------
step "Preflight strumenti e autenticazioni"
need_cmd git
need_cmd gh
need_cmd node
need_cmd npm
need_cmd npx
need_cmd curl
need_cmd supabase
git rev-parse --is-inside-work-tree >/dev/null || die "Non è un repo git"
gh auth status >/dev/null 2>&1 || die "gh non autenticato. Esegui: gh auth login"
ok "git, gh, node, npm, supabase"

# --- 02 allinea remoto ------------------------------------------------------
step "Allinea i riferimenti remoti"
run git fetch origin --prune
ok "fetch origin"

# --- 03 salva lavoro locale -------------------------------------------------
step "Salva il lavoro locale (commit, senza secret)"
STATUS="$(git status --porcelain)"
CURRENT_BRANCH="$(git branch --show-current)"
if [[ -z "$CURRENT_BRANCH" ]]; then
  die "HEAD staccata: checkout di un branch prima di VAI"
fi

if [[ -n "$STATUS" ]]; then
  note "Working tree sporco su $CURRENT_BRANCH"
  git status -sb
  if [[ "$CURRENT_BRANCH" == "main" ]]; then
    RELEASE_BRANCH="vai/${STAMP}"
    note "Creo branch $RELEASE_BRANCH da main"
    run git checkout -b "$RELEASE_BRANCH"
    CURRENT_BRANCH="$RELEASE_BRANCH"
  fi
  if [[ "$DRY_RUN" -eq 0 ]]; then
    git add -A
    git reset -q -- \
      '.env' '.env.*' 'musicpro/.env' 'musicpro/.env.*' \
      '*.pem' '*credentials.json' 2>/dev/null || true
    if git diff --cached --quiet; then
      warn "Niente da committare dopo il filtro secret"
    else
      git commit -m "$(cat <<EOF
Ship pending work to production.

VAI ${STAMP}: allinea, salva e pubblica su main.
EOF
)"
      ok "commit su $CURRENT_BRANCH"
    fi
  else
    note "dry-run: avrei committato le modifiche su $CURRENT_BRANCH"
  fi
else
  ok "working tree pulito"
fi

# --- 04 allinea branch corrente a origin/main --------------------------------
step "Allinea $CURRENT_BRANCH a origin/main"
if [[ "$CURRENT_BRANCH" != "main" ]]; then
  if [[ "$DRY_RUN" -eq 0 ]]; then
    if ! git merge --ff-only origin/main; then
      git merge --no-edit origin/main || die "Conflitto nel merge di origin/main su $CURRENT_BRANCH"
    fi
  else
    note "dry-run: merge origin/main → $CURRENT_BRANCH"
  fi
  ok "branch allineato a origin/main"
else
  if [[ "$DRY_RUN" -eq 0 ]]; then
    git pull --ff-only origin main || die "main non è fast-forward rispetto a origin/main"
  fi
  ok "main già sul branch di produzione"
fi

# --- 05 lint Next.js se il monorepo è presente ------------------------------
step "Typecheck web (@musicpro/web)"
if [[ -f musicpro/apps/web/package.json ]]; then
  if [[ "$DRY_RUN" -eq 1 ]]; then
    note "dry-run: npm run lint --workspace=@musicpro/web"
  else
    (
      cd musicpro
      npm run lint --workspace=@musicpro/web
    ) || die "Typecheck web fallito: correggi prima di pubblicare"
  fi
  ok "typecheck web"
else
  warn "monorepo web assente, lint saltato"
fi

# --- 06 push + PR del lavoro corrente ---------------------------------------
step "Push e PR del lavoro corrente"
if [[ "$CURRENT_BRANCH" != "main" ]]; then
  run git push -u origin HEAD
  if [[ "$DRY_RUN" -eq 0 ]]; then
    EXISTING_PR="$(gh pr list --head "$CURRENT_BRANCH" --state open --json number --jq '.[0].number' || true)"
    if [[ -z "${EXISTING_PR:-}" ]]; then
      CREATED_PR="$(gh pr create --title "VAI produzione ${STAMP}" --body "$(cat <<EOF
## Summary
- Snapshot automatico VAI ${STAMP}: allinea, salva e manda in produzione.
- Merge su main, migrations Supabase, Edge Functions, Vercel, FTP iscrizione.

## Test plan
- [x] Typecheck @musicpro/web
- [ ] Smoke HTTP school + iscrizione (eseguito dallo script)
EOF
)")"
      ok "PR creata: $CREATED_PR"
    else
      CREATED_PR="$(gh pr view "$EXISTING_PR" --json url --jq .url)"
      ok "PR già aperta: $CREATED_PR"
    fi
  fi
else
  if [[ "$DRY_RUN" -eq 0 ]]; then
    git push origin main || die "Push su main fallito"
  fi
  ok "nessuna feature branch: main già pushato"
fi

# --- 07 merge tutte le PR aperte su main ------------------------------------
step "Merge di tutte le PR aperte su main"
if [[ "$DRY_RUN" -eq 1 ]]; then
  gh pr list --base main --state open
  note "dry-run: avrei mergiato le PR aperte"
else
  OPEN_PRS="$(gh pr list --base main --state open --json number,title,mergeable --jq '.[] | "\(.number)\t\(.mergeable)\t\(.title)"')"
  if [[ -z "$OPEN_PRS" ]]; then
    ok "nessuna PR aperta"
  else
    while IFS=$'\t' read -r num mergeable title; do
      [[ -z "$num" ]] && continue
      if [[ "$mergeable" == "CONFLICTING" ]]; then
        die "PR #$num in conflitto: $title"
      fi
      note "Merge PR #$num — $title"
      gh pr merge "$num" --merge --delete-branch
      MERGED_PRS+=("#$num")
      ok "mergiata PR #$num"
    done <<< "$OPEN_PRS"
  fi
fi

# --- 08 main locale = origin/main -------------------------------------------
step "Checkout main e pull"
if [[ "$DRY_RUN" -eq 0 ]]; then
  git checkout main
  git pull --ff-only origin main
  DEPLOY_SHA="$(git rev-parse --short HEAD)"
else
  DEPLOY_SHA="$(git rev-parse --short origin/main)"
  note "dry-run: checkout main && pull --ff-only"
fi
ok "main @ $DEPLOY_SHA"

# --- 09 migrations Supabase -------------------------------------------------
step "Applica migrations Supabase (db push)"
SUPABASE_PASS="$(read_env_value musicpro/.env SUPABASE_PASS)"
if [[ "$DRY_RUN" -eq 1 ]]; then
  note "dry-run: supabase db push --linked --yes"
elif [[ -n "$SUPABASE_PASS" ]]; then
  supabase db push --linked --yes -p "$SUPABASE_PASS" \
    || die "supabase db push fallito. Controlla che il progetto $PROJECT_REF sia Active."
  ok "migrations applicate"
else
  supabase db push --linked --yes \
    || die "supabase db push fallito (manca SUPABASE_PASS in musicpro/.env)."
  ok "migrations applicate"
fi

# --- 10 Edge Functions ------------------------------------------------------
step "Deploy Edge Functions"
for fn in "${EDGE_FUNCTIONS[@]}"; do
  if [[ "$DRY_RUN" -eq 1 ]]; then
    note "dry-run: supabase functions deploy $fn --no-verify-jwt"
  else
    supabase functions deploy "$fn" --no-verify-jwt \
      || die "Deploy Edge Function fallito: $fn"
  fi
  ok "function $fn"
done

# --- 11 Vercel production ---------------------------------------------------
step "Deploy Vercel production"
if [[ "$DRY_RUN" -eq 1 ]]; then
  note "dry-run: npx vercel deploy --prod --yes"
  VERCEL_URL="https://${PRODUCTION_HOST}"
else
  VERCEL_OUT="$(npx vercel deploy --prod --yes)"
  printf '%s\n' "$VERCEL_OUT"
  VERCEL_URL="$(printf '%s\n' "$VERCEL_OUT" | grep -oE 'https://[a-zA-Z0-9._-]+\.vercel\.app' | tail -1)"
  if [[ -z "$VERCEL_URL" ]]; then
    VERCEL_URL="https://${PRODUCTION_HOST}"
    warn "URL Vercel non in output; --prod ha già aliasato $PRODUCTION_HOST"
  else
    npx vercel alias set "$VERCEL_URL" "$PRODUCTION_HOST" \
      || warn "alias $PRODUCTION_HOST non impostato (forse già attivo)"
  fi
fi
ok "Vercel $VERCEL_URL → https://$PRODUCTION_HOST"

# --- 12 FTP iscrizione ------------------------------------------------------
step "FTP iscrizione.musicproeventi.it"
FTP_USER="$(read_env_value .env ISCRIZIONE_FTP_USER)"
FTP_PASS="$(read_env_value .env FTP_PASS_ISCRIZIONE)"
if [[ "$DRY_RUN" -eq 1 ]]; then
  note "dry-run: npm run deploy:iscrizione"
elif [[ -z "$FTP_USER" || -z "$FTP_PASS" ]]; then
  die "Mancano ISCRIZIONE_FTP_USER o FTP_PASS_ISCRIZIONE in .env"
else
  npm run deploy:iscrizione || die "FTP iscrizione fallito"
fi
ok "FTP $ISCRIZIONE_HOST"

# --- 13 smoke HTTP ----------------------------------------------------------
step "Smoke HTTP produzione"
if [[ "$DRY_RUN" -eq 1 ]]; then
  note "dry-run: curl school + iscrizione + edge"
else
  FAIL_SMOKE=0
  check() {
    local url="$1" expect="$2"
    local code
    code="$(http_code "$url")"
    if [[ "$code" == "$expect" ]]; then
      ok "$code $url"
    else
      warn "$code $url (atteso $expect)"
      FAIL_SMOKE=1
    fi
  }
  check "https://${PRODUCTION_HOST}/prenotazioni" "200"
  check "https://${PRODUCTION_HOST}/login" "200"
  check "https://${PRODUCTION_HOST}/admin" "200"
  check "https://${ISCRIZIONE_HOST}/" "200"

  EDGE_CODE="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 30 \
    -X POST "https://${PROJECT_REF}.supabase.co/functions/v1/stripe-room-webhook" \
    -H 'Content-Type: application/json' \
    -d '{}' || echo 000)"
  if [[ "$EDGE_CODE" == "400" || "$EDGE_CODE" == "401" ]]; then
    ok "edge stripe-room-webhook HTTP $EDGE_CODE (viva)"
  else
    warn "edge stripe-room-webhook HTTP $EDGE_CODE (atteso 400/401)"
    FAIL_SMOKE=1
  fi

  [[ "$FAIL_SMOKE" -eq 0 ]] || die "Smoke HTTP fallito: produzione non allineata"
fi

note "GAS/clasp: saltato (stack deprecato)"
note "migrate:sheets: saltato (non è un deploy, è un import)"
ok "produzione allineata"
