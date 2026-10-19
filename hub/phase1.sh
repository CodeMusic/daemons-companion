#!/bin/bash
# C-168 Phase 1: the companion server on the hub, by hand -- does it install, typecheck, pass its tests and answer?
# Run it ON THE HUB, as root, after phase0.sh:
#
#   scp companion/hub/phase1.sh debian@<hub>:      then, from the Mac (detached, so a dropped SSH does not kill it):
#   ssh -t debian@<hub> 'sudo systemd-run --unit=daemons-phase1 --collect \
#        -p StandardOutput=truncate:/home/debian/phase1-run.log -p StandardError=inherit bash /home/debian/phase1.sh'
#   ssh debian@<hub> 'tail -f ~/phase1-run.log'
#
# What it does: masks ModemManager (it sends AT commands to every new /dev/ttyACM*, which would talk over each board on
# the hub) and stops M5's nginx; installs Node 22 for 32-bit ARM in /opt/node22, checked against a pinned SHA-256 (Node
# 24 has no armv7l build); makes a 'daemons' system user (in dialout, for the boards' cables) with the code in
# /opt/daemons-companion and its data in /var/lib/daemons-companion (0700); clones the public repo; then, timed with
# /usr/bin/time -v and the least memory available while it ran: npm ci (then whether its 32-bit ARM binaries load), the
# typecheck, the tests (one worker, long timeouts: one Cortex-A7 is many times slower than the Mac); then the server against a SCRATCH store on 127.0.0.1 -- time to its first answer, its memory idle and after
# a face is drawn -- and bindCompanion.sh's Node gate, expected to refuse. Results in /var/lib/daemons-companion/phase1/.
#
# A 1 GB swapfile is switched on for the run only (it is gone at the next boot); the swap counters say whether anything
# was ever pushed out to it. Nothing reads the user's save, no real store is touched, nothing listens beyond the board.
# Every step is idempotent. Nothing personal is in this file (the companion repo is public, C-12).
set -euo pipefail

[ "$(id -u)" = 0 ] || { echo "phase1: run it with sudo" >&2; exit 1; }
NODE_VER=22.23.3
NODE_TAR=node-v${NODE_VER}-linux-armv7l.tar.xz
NODE_SHA=590a2768199bdd0b848648a81cd7f07f88a5ceb27949f0c70d5e6652c3eaca69   # nodejs.org/dist/v22.23.3/SHASUMS256.txt
REPO=https://github.com/CodeMusic/daemons-companion
CODE=/opt/daemons-companion
DATA=/var/lib/daemons-companion
OUT=$DATA/phase1
NODE=/opt/node22/bin
PORT=4730

say() { printf '\n== %s\n' "$*"; }
# whatever happens, leave no server running and no scratch config behind
trap 'pkill -u daemons -f "src/main.ts" 2>/dev/null || true; rm -f "$CODE/server/config.json"; swapoff /swapfile-phase1 2>/dev/null && rm -f /swapfile-phase1 || true' EXIT
# a command line run as the daemons user, with our Node first -- an array, not a function, so /usr/bin/time can run it
AS=(runuser -u daemons -- env HOME="$DATA" PATH="$NODE:/usr/bin:/bin" npm_config_cache="$DATA/.npm"
    NODE_OPTIONS="--disable-warning=ExperimentalWarning")
as_daemons() { "${AS[@]}" "$@"; }
swapped() { awk '/^pswpout/{print $2}' /proc/vmstat; }
# /usr/bin/time -v, its wall clock and peak memory pulled out for the summary
# ("Maximum resident" is the largest single process, not the tree; the least MemAvailable is what the board felt)
timed() { local name=$1 w rc; shift
  ( while :; do awk '/^MemAvailable/{print int($2/1024)}' /proc/meminfo; sleep 1; done ) > "$OUT/$name.mem" & w=$!
  /usr/bin/time -v -o "$OUT/$name.time" "$@" > "$OUT/$name.log" 2>&1 && rc=0 || rc=$?
  kill "$w"; wait "$w" 2>/dev/null || true
  local wall rss least; wall=$(awk -F': ' '/Elapsed \(wall clock\)/{print $2}' "$OUT/$name.time")
  rss=$(awk -F': ' '/Maximum resident/{printf "%d MB", $2/1024}' "$OUT/$name.time")
  least=$(sort -n "$OUT/$name.mem" | head -1)
  printf '%-10s exit %s  wall %s  largest process %s  least available %s MB\n' "$name" "$rc" "$wall" "$rss" "$least" \
    | tee -a "$OUT/summary.txt"
  [ "$rc" = 0 ] || { echo "   last lines of $OUT/$name.log:"; tail -25 "$OUT/$name.log" | sed 's/^/   /'; }
  return 0
}

say "services: ModemManager masked, nginx stopped"
systemctl disable --now ModemManager.service 2>/dev/null || true
systemctl mask ModemManager.service
systemctl disable --now nginx.service 2>/dev/null || true

say "Node $NODE_VER (armv7l) in /opt/node22"
# Node's armv7l build links libatomic, which M5's image does not have (found 2026-10-19: "libatomic.so.1: cannot open")
dpkg -s libatomic1 xz-utils >/dev/null 2>&1 || DEBIAN_FRONTEND=noninteractive apt-get install -y -q libatomic1 xz-utils
if [ "$("$NODE/node" -v 2>/dev/null)" != "v$NODE_VER" ]; then
  mkdir -p /var/cache/daemons-hub; cd /var/cache/daemons-hub
  echo "$NODE_SHA  $NODE_TAR" | sha256sum -c --status - 2>/dev/null || curl -fsSL -o "$NODE_TAR" "https://nodejs.org/dist/v$NODE_VER/$NODE_TAR"
  echo "$NODE_SHA  $NODE_TAR" | sha256sum -c -
  tar -xJf "$NODE_TAR" -C /opt --no-same-owner
  ln -sfn "/opt/node-v$NODE_VER-linux-armv7l" /opt/node22
fi
# root's, not the tarball's uid 1000 (which is 'debian' here): no login user may change the Node the server runs
chown -R root:root "/opt/node-v$NODE_VER-linux-armv7l"
"$NODE/node" -v
"$NODE/node" --disable-warning=ExperimentalWarning -e \
  "new (require('node:sqlite').DatabaseSync)(':memory:').exec('select 1'); console.log('node:sqlite ok, SQLite', process.versions.sqlite)"
"$NODE/node" -p "'V8 heap limit ' + Math.round(require('v8').getHeapStatistics().heap_size_limit / 2**20) + ' MB'"

say "the 'daemons' user, the code and the data"
id daemons >/dev/null 2>&1 || useradd --system --user-group --home-dir "$DATA" --no-create-home --shell /usr/sbin/nologin daemons
usermod -aG dialout daemons   # the boards' cables are root:dialout 0660 on Linux
install -d -o daemons -g daemons -m 0700 "$DATA"
install -d -o daemons -g daemons -m 0755 "$CODE"
rm -rf "$OUT"; install -d -o daemons -g daemons -m 0700 "$OUT"
cd /   # git will not run in a directory the daemons user cannot read (sudo leaves us in ~debian)
# Full history (3.4 MB): the server asks git whether the app changed since a phone's build (/api/version)
if [ -d "$CODE/.git" ]; then
  [ "$(as_daemons git -C "$CODE" rev-parse --is-shallow-repository)" = false ] || as_daemons git -C "$CODE" fetch -q --unshallow
  as_daemons git -C "$CODE" pull --ff-only -q
else as_daemons git clone -q "$REPO" "$CODE"; fi
echo "commit $(as_daemons git -C "$CODE" log -1 --format='%h %cs')" | tee "$OUT/summary.txt"

say "a 1 GB swapfile for this run only"
if ! swapon --show=NAME --noheadings | grep -qx /swapfile-phase1; then
  [ -f /swapfile-phase1 ] || { fallocate -l 1G /swapfile-phase1; chmod 600 /swapfile-phase1; mkswap -q /swapfile-phase1; }
  swapon /swapfile-phase1
fi
SWAP0=$(swapped)
free -m | sed -n 2p | tee -a "$OUT/summary.txt"

say "npm ci, the typecheck, the tests (this is the slow part)"
cd "$CODE/server"
timed npm-ci    "${AS[@]}" npm ci --no-audit --no-fund
# vitest starts vite, which starts rolldown's native binding: if that does not load, no test runs at all
GLIBC=$(ldd --version | awk 'NR==1{print $NF}')
for f in node_modules/@rolldown/binding-linux-arm-gnueabihf/*.node node_modules/lightningcss-linux-arm-gnueabihf/*.node; do
  [ -f "$f" ] && echo "$(basename "$f") wants $(grep -aoE 'GLIBC_[0-9]+(\.[0-9]+)+' "$f" | sort -uV | tail -1), Debian has $GLIBC"
done | tee -a "$OUT/summary.txt"
{ as_daemons node -e "require('@rolldown/binding-linux-arm-gnueabihf'); console.log('rolldown binding loads')" 2>&1 \
    || echo "rolldown binding does NOT load: vitest cannot start"; } | tail -3 | tee -a "$OUT/summary.txt"
# TypeScript 7 is a native (Go) compiler: no Node heap; one checker on one core (159 MB rather than 206 on the Mac)
timed typecheck "${AS[@]}" ./node_modules/.bin/tsc --noEmit --singleThreaded
# One worker, long timeouts, a temp folder of their own (the tests leave scratch saves behind). Expected to fail here:
# api.test.ts "the art (C-05)" (DAEMONS' own art is not beside the clone until Phase 2) and generated.test.ts's
# casino_art.py (it compares PNG bytes made by the Mac's Pillow); the two voice conversions skip (their check does not
# know /usr/bin/ffmpeg).
install -d -o daemons -g daemons "$OUT/tmp"
timed tests     "${AS[@]}" TMPDIR="$OUT/tmp" ./node_modules/.bin/vitest run --pool=forks --maxWorkers=1 \
                  --testTimeout=120000 --hookTimeout=120000 --teardownTimeout=30000 --slowTestThreshold=5000 --logHeapUsage
rm -rf "$OUT/tmp"
grep -E "Test Files|Tests " "$OUT/tests.log" | tail -2 | tee -a "$OUT/summary.txt" || true
grep -E "^ *(FAIL|×)" "$OUT/tests.log" | sort -u | head -20 | tee -a "$OUT/summary.txt" | sed 's/^/   /' || true

say "ffmpeg, as the server's voice runs it (one second of sound to the boards' 16 kHz)"
# Debian's ffmpeg is a full build with every codec library; a handheld's talk starts it twice (voice.ts)
timed ffmpeg ffmpeg -hide_banner -loglevel error -f lavfi -i sine=d=1 -f s16le -ar 16000 -ac 1 -y "$OUT/ffmpeg-test.pcm"

say "the server against a scratch store, on 127.0.0.1 only"
install -d -o daemons -g daemons "$OUT/art"
cat > "$CODE/server/config.json" <<EOF
{ "host": "127.0.0.1", "port": $PORT, "database": "$OUT/scratch.sqlite", "artDir": "$OUT/art" }
EOF
chown daemons:daemons "$CODE/server/config.json"
if curl -s -m 2 -o /dev/null "http://127.0.0.1:$PORT/api/today"; then echo "phase1: something already answers on $PORT" >&2; exit 1; fi
# Started the way the hub's unit will start it: one process, tsx loaded in-thread, no watcher. Twice: the first start
# compiles every TypeScript file into tsx's cache, the second reads them back.
serve() { local label=$1 t0 first="" code SERVER NODEPID
  t0=$(date +%s.%N)
  ( cd "$CODE/server" && as_daemons node --import tsx src/main.ts ) > "$OUT/server-$label.log" 2>&1 &
  SERVER=$!
  for _ in $(seq 1 240); do
    code=$(curl -s -m 2 -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/api/today" || true)
    [ "$code" = 200 ] && { first=$(awk -v a="$t0" -v b="$(date +%s.%N)" 'BEGIN{printf "%.1f", b-a}'); break; }
    kill -0 $SERVER 2>/dev/null || break
    sleep 0.5
  done
  NODEPID=$(pgrep -u daemons -f "src/main.ts" | tail -1 || true)
  # the node process, and everything of the daemons user's (tsx starts an esbuild service on a cold cache)
  rss() { [ -n "$NODEPID" ] && printf '%s (all of daemons: %s)' "$(ps -o rss= -p "$NODEPID" | awk '{printf "%d MB", $1/1024}')" \
            "$(ps -o rss= -u daemons | awk '{s+=$1} END {printf "%d MB", s/1024}')"; }
  if [ -n "$first" ]; then
    echo "server ($label) first answer in ${first} s, RSS $(rss)" | tee -a "$OUT/summary.txt"
    if [ "$label" = warm ]; then
      sleep 10; echo "server ($label) RSS after 10 s idle $(rss)" | tee -a "$OUT/summary.txt"
      for f in idle-0 thinking-1; do
        curl -s -m 60 -o "$OUT/face-$f.png" -w "  face $f: %{http_code}, %{size_download} bytes in %{time_total} s\n" \
          "http://127.0.0.1:$PORT/art/face/$f.png" | tee -a "$OUT/summary.txt"
      done
      for p in /api/today /api/goals /api/broadcast/acts /api/index; do
        curl -s -m 30 -o /dev/null -w "  GET $p: %{http_code} in %{time_total} s\n" "http://127.0.0.1:$PORT$p" | tee -a "$OUT/summary.txt"
      done
      echo "server ($label) RSS after those $(rss)" | tee -a "$OUT/summary.txt"
      free -m | sed -n 2p | tee -a "$OUT/summary.txt"
    fi
  else
    echo "server ($label) no answer in 120 s; last lines:" | tee -a "$OUT/summary.txt"; tail -25 "$OUT/server-$label.log" | sed 's/^/   /'
  fi
  pkill -u daemons -f "src/main.ts" 2>/dev/null || true; wait $SERVER 2>/dev/null || true
}
rm -rf /tmp/tsx-"$(id -u daemons)"
serve cold
serve warm

say "bindCompanion.sh's Node gate (expected to refuse Node 22)"
cd "$CODE"
as_daemons timeout 30 ./bindCompanion.sh server > "$OUT/bind-gate.log" 2>&1 && rc=0 || rc=$?
pkill -u daemons -f "src/main.ts" 2>/dev/null || true
echo "bindCompanion server: exit $rc -- $(head -1 "$OUT/bind-gate.log")" | tee -a "$OUT/summary.txt"
rm -f "$CODE/server/config.json"

say "what is left"
echo "swap: $(( $(swapped) - SWAP0 )) pages pushed out during the run" | tee -a "$OUT/summary.txt"
swapoff /swapfile-phase1 && rm -f /swapfile-phase1
echo "heat: $(awk '{printf "%.0f C", $1/1000}' /sys/class/thermal/thermal_zone0/temp)" | tee -a "$OUT/summary.txt"
ss -tlpn | tee "$OUT/listening.txt" | sed 's/^/   /'
ufw status 2>/dev/null | head -3 | sed 's/^/   ufw: /' || true
chown -R daemons:daemons "$OUT"

say "SUMMARY ($OUT/summary.txt)"
cat "$OUT/summary.txt"
echo
echo "phase1: done. Next: fix bindCompanion.sh's gate for Linux, then Phase 2 (the unit, the five things before the cut-over)."
