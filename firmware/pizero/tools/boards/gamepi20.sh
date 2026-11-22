#!/usr/bin/env bash
# C-457: a Waveshare GamePi20 made ready for DAEMONS, once, on the device itself with sudo -- its screen, its twelve
# buttons and its speaker turned on in the boot config, and DAEMONS started at boot in place of the console. Raspberry
# Pi OS Lite (trixie or bookworm), with the user and Wi-Fi set in Raspberry Pi Imager. Run by tools/install.sh, or:
#   sudo ~/daemons-zero/src/tools/boards/gamepi20.sh [user]      then reboot
# Every line it adds to config.txt sits between two "# DAEMONS GamePi20" marks and is rewritten whole on a second run.
# The pins are Waveshare's (wiki: GamePi20): screen SPI0 CE0, DC 25, RESET 27, backlight 24; sound PWM on 18; the
# buttons, active low, below.
#   GAMEPI_MADCTL=0x60   the screen's turn (ST7789 MADCTL): 0xA0 is the other way up
set -euo pipefail
source "$(dirname "$0")/common.sh"
madctl=${GAMEPI_MADCTL:-0x60}

# ---- the screen: the kernel's panel-mipi-dbi driver, told the ST7789VW's start-up by a firmware file ---------------------
# The file's form is the kernel's (Documentation/gpu/panel-mipi-dbi): "MIPI DBI", seven zero bytes, version 1, then each
# command as its byte, its count of parameters, the parameters; command 0 is a wait of that many milliseconds.
python3 - "$madctl" <<'EOF'
import sys
madctl = int(sys.argv[1], 0)
seq = [
    (0x01, []), (0x00, [150]),          # software reset, then wait
    (0x11, []), (0x00, [120]),          # out of sleep
    (0x3A, [0x55]),                     # 16 bits a pixel (RGB565)
    (0x36, [madctl]),                   # the turn: 320 wide, as it is held
    (0x21, []),                         # inverted, as an IPS ST7789 wants
    (0x13, []),                         # normal display
    (0x29, []), (0x00, [50]),           # on
]
out = bytearray(b"MIPI DBI" + bytes(7) + b"\x01")
for cmd, params in seq:
    out += bytes([cmd, len(params)]) + bytes(params)
open("/lib/firmware/panel.bin", "wb").write(out)
EOF
echo "screen: /lib/firmware/panel.bin (MADCTL $madctl)"

# ---- the buttons ----------------------------------------------------------------------------------------------------
#           UP DOWN LEFT RIGHT A  B X  Y  START SELECT L R
pad_buttons "12 20  21   13    23 4 22 17 26    16     5 6"

# ---- config.txt: our lines, between the marks ------------------------------------------------------------------------
config_lines GamePi20 <<'EOF'
dtparam=spi=on
dtoverlay=mipi-dbi-spi,spi0-0,speed=48000000
dtparam=width=320,height=240,width-mm=41,height-mm=31
dtparam=reset-gpio=27,dc-gpio=25,backlight-gpio=24,write-only
dtoverlay=daemons-pad
dtparam=audio=on
dtoverlay=audremap,pins_18_19
EOF

# ---- DAEMONS at boot, on the small screen, in place of the console --------------------------------------------------
start_at_boot gamepi20
echo "now: sudo reboot"
