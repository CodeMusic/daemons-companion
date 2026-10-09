#!/usr/bin/env bash
# Put the newest firmware on the companion's devices, over their USB cables -- knowing which board each one is.
#
#   ./updateCompanion.sh                  find the boards plugged in, ask each what it is, flash the right build
#   ./updateCompanion.sh --all            ... every board found, without asking which
#   ./updateCompanion.sh --board t-watch-s3   say what it is (a board with no companion firmware on it yet):
#                                             t-embed, t-watch-s3, m5-sticks3, m5-cores3, m5-core (M5GO, Fire), m5-tab5
#   ./updateCompanion.sh --port /dev/cu.usbmodem1101   only this one
#   ./updateCompanion.sh --link           ... then link it to the server (./linkCompanion.sh)
#   ./updateCompanion.sh --build          only build every board's firmware, to check it compiles (no board needed)
#   ./updateCompanion.sh --help
#
# C-81: every board running the companion says "HELLO daemons-companion <board> <version>" every three seconds, so the
# script asks each port what it is: the T-Embeds (CC1101, plain, SI4732) all take the one build env:t-embed (they tell
# themselves apart at start, C-67), the watch takes env:t-watch-s3. A board that says nothing -- new, or not running the
# companion -- is asked about. A running bridge holds a board's port, so it is stopped first. If an upload cannot
# connect: hold BOOT, press and release RST, let go of BOOT, and run this again (firmware/esp32/FLASHING.md).
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
FW="$HERE/firmware/esp32"

usage() { sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//'; }

link=0 build_only=0 all=0 want_board="" want_port=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --link)         link=1 ;;
    --build)        build_only=1 ;;
    --all)          all=1 ;;
    --board)        want_board="${2:-}"; shift ;;
    --port)         want_port="${2:-}"; shift ;;
    -h|--help|help) usage; exit 0 ;;
    *) echo "updateCompanion: unknown '$1' (try --help)" >&2; exit 64 ;;
  esac
  shift
done

# -- PlatformIO ---------------------------------------------------------------------------------------------------
PIO="$(command -v pio || true)"
[[ -n "$PIO" ]] || { [[ -x "$HOME/.platformio/penv/bin/pio" ]] && PIO="$HOME/.platformio/penv/bin/pio"; }
[[ -n "$PIO" ]] || { echo "updateCompanion: needs PlatformIO (pip install platformio)." >&2; exit 1; }
# The serial checks need pyserial: PlatformIO's own Python always has it (the system's may not).
PY="$(dirname "$PIO")/python"; [[ -x "$PY" ]] || PY=python3

cd "$FW"
if [[ $build_only == 1 ]]; then "$PIO" run && exec "$HERE/firmware/tab5/pio.sh" run; exit 1; fi   # C-77: and the Tab5

env_for() {                     # a board's id -> its build
  case "$1" in
    t-embed*)   echo t-embed ;;
    t-watch-s3) echo t-watch-s3 ;;
    m5-sticks3) echo m5-sticks3 ;;
    m5-cores3)  echo m5-cores3 ;;
    m5-core|m5-fire|m5go) echo m5-core ;;   # C-75: one build, the original ESP32
    m5-tab5*)   echo m5-tab5 ;;       # C-77: its own project, firmware/tab5, with its own PlatformIO
    *)          echo "" ;;
  esac
}

# -- the boards -----------------------------------------------------------------------------------------------------
if pgrep -f usb_bridge.py >/dev/null 2>&1; then
  echo "updateCompanion: stopping the bridge (it holds the board's port)"
  pkill -f usb_bridge.py || true
  sleep 1
fi

ports=()
if [[ -n "$want_port" ]]; then ports=("$want_port")
else while IFS= read -r p; do [[ -n "$p" ]] && ports+=("$p"); done < <("$PY" -c "import sys; sys.path.insert(0, '$FW'); import boardport; print('\n'.join(boardport.ports()))"); fi   # C-75: USB-serial too
if [[ ${#ports[@]} -eq 0 ]]; then
  echo "updateCompanion: no board on USB. Plug it in with a cable that carries data (not only power), then run this again." >&2
  exit 1
fi

# Ask a port what it is: its HELLO names the board ("" when it says nothing within five seconds).
ask() {
  "$PY" - "$1" "$FW" <<'PY' 2>/dev/null || true
import re, serial, sys, time
sys.path.insert(0, sys.argv[2]); import boardport
end = time.time() + 5
got = b""
try:
    with boardport.open_port(sys.argv[1], timeout=0.3) as s:
        while time.time() < end:
            got += s.read(512)
            m = re.search(rb"HELLO daemons-companion (\S+)", got)
            if m:
                print(m.group(1).decode()); break
except Exception:
    pass
PY
}

ids=(); envs=()
for p in "${ports[@]}"; do
  id="$(ask "$p")"
  ids+=("${id:-unknown}")
  envs+=("$(env_for "${want_board:-$id}")")
  echo "updateCompanion: $p  ${id:-says nothing (no companion firmware yet?)}"
done

chosen=()
if [[ ${#ports[@]} -eq 1 || $all == 1 || -n "$want_port" ]]; then
  for i in "${!ports[@]}"; do chosen+=("$i"); done
else
  echo "updateCompanion: ${#ports[@]} boards plugged in. Which to flash? (numbers, or a for all)"
  for i in "${!ports[@]}"; do echo "  $((i + 1))) ${ports[$i]}  ${ids[$i]}"; done
  [[ -t 0 ]] || { echo "updateCompanion: no one to ask -- run with --all or --port." >&2; exit 64; }
  read -r answer
  if [[ "$answer" == a* ]]; then for i in "${!ports[@]}"; do chosen+=("$i"); done
  else for n in $answer; do chosen+=("$((n - 1))"); done; fi
fi

for i in "${chosen[@]}"; do
  port="${ports[$i]}" env="${envs[$i]}"
  if [[ -z "$env" ]]; then
    echo "updateCompanion: what is the board on $port? 1) a T-Embed (CC1101, plain or SI4732)  2) the T-Watch S3  3) the M5StickS3  4) the M5Stack CoreS3  5) an M5GO or Fire  6) the M5Stack Tab5"
    [[ -t 0 ]] || { echo "updateCompanion: no one to ask -- run with --board t-embed, t-watch-s3, m5-sticks3, m5-cores3, m5-core or m5-tab5." >&2; exit 64; }
    read -r answer
    case "$answer" in 1*) env=t-embed ;; 2*) env=t-watch-s3 ;; 3*) env=m5-sticks3 ;; 4*) env=m5-cores3 ;; 5*) env=m5-core ;; 6*) env=m5-tab5 ;; *) echo "updateCompanion: skipping $port"; continue ;; esac
  fi
  echo "updateCompanion: flashing $port with $env"
  if [[ "$env" == m5-tab5 ]]; then "$HERE/firmware/tab5/pio.sh" run -t upload --upload-port "$port"   # C-77
  else "$PIO" run -e "$env" -t upload --upload-port "$port"; fi

  # The S3's own USB sometimes leaves the board in its bootloader after the upload's "hard reset": it looks dead and
  # says nothing (2026-10-06). The firmware says HELLO every three seconds, so wait for one, and reset it ourselves if
  # it is silent. The port comes and goes while it restarts.
  "$PY" - "$port" "$FW" <<'PY' || echo "updateCompanion: no HELLO yet from $port -- press the board's RST button once." >&2
import serial, sys, time
port = sys.argv[1]
sys.path.insert(0, sys.argv[2]); import boardport
def hello(wait):
    end = time.time() + wait
    while time.time() < end:
        try:
            with boardport.open_port(port, timeout=0.5) as s:
                got = b""
                while time.time() < end:
                    got += s.read(512)
                    if b"HELLO daemons-companion" in got:
                        print("updateCompanion: " + port + " says " + got.split(b"HELLO daemons-companion ")[1].split(b"\n")[0].decode().strip())
                        return True
        except (serial.SerialException, OSError):
            time.sleep(0.5)
    return False
if hello(10):
    sys.exit(0)
print("updateCompanion: the board is silent after the upload -- resetting it")
with boardport.open_port(port) as s:
    s.dtr = False; s.rts = True; time.sleep(0.2); s.rts = False
sys.exit(0 if hello(20) else 1)
PY
done
echo "updateCompanion: done."

if [[ $link == 1 ]]; then exec "$HERE/linkCompanion.sh"; fi
echo "updateCompanion: to link a board to the server: ./linkCompanion.sh"
