#!/usr/bin/env bash
# C-512: the DAEMICOM (a Raspberry Pi 5 booting from its SSD) made ready for DAEMONS, once, on the device with sudo --
# its 3.5-inch screen and touch, and DAEMONS started at boot on that screen. Run by tools/install.sh, or:
#   sudo ~/daemons-zero/src/tools/boards/daemicom.sh [user]      then reboot
# The screen is the generic "3.5inch RPi Display" (LCD35 / MPI3501): an ILI9486 on SPI0 CE0 (DC 24, RESET 25) and an
# XPT2046 on CE1 (PENIRQ 17) -- the kernel's own piscreen overlay drives both, so nothing is built. The Pi's desktop
# stays on its HDMI ports (the user keeps Raspberry Pi OS with its desktop): DAEMONS draws only on the small screen's
# framebuffer, found by its driver's name (hal/device.cpp). Seen on the device: not yet (DRAFT) -- the overlay's turn
# and the touch's axes are the first things to check; calibrate in ~/.config/daemons/touch.conf (touch.h).
set -euo pipefail
source "$(dirname "$0")/common.sh"

# The screen held landscape, 480 wide; ads7846's touch then reads across as the screen does (else: swapxy, invx in
# touch.conf). 16 MHz is the panel's safe speed through its shift registers.
config_lines daemicom <<'CFG'
dtparam=spi=on
dtoverlay=piscreen,speed=16000000,rotate=90
CFG

start_at_boot daemicom
echo "now: sudo reboot -- then, if a tap lands in the wrong place, write ~/.config/daemons/touch.conf (touch.h)"
