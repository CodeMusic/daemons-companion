#!/bin/bash
# C-180 Phase 5: the hub's own link to its Module LLM (HUB.md Phase 5). The LLM Mate's RJ45 is cabled to eth1; this
# gives that cable a network of two, the hub at 192.168.50.1 and the module at 192.168.50.2 (a /30, which the server
# never hands to phones and boards -- api.ts lanAddress). The hub shares its internet over it, so the module can fetch
# its packages (llm-openai-api, the models); it is never the hub's way out. Run it ON THE HUB:
#
#   ssh -t debian@coremp135 'sudo bash /opt/daemons-companion/hub/phase5.sh'
#
# The module takes its address by DHCP from the hub (M5's image asks for one on the Mate's port); the /30 leaves it
# only .2, which is where server/src/ai/discover.ts looks. Safe to run again. Run on the hub 2026-10-28: the link and
# the address work; the sharing does not -- this kernel has no nftables NAT, so the module fetches its packages through
# the hub's SSH instead (ssh -R 1080, apt's Acquire::https::Proxy socks5h://127.0.0.1:1080).
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "phase5: run it with sudo" >&2; exit 1; }
CON=module-link
# the default profile NetworkManager made for eth1 would ask the module's side for an address; this one answers instead
# only a profile bound to eth1 by name: never the one that carries the home network (eth0)
nmcli -t -f NAME con show | while read -r name; do
  [ "$name" = "$CON" ] && continue
  if [ "$(nmcli -g connection.interface-name con show "$name" 2>/dev/null)" = eth1 ]; then
    nmcli con mod "$name" connection.autoconnect no
  fi
done
nmcli -t -f NAME con show | grep -qx "$CON" || nmcli con add type ethernet ifname eth1 con-name "$CON"
nmcli con mod "$CON" connection.autoconnect yes connection.autoconnect-priority 10 \
  ipv4.method shared ipv4.addresses 192.168.50.1/30 ipv4.never-default yes ipv6.method disabled
nmcli con up "$CON" || echo "phase5: eth1 has no link yet -- it comes up by itself once the module's port lights"
nmcli -t -f DEVICE,STATE dev | grep '^eth1:'
echo "phase5: when the module has booted, check it: curl -s http://192.168.50.2:8000/v1/models"
