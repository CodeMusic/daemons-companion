#!/bin/bash
# C-168 Phase 3: boards linked by cable to the hub itself (HUB.md Phase 3). Run it ON THE HUB, once:
#
#   ssh -t debian@daemons-hearth 'sudo bash /opt/daemons-companion/hub/phase3.sh'
#
# Installs daemons-companion-bridges.service (hub/bridges.py: one usb_bridge.py per allowed board, by its USB serial),
# makes the allow-list if there is none (boards.allow, editable by the login user too), and installs the newer
# deploy.sh, which restarts the bridges on each deploy. Safe to run again: an existing allow-list is kept.
#
# The allow-list starts EMPTY: a board plugged in is noted in boards.seen and left alone until its serial is added --
#   echo <SERIAL> >> /var/lib/daemons-companion/boards.allow        (python3 /opt/daemons-companion/hub/bridges.py --once
# lists what is plugged in). Then it links within a few seconds; no restart.
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "phase3: run it with sudo" >&2; exit 1; }
CODE=/opt/daemons-companion
DATA=/var/lib/daemons-companion
dpkg -s python3-serial >/dev/null 2>&1 || apt-get install -y -q python3-serial
getent group dialout >/dev/null && usermod -aG dialout daemons
for f in boards.allow boards.seen; do
  [ -e "$DATA/$f" ] || install -o daemons -g daemons -m 0664 /dev/null "$DATA/$f"
done
grep -q '^#' "$DATA/boards.allow" || sed -i '1i # C-168 Phase 3: the boards the hub links by cable -- one USB serial per line (bridges.py --once lists them)' "$DATA/boards.allow"
install -m 0644 "$CODE/hub/systemd/daemons-companion-bridges.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable -q --now daemons-companion-bridges.service
cmp -s "$CODE/hub/deploy.sh" /usr/local/sbin/daemons-companion-deploy || \
  install -o root -g root -m 0755 "$CODE/hub/deploy.sh" /usr/local/sbin/daemons-companion-deploy
systemctl is-active daemons-companion-bridges.service
DAEMONS_STATE=$DATA python3 "$CODE/hub/bridges.py" --once
