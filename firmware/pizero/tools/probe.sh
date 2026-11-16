#!/usr/bin/env bash
# C-377: what the Cardputer Zero really is, the first day -- run on the device, read on the computer:
#   ssh <user>@<device> 'bash -s' < tools/probe.sh > probe.txt
# It reads and changes nothing. It leaves out serial numbers, MAC addresses and network addresses: what it prints can
# be summarised into docs/HARDWARE.md, but read it before copying anything from it.
#   I2C=1   also scan I2C1 (i2cdetect: a read of each address -- M5Stack lists what should answer)
#   BENCH=1 also time the game, if DAEMONS is installed and made (daemons-zero --bench)
set -u
say() { printf '\n== %s\n' "$*"; }
run() { "$@" 2>&1 || true; }

say "the system"
run cat /etc/os-release
run uname -srm
run cat /proc/device-tree/model; echo
run grep -E '^(Model|Hardware|Revision)' /proc/cpuinfo
run nproc
for f in scaling_governor scaling_max_freq cpuinfo_max_freq; do
  printf '%s: ' "$f"; run cat /sys/devices/system/cpu/cpu0/cpufreq/$f
done
run free -m
run df -h /
run vcgencmd measure_temp

say "the screen"
run ls -l /dev/fb* /dev/dri 2>/dev/null
for fb in /sys/class/graphics/fb*; do
  [[ -e $fb ]] || continue
  printf '%s: name=%s size=%s bpp=%s stride=%s rotate=%s\n' "$fb" "$(cat $fb/name 2>/dev/null)" "$(cat $fb/virtual_size 2>/dev/null)" \
    "$(cat $fb/bits_per_pixel 2>/dev/null)" "$(cat $fb/stride 2>/dev/null)" "$(cat $fb/rotate 2>/dev/null)"
done
for c in /sys/class/drm/card*-*; do [[ -e $c ]] && printf '%s: %s\n' "$c" "$(cat $c/status 2>/dev/null)"; done
run ls /sys/class/backlight
for b in /sys/class/backlight/*; do [[ -e $b ]] && printf '%s: %s of %s\n' "$b" "$(cat $b/brightness)" "$(cat $b/max_brightness)"; done
for p in /sys/module/fbtft/parameters /sys/module/*st7789*/parameters /sys/module/panel_mipi_dbi/parameters; do
  [[ -d $p ]] && for x in $p/*; do printf '%s=%s\n' "$x" "$(cat $x 2>/dev/null)"; done
done
say "the boot config (display, SPI, I2C, sound overlays)"
for c in /boot/firmware/config.txt /boot/config.txt; do [[ -f $c ]] && grep -vE '^\s*(#|$)' "$c"; done
run ls /boot/firmware/overlays 2>/dev/null | grep -iE 'm5|cardputer|st77|tca|es83|aw87|bq27'

say "the keys and other input"
run grep -vE '^U: Uniq=' /proc/bus/input/devices
run ls -l /dev/input/by-path /dev/input/by-id

say "sound"
run cat /proc/asound/cards
run aplay -l
run arecord -l

say "power"
for s in /sys/class/power_supply/*; do
  [[ -e $s ]] || continue
  echo "-- $s"
  grep -viE 'serial|manufacture_date' "$s/uevent" 2>/dev/null
done

say "the kernel's drivers for its parts"
run lsmod | grep -iE 'fb|st77|drm|tca|matrix|keypad|snd|es83|aw87|bq27|rx8130|bmi|bmm|imx219|lirc|gpio_ir|spi|i2c'
run ls /dev/i2c-* /dev/spidev* /dev/lirc* /dev/gpiochip* 2>/dev/null
if [[ ${I2C:-0} == 1 ]] && command -v i2cdetect >/dev/null; then say "I2C1"; run i2cdetect -y 1; fi

say "the network (names and states only)"
run ip -br link | awk '{print $1, $2}'
run nmcli -t -f DEVICE,TYPE,STATE device 2>/dev/null

say "the launcher"
run systemctl --user status APPLaunch.service --no-pager -n 0
run ls /usr/share/APPLaunch /usr/share/APPLaunch/applications
run dpkg-query -W -f '${Package} ${Version}\n' 2>/dev/null | grep -iE 'applaunch|cardputer|m5|lvgl|store'
say "what a build needs"
for t in gcc g++ cmake ninja make git pkg-config dpkg-deb curl; do printf '%s: %s\n' "$t" "$(command -v $t || echo missing)"; done
run dpkg-query -W -f '${Package} ${Version}\n' libcurl4-openssl-dev 2>/dev/null

if [[ ${BENCH:-0} == 1 && -x /usr/share/APPLaunch/bin/daemons-zero ]]; then
  say "the game's speed"
  run /usr/share/APPLaunch/bin/daemons-zero --bench 1800
fi
