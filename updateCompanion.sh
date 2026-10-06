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

# The S3's own USB sometimes leaves the board in its bootloader after the upload's "hard reset": it looks dead and says
# nothing (2026-10-06). The firmware says HELLO every three seconds, so wait for one, and reset it ourselves if it is
# silent. The port comes and goes while it restarts.
python3 - "$port" <<'PY' || echo "updateCompanion: no HELLO yet -- press the board's RST button once." >&2
import serial, sys, time
port = sys.argv[1]
def hello(wait):
    end = time.time() + wait
    while time.time() < end:
        try:
            with serial.Serial(port, 115200, timeout=0.5) as s:
                got = b""
                while time.time() < end:
                    got += s.read(512)
                    if b"HELLO daemons-companion" in got:
                        return True
        except (serial.SerialException, OSError):
            time.sleep(0.5)
    return False
if hello(10):
    sys.exit(0)
print("updateCompanion: the board is silent after the upload -- resetting it")
with serial.Serial(port, 115200) as s:
    s.dtr = False; s.rts = True; time.sleep(0.2); s.rts = False
sys.exit(0 if hello(20) else 1)
PY
echo "updateCompanion: done -- the board is running the new firmware."

if [[ $link == 1 ]]; then exec "$HERE/linkCompanion.sh"; fi
echo "updateCompanion: to link it to the server: ./linkCompanion.sh"
