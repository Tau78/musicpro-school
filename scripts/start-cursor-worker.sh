#!/bin/zsh
# Worker My Machines — MusicPro School (Tau78/musicpro-school)
set -euo pipefail
export PATH="$HOME/.local/bin:$PATH"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
exec "$HOME/.local/bin/cursor-mac-mini-school-worker.sh"
