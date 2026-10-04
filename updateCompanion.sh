#!/usr/bin/env bash
# Put the newest firmware on the handheld (the LilyGO T-Embed CC1101), over its USB cable.
#
#   ./updateCompanion.sh              build the firmware and flash it to the board
#   ./updateCompanion.sh --link       ... then link it to the server (./linkCompanion.sh)
#   ./updateCompanion.sh --build      only build it, to check it compiles (no board needed)
#   ./updateCompanion.sh --help
#
# A running bridge holds the board's port and would make the upload fail, so it is stopped first.
# If the upload cannot connect: hold BOOT, press and release RST, let go of BOOT, and run this again
# (firmware/esp32/FLASHING.md). It needs PlatformIO: pip install platformio.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
FW="$HERE/firmware/esp32"

usage() { sed -n '2,7p' "$0" | sed 's/^# \{0,1\}//'; }

link=0 build_only=0
for arg in "$@"; do
  case "$arg" in
    --link)         link=1 ;;
    --build)        build_only=1 ;;
    -h|--help|help) usage; exit 0 ;;
    *) echo "updateCompanion: unknown '$arg' (try --help)" >&2; exit 64 ;;
  esac
done

# -- PlatformIO ---------------------------------------------------------------------------------------------------
PIO="$(command -v pio || true)"
[[ -n "$PIO" ]] || { [[ -x "$HOME/.platformio/penv/bin/pio" ]] && PIO="$HOME/.platformio/penv/bin/pio"; }
[[ -n "$PIO" ]] || { echo "updateCompanion: needs PlatformIO (pip install platformio)." >&2; exit 1; }

cd "$FW"
if [[ $build_only == 1 ]]; then exec "$PIO" run; fi

# -- the board ------------------------------------------------------------------------------------------------------
port="$(ls /dev/cu.usbmodem* 2>/dev/null | head -1 || true)"
if [[ -z "$port" ]]; then
  echo "updateCompanion: no board on USB. Plug it in with a cable that carries data (not only power), then run this again." >&2
  exit 1
fi

if pgrep -f usb_bridge.py >/dev/null 2>&1; then
  echo "updateCompanion: stopping the bridge (it holds the board's port)"
  pkill -f usb_bridge.py || true
  sleep 1
fi

echo "updateCompanion: flashing $port"
"$PIO" run -t upload --upload-port "$port"
echo "updateCompanion: done -- the board restarts on the new firmware."

if [[ $link == 1 ]]; then exec "$HERE/linkCompanion.sh"; fi
echo "updateCompanion: to link it to the server: ./linkCompanion.sh"
