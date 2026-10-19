# Running the companion

The companion is two parts in one repository: the **server** (`server/`, Node 24 and TypeScript, SQLite) and the
**app** (`app/`, Expo / React Native and Tamagui), which runs as a site in your browser, in a simulator, and as an
iPhone app from the same code. `bindCompanion.sh` starts both.

## Start it

```sh
./bindCompanion.sh            # the server, then the app as a site in your browser
```

On a Mac with Node 24 that is the whole of it: the first run installs what each part needs, starts the server in the
background, and opens the site at <http://localhost:8081>. **Ctrl-C stops both.**

| command | what it does |
|---|---|
| `./bindCompanion.sh` | the server, then the app as a **site** (the default) |
| `./bindCompanion.sh ios` | the server, then the app in the **iOS Simulator** (needs Xcode) |
| `./bindCompanion.sh android` | the server, then the app in an **Android emulator** (needs Android Studio) |
| `./bindCompanion.sh server` | **only the server**, in this terminal |
| `./bindCompanion.sh app [web\|ios\|android]` | **only the app**, against a server you started yourself |
| `./bindCompanion.sh test` | the server's **type check and tests** |
| `./bindCompanion.sh phone` | **build the app for your iPhone** and install it ([Host on your phone](Host-on-your-phone#4-build-the-app-onto-your-iphone)) |
| `./bindCompanion.sh always` | **keep the server running**: at login, restarted if it stops, the Mac awake on power ([below](#keep-it-running)) |
| `./bindCompanion.sh never` | stop doing that |
| `./bindCompanion.sh --help` | the list above |

**One terminal.** The app runs in the foreground, so Expo's own keys work there: `w` opens the site, `i` the iOS
Simulator, `a` the Android emulator, `r` reloads. A session started as a site can reach the others without starting
again. If a server is already answering on the port, the script uses it, and leaves it running when you stop.

The two scripts for boards, `updateCompanion.sh` and `linkCompanion.sh`, and the BOX-3's `firmware/box3/box3.sh`, are
on [Flashing and linking](Flashing-and-linking).

## The site

The site is the companion's own screen, on your computer, with **no logins**. It stays on your computer: the phone
is the remote ([Away from home](Away-from-home)). The site is needed once per phone, to pair it, and for what only
the computer can do -- opening the server to the network, the file picker for the save, the relay's settings, Home
Assistant's token, and the cable and flashing. In a browser only the companion's own page may ask the server anything:
a request from any other web page is refused, so a page you happen to have open cannot drive it.

Six tabs, the same on the site and the phone, with **SETTINGS** behind the gear at the top right (on the Tab5 it is a
seventh tab). A word, an act or a JACKPOT from another daemon shows as a banner over whatever tab is open; a tap opens
NEARBY.

- **TODAY** -- the home page: the day's theme, its virtue over its shadow, chakra and note, the season, and **THE ONE
  THING**, the one next step; then your daemon and its care (FEED, DRINK, TRAIN), NEARBY's latest, your game (where you
  saved, MARKS, coins, the CASINO's waiting for SYNC) and what waits in the LIBRARY. Each weekday has its own colours
  (`?day=tuesday` on the site previews another).
- **DAEMON** -- four parts: **Yours** (its day and care, on the phone HOLD TO TALK, SYNC, NEARBY, MET NEARBY), **Party**
  (drawn as the game draws it), the **INDEX** (every entry, where each daemon is NATIVE, LISTEN) and **Routines** (THE
  CASINO, THE HOUSE and the party's own -- [The CASINO](The-CASINO)).
- **GOALS** -- one goal, its steps and milestones, and WALKING.
- **LIBRARY** -- CALLOW SCHOOL, THE GUIDE and THE SUBTLE LAYER once your save has found them, the **NOTEBOOK**, the
  **SONGBOOK** (your instrument to PLAY, and the songs you have learned, in their colours, with LISTEN to hear one) and
  **STREAM** (every lesson a MARK or a ROOT has opened).
- **YOU** -- you as the game draws you, the save's facts, MARKS and ROOTS that open, the two region maps, GROVES and GAME
  EVENTS.
- **PLACES** -- your devices under their makers (a picture of each, which daemon each hosts, batteries, ITS SETTINGS
  for each one, routines, remotes, every device's settings and networks) and your home: Home Assistant's rooms, each a
  tap, and the house asked in words ([Home Assistant and the BOX-3](Home-Assistant-and-the-BOX-3)).
- **SETTINGS** (the gear) -- the app's build and LIGHT OR DARK, your save, THE WEATHER, who answers when you talk; on
  the phone THIS PHONE; on the site also PAIR A PHONE, AWAY FROM HOME and HOME ASSISTANT ([Settings](Settings)).

A press whose work fails says why under its key, for a few seconds, rather than failing unseen.

YOU, the NOTEBOOK and the LIBRARY are on [Your game on the companion](Your-game-on-the-companion).

## The server

The server answers on <http://127.0.0.1:4730>. With no `server/config.json` at all it runs on safe defaults: **it
reads no save and calls no model** (see [Settings](Settings)). Its routes are on [Server API](Server-API).

**Logs.** Started by `bindCompanion.sh`, it writes to `.logs/server.log`:

```sh
tail -f .logs/server.log
```

It restarts itself when its code changes. Started with `always`, it writes to `.logs/server-always.log` instead.

## Another companion beside yours

`COMPANION_CONFIG` names the config file the server reads instead of `server/config.json`. Give it its own `port`,
`database` and `savePath` and it shares nothing with yours. A file that is not there stops it, rather than letting it
fall back on your database:

```sh
cd server && COMPANION_CONFIG=/path/to/other.json npx tsx src/main.ts
```

The site uses another server when its address says so: `http://localhost:8081/?server=http://localhost:4731`. Only
this machine's kinds of address are taken (loopback, a private network, the tailnet, `localhost`, a `.local` or
`.ts.net` name, or a bare one), and only for that visit: open the site plainly and it is back on yours. A second server
still answers only this computer and a paired phone. To use it from a phone, something on this computer has to carry
the phone's requests, as the [DAEMONS playground](https://github.com/CodeMusic/daemons-playground) does for the
companions it runs, one for each build of the game.

## Keep it running

Your phone reaches the companion only while the server **runs** and the computer is **awake**. One command makes both
true, and one undoes it:

```sh
./bindCompanion.sh always     # the server at login, restarted if it stops, the Mac awake while on power
./bindCompanion.sh never
```

`always` installs a login agent (`~/Library/LaunchAgents/ca.codemusic.daemons-companion.plist`) that runs the server
under `caffeinate -s`. On battery the Mac still sleeps as usual; the phone then works from what it holds and sends what
it kept when the Mac is back. If a server was already running in a terminal, stop that one: the agent takes over
within 30 seconds.

## Node 24

The companion needs **Node 24** (`.nvmrc`): `brew install node@24`, or `nvm use`. `bindCompanion.sh` finds Homebrew's
`node@24` by itself if the `node` on your PATH is another version; by hand, put it on your PATH first.

## Each part on its own

The server (`server/`):

```sh
cd server
npm install
npm run dev          # restarts on every change
npm start            # or once, without watching
npm test             # vitest
npm run typecheck    # tsc --noEmit
```

The app (`app/`), on <http://localhost:8081> as a site:

```sh
cd app
npm install
npm run web          # the site
npm run ios          # the iOS Simulator
npm run android      # an Android emulator
```

The app looks for the server at `http://127.0.0.1:4730`, or at `EXPO_PUBLIC_DAEMONS_SERVER` if it is set. **An Android
emulator reaches your machine at `10.0.2.2`**, so start it with
`EXPO_PUBLIC_DAEMONS_SERVER=http://10.0.2.2:4730 npm run android` (`bindCompanion.sh android` does this for you). The
site and the iOS Simulator share your machine's network and need nothing.

## What the server knows about the game

`server/data/` is exported from DAEMONS, never typed twice: species and their INDEX entries in both editions' voices,
the text encoding, the week, the seasons, the holidays, the save's layout, the routines, the daemons' art, the NOTEBOOK
and its songs, and DAEMONS' own HARP and FLUTE (synthesized for the project, nothing of Nintendo's). With
[DAEMONS](https://github.com/CodeMusic/DAEMONS) checked out beside this repository:

```sh
python3 ../DAEMONS/tools/companion_export.py           # what would change
python3 ../DAEMONS/tools/companion_export.py --write   # write server/data/
```
