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
[[ $EUID == 0 ]] || { echo "run it with sudo" >&2; exit 1; }
user=${1:-${SUDO_USER:-codemusic}}
madctl=${GAMEPI_MADCTL:-0x60}
boot=/boot/firmware; [[ -f $boot/config.txt ]] || boot=/boot
cfg=$boot/config.txt
here=$(cd "$(dirname "$0")" && pwd)

command -v dtc >/dev/null || apt-get install -y -qq device-tree-compiler

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

# ---- the buttons: one gpio-keys device, every button on it, each sending the gamepad code it is named for --------------
# (twelve dtoverlay=gpio-key lines would make twelve input devices; DAEMONS reads one). Pulled up, pressed low.
dts=$(mktemp --suffix=.dts)
cat > "$dts" <<'EOF'
/dts-v1/;
/plugin/;
/ {
  compatible = "brcm,bcm2835";
  fragment@0 {
    target = <&gpio>;
    __overlay__ {
      daemons_pad_pins: daemons_pad_pins {
        brcm,pins = <12 20 21 13 23 4 22 17 26 16 5 6>;
        brcm,function = <0>;
        brcm,pull = <2 2 2 2 2 2 2 2 2 2 2 2>;
      };
    };
  };
  fragment@1 {
    target-path = "/";
    __overlay__ {
      daemons-pad {
        compatible = "gpio-keys";
        pinctrl-names = "default";
        pinctrl-0 = <&daemons_pad_pins>;
        up     { label = "UP";     linux,code = <0x220>; gpios = <&gpio 12 1>; };
        down   { label = "DOWN";   linux,code = <0x221>; gpios = <&gpio 20 1>; };
        left   { label = "LEFT";   linux,code = <0x222>; gpios = <&gpio 21 1>; };
        right  { label = "RIGHT";  linux,code = <0x223>; gpios = <&gpio 13 1>; };
        a      { label = "A";      linux,code = <0x130>; gpios = <&gpio 23 1>; };
        b      { label = "B";      linux,code = <0x131>; gpios = <&gpio 4 1>; };
        x      { label = "X";      linux,code = <0x133>; gpios = <&gpio 22 1>; };
        y      { label = "Y";      linux,code = <0x134>; gpios = <&gpio 17 1>; };
        start  { label = "START";  linux,code = <0x13b>; gpios = <&gpio 26 1>; };
        select { label = "SELECT"; linux,code = <0x13a>; gpios = <&gpio 16 1>; };
        tl     { label = "L";      linux,code = <0x136>; gpios = <&gpio 5 1>; };
        tr     { label = "R";      linux,code = <0x137>; gpios = <&gpio 6 1>; };
      };
    };
  };
};
EOF
dtc -@ -q -I dts -O dtb -o "$boot/overlays/daemons-pad.dtbo" "$dts"
rm -f "$dts"
echo "buttons: $boot/overlays/daemons-pad.dtbo"

# ---- config.txt: our lines, between the marks ------------------------------------------------------------------------
tmp=$(mktemp)
awk '/^# DAEMONS GamePi20 \(C-457\)$/{skip=!skip; next} !skip' "$cfg" > "$tmp"
cat >> "$tmp" <<'EOF'
# DAEMONS GamePi20 (C-457)
[all]
dtparam=spi=on
dtoverlay=mipi-dbi-spi,spi0-0,speed=48000000
dtparam=width=320,height=240,width-mm=41,height-mm=31
dtparam=reset-gpio=27,dc-gpio=25,backlight-gpio=24,write-only
dtoverlay=daemons-pad
dtparam=audio=on
dtoverlay=audremap,pins_18_19
# DAEMONS GamePi20 (C-457)
EOF
cp "$cfg" "$cfg.before-daemons"
cat "$tmp" > "$cfg"   # in place: the file keeps its owner and mode
rm -f "$tmp"
echo "config: $cfg (the old one kept as config.txt.before-daemons)"

# ---- DAEMONS at boot, on the small screen, in place of the console --------------------------------------------------
usermod -aG video,input,audio,gpio "$user" 2>/dev/null || usermod -aG video,input,audio "$user"
install -d -o "$user" -g "$user" "/home/$user/.config/daemons"
echo gamepi20 > "/home/$user/.config/daemons/board"; chown "$user:" "/home/$user/.config/daemons/board"
install -m 0644 "$here/daemons@.service" /etc/systemd/system/daemons@.service
systemctl daemon-reload
systemctl enable "daemons@$user.service" >/dev/null
echo "started at boot: daemons@$user.service (journalctl -u daemons@$user to read it)"
echo "now: sudo reboot"
