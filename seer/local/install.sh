#!/usr/bin/env bash
# This machine's own models, for when there is no Tiiny (or it stops answering): a chat model on :1234 and Whisper for
# hearing on :8770. LM Studio (or anything) already answering on :1234 is used as it is.
set -euo pipefail
SEER="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"; . "$SEER/lib/service.sh"
set -a; . "$SEER/.seer"; set +a
MAC=$([ "$(uname)" = Darwin ] && [ "$(uname -m)" = arm64 ] && echo yes || echo no)
if curl -fsS --max-time 3 http://127.0.0.1:1234/v1/models >/dev/null 2>&1; then echo "   local models: :1234 already answers (LM Studio?), used as it is"
elif [ "$MAC" = yes ]; then
  V="$HOME/.daemons-mlx-venv"; [ -d "$V" ] || python3 -m venv "$V"
  "$V/bin/pip" install --quiet --upgrade pip mlx-lm
  seer_service localmodels "" "$V/bin/mlx_lm.server" --model "${LOCAL_TALK_MODEL:-mlx-community/gemma-3-4b-it-4bit}" --host 127.0.0.1 --port 1234
  echo "   local models: MLX serving ${LOCAL_TALK_MODEL:-mlx-community/gemma-3-4b-it-4bit} on :1234 (downloads on first ask)"
else
  echo "   local models: on Linux run Ollama or llama.cpp's server yourself and set LOCAL_URL in seer/.seer (Ollama: http://127.0.0.1:11434/v1)"
fi
if curl -fsS --max-time 3 http://127.0.0.1:8770/health >/dev/null 2>&1; then echo "   hearing: Whisper already answers on :8770"
elif [ "$MAC" = yes ]; then
  command -v ffmpeg >/dev/null || { echo "   hearing needs ffmpeg: brew install ffmpeg" >&2; exit 1; }
  V="$HOME/.daemons-stt-venv"; [ -d "$V" ] || python3 -m venv "$V"
  "$V/bin/pip" install --quiet --upgrade pip mlx-whisper fastapi uvicorn python-multipart numpy
  seer_service stt "" "$V/bin/python" "$SEER/stt/whisper_server.py"
  echo "   hearing: Whisper on :8770 (downloads ~1.6 GB on first use)"
else
  echo "   hearing: seer/stt is MLX (Apple silicon); on Linux point STT_URL in seer/.seer at any OpenAI-style transcription server"
fi
