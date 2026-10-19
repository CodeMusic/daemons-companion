#!/bin/bash
# C-168 Phase 0: bring a fresh M5Stack CoreMP135 (M5's Debian 12 image, 20260626) up to be the companion's hub.
# Run it ON THE HUB, as root, twice -- it knows which half it is in:
#
#   scp companion/hub/phase0.sh debian@<hub>:      then, from the Mac:
#   ssh -t debian@<hub> 'sudo bash ~/phase0.sh Area/City'      (your timezone, as timedatectl names it)
#
# FIRST RUN (the root filesystem is still M5's 1 GB): new passwords for debian and root (you type them); SSH by key
# only, no root login; fresh SSH host keys (every copy of M5's image ships the same ones); the timezone; the root
# partition grown to the whole card, and a one-shot service that grows the filesystem on the next boot; then a reboot.
# The Mac's known_hosts needs `ssh-keygen -R <hub>` after it, because the host keys changed.
#
# SECOND RUN (the filesystem is big): apt update and full-upgrade (the kernel is a plain file in /boot that no package
# owns, so an upgrade cannot replace it), the packages the hub's later phases use, and a read-only probe of what the
# board has -- printed for the record. Nothing here powers the M5-Bus or touches the radio: that is measured first.
#
# Every step is idempotent. Nothing personal is in this file (the companion repo is public, C-12).
set -euo pipefail

[ "$(id -u)" = 0 ] || { echo "phase0: run it with sudo" >&2; exit 1; }
TZ_WANTED="${1:-}"
DEV=/dev/mmcblk0
ROOT_GB=$(( $(df --output=size -k / | tail -1) / 1024 / 1024 ))

say() { printf '\n== %s\n' "$*"; }

if [ "$ROOT_GB" -lt 2 ]; then
  say "FIRST RUN: the root filesystem is ${ROOT_GB} GB"

  say "passwords: type a new one for 'debian', then for 'root' (M5's published defaults are temppwd and root)"
  passwd debian
  passwd root

  say "SSH: keys only, no root login"
  [ -s /home/debian/.ssh/authorized_keys ] || { echo "phase0: no key in ~debian/.ssh/authorized_keys -- refusing to turn passwords off" >&2; exit 1; }
  cat > /etc/ssh/sshd_config.d/10-daemons-hub.conf <<'EOF'
# C-168: the hub is reached by key (the Mac's), never by password; root never logs in over SSH
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
EOF

  say "SSH: fresh host keys (they are new after the reboot)"
  rm -f /etc/ssh/ssh_host_*
  ssh-keygen -A

  if [ -n "$TZ_WANTED" ]; then say "timezone: $TZ_WANTED"; timedatectl set-timezone "$TZ_WANTED"; fi

  say "root partition: grow it to the end of the card"
  P4_END=$(( $(cat /sys/block/mmcblk0/mmcblk0p4/start) + $(cat /sys/block/mmcblk0/mmcblk0p4/size) ))
  P5_START=$(cat /sys/block/mmcblk0/mmcblk0p5/start)
  # M5's resize_mmc.sh recreates partition 5 from the sector after partition 4: only safe if that is where it starts
  [ "$P4_END" = "$P5_START" ] || { echo "phase0: partition 5 starts at $P5_START, not $P4_END -- not touching it" >&2; exit 1; }
  # The image was made for a 1 GB card: its GPT's backup header and last usable sector sit at 1 GB. Move them to the
  # end of this card first, or the new partition 5 would end at 1 GB again (M5's resize_mmc.sh does not)
  sgdisk -e "$DEV"
  # M5's own steps (usr/local/m5stack/resize_mmc.sh), without its fsck of the mounted root filesystem
  sgdisk "$DEV" -d 5
  sgdisk -a 1 -n "5:${P5_START}:" -c 5:rootfs -t 5:8300 -u 5:549C80E0-A7FA-42CB-87B7-810481D4D26F "$DEV"
  sgdisk "$DEV" -A 5:set:2
  sgdisk "$DEV" -i 5 | grep -E "First sector|Last sector|Partition size"
  cat > /etc/systemd/system/resizefs.service <<EOF
[Unit]
Description=Resize root filesystem to fit available disk space (C-168, once)
Wants=systemd-udevd.service systemd-udev-trigger.service
After=systemd-remount-fs.service systemd-udevd.service

[Service]
Type=oneshot
ExecStart=/sbin/resize2fs ${DEV}p5
ExecStartPost=/bin/systemctl disable resizefs.service

[Install]
WantedBy=basic.target
EOF
  systemctl enable resizefs.service
  sync

  say "rebooting in 5 s: the filesystem grows as it starts. Then on the Mac: ssh-keygen -R <hub>, and run this again."
  sleep 5
  systemctl reboot
  exit 0
fi

say "SECOND RUN: the root filesystem is ${ROOT_GB} GB"

say "network: keep each Ethernet port's MAC from boot to boot"
# This board has no MAC in its OTP: it makes up a new one at every boot, so the router gave it a new address each time
# (seen 2026-10-18). Pin the MAC it has now into NetworkManager, per port, so its address can be reserved and stays.
ETH0_CON=$(nmcli -g GENERAL.CONNECTION device show eth0 2>/dev/null || true)
for ifc in eth0 eth1; do
  [ -e "/sys/class/net/$ifc" ] || { echo "$ifc: not on this board"; continue; }
  con=$(nmcli -g GENERAL.CONNECTION device show "$ifc" 2>/dev/null || true)
  # a port with no cable has no active connection: take the wired one eth0 is not using
  [ -n "$con" ] || con=$(nmcli -t -f NAME,TYPE connection show | awk -F: -v not="$ETH0_CON" '$2=="802-3-ethernet" && $1!=not {print $1; exit}' || true)
  mac=$(cat "/sys/class/net/$ifc/address")
  have=$([ -n "$con" ] && nmcli -g 802-3-ethernet.cloned-mac-address connection show "$con" 2>/dev/null || true)
  if [ -n "$con" ] && [ -z "$have" ]; then
    nmcli connection modify "$con" 802-3-ethernet.cloned-mac-address "$mac" 802-3-ethernet.mac-address "" connection.interface-name "$ifc"
    echo "$ifc: '$con' keeps $mac"
  else
    echo "$ifc: '${con:-none}' ${have:+already keeps $have}"
  fi
done

say "apt: update and full-upgrade"
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get -y -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold full-upgrade

say "apt: the packages the hub uses"
# python3-serial: the cable bridges. spidev + libgpiod + gpiod: the LoRa radio. sqlite3 + time: the server's store and
# timings. ffmpeg: the server's voice (voice.ts converts with it). evtest, python3-pil, python3-evdev: the screen.
apt-get -y install curl git python3-serial python3-spidev python3-libgpiod gpiod sqlite3 time ffmpeg evtest \
  python3-pil python3-evdev usbutils

say "probe: what this board has (read only)"
echo "--- system";   grep PRETTY /etc/os-release; uname -r; df -h / | tail -1; free -m | sed -n 2p
echo "--- clock";    timedatectl | grep -E "Time zone|synchronized|RTC time"; ls /dev/rtc* 2>/dev/null
echo "--- kernel";   zcat /proc/config.gz 2>/dev/null | grep -E '^CONFIG_(TUN|USB_ACM|USB_SERIAL_CP210X|USB_SERIAL_FTDI_SIO|USB_SERIAL_CH341|ZRAM|SPI_SPIDEV|MEMCG|OF_OVERLAY)=' || echo "(no /proc/config.gz)"
for m in tun cp210x ftdi_sio ch341 cdc_acm; do printf '%-9s ' "$m"; modinfo -F filename "$m" 2>/dev/null || echo "-"; done
echo "--- usb";      lsusb -t 2>/dev/null
echo "--- spi";      for d in /sys/bus/spi/devices/*; do echo "$d $(cat "$d/modalias" 2>/dev/null) $(readlink -f "$d/of_node")"; done
echo "--- screen";   cat /proc/fb; grep -E "N: Name|H: Handlers" /proc/bus/input/devices
echo "--- heat";     for z in /sys/class/thermal/thermal_zone*; do echo "$z $(cat "$z/type") $(cat "$z/temp")"; done
echo "--- watchdog"; ls /dev/watchdog* 2>/dev/null   # listed only: opening it with NOWAYOUT reboots the board in 32 s
echo "--- bus power (PI3 = BUS_OUT_EN), read only"; ls -d /sys/class/gpio/PI3 2>/dev/null && cat /sys/class/gpio/PI3/value 2>/dev/null || echo "PI3 not exported (bus power not driven by Linux)"
echo "--- network";  ip -br link
echo
echo "phase0: done. Next: measure the M5-Bus 5 V before powering it (C-168 test 11), then Phase 1 (Node 22, the server)."
