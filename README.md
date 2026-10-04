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
| `app/` | **the app** -- Expo / React Native and **Tamagui**: a site you run yourself first, an iPhone and iPad app from the same code later | **running as a site, in the day's colours** (each weekday is a theme, from the week DAEMONS exports; `?day=tuesday` on the site previews another). Four screens: **TODAY** (the day's colour, note and virtue, the season, and the one thing to do), **GOALS** (add one, see its steps, tick them off), **DAEMON** (your party, and answering the game when it asks to send a daemon), **PROFILE** (the save's trainer, play time, INDEX, MARKS and progress) |
| `firmware/esp32/` | **the handheld** -- ESP32-S3, PlatformIO + Arduino, grown from RoverCodeBase | not started: waits on which board (TODO C-07) |
| `firmware/pizero/` | **the Pi Zero device** -- Python, grown from RoverCub and RoverOSpi | not started: waits on which board and screen (C-08) |

**Local first, one person.** Everything runs on your own machine; accounts, many users and hosting come later.

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

The server runs on safe defaults with no settings at all: **it reads no save and calls no model.** To change that,
copy `server/config.example.json` to `server/config.json` (never committed) and edit it:

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
| `GET /api/device/state` | what a device shows: the day, the season, the one next step, its daemon |
| `POST /api/device/ticks` | `{steps: [ids]}` -- the steps a device ticked off; answers with the new state |

## Read next

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
