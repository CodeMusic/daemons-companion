#!/usr/bin/env bash
# C-541: the Pi program built and packaged for one board -- the one recipe GitHub's workflow (.github/workflows/pizero.yml)
# and a volunteer host of DAEMONS Server both run, so their builds can be compared. Run in Debian 13 on arm64, from a
# checkout of one commit:
#   tools/package.sh fetch BOARD          configure only: fetches what CMake pins (by hash); the only step with a network
#   tools/package.sh build BOARD DIST     build, check, package into DIST: daemons-zero-BOARD.tar.gz, .deb, BOARD.json
# The tarball is made the same way on every machine (its files sorted, owned by 0, dated to the commit, gzip without
# a name or time), and the program's built() is the commit's time (SOURCE_DATE_EPOCH), so two honest builds of one
# commit give one SHA-1. ZERO_VERSION is the commit; SOURCE_DATE_EPOCH its time (both set by the caller, else git's).
set -euo pipefail
cd "$(dirname "$0")/.."
step=${1:?fetch or build}; board=${2:?a board}
export BOARD=$board
export ZERO_VERSION=${ZERO_VERSION:-$(git rev-parse HEAD 2>/dev/null || echo local)}
export SOURCE_DATE_EPOCH=${SOURCE_DATE_EPOCH:-$(git log -1 --format=%ct 2>/dev/null || date +%s)}
out=build/device; [[ $board != cardputer-zero ]] && out=build/device-$board
args=(-DCMAKE_BUILD_TYPE=Release -DZERO_BOARD="$board")
command -v ninja >/dev/null && args+=(-G Ninja)

case $step in
  fetch) cmake -S . -B "$out" "${args[@]}" >/dev/null && echo "fetched: $board" ;;
  build)
    dist=${3:?a folder for the result}; mkdir -p "$dist"; dist=$(cd "$dist" && pwd)
    ./build.sh device
    cp ../../server/data/patches.json patches.json
    deb=$(tools/make_deb.sh "$out/daemons-zero")
    cp "$deb" "$dist/daemons-zero-$board.deb"
    stage=$(mktemp -d); cp "$out/daemons-zero" patches.json "$stage/"
    tar --sort=name --mtime="@$SOURCE_DATE_EPOCH" --owner=0 --group=0 --numeric-owner -C "$stage" -cf - daemons-zero patches.json \
      | gzip -n -9 > "$dist/daemons-zero-$board.tar.gz"
    rm -rf "$stage"
    sha=$(sha1sum "$dist/daemons-zero-$board.tar.gz" | cut -d' ' -f1)
    printf '{"board":"%s","commit":"%s","at":"%s","sha1":"%s","file":"daemons-zero-%s.tar.gz"}\n' \
      "$board" "$ZERO_VERSION" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$sha" "$board" > "$dist/$board.json"
    echo "built: $board $sha" ;;
  *) echo "fetch or build" >&2; exit 2 ;;
esac
