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

The two scripts for boards, `updateCompanion.sh` and `linkCompanion.sh`, are on
[Flashing and linking](Flashing-and-linking).

## The site

The site is the companion's own screen, on your computer, with **no logins**. It stays on your computer: the phone
is the remote ([Away from home](Away-from-home)). The site is needed once per phone, to pair it, and for what only
the computer can do -- opening the server to the network, the file picker for the save, the relay's settings, and the
cable and flashing.

The tabs:

- **TODAY** -- the day's theme, its virtue over its vice, chakra and note, the season, and **THE ONE THING**: the one
  next step. Each weekday has its own colours (`?day=tuesday` on the site previews another).
- **GOALS** -- one goal, its steps and milestones, and WALKING.
- **DAEMON** -- your party, drawn as the game draws it; **SYNC**; the hosted daemon's day and care; MET NEARBY.
- **INDEX** -- every entry, and **LISTEN** to hear one read aloud.
- **DEVICE** -- your devices, which daemon each hosts, their batteries, settings, routines, remotes and networks.
- **PROFILE** -- the save's trainer, play time, INDEX counts, MARKS, DIPLOMA, OPUS, and where it was saved.
- **SETTINGS** -- your save, the app's build, who answers when you talk; on the site also PAIR A PHONE and AWAY FROM
  HOME.

## The server

The server answers on <http://127.0.0.1:4730>. With no `server/config.json` at all it runs on safe defaults: **it
reads no save and calls no model** (see [Settings](Settings)). Its routes are on [Server API](Server-API).

**Logs.** Started by `bindCompanion.sh`, it writes to `.logs/server.log`:

```sh
tail -f .logs/server.log
```

It restarts itself when its code changes. Started with `always`, it writes to `.logs/server-always.log` instead.

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
the text encoding, the week, the seasons, the save's layout, the routines and the daemons' art. With
[DAEMONS](https://github.com/CodeMusic/DAEMONS) checked out beside this repository:

```sh
python3 ../DAEMONS/tools/companion_export.py           # what would change
python3 ../DAEMONS/tools/companion_export.py --write   # write server/data/
```
