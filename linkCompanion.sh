#!/usr/bin/env bash
# Link the handheld to the companion's server over its USB cable -- the corner of its screen says USB.
#
#   ./linkCompanion.sh                the bridge, starting the server too if none is running
#   ./linkCompanion.sh --port PORT    a particular serial port (otherwise the board is found by itself)
#   ./linkCompanion.sh --help
#
# ONE TERMINAL. The bridge runs in the foreground and says what passes over it (state sent, steps ticked, routines
# run). If this script started the server, it runs in the background (.logs/server.log) and Ctrl-C stops both; a
# server that was already running is used and left running. For the site as well, run ./bindCompanion.sh first in
# another terminal -- this one then finds its server and uses it.
#
# The bridge needs pyserial, which PlatformIO's own Python already has.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
PORT=4730
LOGS="$HERE/.logs"
SERVER_LOG="$LOGS/server.log"

usage() { sed -n '2,6p' "$0" | sed 's/^# \{0,1\}//'; }

bridge_args=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --port)         bridge_args+=("${2:?--port needs a port}"); shift 2 ;;
    -h|--help|help) usage; exit 0 ;;
    *) echo "linkCompanion: unknown '$1' (try --help)" >&2; exit 64 ;;
  esac
done

# -- a Python with pyserial -----------------------------------------------------------------------------------------
PY="$HOME/.platformio/penv/bin/python"
if [[ ! -x "$PY" ]]; then
  PY="$(command -v python3)"
  "$PY" -c "import serial" 2>/dev/null || { echo "linkCompanion: needs pyserial (pip install pyserial, or install PlatformIO)." >&2; exit 1; }
fi

# -- the board ------------------------------------------------------------------------------------------------------
if [[ ${#bridge_args[@]} -eq 0 ]] && [[ -z "$("$PY" -c "import sys; sys.path.insert(0, '$HERE/firmware/esp32'); import boardport; print(*boardport.ports())")" ]]; then   # C-75: USB-serial too
  echo "linkCompanion: no board on USB. Plug it in with a cable that carries data, then run this again." >&2
  exit 1
fi
if pgrep -f usb_bridge.py >/dev/null 2>&1; then
  echo "linkCompanion: a bridge is already running (another terminal?). Stop it there first." >&2
  exit 1
fi

# -- the server, unless one is already up ---------------------------------------------------------------------------
answering() { curl -fsS -o /dev/null --max-time 1 "http://127.0.0.1:$PORT/api/today" 2>/dev/null; }
server_pid=""
stop_server() {
  if [[ -n "$server_pid" ]] && kill -0 "$server_pid" 2>/dev/null; then
    pkill -TERM -P "$server_pid" 2>/dev/null || true
    kill -TERM "$server_pid" 2>/dev/null || true
    echo "linkCompanion: server stopped."
  fi
  server_pid=""
}

if answering; then
  echo "linkCompanion: using the server already on port $PORT."
else
  want="$(tr -d '[:space:]v' < "$HERE/.nvmrc")"
  for brew in /opt/homebrew/opt/node@"$want"/bin /usr/local/opt/node@"$want"/bin; do
    [[ -x "$brew/node" ]] && { PATH="$brew:$PATH"; break; }
  done
  [[ -d "$HERE/server/node_modules" ]] || (cd "$HERE/server" && npm install --no-fund --no-audit)
  mkdir -p "$LOGS"
  (cd "$HERE/server" && exec npx tsx watch src/main.ts) >"$SERVER_LOG" 2>&1 &
  server_pid=$!
  trap stop_server EXIT
  trap 'stop_server; exit 130' INT TERM
  for _ in $(seq 1 60); do answering && break; sleep 0.25; done
  answering || { echo "linkCompanion: the server did not answer in 15s -- see $SERVER_LOG" >&2; exit 1; }
  echo "linkCompanion: server on http://127.0.0.1:$PORT   (log: tail -f .logs/server.log)"
fi

# -- the bridge, in the foreground ----------------------------------------------------------------------------------
echo "linkCompanion: the bridge -- Ctrl-C stops it"
cd "$HERE/firmware/esp32"
"$PY" usb_bridge.py ${bridge_args[@]+"${bridge_args[@]}"}
