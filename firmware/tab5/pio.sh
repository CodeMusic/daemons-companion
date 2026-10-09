#!/usr/bin/env bash
# C-77: the Tab5's own PlatformIO. pioarduino's platform (Arduino 3.3, the ESP32-P4) needs PlatformIO Core 6.2, and the
# handhelds are built with the PlatformIO already installed -- so this one lives apart: a virtual environment here
# (.venv, made the first time) and its own core folder (~/.platformio-tab5), where its toolchains go. Nothing the
# handhelds use is touched.
#
#   ./pio.sh run                 build
#   ./pio.sh run -t upload       flash
#   ./pio.sh device monitor      watch it
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
VENV="$HERE/.venv"
if [[ ! -x "$VENV/bin/pio" ]]; then
  echo "pio.sh: making the Tab5's own PlatformIO (once) in $VENV" >&2
  python3 -m venv "$VENV" || exit 1
  "$VENV/bin/pip" install --quiet "platformio==6.2.0" || exit 1
fi
export PLATFORMIO_CORE_DIR="${PLATFORMIO_CORE_DIR:-$HOME/.platformio-tab5}"
CORE="$PLATFORMIO_CORE_DIR"
cd "$HERE"
"$VENV/bin/pio" "$@"; status=$?
# The first install leaves ~2.5 GB the Tab5 never uses, and a full disk is what stopped it the first time (2026-10-08):
# the Arduino libraries of every other ESP32 chip, the toolchain's unpacking copy in tools/ (the build uses the one in
# packages/), and the downloaded archives. A clean rebuild after this reinstalls nothing.
libs="${CORE:?}/packages/framework-arduinoespressif32-libs"
if [[ -d "$libs/esp32p4" ]]; then
  for chip in esp32 esp32s2 esp32s3 esp32c2 esp32c3 esp32c5 esp32c6 esp32c61 esp32h2; do
    [[ -d "$libs/$chip" ]] && rm -rf "${libs:?}/${chip:?}"
  done
fi
[[ -d "$CORE/packages/toolchain-riscv32-esp" && -d "$CORE/tools/toolchain-riscv32-esp" ]] && rm -rf "${CORE:?}/tools/toolchain-riscv32-esp"
[[ -d "$CORE/packages/tool-riscv32-esp-elf-gdb" && -d "$CORE/tools/tool-riscv32-esp-elf-gdb" ]] && rm -rf "${CORE:?}/tools/tool-riscv32-esp-elf-gdb"
[[ -d "$CORE/dist" ]] && rm -rf "${CORE:?}/dist"
[[ -d "$CORE/.cache/downloads" ]] && rm -rf "${CORE:?}/.cache/downloads"
exit $status
