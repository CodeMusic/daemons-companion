#!/usr/bin/env bash
# C-377: DAEMONS onto the Cardputer Zero over SSH, from this computer -- the source copied across (never a build, a
# ROM or a save), built on the device itself, packaged as a .deb and installed, so DAEMONS shows on its HOME.
#   tools/install.sh <user>@<device>          the user and name set in M5 Imager (SSH turned on there)
#   tools/install.sh <user>@<device> probe    tools/probe.sh only, into build/probe-<device>.txt
# It installs the build's tools on the device if they are missing (cmake, g++, ninja, libcurl's headers), which needs
# sudo there; where sudo asks for a password it stops and says what to run.
set -euo pipefail
host=${1:?usage: tools/install.sh <user>@<device> [probe]}
here=$(cd "$(dirname "$0")/.." && pwd)
repo=$(cd "$here/../.." && pwd)
mkdir -p "$here/build"

if [[ ${2:-} == probe ]]; then
  out="$here/build/probe-${host#*@}.txt"
  ssh "$host" 'bash -s' < "$here/tools/probe.sh" > "$out"
  echo "probe: $out"
  exit 0
fi

echo "copying the source to $host:daemons-zero/src"
# by content (-c), and without the Mac's times: a file that changed lands with the time it arrived, so the device's build
# remakes exactly what changed (tar kept the Mac's times, older than the device's objects, and nothing was remade); the
# device's own build/ is never touched, so a second install builds only what changed
# C-457: the board, named once (BOARD=gamepi20 tools/install.sh ...) and kept on the device; the Cardputer Zero otherwise
if [[ -n ${BOARD:-} ]]; then ssh "$host" "mkdir -p ~/.config/daemons && echo $BOARD > ~/.config/daemons/board"; fi
ssh "$host" 'mkdir -p ~/daemons-zero/src'
rsync -rc --delete --exclude /build/ --exclude '/build-*/' --exclude /shots/ --exclude '*.gba' --exclude '*.sav' \
  --exclude '*.bps' --exclude '*.deb' --exclude /patches.json --exclude .DS_Store "$here/" "$host:daemons-zero/src/"
scp -q "$repo/server/data/patches.json" "$host:daemons-zero/src/patches.json"

ssh "$host" 'bash -s' <<'EOF'
set -euo pipefail
need=()
for p in cmake g++ ninja-build pkg-config libcurl4-openssl-dev rsync device-tree-compiler; do dpkg -s "$p" >/dev/null 2>&1 || need+=("$p"); done
if ((${#need[@]})); then
  echo "installing on the device: ${need[*]}"
  if ! sudo -n true 2>/dev/null; then
    echo "sudo asks for a password here. On the device, run:  sudo apt-get install -y ${need[*]}  -- then this again."
    exit 1
  fi
  sudo -n apt-get update -qq && sudo -n apt-get install -y -qq "${need[@]}"
fi
cd ~/daemons-zero/src
echo "building on the device (the first time fetches mGBA, LovyanGFX and miniaudio: a few minutes)"
./build.sh device
deb=$(tools/make_deb.sh)
board=$(cat ~/.config/daemons/board 2>/dev/null || echo cardputer-zero)
setup=""
# a board with no launcher is made ready once (its screen, buttons, sound, and DAEMONS at boot): tools/boards/<board>.sh
[[ $board != cardputer-zero && -x tools/boards/$board.sh ]] && ! grep -q "DAEMONS $board\|DAEMONS GamePi20" /boot/firmware/config.txt /boot/config.txt 2>/dev/null \
  && setup="sudo ~/daemons-zero/src/tools/boards/$board.sh && "
if sudo -n true 2>/dev/null; then
  sudo -n dpkg -i "$deb" && echo "installed"
  [[ -n $setup ]] && sudo -n ~/daemons-zero/src/tools/boards/$board.sh && echo "made ready: now  sudo reboot"
else echo "built $deb -- to install it, on the device run:  ${setup}sudo dpkg -i ~/daemons-zero/src/$deb"; fi
EOF
