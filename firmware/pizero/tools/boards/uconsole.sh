#!/usr/bin/env bash
# C-514: a ClockworkPi uConsole (a CM4) made ready for DAEMONS, once, on the device with sudo. Run by tools/install.sh,
# or:  sudo ~/daemons-zero/src/tools/boards/uconsole.sh [user] [boot]      then reboot
#
# The uConsole is a computer with a desktop of its own (Rex's Bookworm, or ClockworkPi's image): its screen, keyboard,
# sound and cells already work there, so this adds nothing for them. It adds only what DAEMONS needs:
#   - the HackerGadgets AIO's lines in config.txt, where they are missing (HackerGadgets' guide): SPI1 for its SX1262,
#     the UART for its GPS, I2C for its RTC. Nothing is powered on here: the AIO v2's modules each have a power line
#     (GPS 27, LoRa 16, SDR 7, its USB 23), and DAEMONS asks for one only when a routine needs it.
#   - the screen's turn: the panel is 720x1280, held landscape, so the canvas is turned a quarter (ZERO_ROTATE, in a
#     drop-in for daemons@.service; 1 or 3 is seen on the first day).
#   - with "boot": DAEMONS at boot on the bare screen, the desktop no longer started (systemctl set-default
#     graphical.target brings it back). Without it, DAEMONS is not started at boot and the desktop is untouched.
# Everything here is DRAFT until seen on this uConsole (docs/PIBOARDS.md).
set -euo pipefail
source "$(dirname "$0")/common.sh"
mode=${2:-}

# The AIO's lines, only those config.txt does not already carry (Rex's image has some of them)
aio=""
for line in "dtparam=spi=on" "dtoverlay=spi1-1cs" "enable_uart=1" "dtparam=i2c_arm=on" "dtoverlay=i2c-rtc,pcf85063a"; do
  awk -v m="# DAEMONS uconsole (C-457)" '$0 == m { skip = !skip; next } !skip' "$cfg" | grep -qxF "$line" || aio+="$line"$'\n'
done
printf '%s' "$aio" | config_lines uconsole

# The GPS's UART is the serial console's unless the console is taken off it (HackerGadgets' guide)
cmd=$boot/cmdline.txt
if grep -q 'console=serial0,115200' "$cmd"; then
  cp "$cmd" "$cmd.before-daemons"
  sed -i 's/console=serial0,115200 *//' "$cmd"
  echo "kernel: the serial console taken off the GPS's UART ($cmd; the old one kept)"
fi
usermod -aG spi,i2c,gpio,dialout "$user" 2>/dev/null || true

# The screen's turn, for the service (and for running daemons-zero by hand: ZERO_ROTATE=1 daemons-zero)
install -d /etc/systemd/system/daemons@.service.d
printf '[Service]\nEnvironment=ZERO_ROTATE=%s\n' "${UCONSOLE_ROTATE:-1}" > /etc/systemd/system/daemons@.service.d/uconsole.conf

if [[ $mode == boot ]]; then
  start_at_boot uconsole
  systemctl set-default multi-user.target >/dev/null
  echo "the desktop is no longer started at boot (sudo systemctl set-default graphical.target brings it back)"
else
  install -d -o "$user" -g "$user" "/home/$user/.config/daemons"
  echo uconsole > "/home/$user/.config/daemons/board"; chown "$user:" "/home/$user/.config/daemons/board"
  systemctl daemon-reload
  echo "not started at boot (add 'boot' to start it there instead of the desktop)"
fi
echo "now: sudo reboot"
