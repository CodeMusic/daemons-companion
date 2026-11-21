#!/usr/bin/env bash
# C-378: build DAEMONS for the Cardputer Zero, and run its checks.
#   ./build.sh            on a computer: the SDL window (build/window); on the device: its own screen (build/device)
#   ./build.sh window     the window, even on a Linux computer
#   ./build.sh run [...]  build, then run it (the arguments go to daemons-zero)
# A failed build stops here (set -e) -- never a stale program run in its place.
set -euo pipefail
cd "$(dirname "$0")"

side=auto
run=0
if [[ "${1:-}" == "window" || "${1:-}" == "device" ]]; then side=$1; shift; fi
if [[ "${1:-}" == "run" ]]; then run=1; shift; fi
if [[ $side == auto ]]; then
  # aarch64, or armv6/armv7 (a first Pi Zero runs 32-bit): C-457
  if [[ "$(uname -s)" == Linux && "$(uname -m)" =~ ^(aarch64|armv[67]) ]]; then side=device; else side=window; fi
fi
# C-457: the board (src/boards/): BOARD=gamepi20 ./build.sh; else the one kept in ~/.config/daemons/board on a device,
# else the Cardputer Zero. Its build is build/<side>, or build/<side>-<board> for any board but the first.
board=${BOARD:-$(cat ~/.config/daemons/board 2>/dev/null || echo cardputer-zero)}
out=build/$side
[[ $board != cardputer-zero ]] && out=build/$side-$board

args=(-DCMAKE_BUILD_TYPE=Release -DZERO_BOARD="$board")
[[ $side == window ]] && args+=(-DZERO_DEVICE=OFF)
[[ "$(uname -s)" == Darwin && -d /opt/homebrew ]] && args+=(-DCMAKE_PREFIX_PATH=/opt/homebrew)
command -v ninja >/dev/null && args+=(-G Ninja)
jobs=$( (nproc || sysctl -n hw.ncpu) 2>/dev/null || echo 2)
# The device has 512 MB, and the GPU keeps 128 of it (gpu_mem=128 for the camera). Seen on the first day: 352 MB, 124 of
# them free with the launcher and PipeWire running. So one compiler at a time below 300 MB free, else two; ZERO_JOBS
# overrides either.
if [[ $side == device ]]; then
  avail=$(awk '/MemAvailable/ { print int($2 / 1024) }' /proc/meminfo 2>/dev/null || echo 0)
  jobs=$(( avail < 300 ? 1 : 2 ))
fi
jobs=${ZERO_JOBS:-$jobs}

cmake -S . -B "$out" "${args[@]}" >/dev/null
cmake --build "$out" -j "$jobs"
ctest --test-dir "$out" --output-on-failure >/dev/null && echo "checks: all passed"
echo "built: $out/daemons-zero ($board)"
if (( run )); then exec "$out/daemons-zero" "$@"; fi
