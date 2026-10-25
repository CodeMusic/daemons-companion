#!/bin/bash
# C-168: bring the hub's server up to date with the companion's main branch, from a computer:
#
#   ssh -t debian@<hub> 'sudo bash /opt/daemons-companion/hub/deploy.sh'      (your password)
#   ssh debian@<hub> 'sudo -n /usr/local/sbin/daemons-companion-deploy'       (no password, once deploy-setup.sh ran)
#
# Pulls the clone (as the daemons user), runs npm ci only when the lockfile changed, restarts the server, and checks it
# answers on the same commit. If the new code does not answer within a minute it goes back to the commit it was on and
# restarts that, so a bad push never leaves the hub without a server.
set -euo pipefail

[ "$(id -u)" = 0 ] || { echo "deploy: run it with sudo" >&2; exit 1; }
CODE=/opt/daemons-companion
DATA=/var/lib/daemons-companion
AS=(runuser -u daemons -- env HOME="$DATA" PATH="/opt/node22/bin:/usr/bin:/bin" npm_config_cache="$DATA/.npm"
    NODE_OPTIONS="--disable-warning=ExperimentalWarning")
git_() { "${AS[@]}" git -C "$CODE" "$@"; }
lock() { sha1sum "$CODE/server/package-lock.json" | cut -c1-40; }
answers() {
  for _ in $(seq 1 60); do
    [ "$(curl -s -m 2 -o /dev/null -w '%{http_code}' http://127.0.0.1:4730/api/today)" = 200 ] && return 0; sleep 1
  done; return 1
}
cd /

was=${WAS:-$(git_ rev-parse HEAD)}; lock0=${LOCK0:-$(lock)}
git_ fetch -q origin main
# settings the hub's config should carry; each is added once, never changed after (the config is the user's)
config_waiting() {
  { [ -f "$DATA/shared/site/index.html" ] && ! grep -q '"siteDir"' "$DATA/config.json"; } \
    || ! grep -q '"lanInterface"' "$DATA/config.json"
}
if [ "$(git_ rev-parse origin/main)" = "$was" ] && ! config_waiting; then
  echo "deploy: already on $(git_ log -1 --format='%h %s' | cut -c1-90)"; exit 0
fi
git_ merge -q --ff-only origin/main
# a newer deploy.sh came with the code: run that one instead, so its own steps apply on this same run -- but never from
# the root-owned installed copy (the passwordless one): the clone belongs to the daemons user, and running its copy as
# root would let anything that can write the clone run as root. That copy only says a newer one is waiting.
INSTALLED=/usr/local/sbin/daemons-companion-deploy
if [ "$0" != "$INSTALLED" ] && [ -z "${DEPLOY_REEXEC:-}" ] && ! cmp -s "$0" "$CODE/hub/deploy.sh"; then
  echo "deploy: deploy.sh itself changed -- running the new one"; DEPLOY_REEXEC=1 WAS="$was" LOCK0="$lock0" exec bash "$CODE/hub/deploy.sh"
fi
echo "deploy: $(git_ log -1 --format='%h' "$was") -> $(git_ log -1 --format='%h %s' | cut -c1-90)"
git_ log --format='  %h %s' "$was..HEAD" -- server | cut -c1-110 | head -12
[ "$lock0" = "$(lock)" ] || { echo "deploy: the lockfile changed -- npm ci"; (cd "$CODE/server" && "${AS[@]}" npm ci --no-audit --no-fund); }

# C-170: once a site has been sent (./syncCompanion.sh site), the config names it, so the hub serves it
if config_waiting; then
  python3 - "$DATA/config.json" "$DATA/shared/site" <<'PY'
import json, os, sys
p, site = sys.argv[1], sys.argv[2]; c = json.load(open(p))
if os.path.exists(os.path.join(site, "index.html")) and "siteDir" not in c:
    c["siteDir"] = site; print("deploy: the config now serves the site from", site)
if "lanInterface" not in c:
    c["lanInterface"] = "eth0"; print("deploy: the config now names eth0 as the address devices are given")
open(p, "w").write(json.dumps(c, indent=2) + "\n")
PY
fi

systemctl restart daemons-companion.service
if answers; then
  echo "deploy: the server answers on $(git_ log -1 --format=%h)"
  [ "$0" = "$INSTALLED" ] && ! cmp -s "$0" "$CODE/hub/deploy.sh" && \
    echo "deploy: a newer deploy.sh came with the code; install it (your password): sudo bash $CODE/hub/deploy-setup.sh"
  systemctl is-enabled -q daemons-companion-screen.service 2>/dev/null && systemctl restart daemons-companion-screen.service \
    && echo "deploy: the screen restarted on the new code"
else
  echo "deploy: the new code did not answer in 60 s -- going back to $(git_ log -1 --format=%h "$was")" >&2
  journalctl -u daemons-companion --no-pager -n 20 >&2 || true
  git_ reset -q --hard "$was"
  [ "$lock0" = "$(lock)" ] || (cd "$CODE/server" && "${AS[@]}" npm ci --no-audit --no-fund)
  systemctl restart daemons-companion.service
  answers && echo "deploy: back on $(git_ log -1 --format=%h), answering" >&2
  exit 1
fi
