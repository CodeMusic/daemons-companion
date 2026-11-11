#!/bin/zsh
# C-342: THE HANDS -- THE ENGINE ROOM's helper on this computer (server/src/hands_main.ts), run as a LaunchAgent. It asks
# the hub for the jobs asked for in THE ENGINE ROOM (the save, art, DEBUG patches, backups, deploy, the commons' keeper)
# and runs them from this checkout. It dials out: nothing new listens here.
#   hub/hands.sh install     pair it with the hub (a code by ssh, from .hub's HUB), write the LaunchAgent, start it
#   hub/hands.sh log         the last lines of its log
#   hub/hands.sh restart     start it again (after a pull)
#   hub/hands.sh uninstall   stop it and remove the LaunchAgent (its key stays paired until forgotten in THE ENGINE ROOM)
#   hub/hands.sh run         what the LaunchAgent runs
# Its key is kept in ~/Library/Application Support/daemons-hands/hands.env (mode 600), never in this repository.
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
export PATH="/opt/homebrew/opt/node@22/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
LABEL=ca.codemusic.daemons.hands
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
DATA="$HOME/Library/Application Support/daemons-hands"
ENV="$DATA/hands.env"
LOG="$HOME/Library/Logs/daemons-hands.log"
[[ -f "$HERE/.hub" ]] && source "$HERE/.hub"
HUBHOST="${HUB#*@}"; HUBHOST="${HUBHOST%%:*}"
HANDS_HUB="${HANDS_HUB:-http://$HUBHOST:4730}"

case "${1:-}" in
  run)
    [[ -f "$ENV" ]] || { echo "hands: not installed -- hub/hands.sh install" >&2; exit 2; }
    set -a; source "$ENV"; set +a
    cd "$HERE/server"
    HANDS_ROOT="$HERE" exec node --import tsx src/hands_main.ts ;;
  install)
    [[ -n "${HUB:-}" ]] || { echo "hands: .hub names no HUB (see .hub.example)" >&2; exit 1; }
    [[ -d "$HERE/server/node_modules" ]] || (cd "$HERE/server" && npm ci --no-audit --no-fund)
    mkdir -p "$DATA" "$(dirname "$PLIST")"; chmod 700 "$DATA"
    if [[ ! -f "$ENV" ]]; then
      code=$(ssh "$HUB" 'curl -s -X POST http://127.0.0.1:4730/api/pair/code' | python3 -c 'import json,sys; print(json.load(sys.stdin)["code"])')
      key=$(curl -s -X POST "$HANDS_HUB/api/pair" -H 'content-type: application/json' \
              -d "{\"code\":\"$code\",\"name\":\"THE HANDS ($(scutil --get ComputerName 2>/dev/null | tr -cd '[:alnum:] -' | cut -c1-24))\"}" \
            | python3 -c 'import json,sys; print(json.load(sys.stdin)["token"])')
      umask 077; printf 'HANDS_HUB=%s\nHANDS_KEY=%s\n' "$HANDS_HUB" "$key" > "$ENV"
      echo "hands: paired with $HANDS_HUB"
    fi
    cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>/bin/zsh</string><string>$HERE/hub/hands.sh</string><string>run</string></array>
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
    echo "hands: running ($LABEL); its log: hub/hands.sh log" ;;
  restart) launchctl kickstart -k "gui/$(id -u)/$LABEL" && echo "hands: started again" ;;
  log) tail -n "${2:-40}" "$LOG" ;;
  uninstall)
    launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
    rm -f "$PLIST"; echo "hands: stopped and removed (its key: forget THE HANDS in THE ENGINE ROOM's KEYS)" ;;
  *) sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'; exit 1 ;;
esac
