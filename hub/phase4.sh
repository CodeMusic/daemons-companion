#!/bin/bash
# C-168 Phase 4: the hub's screen as a service (hub/screen.py), in place of a copy run by hand. Run it ON THE HUB:
#
#   ssh -t debian@<hub> 'sudo bash /opt/daemons-companion/hub/phase4.sh'
#
# Brings the code up to date (deploy.sh), installs and starts daemons-companion-screen, and stops a hand-run copy.
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "phase4: run it with sudo" >&2; exit 1; }
CODE=/opt/daemons-companion
bash "$CODE/hub/deploy.sh" || true
pkill -f "python3 /home/[^ ]*/screen.py" 2>/dev/null || true     # the copy started by hand, if any
install -m 0644 "$CODE/hub/systemd/daemons-companion-screen.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable -q --now daemons-companion-screen.service
sleep 5
systemctl is-active daemons-companion-screen.service
echo "phase4: the screen runs as a service; it starts after the server at every boot."
