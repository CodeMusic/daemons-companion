#!/bin/zsh
# C-424: build, review and run the Kode Dot app on roverbyteseer, where its toolchain lives (the user, 2026-11-19:
# ESP-IDF v6.1 in ~/.espressif, Rust, and kode-sim built in ~/kode/kode-sim; ~/kode/setup_seer.sh made them).
#
#   ./seer.sh build                  the image for the board: build/daemons.bin, for KodeOS's kcli.py to install
#   ./seer.sh sim                    the image for the simulator only (kode-sim build), to check it compiles there
#   ./seer.sh review [SCENARIO]      kode-sim boots kodeOS, installs the app, plays the scenario (default
#                                    scenarios/menu.json) and judges it; the verdict and screenshots come back to review/
#                                    (scenarios/den.json wants scratch_companion.sh running there first)
#   ./seer.sh run                    the Kode Dot in a browser on this computer: http://127.0.0.1:8765 (Ctrl-C stops it)
#
# KODE_HOST overrides where (default roverbyte@roverbyteseer, by its Tailscale name). This folder is copied there
# first, without what a build makes; nothing on roverbyteseer is ever copied back but the image and a review.
set -euo pipefail
HOST=${KODE_HOST:-roverbyte@roverbyteseer}
HERE=${0:A:h}
APP=kode/apps/daemons
ENVSET='export PATH=$HOME/kode/bin:$HOME/.local/bin:$HOME/.cargo/bin:/usr/bin:/bin:/usr/sbin:/sbin;
        source $HOME/.espressif/tools/activate_idf_v6.1.sh >/dev/null'

ssh -o BatchMode=yes "$HOST" "mkdir -p $APP"
rsync -a --delete --exclude build --exclude managed_components --exclude sdkconfig --exclude sdkconfig.old \
  --exclude dependencies.lock --exclude review "$HERE/" "$HOST:$APP/"

case ${1:-build} in
  build)
    ssh -o BatchMode=yes "$HOST" "$ENVSET; cd $APP && idf.py build"
    mkdir -p "$HERE/build"
    scp -q "$HOST:$APP/build/daemons.bin" "$HERE/build/daemons.bin"
    echo "the board's image: $HERE/build/daemons.bin"
    echo "install it: python KodeOS/tools/kcli.py -p PORT install build/daemons.bin"
    ;;
  sim)
    ssh -o BatchMode=yes "$HOST" "$ENVSET; kode-sim build ~/$APP"
    ;;
  review)
    SCENARIO=${2:-scenarios/menu.json}
    # The verdict's exit code is kept: 0 passed, 1 a check failed, 2 the review could not run.
    set +e
    # A scenario says @HOST_IP@ where it means this machine: the simulator's network is user-mode, so the Dot reaches a
    # server here by the machine's own address on its network, never 127.0.0.1 (C-426's den, against a scratch companion).
    ssh -o BatchMode=yes "$HOST" "$ENVSET; rm -rf ~/kode/review/daemons; mkdir -p ~/kode/review;
      IF=\$(route -n get default | awk '/interface:/{print \$2}'); sed \"s/@HOST_IP@/\$(ipconfig getifaddr \$IF)/g\" ~/$APP/$SCENARIO > ~/kode/review/scenario.json;
      kode-sim review --kodeos ~/kode/KodeOS --out ~/kode/review/daemons ~/$APP ~/kode/review/scenario.json"
    RC=$?
    set -e
    rm -rf "$HERE/review"
    scp -q -r "$HOST:kode/review/daemons" "$HERE/review" || true
    echo "the verdict: $HERE/review/verdict.json (exit $RC)"
    exit $RC
    ;;
  run)
    ssh -o BatchMode=yes -t -L 8765:127.0.0.1:8765 "$HOST" "$ENVSET; kode-sim run --no-open --port 8765 ~/$APP"
    ;;
  *)
    sed -n '2,13p' "$0"
    exit 2
    ;;
esac
