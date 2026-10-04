# daemons-companion

**A goal companion that carries a daemon.** You carry a daemon from your game of
[**DAEMONS**](https://github.com/CodeMusic/DAEMONS) on a little device. You feed it, train it, spend time with it --
and it helps you: tell it what you want to get done, and it turns that into **one next step** and walks you through
the day. As you get things done, it thrives. Pass someone else carrying one, and your INDEX sees their daemon.

It is the successor to **RoverRadio** (in [CodeMusic/RoverByte](https://github.com/CodeMusic/RoverByte)) and
[**RoverCub**](https://github.com/CodeMusic/RoverCub), joined to the game.

## Start it

```sh
./bindCompanion.sh            # the server, then the app as a site in your browser
```

That is the whole of it on a Mac with Node 24: the first run installs what each part needs, starts the server in the
background, and opens the app at <http://localhost:8081>. **Ctrl-C stops both.**

| | |
|---|---|
| `./bindCompanion.sh` | the server, then the app as a **site** (the default) |
| `./bindCompanion.sh ios` | the server, then the app in the **iOS Simulator** (needs Xcode) |
| `./bindCompanion.sh android` | the server, then the app in an **Android emulator** (needs Android Studio) |
| `./bindCompanion.sh server` | **only the server**, in this terminal |
| `./bindCompanion.sh app [web\|ios\|android]` | **only the app**, against a server you started yourself |
| `./bindCompanion.sh test` | the server's **type check and tests** |
| `./updateCompanion.sh` | **flash the handheld** with the newest firmware ([below](#flash-the-handheld)) |
| `./linkCompanion.sh` | **link the handheld** to the server over its cable |

**The app runs in the foreground, so Expo's own keys work in the same terminal**: `w` opens the site, `i` the iOS
Simulator, `a` the Android emulator, `r` reloads. A session started as a site can reach the others without starting
again. The server writes to `.logs/server.log` (`tail -f .logs/server.log`) and restarts itself when its code changes.
If a server is already running on the port, the script uses it and leaves it running when you stop.

*The name is a sibling's: DAEMONS' own `bindDaemons.sh` builds and runs the game; this one runs what you carry
beside it.*

## What works today

| | | |
|---|---|---|
| `server/` | **the local server** -- Node 24 + TypeScript, SQLite | **running.** Goals, their steps and today's one step; the three-pass breakdown (off until you switch it on); the DAEMONS save reader and writer; the daemons drawn as the game draws them; the devices' sync |
| `app/` | **the app** -- Expo / React Native and **Tamagui**: a site you run yourself first, an iPhone and iPad app from the same code later | **running as a site, in the day's colours** (each weekday is a theme, from the week DAEMONS exports; `?day=tuesday` on the site previews another). Five screens: **TODAY** (the day's colour, note and virtue, the season, and the one thing to do), **GOALS** (add one, see its steps, tick them off), **DAEMON** (your party; **SYNC** brings a daemon across or home, and shows what it holds), **PROFILE** (the save's trainer, play time, INDEX, MARKS and progress), **SETTINGS** (your save's path) |
| `firmware/esp32/` | **the handheld** -- the **LilyGO T-Embed CC1101** (ESP32-S3), PlatformIO + Arduino, grown from RoverCodeBase | **running on the board.** The day in its colour (a rainbow week, and the ring of lights glowing it), the one step (press to tick it off), the daemon you carry -- **drawn as the game draws it**, what it holds, and **its INDEX entry** a press away -- and **ROUTINES**: the board's radios in the game's words -- FLARE (IR), WHISPER (Bluetooth), TOUCHSTONE (NFC), LONGWAVE (Sub-GHz, not wired yet), UPLINK (Wi-Fi). Over the USB cable or Wi-Fi. See [Flash the handheld](#flash-the-handheld) |
| `firmware/pizero/` | **the Pi Zero device** -- Python, grown from RoverCub and RoverOSpi | not started: waits on which board and screen (C-08) |

**Local first, one person.** Everything runs on your own machine; accounts, many users and hosting come later.

## Flash the handheld

With the T-Embed CC1101 plugged in by a USB-C cable that carries data, and
[PlatformIO](https://platformio.org) installed (`pip install platformio`):

```sh
./updateCompanion.sh          # build the firmware and flash it to the board
./linkCompanion.sh            # link it to the server over the cable (starts the server if none is running)
./updateCompanion.sh --link   # both, one after the other
```

| | |
|---|---|
| `./updateCompanion.sh` | build and **flash** the board; stops a running bridge first (it holds the port) |
| `./updateCompanion.sh --link` | flash, then link |
| `./updateCompanion.sh --build` | only build, to check it compiles (no board needed) |
| `./linkCompanion.sh` | the **bridge**, in this terminal; starts the server in the background if none is answering, and Ctrl-C stops both |
| `./linkCompanion.sh --port PORT` | a particular serial port |

With the site open too, run `./bindCompanion.sh` in one terminal and `./linkCompanion.sh` in another: the link uses
the site's server. By hand, the same is `pio run -t upload` and `python usb_bridge.py` in `firmware/esp32/`.

The bridge finds the board's port, hands it the server's state every five seconds, and passes back what you do on it
(a step ticked off, a routine run). The corner of the screen says **USB** while it is linked. Start the server first
(`./bindCompanion.sh` or `./bindCompanion.sh server`).

**On the board:** **turn** the dial to choose, **press** the front button to open or confirm, and the **top button**
goes back when you let it go (and gives up a routine that is waiting). The pages are TODAY, DAEMON (press: its INDEX
entry) and ROUTINES. **Sleep:** hold the top button and press the front one -- the screen and the lights go dark until
you turn the dial or press anything (that touch only wakes it).

**Home is the daemon you carry** -- large, breathing, drifting, now and then hopping -- and **how it is**: its mood in
a word, how it has eaten and drunk today, and at a meal time one quiet line. **Press** for CARE: feed it, water it,
train it, or read its INDEX entry. **Your goals nourish it**: each step you finish counts as a meal, and gives it
experience -- twenty steps a level, on its own growth curve -- which it takes home: the next SYNC after it comes home
writes its experience, and its level and stats where it grew past one, into your save. It never nags (PLAN 7): small effects, happier for time together, a little lower for
each day with nothing at all, and back at once when you return. The site's DAEMON tab shows and does the same. Any menu left alone goes to sleep
(two minutes, by default), and waking always lands back at home, to a few notes of the title theme.

**It sounds in the day's key** (Sunday C ... Saturday B): turning the dial right rises, left falls, select is the day's
note, and each routine has its own short tune, with the ring dancing to it -- the daemon running it.

**It learns remotes and networks**, as your daemon would: FLARE's TEACH A REMOTE takes POWER, VOLUME UP and VOLUME
DOWN from your remote (or the site adds a remote by its TV's brand), and UPLINK's TEACH A NETWORK learns a Wi-Fi network
(it joins any it knows). The site's DEVICE tab shows what it has learned, and can choose, add or forget.

**Its settings are set on the site** (DEVICE tab): home (the daemon or today's step), how soon it sleeps, sound and
volume, and how bright the ring rests. A linked board picks them up and keeps them.

**The ring of lights** glows the day's colour at a third, and goes out after a minute unused; touching anything brings
it back. Turning the dial runs a white light once round the ring (clockwise for right), select flashes it white, and
back darkens it for a moment.

**To see the board's screen on the computer** (stop the bridge first; it holds the port):
`python3 firmware/esp32/shot.py screen.png` saves it as a PNG.

[`firmware/esp32/FLASHING.md`](firmware/esp32/FLASHING.md) has the rest: download mode if an upload cannot connect,
Wi-Fi instead of the cable, watching it talk, putting the factory firmware back, and what each routine does.

## Each part on its own

You need **Node 24** (`.nvmrc`; `brew install node@24`, or `nvm use`). `bindCompanion.sh` finds Homebrew's node@24 by
itself; by hand, put it on your PATH first.

**The server** (`server/`), on <http://127.0.0.1:4730>:

```sh
cd server
npm install
npm run dev          # restarts on every change
npm start            # or once, without watching
npm test             # vitest
npm run typecheck    # tsc --noEmit
```

**The app** (`app/`), on <http://localhost:8081> as a site:

```sh
cd app
npm install
npm run web          # the site
npm run ios          # the iOS Simulator
npm run android      # an Android emulator
```

The app looks for the server at `http://127.0.0.1:4730`, or at `EXPO_PUBLIC_DAEMONS_SERVER` if it is set. **An Android
emulator reaches your machine at `10.0.2.2`**, so start it with
`EXPO_PUBLIC_DAEMONS_SERVER=http://10.0.2.2:4730 npm run android` (the script does this for you). The site and the
iOS Simulator share your machine's network and need nothing.

**What the server knows about the game** (`server/data/`) is exported from DAEMONS, never typed twice: species and
their INDEX entries in both editions' voices, the text encoding, the week, the seasons, the save's layout, the routines
and the daemons' art. With [DAEMONS](https://github.com/CodeMusic/DAEMONS) checked out beside this repo:

```sh
python3 ../DAEMONS/tools/companion_export.py           # what would change
python3 ../DAEMONS/tools/companion_export.py --write   # write server/data/
```

## Settings

**The save path is easiest set in the app**: open the **SETTINGS** tab, click *Choose a save…* (a native file picker
on Mac) or type the path, and *Open the folder* shows where to put one. What you set there overrides `config.json` and
is kept by the server, so SYNC just works. (If you SYNC before setting one, the app walks you through it.)

Everything else is in `server/config.json` (copy `server/config.example.json`; never committed). The server runs on
safe defaults with no config at all: **it reads no save and calls no model.**

| | |
|---|---|
| `host` | `127.0.0.1` (the default) serves this machine only; `0.0.0.0` serves the local network too, so a device can reach it. Nothing secret goes over it |
| `edition` | `CONTENT` or `CONTEXT` -- whose voice the daemon keeps, and whose season: CONTENT keeps the northern year, CONTEXT the southern |
| `savePath` | a **copy** of your DAEMONS save (`daemonsContent.sav` or `daemonsContext.sav`) -- **never the one the game is using**. When you answer the game from the DAEMON screen, the server writes to this file, and keeps a backup beside it in `companion-backups/` first. Close the game before answering: a running emulator writes its own copy back over yours |
| `ai` | off by default. `enabled`, a `baseUrl` that speaks the OpenAI chat API (DAEMONS' LiteLLM config, a local model, or any other), the `model`, and `apiKeyEnv`: the *name* of an environment variable holding the key, never the key itself. **Off, the breakdown answers with a built-in example**, so everything works without a model |

## The server's API

JSON in, JSON out, on this machine only.

| | |
|---|---|
| `GET /api/today` | the day (colour, note, virtue), the season of the daemon's edition, and the one next step |
| `GET /api/goals` | every goal, its sub-items and steps |
| `POST /api/goals` | `{title, breakdown?: true}` -- a goal, broken down when asked |
| `POST /api/steps/:id/done` | tick a step off |
| `GET /api/party` | the party of the configured save copy |
| `GET /api/profile` | the save's trainer, play time, INDEX counts, MARKS, DIPLOMA, OPUS, and where it was saved |
| `GET /api/species/:id` | one daemon's name, types, category and its edition's INDEX entry |
| `POST /api/away/answer` | answer the game's requests to send or bring home a daemon, after a backup |
| `GET /art/<name>_front.png` | a daemon's art, from DAEMONS' own `gfx/daemons/` |
| `GET /art/party/<slot>.png` | a party daemon as the game draws it, its streaks painted for its routines |
| `POST /api/sync` | **SYNC**: read the save, bring a daemon across or home, link the save the first time |
| `GET /api/settings` | the save path, where it came from, and whether it is a save |
| `POST /api/settings` | `{savePath}` -- set it (kept by the server; overrides `config.json`) |
| `POST /api/settings/pick` | a native file picker, on Mac |
| `POST /api/settings/reveal` | open the save's folder in Finder |
| `GET /api/device/state` | what a device shows: the day (and its menu and light colours), the season, the one next step, its daemon, what it holds and its INDEX entry |
| `GET /api/device/art` | the carried daemon's front sprite, as sixteen RGB565 colours and 4-bit pixels |
| `GET /api/device/link` | (this machine) the board: linked or not and how, its routines, their results |
| `POST /api/device/run` | `{routine}` -- run one of the board's routines |
| `POST /api/device/wifi` | `{ssid, password}` -- the board's Wi-Fi, sent down its cable only |
| `POST /api/device/ir` | `{protocol, code, bits, keep?}` -- one IR code, tried (and kept for SEND TO MY TV) |
| `GET`/`POST /api/device/settings` | the board's settings: home, sleep, sound, volume, ring |
| `GET /api/device/commands` | (the board) what the site sent it; `POST /api/device/results` and `/api/device/routines` answer |
| `GET /api/index` | the save's INDEX: seen and bound, each entry, and OPUS's margins |
| `GET /api/daemon/life` | the carried daemon's life: mood, fed, watered, trained, tired, a cue at a meal time |
| `POST /api/daemon/feed` (`water`, `train`) | tend it from the site |
| `GET /api/ir/brands` | TV power codes by brand, for FLARE's search |
| `POST /api/device/ticks` | `{steps: [ids]}` -- the steps a device ticked off; answers with the new state |
| `POST /api/device/interact` | `{kind, detail}` -- a device was used (a routine run): tending the daemon |

**Only the device routes (`/api/device/*`) and the art answer from another machine** on your network, when `host` is
`0.0.0.0`; everything else answers this machine only.

## Read next

- [**CONTEXT.md**](CONTEXT.md) -- what this project is and who it is for (read first).
- [**docs/FIELD-GUIDE.md**](docs/FIELD-GUIDE.md) -- a walk through everything, to try it.
- [**docs/vision.md**](docs/vision.md) -- what it is for and what it should feel like.
- [**docs/PLAN.md**](docs/PLAN.md) -- how each piece is built, and the questions still open.
- [**docs/INHERITANCE.md**](docs/INHERITANCE.md) -- what RoverRadio, RoverCub and their kin already did.
- [**TODO.md**](TODO.md) -- the work, decided and not done.

## The DAEMONS family

| | |
|---|---|
| [**CodeMusic/DAEMONS**](https://github.com/CodeMusic/DAEMONS) | **the game** -- its design bible, its tools, and patches for your own cartridge |
| [CodeMusic/pokefirered-daemons](https://github.com/CodeMusic/pokefirered-daemons) | the game's engine |
| [CodeMusic/gpt-play-pokemon-firered-daemons](https://github.com/CodeMusic/gpt-play-pokemon-firered-daemons) | the harness that lets a model play it |
| **CodeMusic/daemons-companion** | this: the goal companion |

**Nothing of Nintendo's is in here.** The daemon art it shows is DAEMONS' own -- every sprite in
`DAEMONS/gfx/daemons/` was drawn for the project -- and it reads and writes a DAEMONS save without any of the game's
code.
