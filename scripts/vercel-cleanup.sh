#!/usr/bin/env bash
# Libera quota Vercel Hobby (10 GB disk) senza toccare alias attivi.
# Uso:
#   bash scripts/vercel-cleanup.sh              # --safe su tutti i progetti del team
#   bash scripts/vercel-cleanup.sh musicpro-school
#   bash scripts/vercel-cleanup.sh --aggressive musicpro-school  # rimuove anche alias git-* vecchi (>7g)
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

aggressive=0
projects=()
for arg in "$@"; do
  case "$arg" in
    --aggressive) aggressive=1 ;;
    -h|--help)
      sed -n '2,8p' "$0"
      exit 0
      ;;
    *) projects+=("$arg") ;;
  esac
done
if ((${#projects[@]} == 0)); then
  projects=("${ALL_PROJECTS[@]}")
fi

note() { printf '→ %s\n' "$*"; }

remove_safe() {
  local project="$1"
  note "vercel remove $project --safe --yes (scope=$SCOPE)"
  npx vercel remove "$project" --safe --yes --scope "$SCOPE"
}

# Drop stale git-branch aliases so --safe can reclaim those deployments next run.
prune_stale_git_aliases() {
  local project="$1"
  local max_age_days="${2:-7}"
  note "prune git-* aliases older than ${max_age_days}d for $project"
  # alias ls has no JSON; parse age column (Nd / Nh / Nm / Ns)
  npx vercel alias ls --scope "$SCOPE" 2>/dev/null | awk -v proj="$project" -v maxd="$max_age_days" '
    $0 ~ proj"-git-" {
      age=$NF
      days=0
      if (age ~ /^[0-9]+d$/) { sub(/d$/,"",age); days=age+0 }
      else if (age ~ /^[0-9]+h$/) { sub(/h$/,"",age); days=(age+0)/24 }
      else if (age ~ /^[0-9]+m$/) { days=0 }
      else if (age ~ /^[0-9]+s$/) { days=0 }
      if (days >= maxd) print $(NF-1)
    }
  ' | while read -r url; do
    [[ -z "$url" ]] && continue
    note "alias rm $url"
    npx vercel alias rm "$url" --yes --scope "$SCOPE" || true
  done
}

for project in "${projects[@]}"; do
  echo "===== $project ====="
  if ((aggressive)); then
    prune_stale_git_aliases "$project" 7
  fi
  remove_safe "$project"
done

note "Done. Re-run with --aggressive to drop old git-* preview aliases, then --safe again."
