#!/usr/bin/env bash
# LiteLLM, the local cloud's one door to every model (seer/make.py writes its config): :4000, keyed by LITELLM_MASTER_KEY.
set -euo pipefail
SEER="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"; . "$SEER/lib/service.sh"
VENV="$HOME/.litellm-venv"
PY=""; for c in python3.12 python3.11 python3; do command -v "$c" >/dev/null && "$c" -c 'import sys;sys.exit(sys.version_info<(3,9))' && { PY="$c"; break; }; done
[ -n "$PY" ] || { echo "LiteLLM needs Python 3.9 or newer" >&2; exit 1; }
[ -d "$VENV" ] || "$PY" -m venv "$VENV"
"$VENV/bin/pip" install --quiet --upgrade pip 'litellm[proxy]'
seer_service litellm "$SEER/out/services.env" "$VENV/bin/litellm" --config "$SEER/out/litellm.yaml" --port 4000
seer_wait http://127.0.0.1:4000/health/liveliness 60 && echo "   LiteLLM: up on :4000" || { echo "   LiteLLM: not answering yet -- its log says why"; exit 1; }
