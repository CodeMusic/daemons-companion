#!/usr/bin/env bash
# C-378: the .deb the Cardputer Zero's launcher expects (CardputerZero/AppBuilder's "DEB Package Structure"): the
# program in /usr/share/APPLaunch/bin, its entry in applications/ (APPLaunch looks there every three seconds), its icon
# and the patches.json it falls back on. No service and nothing run as root: APPLaunch starts it as the user.
# Run on the device after ./build.sh device, or anywhere with dpkg-deb and an arm64 build.
#   tools/make_deb.sh [the program]    -> build/daemons-zero_<version>_arm64.deb
set -euo pipefail
cd "$(dirname "$0")/.."
# C-457: the board kept on the device (~/.config/daemons/board) picks the layout: the Cardputer Zero's for APPLaunch, or
# any other board's -- /usr/bin, and daemons@.service to start it at boot (tools/boards/<board>.sh enables it)
board=${BOARD:-$(cat ~/.config/daemons/board 2>/dev/null || echo cardputer-zero)}
build=build/device; [[ $board != cardputer-zero ]] && build=build/device-$board
bin=${1:-$build/daemons-zero}
[[ -x $bin ]] || { echo "build it first: ./build.sh device" >&2; exit 1; }
arch=$(dpkg --print-architecture 2>/dev/null || echo arm64)
patches=patches.json
[[ -f $patches ]] || patches=../../server/data/patches.json
ver="0.1.$(date -u +%Y%m%d%H%M)"
root=build/deb
rm -rf "$root"
if [[ $board == cardputer-zero ]]; then
  install -D -m 0755 "$bin" "$root/usr/share/APPLaunch/bin/daemons-zero"
  install -D -m 0644 packaging/daemons.desktop "$root/usr/share/APPLaunch/applications/daemons.desktop"
  install -D -m 0644 packaging/daemons_100.png "$root/usr/share/APPLaunch/share/images/daemons_100.png"
  install -D -m 0644 "$patches" "$root/usr/share/APPLaunch/share/daemons/patches.json"
  section=APPLaunch
else
  install -D -m 0755 "$bin" "$root/usr/bin/daemons-zero"
  install -D -m 0644 tools/boards/daemons@.service "$root/lib/systemd/system/daemons@.service"
  install -D -m 0644 "$patches" "$root/usr/share/daemons/patches.json"
  section=games
fi
mkdir -p "$root/DEBIAN"
cat > "$root/DEBIAN/control" <<EOF
Package: daemons-zero
Version: $ver
Architecture: $arch
Maintainer: CodeMusic <https://github.com/CodeMusic/daemons-companion>
Depends: libcurl4 | libcurl4t64
Section: $section
Priority: optional
Description: DAEMONS on the $board
 The game, made on the device from the player's own ROM, and the companion
 around it. Nothing of Nintendo's is in this package.
EOF
out="build/daemons-zero_${ver}_${arch}.deb"
dpkg-deb --build --root-owner-group "$root" "$out" >/dev/null
echo "$out"
