#!/bin/bash
# The hub's name, changed in every place a machine is known by it (the user, 2026-11-11: CoreMP135 -> daemons-hearth,
# so it reads as the companion's on the network):
#
#   ssh -t debian@<hub> 'sudo bash /opt/daemons-companion/hub/rename.sh daemons-hearth'      (your password)
#
# its own name (hostnamectl, /etc/hosts), the home network's (avahi: <name>.local), the tailnet's (tailscale: <name> and
# <name>.<tailnet>.ts.net), then the companion and its screen restarted, so pairing shows the new name. The save, the
# database, the deploy and every device given the hub's address (not its name) are untouched. Run it again with the old
# name to go back. Nothing keeps the old name answering: whatever was told "coremp135" is told the new one.
set -euo pipefail

[ "$(id -u)" = 0 ] || { echo "rename: run it with sudo" >&2; exit 1; }
NEW=${1:-}
[[ "$NEW" =~ ^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$ ]] || { echo "rename: a name is lowercase letters, digits and hyphens, e.g. daemons-hearth" >&2; exit 1; }
OLD=$(hostname)
echo "rename: $OLD -> $NEW"

hostnamectl set-hostname "$NEW"
# the line that names this machine to itself (127.0.1.1 on Debian; M5's image put it on 127.0.0.1)
sed -i -E "s/^(127\.0\.[01]\.1[[:space:]]+)$OLD\b.*/\1$NEW/I" /etc/hosts
grep -qE "^127\.0\.[01]\.1[[:space:]]+$NEW\b" /etc/hosts || echo "127.0.1.1       $NEW" >> /etc/hosts
echo "rename: its own name is $(hostname); /etc/hosts:"; grep -E "^127\.0\.[01]\.1" /etc/hosts | sed 's/^/  /'

if systemctl is-active -q avahi-daemon; then
  systemctl restart avahi-daemon && echo "rename: on the home network as $NEW.local"
fi
if command -v tailscale >/dev/null; then
  tailscale set --hostname="$NEW"
  sleep 3
  echo "rename: on the tailnet as $(tailscale status --self --json | python3 -c 'import json,sys; print(json.load(sys.stdin)["Self"]["DNSName"].rstrip("."))')"
fi

systemctl restart daemons-companion.service
systemctl is-enabled -q daemons-companion-screen.service 2>/dev/null && systemctl restart daemons-companion-screen.service
for _ in $(seq 1 60); do
  [ "$(curl -s -m 2 -o /dev/null -w '%{http_code}' http://127.0.0.1:4730/api/today)" = 200 ] && { echo "rename: the companion answers"; exit 0; }
  sleep 1
done
echo "rename: the companion did not answer in 60 s -- journalctl -u daemons-companion" >&2; exit 1
