#!/usr/bin/env bash
# ACE-Step 1.5 (github.com/ace-step/ACE-Step-1.5), the music model sleep sounds are made with: its API on 127.0.0.1:8001
# only. One already answering there (roverbyteseer's musai stack) is used as it is. First run downloads ~19 GB of models.
set -euo pipefail
SEER="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"; . "$SEER/lib/service.sh"
if curl -fsS --max-time 3 http://127.0.0.1:8001/health >/dev/null 2>&1; then echo "   ACE-Step: already answering on :8001, used as it is"; exit 0; fi
APPS="${SEER_APPS:-$HOME/daemons-seer-apps}"; DIR="$APPS/ACE-Step-1.5"
mkdir -p "$APPS"
[ -d "$DIR/.git" ] || git clone --depth 1 https://github.com/ace-step/ACE-Step-1.5.git "$DIR"
[ -d "$APPS/uv-venv" ] || python3 -m venv "$APPS/uv-venv"
"$APPS/uv-venv/bin/pip" install --quiet --upgrade uv
(cd "$DIR" && "$APPS/uv-venv/bin/uv" sync)
ENV="$SEER/out/acestep.env"; : > "$ENV"
[ "$(uname)" = Darwin ] && [ "$(uname -m)" = arm64 ] && echo "ACESTEP_LM_BACKEND=mlx" >> "$ENV"
echo "TOKENIZERS_PARALLELISM=false" >> "$ENV"
seer_service acestep "$ENV" /bin/sh -c "cd '$DIR' && exec '$APPS/uv-venv/bin/uv' run acestep-api --host 127.0.0.1 --port 8001"
echo "   ACE-Step: starting -- the first start downloads its models (~19 GB) and takes a while"
seer_wait http://127.0.0.1:8001/health 900 && echo "   ACE-Step: up on :8001" || echo "   ACE-Step: still starting; sleep sounds wait for it"
