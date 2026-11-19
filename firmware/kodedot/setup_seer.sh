#!/bin/zsh
# C-424: the Kode Dot's toolchain, set up on roverbyteseer (the user, 2026-11-19: "roverbyteseer") -- run THERE, once:
#   scp firmware/kodedot/setup_seer.sh roverbyte@roverbyteseer:kode/ && ssh roverbyte@roverbyteseer kode/setup_seer.sh
#
# ESP-IDF v6.1 through Espressif's installer (eim) into ~/.espressif, where kode-sim looks for
# ~/.espressif/tools/activate_idf_v6.1.sh; Rust; Kode's repositories in ~/kode; kode-sim built from source. roverbyteseer
# has no Homebrew, so cmake and ninja come from uv and Python 3.12 from ~/.local/bin. Idempotent; about 7 minutes and
# 7 GB the first time.
set -u
export PATH="$HOME/kode/bin:$HOME/.local/bin:$HOME/.cargo/bin:/usr/bin:/bin:/usr/sbin:/sbin"
mkdir -p ~/kode/bin
ln -sf ~/.local/bin/python3.12 ~/kode/bin/python3
log() { echo "== $(date '+%H:%M:%S') $*"; }

log "python: $(python3 --version)"
log "cmake and ninja"
command -v cmake >/dev/null || uv tool install cmake
command -v ninja >/dev/null || uv tool install ninja

log "eim, Espressif's installer"
if ! command -v eim >/dev/null; then
  mkdir -p ~/kode/dl && cd ~/kode/dl
  curl -fsSL -o eim.zip https://github.com/espressif/idf-im-ui/releases/download/v0.21.1/eim-cli-macos-aarch64.zip
  unzip -o -q eim.zip -d eim && cp eim/eim ~/.local/bin/eim && chmod +x ~/.local/bin/eim
fi

log "rust"
if ! command -v cargo >/dev/null; then
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal --no-modify-path
fi

log "Kode's repositories"
cd ~/kode
for r in kode-sim kode-sdk kode-app-template; do
  [ -d "$r" ] || git clone --depth 1 "https://github.com/kodediy/$r.git"
done
# KodeOS carries the SDK (and the C5's firmware inside it) as a submodule: kode-sim review builds kodeOS from it.
[ -d KodeOS ] || git clone --depth 1 https://github.com/kodediy/KodeOS.git
git -C KodeOS submodule update --init --recursive --depth 1

log "ESP-IDF v6.1 for esp32p4 and esp32c5"
if [ ! -f ~/.espressif/tools/activate_idf_v6.1.sh ]; then
  eim install -n true -i v6.1 -t esp32p4,esp32c5 --do-not-track true --cleanup true \
    || eim install -n true -i v6.1 -t esp32p4,esp32c5 --do-not-track true --cleanup true --skip-prerequisites-check true
fi
[ -f ~/.espressif/tools/activate_idf_v6.1.sh ] || { log "ESP-IDF FAILED"; exit 1; }

log "kode-sim"
cd ~/kode/kode-sim && cargo build --release && ln -sf "$PWD/target/release/kode-sim" ~/.local/bin/kode-sim

log "disk"; df -h / | tail -1
log "DONE"
