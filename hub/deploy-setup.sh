#!/bin/bash
# C-168: deploys without a password (the user, 2026-10-25: "yes, set up passwordless deploy"). Run it ON THE HUB:
#
#   ssh -t debian@<hub> 'sudo bash /opt/daemons-companion/hub/deploy-setup.sh'
#
# Installs a ROOT-OWNED copy of deploy.sh at /usr/local/sbin/daemons-companion-deploy, and one sudoers rule that lets the
# login user run exactly that file, with no arguments, without a password. The copy lives outside the clone (which the
# daemons user can write), so nothing that can change the clone gains root; it pulls companion main from GitHub and
# restarts the companion, rolling back if the new code does not answer. Run this again (with your password) to install
# a newer deploy.sh; the installed one says when one is waiting. Then it deploys once.
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "deploy-setup: run it with sudo" >&2; exit 1; }
LOGIN=${SUDO_USER:-debian}
CODE=/opt/daemons-companion
TARGET=/usr/local/sbin/daemons-companion-deploy
RULE=/etc/sudoers.d/daemons-companion-deploy
install -o root -g root -m 0755 "$CODE/hub/deploy.sh" "$TARGET"
tmp=$(mktemp)
printf '# C-168: %s may deploy the companion (pull main, restart) without a password -- this one root-owned file only\n%s ALL=(root) NOPASSWD: %s ""\n' \
  "$LOGIN" "$LOGIN" "$TARGET" > "$tmp"
visudo -cf "$tmp" >/dev/null || { rm -f "$tmp"; echo "deploy-setup: the rule did not check out; nothing installed" >&2; exit 1; }
install -o root -g root -m 0440 "$tmp" "$RULE"; rm -f "$tmp"
echo "deploy-setup: $TARGET installed (root, 0755) and $RULE (0440); $LOGIN may run it without a password"
"$TARGET"
