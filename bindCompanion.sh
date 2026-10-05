#!/usr/bin/env bash
# Start the companion: its server, then its app.
#
#   ./bindCompanion.sh                the server, then the app as a site in your browser (web is the default)
#   ./bindCompanion.sh ios            the server, then the app in the iOS Simulator (needs Xcode)
#   ./bindCompanion.sh android        the server, then the app in an Android emulator (needs Android Studio)
#   ./bindCompanion.sh server         only the server, in this terminal
#   ./bindCompanion.sh app [web|ios|android]
#                                     only the app, against a server you started yourself
#   ./bindCompanion.sh test           the server's type check and its tests
#   ./bindCompanion.sh phone          build the app for your iPhone (plugged in or on the same Wi-Fi) and install it
#   ./bindCompanion.sh --help
#
# ONE TERMINAL. The server runs in the background and writes to .logs/server.log; the app runs in the foreground,
# so Expo's own keys work from here: w opens the site, i the iOS Simulator, a the Android emulator, r reloads. So a
# session started as web can reach the others without starting again. Ctrl-C stops the app AND the server.
#
# If a server is already answering on the port, it is used rather than a second one started -- and left running
# when you stop, since this script did not start it.
#
# The DAEMONS family has a script of nearly this name: DAEMONS' bindDaemons.sh builds and runs the game. This one
# runs what you carry beside it.
#
# Node 24 (.nvmrc). If the node on your PATH is another version and Homebrew's node@24 is installed, it is used.
# The server reads no save until server/config.json names one (a COPY, never the save the game is using), and
# calls no model until its AI is switched on -- see server/config.example.json.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
PORT=4730
LOGS="$HERE/.logs"
SERVER_LOG="$LOGS/server.log"

usage() { sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'; }

mode=web target=web
case "${1:-web}" in
  web|ios|android) mode=both target="${1:-web}" ;;
  server)          mode=server ;;
  app)             mode=app target="${2:-web}" ;;
  test)            mode=test ;;
  phone)           mode=phone ;;
  -h|--help|help)  usage; exit 0 ;;
  *) echo "bindCompanion: unknown '$1' (try --help)" >&2; exit 64 ;;
esac
case "$target" in web|ios|android) ;; *) echo "bindCompanion: the app runs as web, ios or android, not '$target'" >&2; exit 64 ;; esac

# -- Node 24 -------------------------------------------------------------------------------------------------------
want="$(tr -d '[:space:]v' < "$HERE/.nvmrc")"
have="$(node -v 2>/dev/null | sed 's/^v//; s/\..*//' || true)"
if [[ "$have" != "$want" ]]; then
  for brew in /opt/homebrew/opt/node@"$want"/bin /usr/local/opt/node@"$want"/bin; do
    if [[ -x "$brew/node" ]]; then PATH="$brew:$PATH"; have="$want"; break; fi
  done
fi
if [[ "$have" != "$want" ]]; then
  echo "bindCompanion: needs Node $want (found ${have:-none}). Install it (brew install node@$want, or nvm use)." >&2
  exit 1
fi

# -- dependencies, once ----------------------------------------------------------------------------------------------
need_install() { [[ ! -d "$HERE/$1/node_modules" ]]; }
for part in server app; do
  if [[ $mode == test && $part == app ]]; then continue; fi
  if [[ $mode == server && $part == app ]]; then continue; fi
  if [[ $mode == app && $part == server ]]; then continue; fi
  if need_install "$part"; then
    echo "bindCompanion: installing $part/ (first run)"
    (cd "$HERE/$part" && npm install --no-fund --no-audit)
  fi
done

answering() { curl -fsS -o /dev/null --max-time 1 "http://127.0.0.1:$PORT/api/today" 2>/dev/null; }

# -- phone: the app, built for a real iPhone and installed (C-27) -------------------------------------------------------
# The native project is generated from app.json (expo prebuild) and is not committed. Signed by the team in app.json
# (automatic signing registers the bundle id); a Release build carries its own JavaScript, so it runs without this Mac.
if [[ $mode == phone ]]; then
  export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8          # CocoaPods fails on a non-UTF-8 locale
  cd "$HERE/app"
  [[ -d node_modules ]] || npm install --no-fund --no-audit
  # Generate the native project again whenever app.json or the dependencies changed since it was made: a plugin added
  # later (C-55's Bluetooth permission) otherwise never reaches it, and iOS closes an app that touches Bluetooth
  # without its permission line -- the user's first PAIR crashed on exactly that.
  if [[ ! -d ios || app.json -nt ios/.prebuilt || package.json -nt ios/.prebuilt ]]; then
    CI=1 npx expo prebuild --platform ios --no-install
    touch ios/.prebuilt
  fi
  (cd ios && pod install)
  phone_id="$(xcrun devicectl list devices 2>/dev/null | awk '/available \(paired\)/ && $0 !~ /simulated/ { for (i=1;i<=NF;i++) if ($i ~ /^[0-9A-F]{8}-[0-9A-F]{16}$/) { print $i; exit } }')"
  [[ -n "$phone_id" ]] || { echo "bindCompanion: no iPhone found -- plug it in (and trust this Mac), or put it on the same Wi-Fi with developer mode on." >&2; exit 1; }
  team="$(python3 -c "import json; print(json.load(open('app.json'))['expo']['ios']['appleTeamId'])")"
  echo "bindCompanion: building for the iPhone $phone_id (team $team)"
  xcodebuild -workspace ios/DAEMONScompanion.xcworkspace -scheme DAEMONScompanion -configuration Release \
    -destination "generic/platform=iOS" -derivedDataPath ios/build -allowProvisioningUpdates \
    DEVELOPMENT_TEAM="$team" CODE_SIGN_STYLE=Automatic build | grep -E "error:|BUILD (SUCCEEDED|FAILED)"
  # built for any iPhone, so a locked phone does not stop the build; installing needs it unlocked
  until xcrun devicectl device install app --device "$phone_id" ios/build/Build/Products/Release-iphoneos/DAEMONScompanion.app; do
    echo "bindCompanion: unlock the iPhone to install -- trying again in 10 seconds (Ctrl-C to stop)"; sleep 10
  done
  echo "bindCompanion: installed. Open DAEMONS companion on the phone and pair it (the site: SETTINGS, PAIR A PHONE)."
  exit 0
fi

# -- test -------------------------------------------------------------------------------------------------------------
if [[ $mode == test ]]; then
  cd "$HERE/server"
  npm run --silent typecheck
  exec npm test
fi

# -- server only, in the foreground -------------------------------------------------------------------------------------
if [[ $mode == server ]]; then
  if answering; then echo "bindCompanion: a server is already answering on port $PORT." >&2; exit 1; fi
  [[ -f "$HERE/server/config.json" ]] || echo "bindCompanion: no server/config.json -- running on defaults (no save read, AI off)."
  cd "$HERE/server"
  exec npm run --silent dev          # tsx watch: restarts itself when a source file changes
fi

# -- the server in the background, unless one is already up ------------------------------------------------------------
server_pid=""
stop_server() {
  if [[ -n "$server_pid" ]] && kill -0 "$server_pid" 2>/dev/null; then
    pkill -TERM -P "$server_pid" 2>/dev/null || true
    kill -TERM "$server_pid" 2>/dev/null || true
    echo "bindCompanion: server stopped."
  fi
  server_pid=""
}

if [[ $mode == both ]]; then
  if answering; then
    echo "bindCompanion: using the server already on port $PORT (it keeps running after this)."
  else
    mkdir -p "$LOGS"
    [[ -f "$HERE/server/config.json" ]] || echo "bindCompanion: no server/config.json -- running on defaults (no save read, AI off)."
    (cd "$HERE/server" && exec npx tsx watch src/main.ts) >"$SERVER_LOG" 2>&1 &
    server_pid=$!
    trap stop_server EXIT
    trap 'stop_server; exit 130' INT TERM
    for _ in $(seq 1 60); do
      answering && break
      if ! kill -0 "$server_pid" 2>/dev/null; then
        echo "bindCompanion: the server stopped while starting. Its log:" >&2
        tail -n 20 "$SERVER_LOG" >&2
        exit 1
      fi
      sleep 0.25
    done
    answering || { echo "bindCompanion: the server did not answer in 15s -- see $SERVER_LOG" >&2; exit 1; }
    echo "bindCompanion: server on http://127.0.0.1:$PORT   (log: tail -f .logs/server.log)"
  fi
elif ! answering; then
  echo "bindCompanion: no server on port $PORT -- the app will show it cannot reach one. Start it: ./bindCompanion.sh server"
fi

# -- the app, in the foreground -----------------------------------------------------------------------------------------
# An Android emulator reaches this Mac at 10.0.2.2, not 127.0.0.1; the site and the iOS Simulator share its network.
if [[ $target == android ]]; then host=10.0.2.2; else host=127.0.0.1; fi
export EXPO_PUBLIC_DAEMONS_SERVER="http://$host:$PORT"
cd "$HERE/app"
echo "bindCompanion: the app ($target) -- keys: w site, i iOS, a Android, r reload, Ctrl-C stops everything"
npx expo start "--$target"
