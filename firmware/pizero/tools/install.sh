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
tar -C "$here" --exclude ./build --exclude '*.gba' --exclude '*.sav' --exclude '*.bps' --exclude '*.deb' -czf - . |
  ssh "$host" 'mkdir -p ~/daemons-zero/src && find ~/daemons-zero/src -mindepth 1 -maxdepth 1 ! -name build -exec rm -rf {} + &&
               tar -xzf - -C ~/daemons-zero/src'   # the source replaced, its build kept: a second install builds only what changed
scp -q "$repo/server/data/patches.json" "$host:daemons-zero/src/patches.json"

ssh "$host" 'bash -s' <<'EOF'
set -euo pipefail
need=()
for p in cmake g++ ninja-build pkg-config libcurl4-openssl-dev; do dpkg -s "$p" >/dev/null 2>&1 || need+=("$p"); done
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
if sudo -n true 2>/dev/null; then sudo -n dpkg -i "$deb" && echo "installed: DAEMONS is on HOME"
else echo "built $deb -- to install it, on the device run:  sudo dpkg -i ~/daemons-zero/src/$deb"; fi
EOF
