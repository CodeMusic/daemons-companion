# The local cloud's services, kept running -- a launch agent on a Mac, a systemd user unit on Linux. Sourced by the
# installers. Each service is `ca.codemusic.daemons.<name>` (the labels roverbyteseer already used, so re-installing
# replaces what is there instead of starting a second one), started now and at login, restarted when it stops, its log in
# ~/Library/Logs/daemons-<name>.log (Mac) or `journalctl --user -u daemons-<name>` (Linux).
#
#   seer_service NAME ENVFILE PROGRAM [ARGS...]     ENVFILE ("" for none): KEY=VALUE lines given to it as its environment
#   seer_wait URL [SECONDS]                          until URL answers (any HTTP status), or say it did not

# Over ssh a Mac's PATH is /usr/bin:/bin only, so Homebrew's ffmpeg and Docker's CLI are not found -- add them
for d in /opt/homebrew/bin /usr/local/bin; do case ":$PATH:" in *":$d:"*) ;; *) [ -d "$d" ] && PATH="$d:$PATH" ;; esac; done
export PATH

seer_service() {
  local name="$1" envfile="$2"; shift 2
  local label="ca.codemusic.daemons.$name"
  if [ "$(uname)" = Darwin ]; then
    local plist="$HOME/Library/LaunchAgents/$label.plist" args="" envs="" k v
    for a in "$@"; do args="$args<string>$(printf '%s' "$a" | sed 's/&/\&amp;/g; s/</\&lt;/g')</string>"; done
    if [ -n "$envfile" ] && [ -f "$envfile" ]; then
      while IFS='=' read -r k v; do
        case "$k" in ''|\#*) continue ;; esac
        v="${v%\"}"; v="${v#\"}"; v="${v%\'}"; v="${v#\'}"
        envs="$envs<key>$k</key><string>$(printf '%s' "$v" | sed 's/&/\&amp;/g; s/</\&lt;/g')</string>"
      done < "$envfile"
    fi
    mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
    umask 077
    cat > "$plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$label</string>
  <key>ProgramArguments</key><array>$args</array>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>$envs</dict>
  <key>RunAtLoad</key><true/><key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$HOME/Library/Logs/daemons-$name.log</string>
  <key>StandardErrorPath</key><string>$HOME/Library/Logs/daemons-$name.log</string>
</dict></plist>
EOF
    umask 022
    # bootout returns before the old one has gone; bootstrapping over it fails ("5: Input/output error") and leaves
    # nothing running -- so wait until it is gone, and try the bootstrap again a few times (roverbyteseer, 2026-11-11)
    local i
    launchctl bootout "gui/$(id -u)/$label" 2>/dev/null || true
    for i in $(seq 1 40); do launchctl print "gui/$(id -u)/$label" >/dev/null 2>&1 || break; sleep 0.25; done
    for i in 1 2 3 4 5; do launchctl bootstrap "gui/$(id -u)" "$plist" 2>/dev/null && break; sleep 1; done
    launchctl print "gui/$(id -u)/$label" >/dev/null 2>&1 || { echo "   launchd would not take $label (see $plist)" >&2; return 1; }
    launchctl kickstart "gui/$(id -u)/$label" 2>/dev/null || true   # a fresh bootstrap over ssh may wait to run
  else
    local unit="$HOME/.config/systemd/user/daemons-$name.service" cmd=""
    for a in "$@"; do cmd="$cmd \"$a\""; done
    mkdir -p "$HOME/.config/systemd/user"
    cat > "$unit" <<EOF
[Unit]
Description=DAEMONS local cloud: $name
After=network-online.target

[Service]
ExecStart=$cmd
${envfile:+EnvironmentFile=$envfile}
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
EOF
    systemctl --user daemon-reload
    systemctl --user enable --now "daemons-$name.service"
    systemctl --user restart "daemons-$name.service"
    loginctl enable-linger "$(id -un)" 2>/dev/null || true   # keep running with nobody logged in
  fi
}

seer_wait() {
  local url="$1" secs="${2:-30}" i
  for i in $(seq 1 $((secs * 2))); do
    [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 2 "$url")" != 000 ] && return 0
    sleep 0.5
  done
  return 1
}

seer_say() { printf '\n== %s\n' "$*"; }
