#!/usr/bin/env bash
# n8n and the companion's workflows (daemon/talk, daemon/hear), set to this local cloud's configuration.
#   - no n8n on :5678: ours is started (docker compose, seer/n8n/docker-compose.yml, its env from seer/out/n8n.env)
#   - one already there (roverbyteseer's musai stack): used as it is -- its environment must carry seer/out/n8n.env's
#     lines (it is said which), since a workflow reads its models and keys from n8n's own environment
# Then the workflows are written for this config and put on it, switched on. n8n's API needs a key made once by hand.
set -euo pipefail
SEER="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"; . "$SEER/lib/service.sh"
CONF="$SEER/.seer"; set -a; . "$CONF"; set +a
if curl -fsS --max-time 3 -o /dev/null http://127.0.0.1:5678/healthz 2>/dev/null; then
  if ! docker ps --format '{{.Names}}' 2>/dev/null | grep -qx daemons-n8n; then
    echo "   n8n: one already answers on :5678 (not ours) -- used as it is. Its environment needs these names, from"
    echo "   seer/out/n8n.env, for the workflows to reach this config's models:"
    sed -n 's/=.*//p' "$SEER/out/n8n.env" | grep -v '^#' | grep -E '^(DEX_|DAEMONS_|OPENROUTER)' | sed 's/^/     /'
  fi
else
  command -v docker >/dev/null || { echo "   n8n runs in Docker: install Docker Desktop (Mac) or docker + compose (Linux), then run this again" >&2; exit 1; }
  docker compose -f "$SEER/n8n/docker-compose.yml" up -d
  seer_wait http://127.0.0.1:5678/healthz 120 && echo "   n8n: up on :5678" || { echo "   n8n: not answering"; exit 1; }
fi
if [ -z "${N8N_INTERNAL_KEY:-}" ]; then
  echo
  echo "   n8n's API needs a key, made once on its own page:"
  echo "     1. open http://${SEER_HOST:-$(hostname -s)}:5678 and make the owner account (first time only)"
  echo "     2. Settings > n8n API > Create an API key"
  if [ -t 0 ]; then
    read -r -s -p "   paste the key here (Enter to skip; run 'seer/bindSeer.sh n8n' later): " K; echo
    [ -n "$K" ] && { printf 'N8N_INTERNAL_URL=http://127.0.0.1:5678\nN8N_INTERNAL_KEY=%s\n' "$K" >> "$CONF"; N8N_INTERNAL_KEY="$K"; }
  fi
fi
[ -n "${N8N_INTERNAL_KEY:-}" ] || { echo "   n8n: workflows not put on it yet (no API key)"; exit 0; }
for f in "$SEER/out/n8n/"*.json; do python3 "$SEER/n8n/push.py" internal "$f" | sed 's/^/   /'; done
if [ -n "${N8N_PUBLIC_URL:-}" ] && [ -n "${N8N_PUBLIC_KEY:-}" ]; then
  for f in "$SEER/out/n8n/public-relay/"*.json; do python3 "$SEER/n8n/push.py" public "$f" | sed 's/^/   /'; done
fi
