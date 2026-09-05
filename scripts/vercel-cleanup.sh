#!/usr/bin/env bash
# Libera quota Vercel Hobby (10 GB disk) senza spegnere la produzione.
#
# Uso:
#   bash scripts/vercel-cleanup.sh
#   bash scripts/vercel-cleanup.sh musicpro-school
#   bash scripts/vercel-cleanup.sh --aggressive   # toglie anche alias git-* >7g, poi --safe
#
# Sicurezza:
#   - usa sempre --safe (salta deployment con alias attivo)
#   - dopo ogni progetto verifica che l'host prod risponda se mappato
#   - NON cancella per URL esplicito il deployment corrente
set -euo pipefail

SCOPE="${VERCEL_SCOPE:-tau78s-projects}"
ALL_PROJECTS=(
  musicpro-school
  musicpro-admin
  app-eventi-iumu
  loveroulette
  genova-fun
  musicpro-eventi-web
  web
  regia-musicpro
)

# Host pubblici da smoke-check dopo cleanup (vuoto = skip)
declare -A PROD_HOST=(
  [musicpro-school]=school.musicproeventi.it
  [musicpro-admin]=admin.musicproeventi.it
)

aggressive=0
projects=()
for arg in "$@"; do
  case "$arg" in
    --aggressive) aggressive=1 ;;
    -h|--help)
      sed -n '2,12p' "$0"
      exit 0
      ;;
    *) projects+=("$arg") ;;
  esac
done
if ((${#projects[@]} == 0)); then
  projects=("${ALL_PROJECTS[@]}")
fi

note() { printf '→ %s\n' "$*"; }
warn() { printf 'WARN: %s\n' "$*" >&2; }

smoke_prod() {
  local project="$1"
  local host="${PROD_HOST[$project]:-}"
  [[ -z "$host" ]] && return 0
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" -L --max-time 20 "https://${host}/" || echo 000)
  if [[ "$code" == "000" || "$code" -ge 500 || "$code" == "404" ]]; then
    warn "$host → HTTP $code dopo cleanup — rideploy subito: cd musicpro/apps/web && npx vercel deploy --prod --yes"
    return 1
  fi
  note "smoke https://${host}/ → $code"
}

prune_stale_git_aliases() {
  local project="$1"
  local max_age_days="${2:-7}"
  note "prune git-* aliases older than ${max_age_days}d for $project"
  npx vercel alias ls --scope "$SCOPE" 2>/dev/null | awk -v proj="$project" -v maxd="$max_age_days" '
    $0 ~ proj"-git-" {
      age=$NF
      days=0
      if (age ~ /^[0-9]+d$/) { sub(/d$/,"",age); days=age+0 }
      else if (age ~ /^[0-9]+h$/) { sub(/h$/,"",age); days=(age+0)/24 }
      if (days >= maxd) print $(NF-1)
    }
  ' | while read -r url; do
    [[ -z "$url" ]] && continue
    note "alias rm $url"
    npx vercel alias rm "$url" --yes --scope "$SCOPE" || true
  done
}

remove_safe() {
  local project="$1"
  note "vercel remove $project --safe --yes (scope=$SCOPE)"
  # Non fallire lo script se un dpl è già stato rimosso in parallelo
  npx vercel remove "$project" --safe --yes --scope "$SCOPE" || warn "remove $project: exit $? (spesso race OK)"
}

for project in "${projects[@]}"; do
  echo "===== $project ====="
  if ((aggressive)); then
    prune_stale_git_aliases "$project" 7
  fi
  remove_safe "$project"
  smoke_prod "$project" || true
done

note "Done. Se un host prod è 404, rideploya immediatamente."
