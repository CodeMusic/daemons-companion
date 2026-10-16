#!/bin/bash
# C-138: build, flash or watch the ESP32-S3-BOX-3 (ESPHome). ESPHome in its own venv (~/.esphome-venv); it installs
# ESP-IDF into its own cache (~/Library/Caches/esphome, about 2 GB) and any PlatformIO it needs into ~/.platformio-esphome,
# so the handhelds' (~/.platformio) and the Tab5's (~/.platformio-tab5) are never touched.
#
#   firmware/box3/box3.sh compile                     build box3.yaml (copy box3.example.yaml to it first)
#   firmware/box3/box3.sh run                         build and flash -- over Wi-Fi if it is on the network, else ask
#   firmware/box3/box3.sh run --device /dev/cu.usbmodem101    flash down the cable
#   firmware/box3/box3.sh logs                        its log
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
VENV="${ESPHOME_VENV:-$HOME/.esphome-venv}"
export PLATFORMIO_CORE_DIR="${PLATFORMIO_CORE_DIR:-$HOME/.platformio-esphome}"

if [[ ! -x "$VENV/bin/esphome" ]]; then
  py="$(command -v python3.12 || command -v python3)"
  echo "box3: installing ESPHome into $VENV (once)"
  "$py" -m venv "$VENV" && "$VENV/bin/pip" install -q esphome
fi
cd "$HERE"
[[ -f box3.yaml ]] || { echo "box3: copy box3.example.yaml to box3.yaml (and secrets.example.yaml to secrets.yaml) and fill them in" >&2; exit 64; }
[[ -f secrets.yaml ]] || { echo "box3: copy secrets.example.yaml to secrets.yaml and fill it in" >&2; exit 64; }
cache="${ESPHOME_DATA_DIR:-$HOME/Library/Caches/esphome}"
free=$(df -k "$HOME" | tail -1 | awk '{print $4}')
if [[ "${1:-}" != logs && "$free" -lt 4194304 && ! -d "$cache/idf" ]]; then
  echo "box3: the first build needs about 4 GB free and there is $((free / 1048576)) GB" >&2; exit 1
fi
# ESP-IDF names its own version from the nearest git repository above its folder (~/Library/Caches/esphome/idf/...). A
# home folder that is itself an empty git repository -- no commits -- stops the build there ("head-ref: No such file").
# So ESPHome's cache gets a repository of its own, one empty commit, and the search ends at it. Nothing else is touched.
if [[ "$(uname)" == Darwin && ! -d "$cache/.git" ]] && git -C "$HOME" rev-parse --git-dir >/dev/null 2>&1 &&
   ! git -C "$HOME" rev-parse -q --verify HEAD >/dev/null 2>&1; then
  mkdir -p "$cache" && git init -q "$cache" &&
    git -C "$cache" -c user.name=box3 -c user.email=box3@localhost commit -q --allow-empty -m "where ESP-IDF stops looking for its version"
fi
cmd="${1:-compile}"; shift || true
exec "$VENV/bin/esphome" "$cmd" box3.yaml "$@"
