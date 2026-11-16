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
  if [[ "$(uname -s)" == Linux && "$(uname -m)" == aarch64 ]]; then side=device; else side=window; fi
fi

args=(-DCMAKE_BUILD_TYPE=Release)
[[ $side == window ]] && args+=(-DZERO_DEVICE=OFF)
[[ "$(uname -s)" == Darwin && -d /opt/homebrew ]] && args+=(-DCMAKE_PREFIX_PATH=/opt/homebrew)
command -v ninja >/dev/null && args+=(-G Ninja)
jobs=$( (nproc || sysctl -n hw.ncpu) 2>/dev/null || echo 2)
# the device has 512 MB: two at a time keeps the compiler out of the swap
[[ $side == device ]] && jobs=2

cmake -S . -B "build/$side" "${args[@]}" >/dev/null
cmake --build "build/$side" -j "$jobs"
ctest --test-dir "build/$side" --output-on-failure >/dev/null && echo "checks: all passed"
echo "built: build/$side/daemons-zero"
if (( run )); then exec "build/$side/daemons-zero" "$@"; fi
