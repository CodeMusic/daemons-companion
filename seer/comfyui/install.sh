#!/usr/bin/env bash
# ComfyUI for the DAEMONS art tools (tools/spriteforge.py): :8008. One already answering there is used as it is.
set -euo pipefail
SEER="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"; . "$SEER/lib/service.sh"
if curl -fsS --max-time 3 http://127.0.0.1:8008/system_stats >/dev/null 2>&1; then echo "   ComfyUI: already answering on :8008, used as it is"; exit 0; fi
APPS="${SEER_APPS:-$HOME/daemons-seer-apps}"; DIR="$APPS/ComfyUI"
mkdir -p "$APPS"
[ -d "$DIR/.git" ] || git clone --depth 1 https://github.com/comfyanonymous/ComfyUI.git "$DIR"
[ -d "$DIR/venv" ] || python3 -m venv "$DIR/venv"
"$DIR/venv/bin/pip" install --quiet --upgrade pip torch torchvision torchaudio
"$DIR/venv/bin/pip" install --quiet -r "$DIR/requirements.txt"
seer_service comfyui "" /bin/sh -c "cd '$DIR' && exec venv/bin/python main.py --listen 0.0.0.0 --port 8008"
seer_wait http://127.0.0.1:8008/system_stats 120 && echo "   ComfyUI: up on :8008" || echo "   ComfyUI: still starting"
echo "   The sprite model is not downloaded for you (its licence is its maker's): put pixelArtDiffusionXL_spriteShaper.safetensors"
echo "   in $DIR/models/checkpoints/ (CivitAI, 'Pixel Art Diffusion XL'), then restart ComfyUI."
