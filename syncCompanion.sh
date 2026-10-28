#!/usr/bin/env bash
# Keep the hub's copy of the save and this computer's in step, both ways (C-168). Also its art and its backups.
#
#   ./syncCompanion.sh            the save: whichever side changed since the last sync goes to the other
#   ./syncCompanion.sh status     say which side changed; change nothing
#   ./syncCompanion.sh push       this computer's save to the hub, over a change there (the hub's is kept aside)
#   ./syncCompanion.sh pull       the hub's save to this computer, over a change here (this one is kept aside)
#   ./syncCompanion.sh art        DAEMONS' own art (gfx/daemons) to the hub, for its pictures
#   ./syncCompanion.sh site       the companion's site, built here, to the hub -- which serves it at its own address (C-170)
#   ./syncCompanion.sh debug      the newest DEBUG patches from DAEMONS' ROM RELEASE to the hub -- private (C-216)
#   ./syncCompanion.sh backups    the hub's nightly backups of its store, to this computer (off the hub's card)
#   ./syncCompanion.sh --help
#
# WHY BOTH WAYS. SYNC on the companion writes the save -- LINKED, the AWAY answers, the daemons met, experience, the
# casino -- and marks those gains applied. A copy that only ever went to the hub would be overwritten at the next push
# and the gains would be gone for good. So this remembers the save as it was at the last sync and moves only the side
# that changed. If both did, it stops, keeps both, and changes neither: choose with push or pull.
#
# The emulator must be closed when the hub's copy comes back: it keeps the save in memory and would write its own over
# it. A pull refuses while the save is open.
#
# Settings, in .hub beside this script (never committed; see .hub.example):
#   HUB=debian@<the hub>.local              how to reach it (ssh, by key)
#   SAVE=/path/to/the/emulator/game.sav     the save the emulator plays, and the companion serves
#   ART=../DAEMONS/gfx/daemons              DAEMONS' own art (this default: the DAEMONS checkout beside this repo)
#   BACKUPS=~/.daemons-companion/backups    where the hub's backups land here
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
STATE="$HERE/.hub-sync"
SHARED=/var/lib/daemons-companion/shared        # the hub's folder for the save and the art (hub/phase2.sh)
REMOTE_SAVE="$SHARED/save.sav"
REMOTE_BACKUPS=/var/lib/daemons-companion/backups

usage() { awk 'NR >= 2 { if ($0 == "#" && ++blank == 2) exit; print }' "$0" | sed 's/^# \{0,1\}//'; }
case "${1:-sync}" in -h|--help|help) usage; exit 0 ;; sync|status|push|pull|art|backups|site|debug) mode="${1:-sync}" ;;
  *) echo "syncCompanion: unknown '$1' (try --help)" >&2; exit 64 ;; esac

[[ -f "$HERE/.hub" ]] || { echo "syncCompanion: no .hub -- copy .hub.example to .hub and fill it in" >&2; exit 1; }
# shellcheck disable=SC1091
source "$HERE/.hub"
: "${HUB:?syncCompanion: .hub has no HUB}"
ART="${ART:-$HERE/../DAEMONS/gfx/daemons}"
BACKUPS="${BACKUPS:-$HOME/.daemons-companion/backups}"
BACKUPS="${BACKUPS/#\~/$HOME}"
hub() { ssh -o BatchMode=yes -o ConnectTimeout=8 "$HUB" "$@"; }
sha() { [[ -f "$1" ]] && shasum "$1" | cut -c1-40 || true; }
stamp() { date +%Y-%m-%d-%H%M%S; }
mkdir -p "$STATE"

if [[ $mode == art ]]; then
  [[ -d "$ART" ]] || { echo "syncCompanion: no art at $ART (set ART in .hub)" >&2; exit 1; }
  rsync -rlt --omit-dir-times --delete --delete-excluded --exclude .DS_Store "$ART/" "$HUB:$SHARED/art/"
  echo "syncCompanion: art sent ($(find "$ART" -type f | wc -l | tr -d ' ') files)"; exit 0
fi
# C-216: the testing builds' patches -- never on GitHub (the user's choice); the hub gives them to a paired phone only.
# The newest DEBUG/PATCHES under DAEMONS' ROM RELEASE (a release's own, or a sealed group's), whole, over what was there.
if [[ $mode == debug ]]; then
  ROMREL="${ROMREL:-$HERE/../DAEMONS/ROM RELEASE}"
  newest="$(find "$ROMREL" -path '*/DEBUG/PATCHES/debug_patches.json' -type f -print0 2>/dev/null | xargs -0 ls -t 2>/dev/null | head -1)"
  [[ -n $newest ]] || { echo "syncCompanion: no DEBUG patches under $ROMREL (a release writes them: DEBUG/PATCHES/)" >&2; exit 1; }
  from="$(dirname "$newest")"
  rsync -rlt --omit-dir-times --delete --exclude .DS_Store "$from/" "$HUB:$SHARED/debug/"
  echo "syncCompanion: the testing builds sent from ${from#$ROMREL/} ($(find "$from" -name '*.bps' | wc -l | tr -d ' ') patches); the app's GAME offers TESTING BUILD to a paired phone"
  exit 0
fi

if [[ $mode == site ]]; then
  # built to talk to whatever serves it, so one build works at the hub's address, its .local name and its Tailscale name
  # the app's own Node (.nvmrc), as bindCompanion.sh finds it; an old build is cleared first so a failure cannot hide
  want="$(tr -d '[:space:]v' < "$HERE/.nvmrc")"
  for brew in /opt/homebrew/opt/node@"$want"/bin /usr/local/opt/node@"$want"/bin; do [[ -x "$brew/node" ]] && { PATH="$brew:$PATH"; break; }; done
  rm -rf "$HERE/app/dist"
  (cd "$HERE/app" && EXPO_PUBLIC_DAEMONS_SERVER=origin npx expo export -p web --output-dir dist > "$STATE/site-build.log" 2>&1) \
    || { echo "syncCompanion: the site did not build -- .hub-sync/site-build.log" >&2; tail -5 "$STATE/site-build.log" >&2; exit 1; }
  [[ -f "$HERE/app/dist/index.html" ]] || { echo "syncCompanion: the site did not build (app/dist/index.html)" >&2; exit 1; }
  rsync -rlt --omit-dir-times --delete --delete-excluded --exclude .DS_Store "$HERE/app/dist/" "$HUB:$SHARED/site/"
  echo "syncCompanion: the site sent ($(find "$HERE/app/dist" -type f | wc -l | tr -d ' ') files, $(du -sh "$HERE/app/dist" | cut -f1)); the hub serves it once its config names it (deploy.sh does)"
  exit 0
fi
if [[ $mode == backups ]]; then
  mkdir -p "$BACKUPS"; chmod 700 "$BACKUPS"
  rsync -a "$HUB:$REMOTE_BACKUPS/" "$BACKUPS/"   # they hold every key and secret the companion has: kept 0700 here
  echo "syncCompanion: the hub's backups are in $BACKUPS ($(ls "$BACKUPS" | wc -l | tr -d ' ') files)"; exit 0
fi

: "${SAVE:?syncCompanion: .hub has no SAVE}"
SAVE="${SAVE/#\~/$HOME}"
last="$(cat "$STATE/last.sha" 2>/dev/null || true)"
mine="$(sha "$SAVE")"
theirs="$(hub "sha1sum $REMOTE_SAVE 2>/dev/null | cut -c1-40" || { echo "syncCompanion: cannot reach $HUB" >&2; exit 1; })"

open_here() { lsof -t -- "$SAVE" >/dev/null 2>&1; }
push() {
  if [[ -n "$theirs" && "$theirs" != "$last" ]]; then
    hub "cp -p $REMOTE_SAVE $SHARED/companion-backups/pushed-over-$(stamp).sav 2>/dev/null || { mkdir -p $SHARED/companion-backups && cp -p $REMOTE_SAVE $SHARED/companion-backups/pushed-over-$(stamp).sav; }"
    echo "syncCompanion: the hub's copy had changed; kept on the hub in companion-backups/"
  fi
  scp -q "$SAVE" "$HUB:$SHARED/.save.sav.part"
  hub "mv -f $SHARED/.save.sav.part $REMOTE_SAVE"
  echo "$mine" > "$STATE/last.sha"
  echo "syncCompanion: this computer's save -> the hub"
}
pull() {
  if open_here; then echo "syncCompanion: the save is open (close the emulator first): $SAVE" >&2; exit 1; fi
  if [[ -n "$mine" && "$mine" != "$last" ]]; then
    mkdir -p "$STATE/kept"; cp -p "$SAVE" "$STATE/kept/pulled-over-$(stamp).sav"
    echo "syncCompanion: this computer's save had changed; kept in .hub-sync/kept/"
  elif [[ -n "$mine" ]]; then
    mkdir -p "$STATE/kept"; cp -p "$SAVE" "$STATE/kept/before-pull-$(stamp).sav"
  fi
  scp -q "$HUB:$REMOTE_SAVE" "$SAVE.part"
  [[ "$(sha "$SAVE.part")" == "$theirs" ]] || { rm -f "$SAVE.part"; echo "syncCompanion: the copy came back different; nothing changed" >&2; exit 1; }
  mv -f "$SAVE.part" "$SAVE"
  echo "$theirs" > "$STATE/last.sha"
  echo "syncCompanion: the hub's save -> this computer"
}
# keep a few of the kept-aside copies, not every one
trap '{ ls -t "$STATE"/kept/*.sav 2>/dev/null | tail -n +31 | while read -r f; do rm -f "$f"; done; } || true' EXIT

if [[ $mode == push ]]; then [[ -n "$mine" ]] || { echo "syncCompanion: no save at $SAVE" >&2; exit 1; }; push; exit 0; fi
if [[ $mode == pull ]]; then [[ -n "$theirs" ]] || { echo "syncCompanion: the hub has no save yet" >&2; exit 1; }; pull; exit 0; fi

if [[ "$mine" == "$theirs" ]]; then
  [[ -n "$mine" ]] && echo "$mine" > "$STATE/last.sha"
  if [[ -n "$mine" ]]; then echo "syncCompanion: in step (both the same save)"; else echo "syncCompanion: in step -- neither side has a save"; fi
  exit 0
fi
if [[ -z "$theirs" ]]; then what=push; why="the hub has no save yet"
elif [[ -z "$mine" ]]; then what=pull; why="this computer has no save at $SAVE"
elif [[ -z "$last" ]]; then what=""; why="both have a save, they differ, and they have never been synced"
elif [[ "$theirs" == "$last" ]]; then what=push; why="the game was played here since the last sync"
elif [[ "$mine" == "$last" ]]; then what=pull; why="the companion wrote the hub's copy (a SYNC) since the last sync"
else what=""; why="BOTH changed since the last sync: the game was played here AND the companion wrote the hub's"; fi

if [[ $mode == status ]]; then echo "syncCompanion: ${what:-nothing safe to do} -- $why"; exit 0; fi
if [[ -z $what ]]; then
  [[ -n "$theirs" && -n "$mine" ]] && { mkdir -p "$STATE/kept"; scp -q "$HUB:$REMOTE_SAVE" "$STATE/kept/hub-$(stamp).sav"; }
  echo "syncCompanion: stopped -- $why. Nothing changed; the hub's copy is in .hub-sync/kept/." >&2
  echo "               Keep this computer's: ./syncCompanion.sh push   Keep the hub's: ./syncCompanion.sh pull" >&2
  exit 1
fi
echo "syncCompanion: $why"
$what
