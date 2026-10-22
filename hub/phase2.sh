#!/bin/bash
# C-168 Phase 2: the hub becomes the companion's server. Run it ON THE HUB, as root, after phase1.sh, in two steps:
#
#   ssh -t debian@<hub> 'sudo bash ~/phase2.sh install'
#       the code brought up to date; a shared folder for the save and the art (the server and your login both write
#       it); the server's config outside the clone; the systemd unit (waits for the clock, restarts, capped at 320 MB);
#       a nightly backup of the store; Tailscale installed (you log it in: `sudo tailscale up`). Starts nothing.
#
#   ssh -t debian@<hub> 'sudo bash ~/phase2.sh cutover ~/companion.sqlite'
#       the Mac's store, copied here while the Mac's server is stopped, installed and the server started; then the
#       store's own savePath (a Mac path) cleared, so the config's -- the shared save -- is the one read. Checked.
#
# The order on the Mac, and everything after (the relay, the phones, the boards): docs/HUB.md, "The cut-over".
# Every step is idempotent. Nothing personal is in this file (the companion repo is public, C-12).
set -euo pipefail

[ "$(id -u)" = 0 ] || { echo "phase2: run it with sudo" >&2; exit 1; }
CODE=/opt/daemons-companion
DATA=/var/lib/daemons-companion
SHARED=$DATA/shared
NODE=/opt/node22/bin
PORT=4730
LOGIN=${SUDO_USER:-debian}
AS=(runuser -u daemons -- env HOME="$DATA" PATH="$NODE:/usr/bin:/bin" npm_config_cache="$DATA/.npm"
    NODE_OPTIONS="--disable-warning=ExperimentalWarning")
say() { printf '\n== %s\n' "$*"; }
api() { curl -s -m 10 "$@"; }
mode=${1:-}

if [ "$mode" = install ]; then
  say "packages: rsync (the art and the backups), Tailscale (the voice server by its name)"
  export DEBIAN_FRONTEND=noninteractive
  dpkg -s rsync >/dev/null 2>&1 || apt-get install -y -q rsync
  if ! command -v tailscale >/dev/null; then
    # Tailscale's own repository for Debian 12 (it builds for armhf); the kernel has TUN (Phase 0)
    curl -fsSL https://pkgs.tailscale.com/stable/debian/bookworm.noarmor.gpg -o /usr/share/keyrings/tailscale-archive-keyring.gpg
    curl -fsSL https://pkgs.tailscale.com/stable/debian/bookworm.tailscale-keyring.list -o /etc/apt/sources.list.d/tailscale.list
    apt-get update -q && apt-get install -y -q tailscale
  fi
  tailscale version | head -1

  say "the code, up to date"
  cd /
  as_lock() { sha1sum "$CODE/server/package-lock.json" | cut -c1-40; }
  before=$(as_lock)
  "${AS[@]}" git -C "$CODE" pull --ff-only -q
  "${AS[@]}" git -C "$CODE" log -1 --format='commit %h %cs %s' | cut -c1-100
  if [ "$before" != "$(as_lock)" ] || [ ! -d "$CODE/server/node_modules" ]; then
    (cd "$CODE/server" && "${AS[@]}" npm ci --no-audit --no-fund)
  fi

  say "the folders: the data (the daemons user's), shared (the save and the art: the server and $LOGIN write it)"
  usermod -aG daemons "$LOGIN"
  chgrp daemons "$DATA"; chmod 0710 "$DATA"                 # the group may pass through, not list or read
  install -d -o daemons -g daemons -m 2770 "$SHARED" "$SHARED/art" "$SHARED/site" "$SHARED/companion-backups"
  install -d -o daemons -g daemons -m 0750 "$DATA/backups"
  install -d -o daemons -g daemons -m 0700 "$DATA/tmp"

  say "the server's config, outside the clone"
  if [ ! -f "$DATA/config.json" ]; then
    cat > "$DATA/config.json" <<EOF
{
  "host": "0.0.0.0",
  "port": $PORT,
  "database": "$DATA/companion.sqlite",
  "edition": "CONTENT",
  "savePath": "$SHARED/save.sav",
  "artDir": "$SHARED/art",
  "siteDir": "$SHARED/site",
  "talk": { "url": "http://roverbyteseer:5678/webhook" }
}
EOF
    chown daemons:daemons "$DATA/config.json"; chmod 0600 "$DATA/config.json"
  fi
  ln -sfn "$DATA/config.json" "$CODE/server/config.json"
  echo "config: $DATA/config.json (linked from the clone)"

  say "the unit and the nightly backup"
  install -m 0644 "$CODE"/hub/systemd/daemons-companion*.service "$CODE"/hub/systemd/daemons-companion*.timer /etc/systemd/system/
  systemctl daemon-reload
  systemctl enable -q systemd-time-wait-sync.service
  systemctl enable -q daemons-companion.service
  systemctl enable -q --now daemons-companion-backup.timer
  systemctl list-timers daemons-companion-backup.timer --no-pager | sed -n 2p
  echo
  echo "phase2: installed; nothing started. Next, on the Mac: docs/HUB.md 'The cut-over'."
  tailscale status >/dev/null 2>&1 || echo "        Tailscale is not logged in yet: sudo tailscale up (it prints a link to approve)."
  exit 0
fi

if [ "$mode" = cutover ]; then
  STORE=${2:?phase2: cutover needs the copied store, e.g. ~/companion.sqlite}
  [ -f "$STORE" ] || { echo "phase2: no store at $STORE" >&2; exit 1; }
  [ -f "$DATA/config.json" ] || { echo "phase2: run 'install' first" >&2; exit 1; }
  if [ -f "$DATA/companion.sqlite" ] && [ "${3:-}" != --replace ]; then
    echo "phase2: the hub already has a store; add --replace to put this one in its place (the old one is kept)" >&2; exit 1
  fi

  say "the store: checked, then installed"
  [ "$(sqlite3 "$STORE" 'pragma integrity_check')" = ok ] || { echo "phase2: the copied store fails its integrity check" >&2; exit 1; }
  echo "rows: $(sqlite3 "$STORE" 'select count(*) from settings') settings"
  systemctl stop daemons-companion.service 2>/dev/null || true
  [ -f "$DATA/companion.sqlite" ] && mv "$DATA/companion.sqlite" "$DATA/backups/replaced-$(date +%F-%H%M%S).sqlite"
  install -o daemons -g daemons -m 0600 "$STORE" "$DATA/companion.sqlite"
  rm -f "$STORE"                                              # it held every key: not left in a login's home

  say "the server, started"
  systemctl start daemons-companion.service
  for _ in $(seq 1 60); do
    [ "$(curl -s -m 2 -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/api/today")" = 200 ] && break; sleep 1
  done
  systemctl is-active daemons-companion.service

  say "the store's own save path (the Mac's) cleared: the config's shared save is read"
  api -X POST -H 'content-type: application/json' -d '{"savePath":""}' "http://127.0.0.1:$PORT/api/settings" >/dev/null
  api "http://127.0.0.1:$PORT/api/settings" | python3 -c "import json,sys; s=json.load(sys.stdin); print('save:', s['savePath'], '| from', s['source'], '| exists', s['exists'], '| a save', s['valid'])"
  api "http://127.0.0.1:$PORT/api/settings/network" | python3 -c "import json,sys; s=json.load(sys.stdin); print('listening on the network:', s['now'], '| devices are told', s['address'])"
  echo
  echo "phase2: the hub is the companion's server. Next: the relay, the phones and the boards (docs/HUB.md)."
  exit 0
fi

echo "phase2: install, or cutover <the copied store> (see the top of this file)" >&2; exit 64
