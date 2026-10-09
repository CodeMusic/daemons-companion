#!/usr/bin/env bash
# C-77: the Tab5's own PlatformIO. pioarduino's platform (Arduino 3.3, the ESP32-P4) needs PlatformIO Core 6.2, and the
# handhelds are built with the PlatformIO already installed -- so this one lives apart: a virtual environment here
# (.venv, made the first time) and its own core folder (~/.platformio-tab5), where its toolchains go. Nothing the
# handhelds use is touched.
#
#   ./pio.sh run                 build
#   ./pio.sh run -t upload       flash
#   ./pio.sh device monitor      watch it
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
VENV="$HERE/.venv"
if [[ ! -x "$VENV/bin/pio" ]]; then
  echo "pio.sh: making the Tab5's own PlatformIO (once) in $VENV" >&2
  python3 -m venv "$VENV"
  "$VENV/bin/pip" install --quiet "platformio==6.2.0"
fi
export PLATFORMIO_CORE_DIR="${PLATFORMIO_CORE_DIR:-$HOME/.platformio-tab5}"
cd "$HERE"
exec "$VENV/bin/pio" "$@"
