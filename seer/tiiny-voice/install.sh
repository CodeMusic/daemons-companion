#!/usr/bin/env bash
# The Tiiny's voice, streamed and keyed (tiiny_voice_stream.py says why): :4001. Only with a Tiiny.
set -euo pipefail
SEER="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"; . "$SEER/lib/service.sh"
ENV="$SEER/out/tiiny-voice.env"
{ cat "$SEER/out/services.env"; echo "TIINY_VOICE_CONFIG=$SEER/out/litellm.yaml"; } > "$ENV"; chmod 600 "$ENV"
seer_service tiinyvoice "$ENV" /usr/bin/env python3 "$SEER/tiiny-voice/tiiny_voice_stream.py"
seer_wait http://127.0.0.1:4001/health 20 && echo "   the Tiiny's voice: up on :4001" || { echo "   the Tiiny's voice: not answering"; exit 1; }
