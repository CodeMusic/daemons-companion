#!/bin/bash
# C-168: the companion's store, snapshotted the consistent way (VACUUM INTO, never a copy of the live file), and the
# save beside it; the last 14 of each kept. Run nightly by daemons-companion-backup.timer, as the daemons user.
set -euo pipefail
DATA=/var/lib/daemons-companion
OUT=$DATA/backups
day=$(date +%F)
install -d -m 0750 "$OUT"
rm -f "$OUT/companion-$day.sqlite"
sqlite3 "$DATA/companion.sqlite" "VACUUM INTO '$OUT/companion-$day.sqlite'"
[ -f "$DATA/shared/save.sav" ] && cp -p "$DATA/shared/save.sav" "$OUT/save-$day.sav"
for kind in companion save; do ls -1t "$OUT/$kind-"* 2>/dev/null | tail -n +15 | xargs -r rm -f; done
echo "backup: $(ls "$OUT" | wc -l) files, latest $day"
