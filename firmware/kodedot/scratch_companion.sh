#!/bin/zsh
# C-426: a scratch companion on roverbyteseer for the Kode Dot simulator's den (scenarios/den.json) -- a SYNTHETIC
# save (PIP, a ROVERCUB away to be carried, and KIT), a database of its own made fresh each time, port 4799, never the
# user's save and never the hub. It runs from roverbyteseer's companion checkout (~/Projects/daemons-companion, THE
# COMMONS's), read only: nothing there is changed.
#
#   ./scratch_companion.sh          (re)start it, fresh
#   ./scratch_companion.sh stop
#
# It listens on every interface, because the simulator's network is user-mode and reaches roverbyteseer by its own
# address; from the network a companion answers only the device's door, and this one holds nothing but the made-up save.
set -euo pipefail
HOST=${KODE_HOST:-roverbyte@roverbyteseer}

ssh -o BatchMode=yes "$HOST" zsh -s -- "${1:-start}" <<'REMOTE'
set -euo pipefail
export PATH=/opt/homebrew/opt/node@22/bin:/usr/bin:/bin:/usr/sbin:/sbin
D=~/kode/scratch-companion
P=$(lsof -nP -iTCP:4799 -sTCP:LISTEN -t || true)
[ -n "$P" ] && kill $P && sleep 1
[ "$1" = stop ] && { echo "stopped"; exit 0; }

mkdir -p $D && rm -f $D/scratch.sqlite*
cat > $D/make_save.ts <<'EOF'
// C-426: a SYNTHETIC save for the Kode Dot simulator -- never a copy of the user's.
import { writeFileSync } from "node:fs";
import { buildSave } from "../../Projects/daemons-companion/server/test/build_save.ts";
const pip = { personality: 0x2468ace0, otId: 0x00ab1234, species: 1, nickname: "PIP", level: 9, away: true };
const kit = { personality: 0x13579bdf, otId: 0x00ab1234, species: 4, nickname: "KIT", level: 7 };
writeFileSync(process.argv[2], buildSave({ player: "ASH", trainerId: 0x00ab1234, slots: [{ counter: 3, party: [pip, kit] }] }));
EOF
cat > $D/config.json <<EOF
{ "port": 4799, "host": "0.0.0.0", "database": "$D/scratch.sqlite", "edition": "CONTENT",
  "savePath": "$D/synthetic.sav", "watchSave": false }
EOF
cd ~/Projects/daemons-companion/server
node --import tsx $D/make_save.ts $D/synthetic.sav
COMPANION_CONFIG=$D/config.json nohup node --import tsx src/main.ts > $D/server.log 2>&1 < /dev/null &
for i in {1..30}; do lsof -nP -iTCP:4799 -sTCP:LISTEN -t >/dev/null && break; sleep 0.5; done
grep "server on" $D/server.log
REMOTE
