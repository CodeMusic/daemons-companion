#!/bin/zsh
# THE VAULT on roverbyteseer (C-434, server/src/vault.ts): PRAXIS's encrypted relay and backup, run as its user.
#   hub/vault.sh install     the LaunchAgent ca.codemusic.daemons.vault (npm ci first), started now and at login
#   hub/vault.sh update      pull this checkout, npm ci, restart
#   hub/vault.sh add NAME    a household, its token printed once -- for that hub's config.json, "vault": { url, token }
#   hub/vault.sh list        the households it keeps
#   hub/vault.sh status      that it answers
#   hub/vault.sh log         the last lines of its log
# It listens on the machine's tailnet address only (tailscale ip -4), port 4760, for now; it takes any address, so it
# moves behind a public one (C-278) with no change of code. It holds no key: every event and blob it keeps is sealed.
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
LABEL=ca.codemusic.daemons.vault
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
export VAULT_DIR="$HOME/Library/Application Support/daemons-vault"
LOG="$HOME/Library/Logs/daemons-vault.log"
TS="$(command -v tailscale || echo /Applications/Tailscale.app/Contents/MacOS/Tailscale)"
addr() { "$TS" ip -4 2>/dev/null | head -1; }
url() { echo "http://$(addr):4760"; }

case "${1:-}" in
  run)        # what the LaunchAgent runs
    mkdir -p "$VAULT_DIR"; chmod 700 "$VAULT_DIR"
    cd "$HERE/server"
    VAULT_HOST="$(addr)" VAULT_PORT=4760 exec node --import tsx src/vault_main.ts ;;
  install)
    (cd "$HERE/server" && npm ci --no-audit --no-fund)
    mkdir -p "$VAULT_DIR" "$(dirname "$PLIST")"; chmod 700 "$VAULT_DIR"
    cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>/bin/zsh</string><string>$HERE/hub/vault.sh</string><string>run</string></array>
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
    sleep 3; echo "vault: $(url)"; tail -2 "$LOG" ;;
  update)
    git -C "$HERE" pull --ff-only
    (cd "$HERE/server" && npm ci --no-audit --no-fund)
    launchctl kickstart -k "gui/$(id -u)/$LABEL"; sleep 3; tail -2 "$LOG" ;;
  add)    (cd "$HERE/server" && node --import tsx src/vault_main.ts add "${2:?add NAME}") ;;
  list)   (cd "$HERE/server" && node --import tsx src/vault_main.ts list) ;;
  status) curl -s "$(url)/vault/status"; echo ;;
  log)    tail -20 "$LOG" ;;
  *) awk 'NR>=2 && /^#/ {sub(/^# ?/,""); print; next} NR>=2 {exit}' "$0"; exit 64 ;;
esac
