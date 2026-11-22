#!/bin/bash
# C-458 (docs/ZEROKIT.md 1): the Zero's end of the cable to its LLM630 Kit. Run ON the Zero with sudo, once; it stays.
#
#   sudo ./kitlink.sh             the cable's network, the Kit's internet through the Zero, the Kit offered to the hub
#   sudo ./kitlink.sh status      what is up
#   sudo ./kitlink.sh off         all of it undone
#
# 1. NetworkManager: the Kit's gadget (fixed MAC 02:77:00:00:00:01 on this side, by firmware/llm630/gadget.sh) gets
#    10.77.0.1/30, never a default route -- the Zero's internet stays its Wi-Fi.
# 2. The Kit's internet through the Zero (nftables masquerade from 10.77.0.0/30), so it updates and keeps its clock
#    wherever the Zero has a network. Nothing is offered the other way: the Kit's ports are reached only on the cable.
# 3. THE MIND (C-466): the Kit's OpenAI front door (10.77.0.2:8000) offered on the Zero's tailnet address, port 4810,
#    so the hub's house can use the Kit as one more module (`ai.moduleAddresses` daemons-zero:4810). Tailnet only.
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "run with sudo"; exit 1; }
CON=daemons-kit
MAC=02:77:00:00:00:01

case "${1:-on}" in
  status)
    nmcli -f GENERAL.STATE,IP4.ADDRESS connection show $CON 2>/dev/null || echo "no $CON connection"
    nft list table ip daemons_kit 2>/dev/null | head -n 12 || echo "no sharing"
    systemctl is-active daemons-kit-mind.socket || true
    ping -c1 -W2 10.77.0.2 >/dev/null && echo "the Kit answers at 10.77.0.2" || echo "the Kit does not answer"
    exit 0 ;;
  off)
    nmcli connection delete $CON 2>/dev/null || true
    nft delete table ip daemons_kit 2>/dev/null || true
    rm -f /etc/nftables.d/daemons-kit.nft
    systemctl disable --now daemons-kit-mind.socket 2>/dev/null || true
    rm -f /etc/systemd/system/daemons-kit-mind.socket /etc/systemd/system/daemons-kit-mind.service /etc/sysctl.d/90-daemons-kit.conf
    systemctl daemon-reload
    echo "undone"; exit 0 ;;
esac

echo "== the cable's network"
nmcli connection delete $CON >/dev/null 2>&1 || true
nmcli connection add type ethernet con-name $CON ifname '*' ethernet.mac-address $MAC \
  ipv4.method manual ipv4.addresses 10.77.0.1/30 ipv4.never-default yes ipv6.method disabled connection.autoconnect yes >/dev/null
nmcli connection up $CON >/dev/null 2>&1 || echo "  (the Kit is not plugged in yet; it comes up when it is)"

echo "== the Kit's internet through the Zero"
echo "net.ipv4.ip_forward=1" > /etc/sysctl.d/90-daemons-kit.conf
sysctl -q -p /etc/sysctl.d/90-daemons-kit.conf
mkdir -p /etc/nftables.d
cat > /etc/nftables.d/daemons-kit.nft <<'EOF'
table ip daemons_kit {
  chain post { type nat hook postrouting priority srcnat; ip saddr 10.77.0.0/30 oifname != "enx*" masquerade; }
  chain fwd { type filter hook forward priority filter; policy accept;
              ip daddr 10.77.0.0/30 ct state established,related accept;
              ip daddr 10.77.0.0/30 drop; }
}
EOF
nft delete table ip daemons_kit 2>/dev/null || true
nft -f /etc/nftables.d/daemons-kit.nft
cat > /etc/systemd/system/daemons-kit-nft.service <<'EOF'
[Unit]
Description=The Kit's internet through the Zero (C-458)
After=network-pre.target
[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/usr/sbin/nft -f /etc/nftables.d/daemons-kit.nft
[Install]
WantedBy=multi-user.target
EOF

echo "== the Kit offered to the hub's mind, on the tailnet only (port 4810)"
ts=$(tailscale ip -4 2>/dev/null | head -n1 || true)
if [ -n "$ts" ]; then
  cat > /etc/systemd/system/daemons-kit-mind.socket <<EOF
[Unit]
Description=The Kit's OpenAI front door on the tailnet (C-466)
[Socket]
ListenStream=$ts:4810
FreeBind=yes
[Install]
WantedBy=sockets.target
EOF
  cat > /etc/systemd/system/daemons-kit-mind.service <<'EOF'
[Unit]
Description=The Kit's OpenAI front door on the tailnet (C-466)
[Service]
ExecStart=/usr/lib/systemd/systemd-socket-proxyd --exit-idle-time=5min 10.77.0.2:8000
EOF
else
  echo "  no tailnet address here: skipped"
fi
systemctl daemon-reload
systemctl enable --now daemons-kit-nft.service >/dev/null
[ -n "$ts" ] && systemctl enable --now daemons-kit-mind.socket >/dev/null
echo "done: the Zero is 10.77.0.1, the Kit 10.77.0.2 (KIT on HOME; daemons-zero --kit)"
