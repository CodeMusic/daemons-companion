#!/bin/zsh
# THE COMMONS on roverbyteseer (C-222, docs/TRADING.md): run as its user, beside its other services.
#   hub/commons.sh install    the LaunchAgent ca.codemusic.daemons.commons (npm ci first), started now and at login
#   hub/commons.sh update     pull this checkout, npm ci, restart
#   hub/commons.sh homes      every home, approved or waiting (the keeper's list)
#   hub/commons.sh approve ID let a home in;   hub/commons.sh refuse ID  let it out
#   hub/commons.sh log        the last lines of its log
# It listens on the machine's tailnet address only (tailscale ip -4), port 4750: no internet, no LAN.
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
LABEL=ca.codemusic.daemons.commons
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
DATA="$HOME/Library/Application Support/daemons-commons"
LOG="$HOME/Library/Logs/daemons-commons.log"
TS="$(command -v tailscale || echo /Applications/Tailscale.app/Contents/MacOS/Tailscale)"
addr() { "$TS" ip -4 2>/dev/null | head -1; }
url() { echo "http://$(addr):4750"; }

case "${1:-}" in
  run)        # what the LaunchAgent runs
    mkdir -p "$DATA"
    cd "$HERE/server"
    COMMONS_HOST="$(addr)" COMMONS_PORT=4750 COMMONS_DB="$DATA/commons.sqlite" exec node --import tsx src/commons_main.ts ;;
  install)
    (cd "$HERE/server" && npm ci --no-audit --no-fund)
    mkdir -p "$DATA" "$(dirname "$PLIST")"
    cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>/bin/zsh</string><string>$HERE/hub/commons.sh</string><string>run</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>30</integer>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict></plist>
PL
    launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
    launchctl bootstrap "gui/$(id -u)" "$PLIST"
    launchctl kickstart "gui/$(id -u)/$LABEL"    # bootstrapped over ssh, it waits for a kick (seen 2026-10-28)
    sleep 3; echo "commons: $(url)"; tail -2 "$LOG" ;;
  update)
    git -C "$HERE" pull --ff-only
    (cd "$HERE/server" && npm ci --no-audit --no-fund)
    launchctl kickstart -k "gui/$(id -u)/$LABEL"; sleep 3; tail -2 "$LOG" ;;
  homes)   curl -s "$(url)/commons/keeper"; echo ;;
  approve) curl -s -XPOST "$(url)/commons/approve" -H 'content-type: application/json' -d "{\"id\":\"$2\"}"; echo ;;
  refuse)  curl -s -XPOST "$(url)/commons/approve" -H 'content-type: application/json' -d "{\"id\":\"$2\",\"yes\":false}"; echo ;;
  log)     tail -20 "$LOG" ;;
  *) awk 'NR>=2 && /^#/ {sub(/^# ?/,""); print; next} NR>=2 {exit}' "$0"; exit 64 ;;
esac
