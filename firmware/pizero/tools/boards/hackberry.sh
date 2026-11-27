#!/usr/bin/env bash
# C-593: a HackberryPi (ZitaoTech's; a Raspberry Pi Zero 2 W in a BlackBerry's body) made ready for DAEMONS, once, on
# the device with sudo. Run by tools/install.sh, or:
#   sudo ~/daemons-zero/src/tools/boards/hackberry.sh [user] [boot]
#
# It is a computer with a console of its own, so this changes as little as it can:
#   - the screen: the 4-inch 720x720 panel is on DPI, turned on by one line in config.txt
#     (dtoverlay=vc4-kms-dpi-hyperpixel4sq, the maker's Screen page). Where the line is already there -- any card the
#     screen works on -- config.txt is left exactly as it is. I2C is never turned on: its pins are the screen's, and
#     the maker warns the screen goes black (the STEMMA port is on other pins, GPIO 10 and 11).
#   - the keys: the keyboard is a USB keyboard, and a console logged in on the screen reads it too. `daemons`, a
#     command this writes, takes the keys for DAEMONS while it runs (ZERO_GRAB) and hides the console's cursor; LEAVE
#     on HOME gives both back.
#   - with "boot": DAEMONS at boot (daemons@<user>.service) on a console of its own, the eighth, so what the first
#     console prints is never drawn over it; when DAEMONS stops, the first console is shown again. Without it, nothing
#     is started at boot and the device starts as it always did.
# Seen on the device (2026-11-27): the screen's overlay, the framebuffer, the keyboard, and "boot" -- DAEMONS on the
# eighth console 12.7 seconds after power on, and stopped, the first console back as it was. The `daemons` command
# typed at the console: not yet (DRAFT; docs/PIBOARDS.md).
set -euo pipefail
source "$(dirname "$0")/common.sh"
mode=${2:-}

overlay="dtoverlay=vc4-kms-dpi-hyperpixel4sq"
changed=0
if grep -qE "^[[:space:]]*$overlay" "$cfg"; then
  echo "the screen: its line is already in $cfg, which is left as it is"
else
  config_lines hackberry <<< "$overlay"
  changed=1
fi
if grep -qE '^[[:space:]]*dtparam=i2c_arm=on' "$cfg"; then
  echo "WARNING: $cfg turns I2C on (dtparam=i2c_arm=on). Its pins are this screen's: the maker says the screen stays black." >&2
fi

# DAEMONS from the console, by one short word: the keys ours while it runs, the cursor hidden, the screen cleared after
cat > /usr/local/bin/daemons <<'EOF'
#!/bin/sh
# C-593: DAEMONS on a HackberryPi, started from its console (written by tools/boards/hackberry.sh)
printf '\033[?25l'
ZERO_GRAB=1 /usr/bin/daemons-zero "$@"
s=$?
printf '\033[?25h'
clear
exit $s
EOF
chmod 0755 /usr/local/bin/daemons

install -d -o "$user" -g "$user" "/home/$user/.config/daemons"
echo hackberry > "/home/$user/.config/daemons/board"; chown "$user:" "/home/$user/.config/daemons/board"
usermod -aG video,input,audio,render "$user" 2>/dev/null || usermod -aG video,input,audio "$user"

# For the service: the keys ours, and a console of our own to draw on, its cursor hidden; the first console back after
install -d /etc/systemd/system/daemons@.service.d
cat > /etc/systemd/system/daemons@.service.d/hackberry.conf <<'EOF'
[Service]
Environment=ZERO_GRAB=1
ExecStartPre=+/bin/sh -c 'chvt 8; printf "\\033[?25l" > /dev/tty8'
ExecStopPost=+/bin/sh -c 'printf "\\033[?25h" > /dev/tty8; chvt 1'
EOF

if [[ $mode == boot ]]; then
  start_at_boot hackberry
else
  systemctl daemon-reload
  echo "not started at boot (add 'boot' to start it there). From the console:  daemons"
fi
touch "/home/$user/.config/daemons/ready-hackberry"; chown "$user:" "/home/$user/.config/daemons/ready-hackberry"
(( changed )) && echo "now: sudo reboot" || echo "ready: nothing here needs a reboot"
