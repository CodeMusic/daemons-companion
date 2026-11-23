#!/bin/zsh
# C-360: a node of THE MESH (server/src/machine/mesh_worker_main.ts), run as a LaunchAgent on a Mac -- roverbyteseer, THE HANDS'
# Mac. It dials out to the hub, says what it can do and how busy it is, and takes the processing jobs the hub gives it
# (today: ffmpeg -- sleep sounds' conversions and exports).
#   hub/mesh.sh install     pair it with the hub, write the LaunchAgent, start it. The hub is MESH_HUB (default: .hub's
#                           HUB host, else http://daemons-hearth:4730); the pairing code is MESH_CODE, or asked of the
#                           hub by ssh to .hub's HUB
#   hub/mesh.sh update      pull this checkout and restart it
#   hub/mesh.sh restart | log [n] | uninstall | run (what the LaunchAgent runs)
# Its key is kept in ~/Library/Application Support/daemons-mesh/mesh.env (mode 600), never in this repository.
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
export PATH="/opt/homebrew/opt/node@22/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
LABEL=ca.codemusic.daemons.mesh
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
DATA="$HOME/Library/Application Support/daemons-mesh"
ENV="$DATA/mesh.env"
LOG="$HOME/Library/Logs/daemons-mesh.log"
[[ -f "$HERE/.hub" ]] && source "$HERE/.hub"
HUBHOST="${HUB:-debian@daemons-hearth}"; HUBHOST="${HUBHOST#*@}"; HUBHOST="${HUBHOST%%:*}"
MESH_HUB="${MESH_HUB:-http://$HUBHOST:4730}"

case "${1:-}" in
  run)
    [[ -f "$ENV" ]] || { echo "mesh: not installed -- hub/mesh.sh install" >&2; exit 2; }
    set -a; source "$ENV"; set +a
    cd "$HERE/server"
    exec node --import tsx src/machine/mesh_worker_main.ts ;;
  install)
    [[ -d "$HERE/server/node_modules" ]] || (cd "$HERE/server" && npm ci --no-audit --no-fund)
    mkdir -p "$DATA" "$(dirname "$PLIST")"; chmod 700 "$DATA"
    if [[ ! -f "$ENV" ]]; then
      code="${MESH_CODE:-}"
      [[ -n "$code" ]] || code=$(ssh "$HUB" 'curl -s -X POST http://127.0.0.1:4730/api/pair/code' | python3 -c 'import json,sys; print(json.load(sys.stdin)["code"])')
      name="$(scutil --get ComputerName 2>/dev/null | tr -cd '[:alnum:] -' | cut -c1-24)"
      key=$(curl -s -X POST "$MESH_HUB/api/pair" -H 'content-type: application/json' -d "{\"code\":\"$code\",\"name\":\"THE MESH ($name)\"}" \
            | python3 -c 'import json,sys; print(json.load(sys.stdin)["token"])')
      umask 077; printf 'MESH_HUB=%s\nMESH_KEY=%s\nMESH_NAME="%s"\n' "$MESH_HUB" "$key" "$name" > "$ENV"
      echo "mesh: paired with $MESH_HUB as $name"
    fi
    cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>/bin/zsh</string><string>$HERE/hub/mesh.sh</string><string>run</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>30</integer>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict></plist>
PL
    launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
    launchctl bootstrap "gui/$(id -u)" "$PLIST"
    launchctl kickstart -k "gui/$(id -u)/$LABEL"
    echo "mesh: running ($LABEL); its log: hub/mesh.sh log" ;;
  update) (cd "$HERE" && git pull -q --ff-only) && launchctl kickstart -k "gui/$(id -u)/$LABEL" && echo "mesh: updated and started again" ;;
  restart) launchctl kickstart -k "gui/$(id -u)/$LABEL" && echo "mesh: started again" ;;
  log) tail -n "${2:-40}" "$LOG" ;;
  uninstall)
    launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
    rm -f "$PLIST"; echo "mesh: stopped and removed (its key: forget THE MESH in THE ENGINE ROOM's KEYS)" ;;
  *) sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'; exit 1 ;;
esac
