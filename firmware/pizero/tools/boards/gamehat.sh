#!/usr/bin/env bash
# C-468: a Waveshare Game HAT on a Raspberry Pi 3 or 4 made ready for DAEMONS, once, on the device with sudo -- its
# screen's HDMI picture, its twelve buttons, and DAEMONS started at boot. Raspberry Pi OS Lite (64-bit), with the user
# and Wi-Fi set in Raspberry Pi Imager. Run by tools/install.sh, or:
#   sudo ~/daemons-zero/src/tools/boards/gamehat.sh [user]      then reboot
# The pins are Waveshare's (wiki: Game_HAT). Its screen is on the Pi's HDMI (the first, HDMI0, on a Pi 4): Waveshare
# sends it 640x480, which the HAT fits to its 480x320; its speaker plays the HDMI's sound, so nothing is turned on for
# sound. A Pi 4's second HDMI stays free for a TV.
set -euo pipefail
source "$(dirname "$0")/common.sh"

#           UP DOWN LEFT RIGHT A  B  X  Y  START SELECT L  R
pad_buttons "5 6    13   19    26 12 16 20 21    4      18 23"

# The firmware's own HDMI lines, for the picture before the kernel's driver takes over (Waveshare's)...
config_lines gamehat <<'EOF'
hdmi_force_hotplug=1
hdmi_group=2
hdmi_mode=87
hdmi_cvt=640 480 60 1 0 0 0
hdmi_drive=2
dtoverlay=daemons-pad
EOF
# ...and the kernel's (KMS ignores hdmi_cvt): 640x480 on the first HDMI, forced on whether or not it answers
cmd=$boot/cmdline.txt
if ! grep -q 'video=HDMI-A-1:' "$cmd"; then
  cp "$cmd" "$cmd.before-daemons"
  sed -i '1 s/$/ video=HDMI-A-1:640x480@60D/' "$cmd"
  echo "kernel: video=HDMI-A-1:640x480@60D in $cmd"
fi

start_at_boot gamehat
echo "now: sudo reboot"
