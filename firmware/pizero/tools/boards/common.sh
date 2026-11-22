# C-468: what the handhelds' setups share (sourced by gamepi20.sh and gamehat.sh, run with sudo on the device): the
# buttons as one gpio-keys device, our lines in config.txt between two marks, and DAEMONS started at boot.
[[ $EUID == 0 ]] || { echo "run it with sudo" >&2; exit 1; }
user=${1:-${SUDO_USER:-codemusic}}
boot=/boot/firmware; [[ -f $boot/config.txt ]] || boot=/boot
cfg=$boot/config.txt
here=$(cd "$(dirname "$0")" && pwd)
command -v dtc >/dev/null || apt-get install -y -qq device-tree-compiler

# pad_buttons "UP DOWN LEFT RIGHT A B X Y START SELECT L R" -- twelve BCM pins in that order. One gpio-keys device
# (twelve dtoverlay=gpio-key lines would make twelve; DAEMONS reads one), pulled up, pressed low, each button sending
# the gamepad code it is named for (BTN_A, BTN_START...), so hal/device.cpp reads them as Key::PadA and the rest.
pad_buttons() {
  local p=($1) codes=(0x220 0x221 0x222 0x223 0x130 0x131 0x133 0x134 0x13b 0x13a 0x136 0x137)
  local names=(up down left right a b x y start select tl tr) dts keys="" i
  (( ${#p[@]} == 12 )) || { echo "pad_buttons: twelve pins, not ${#p[@]}" >&2; exit 1; }
  for i in "${!p[@]}"; do
    keys+="        ${names[$i]} { label = \"${names[$i]}\"; linux,code = <${codes[$i]}>; gpios = <&gpio ${p[$i]} 1>; };"$'\n'
  done
  dts=$(mktemp --suffix=.dts)
  cat > "$dts" <<EOF
/dts-v1/;
/plugin/;
/ {
  compatible = "brcm,bcm2835";
  fragment@0 {
    target = <&gpio>;
    __overlay__ {
      daemons_pad_pins: daemons_pad_pins {
        brcm,pins = <${p[*]}>;
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
$keys      };
    };
  };
};
EOF
  dtc -@ -q -I dts -O dtb -o "$boot/overlays/daemons-pad.dtbo" "$dts"
  rm -f "$dts"
  echo "buttons: $boot/overlays/daemons-pad.dtbo (pins ${p[*]})"
}

# config_lines BOARD <<< "lines" -- our lines for BOARD, between two "# DAEMONS <BOARD> (C-457)" marks, rewritten whole
# on a second run; the old config.txt kept beside it
config_lines() {
  local mark="# DAEMONS $1 (C-457)" tmp
  tmp=$(mktemp)
  awk -v m="$mark" '$0 == m { skip = !skip; next } !skip' "$cfg" > "$tmp"
  { echo "$mark"; echo "[all]"; cat; echo "$mark"; } >> "$tmp"
  cp "$cfg" "$cfg.before-daemons"
  cat "$tmp" > "$cfg"   # in place: the file keeps its owner and mode
  rm -f "$tmp"
  echo "config: $cfg (the old one kept as config.txt.before-daemons)"
}

# start_at_boot BOARD -- the board kept for the build and the package, and DAEMONS at boot as the user, on its screen
start_at_boot() {
  usermod -aG video,input,audio,render "$user" 2>/dev/null || usermod -aG video,input,audio "$user"
  install -d -o "$user" -g "$user" "/home/$user/.config/daemons"
  echo "$1" > "/home/$user/.config/daemons/board"; chown "$user:" "/home/$user/.config/daemons/board"
  install -m 0644 "$here/daemons@.service" /etc/systemd/system/daemons@.service
  systemctl daemon-reload
  systemctl enable "daemons@$user.service" >/dev/null
  echo "started at boot: daemons@$user.service (journalctl -u daemons@$user to read it)"
}
