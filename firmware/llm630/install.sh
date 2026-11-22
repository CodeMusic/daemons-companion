#!/bin/bash
# C-453: setup.sh onto the LLM630 Kit and run there, from a computer or from the Zero.
#
#   ./install.sh adb              over ADB (the Kit's OTG port plugged into this machine): no password needed
#   ./install.sh root@10.77.0.2   over SSH (the cable's network from the Zero, or the Kit's address on Wi-Fi)
#   ./install.sh adb key          only this machine's SSH key into the Kit's root, so SSH works without a password
#   ./install.sh adb wifi SSID    join a Wi-Fi network for its updates (asks for the password here; never stored by us)
#   ./install.sh TARGET models    list the models M5Stack offers and which are installed
#
# Anything after the target goes to setup.sh (models, add NAME...).
set -euo pipefail
cd "$(dirname "$0")"
target=${1:?"adb, or user@host"}; shift

run() {   # a command on the Kit
  if [ "$target" = adb ]; then adb shell "$1"; else ssh -o ConnectTimeout=10 "$target" "$1"; fi
}
push() {
  if [ "$target" = adb ]; then adb shell 'rm -rf /tmp/daemons-kit && mkdir -p /tmp/daemons-kit' >/dev/null; for f in setup.sh kitd.py gadget.sh; do adb push "$f" /tmp/daemons-kit/ >/dev/null; done
  else ssh "$target" 'rm -rf /tmp/daemons-kit && mkdir -p /tmp/daemons-kit'; scp -q setup.sh kitd.py gadget.sh "$target":/tmp/daemons-kit/; fi
}

case "${1:-}" in
  key)
    pub=$(ls ~/.ssh/id_ed25519.pub ~/.ssh/id_rsa.pub 2>/dev/null | head -n1)
    [ -n "$pub" ] || { echo "no SSH key here (ssh-keygen -t ed25519)"; exit 1; }
    run "mkdir -p /root/.ssh && chmod 700 /root/.ssh && touch /root/.ssh/authorized_keys && grep -qF '$(cut -d' ' -f2 "$pub")' /root/.ssh/authorized_keys || echo '$(cat "$pub")' >> /root/.ssh/authorized_keys; chmod 600 /root/.ssh/authorized_keys; echo key in"
    exit 0 ;;
  wifi)
    ssid=${2:?"wifi SSID"}
    read -rsp "the password for $ssid (sent to the Kit's nmcli, not kept here): " pw; echo
    run "nmcli device wifi rescan >/dev/null 2>&1; sleep 3; nmcli device wifi connect '$ssid' password '$pw' && nmcli -t -f IP4.ADDRESS device show wlan0 | head -n1"
    exit 0 ;;
esac

push
run "bash /tmp/daemons-kit/setup.sh $*"
