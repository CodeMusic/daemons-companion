# daemons-companion

**A goal companion that carries a daemon.** You carry a daemon from your game of
[**DAEMONS**](https://github.com/CodeMusic/DAEMONS) on a little device -- a LilyGO T-Embed (the CC1101, the plain one or
the SI4732), a T-Watch S3, or your phone. You feed it, train it, spend time with it, **talk with it** -- and it helps
you: tell it what you want to get done, and it turns that into **one next step** and walks you through the day. As you
get things done, it thrives. Pass someone else carrying one, and your INDEX sees their daemon.

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
| `./bindCompanion.sh phone` | **build the app for your iPhone** and install it ([below](#on-your-iphone)) |
| `./updateCompanion.sh` | **flash the handhelds** plugged in -- it asks each which board it is ([below](#the-handhelds)) |
| `./linkCompanion.sh` | **link a handheld** to the server over its cable |

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
| `app/` | **the app** -- Expo / React Native and **Tamagui**: a site you run yourself, and an iPhone app from the same code | **running as a site and on the iPhone, in the day's colours** (each weekday is a theme, from the week DAEMONS exports; `?day=tuesday` on the site previews another). **TODAY** (the day's theme, its virtue over its vice, chakra and note, the season, and the one thing to do), **GOALS**, **DAEMON** (your party; **SYNC** brings a daemon across or home; on the phone, **HOLD TO TALK** with the daemon you carry and an INDEX entry **read aloud**), **INDEX**, **DEVICE** (the handheld, its battery, its routines), **PROFILE**, **SETTINGS** |
| `firmware/esp32/` | **the handhelds** -- one firmware for the **LilyGO T-Embed CC1101, T-Embed and T-Embed SI4732** (they tell themselves apart at start) and its own build for the **T-Watch S3**; ESP32-S3, PlatformIO + Arduino, grown from RoverCodeBase | **running on the CC1101**; the other boards are built and not yet run. The day (its theme, virtue over vice, chakra and note), the one step, the daemon you carry -- **drawn as the game draws it** -- and **ROUTINES**: the board's radios in the game's words, and **GAME ROUTINES**, your party's own routines from the game. **Push to talk** (hold the dial), the battery, and the first radio experiment. See [The handhelds](#the-handhelds) |
| `server/src/ai/`, DAEMONS `ai/` | **the daemon's voice and words** -- n8n workflows on your own machine (DAEMONS `ai/n8n/`), speech to text (`ai/stt/`), a local model or OpenRouter, and the INDEX voice | **running**: a spoken question in, the daemon's answer in the INDEX voice out. See [Talk to your daemon](#talk-to-your-daemon) |
| `firmware/pizero/` | **the Pi Zero device** -- Python, grown from RoverCub and RoverOSpi | not started: waits on which board and screen (C-08) |

**Local first, one person.** Everything runs on your own machine; accounts, many users and hosting come later. **One
daemon goes out at a time today**, to whichever device is linked; a daemon per device, and every device always
connected, are designed in [docs/DEVICES.md](docs/DEVICES.md) (C-80, C-82).

## The handhelds

| board | screen | controls | listens | lights | its own radios | battery | state |
|---|---|---|---|---|---|---|---|
| **T-Embed CC1101** | 320x170 | dial, its press, top button | yes (push to talk) | ring of 8 | IR, NFC, Sub-GHz | gauge and charger | **runs** |
| **T-Embed** (plain) | 320x170 | dial and its press | yes (two mics) | ring of 7 | -- | voltage | built, not yet run |
| **T-Embed SI4732** | 320x170 | dial and its press | yes (two mics) | ring of 7 | AM/FM: LATENT and CONTEXT | voltage | built, not yet run |
| **T-Watch S3** | 240x240 touch | touch, the crown | yes (TALK on the face) | -- | LoRa, IR | power chip | built, not yet run |

The three T-Embeds run **one firmware**: at start each looks at what answers on its I2C bus and knows which board it
is. The watch has its own build. Pins and sources: [docs/HARDWARE.md](docs/HARDWARE.md).

### Flash them

Plug the boards in by USB-C cables that carry data, with [PlatformIO](https://platformio.org) installed
(`pip install platformio`), and:

```sh
./updateCompanion.sh          # every board plugged in: asks each what it is, and flashes the right build
./linkCompanion.sh            # link one to the server over its cable (starts the server if none is running)
```

| | |
|---|---|
| `./updateCompanion.sh` | asks each board on USB for its HELLO, flashes `t-embed` or `t-watch-s3`; with several plugged in it asks which (numbers, or `a` for all) |
| `./updateCompanion.sh --all` | every board found, without asking |
| `./updateCompanion.sh --board t-watch-s3` | say what it is -- for a board with no companion firmware on it yet (it says nothing, so the script would ask) |
| `./updateCompanion.sh --port PORT` | only that one |
| `./updateCompanion.sh --link` | flash, then link |
| `./updateCompanion.sh --build` | only build both, to check they compile (no board needed) |
| `./linkCompanion.sh` | the **bridge**, in this terminal; starts the server in the background if none is answering, and Ctrl-C stops both |
| `./linkCompanion.sh --port PORT` | a particular serial port |

After flashing, the script waits for the board to say HELLO. **A board can stay in its bootloader after an upload and
look dead** (the S3's own USB, and its battery keeps it powered when unplugged): **press RST once**. If an upload cannot
connect at all, hold BOOT, press and release RST, let go of BOOT, and run it again.

The bridge hands the board the server's state every five seconds and passes back what you do on it; the corner of the
screen says **USB**. A board that has learned a network (UPLINK, TEACH A NETWORK) asks the server itself over **WIFI**,
and a paired phone carries it over Bluetooth (**PHONE**). Start the server first (`./bindCompanion.sh` or
`./bindCompanion.sh server`).

### On the board

**The CC1101:** **turn** the dial to choose, **press** to open or confirm (it acts when you let go), and the **top
button** goes back. **Hold the dial** half a second on any home page to **talk** ([below](#talk-to-your-daemon)).
**Sleep:** hold the top button and press the front one; **only the top button wakes it**, so a pocket cannot.

**The plain T-Embed and the SI4732** have one button, the dial's press: a tap presses, held half a second it goes back
(at home it **talks** instead), held two seconds it sleeps (and only a hold wakes it). The SI4732's radio is two routine
types: **LATENT** (AM: LISTEN, and LIGHTNING) and **CONTEXT** (FM: LISTEN with the station's RDS, and STATIC SYNTH).

**The T-Watch S3:** its home is **the face** -- the time, the day's theme, its virtue over its vice, chakra and note,
today's steps, the battery and a TALK button. Swipe to turn between the pages, tap to press, hold to go back; the crown
wakes it or goes back, and held, it sleeps.

**The pages** are TODAY (the one step: press to tick it off; back undoes it for fifteen seconds), DAEMON, ROUTINES and
the DAY (its theme, virtue over vice, chakra and note; press for its note).

**Home is the daemon you carry** -- large, breathing, drifting, now and then hopping -- and **how it is**: its mood in
a word, how it has eaten and drunk today, and at a meal time one quiet line. **Press** for CARE: feed it, water it,
train it, or read its INDEX entry (press there to hear it **read aloud**). **Your goals nourish it**: each step you
finish counts as a meal, and gives it experience, which it takes home at the next SYNC. It never nags (PLAN 7). Any
menu left alone goes to sleep (two minutes, by default), and waking lands back at home, to a few notes of the title theme.

**ROUTINES** are the board's radios in the game's words -- FLARE (IR), WHISPER (Bluetooth), TOUCHSTONE (NFC),
LONGWAVE (Sub-GHz: WHAT'S ON THE AIR, listening only), UPLINK (Wi-Fi) -- and **GAME ROUTINES**: your party, and each daemon's own routines
from the game, in their streak colours; using one plays its own short phrase with the ring lit its colour. On the CC1101
it is the PARTY type; on a board with no radios of its own (the plain T-Embed, the SI4732 for now) ROUTINES opens it
first. UPLINK's **WI-FI MOTION** is the first radio experiment (C-70): it watches the Wi-Fi channel for movement in
the room.

**The battery** shows in the top bar (red when low and unplugged). At 15% it says so; at 5% it goes into deep sleep,
and the top button wakes it.

**It sounds in the day's key** (Sunday C ... Saturday B): the dial rises and falls, select is the day's note, and each
routine has its own tune, the ring dancing to it. **The ring** glows the day's colour, goes out after a minute unused,
and follows the dial. **It learns remotes and networks**, as your daemon would: FLARE's TEACH A REMOTE, UPLINK's TEACH
A NETWORK. **Its settings are set on the site** (DEVICE tab): home, sleep, sound and volume, the ring.

**To see a board's screen on the computer** (stop the bridge first; it holds the port):
`python3 firmware/esp32/shot.py screen.png`.

[`firmware/esp32/FLASHING.md`](firmware/esp32/FLASHING.md) has the rest: download mode, Wi-Fi instead of the cable,
watching it talk, putting the factory firmware back, and every routine.

## On your iPhone

The same app, built for your phone (iOS first; `com.codemusic.daemonscompanion`). Plug the iPhone in (or have it on
the same Wi-Fi with developer mode on), and:

```sh
./bindCompanion.sh phone      # generate the iOS project, build it signed by your team, install it
```

Then **pair it** -- on the site, SETTINGS, PAIR A PHONE: open the companion to your network (and restart it once),
**Show a code**, and type the address and the code into the app. The phone is given its own key; the whole app answers
it across your network, and nothing else does. **Your steps** come from Apple Health (it asks once) and count toward
the walking goal each time you open the app.

**The handheld, over Bluetooth (C-55).** Pair them once: on the handheld, ROUTINES, WHISPER, **PAIR MY PHONE**, and
in the app, DEVICE, **Pair the handheld**. When iOS asks, type the code the handheld shows. From then on the phone
carries the handheld's link wherever you both go, the way the cable does at the desk: its goal, its daemon and its
routines. The link comes back by itself when the handheld is near again, and its corner says PHONE. Away from the
companion, what the handheld does waits on the phone and goes up when the companion answers. The app only has to be open
or in the background (home screen, phone locked: fine); an app swiped away in the app switcher is cut off from
Bluetooth by iOS until it is opened again, and then it links again by itself. **FORGET MY PHONES**, on
the handheld, undoes every pairing.

**Meeting others nearby (C-15).** The handheld and the phone each send a small beacon -- the daemon's species and a
random tag that changes every hour -- and listen for others every few minutes. Passing someone else's companion is a
meeting: at the next SYNC your INDEX sees their daemon and yours grows a little friendlier. Your own handheld and
phone never count as meeting each other. Off in DEVICE, ITS SETTINGS, MEET OTHERS NEARBY.

A Release build carries its own JavaScript, so it runs without this Mac in reach -- though it talks to the companion
on it. **Away from home** it reaches the companion through an n8n workflow that relays into your home network
([docs/REMOTE.md](docs/REMOTE.md), C-56): import `n8n/companion relay.json` into your n8n, put this computer's address
and the secret from the site's SETTINGS (AWAY FROM HOME) in it, and save the webhook's address there too. The phone
learns it the next time it opens at home, and from then on tries home first and the relay after. For the App Store, archive in Xcode and upload with Transporter as usual.

## Talk to your daemon

**Hold to talk, let go, and the daemon you carry answers** -- in its own words, as itself, in the INDEX voice. The words
come from a model on your own machine (or OpenRouter when that one is busy), and nothing goes anywhere you did not set up.

| where | how | state |
|---|---|---|
| the CC1101 | **hold the dial** half a second on a home page; the TALK screen shows what it heard and the answer, and the speaker says it | built; needs the parts below. **Over Wi-Fi only** for now |
| the phone | DAEMON tab, **HOLD TO TALK** (with a daemon on your device) | built; needs a new build (`./bindCompanion.sh phone`) |
| an INDEX entry | press on it (the board), or **Read aloud** (the phone) | runs |
| the plain T-Embed, the SI4732 | **hold the dial** at home | built, not yet run |
| the watch | **hold TALK** on the face | built, not yet run |
| no network at all | an LLM630 riding behind a T-Embed, chosen with `BRAIN` down the cable | client built, not yet run: [docs/LLM630.md](docs/LLM630.md) (C-76) |

**What it takes**, all on your own machines:

1. **n8n** with DAEMONS' workflows (`DAEMONS/ai/n8n/`: `daemon/talk` and `daemon/voice`; its README says how to import
   them and what each needs).
2. **Speech to text** on the machine n8n runs on: `DAEMONS/ai/stt/` -- MLX Whisper on port 8770; its README has the
   install and the launch agent that keeps it running. Without it the daemon still answers, but has not heard you.
3. **A model**: LM Studio on that machine (asked for by name, `google/gemma-3-4b`), and an OpenRouter key in n8n for when
   it is busy or down.
4. **The voice**: the INDEX voice on your Chatterbox server, which `daemon/voice` calls.
5. **The companion pointed at it**, in `server/config.json`: `"talk": { "url": "http://<n8n>:5678/webhook" }`, with the
   shared secret in the `DEX_SHARED_SECRET` environment variable (or `"secret"` in the file, which is never committed).

The server sends every recording on as a 16 kHz WAV, and hands a handheld the answer's voice as 16 kHz samples it
streams straight into its speaker (`server/src/ai/voice.ts`; needs `ffmpeg`, or macOS's own `afconvert`).

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
| `talk` | the daemon's voice and words: `url` (your n8n's webhook base, `http://<n8n>:5678/webhook`), `secretEnv` (the *name* of the variable holding the shared secret, `DEX_SHARED_SECRET` by default) and optionally `localModel`. Off until `url` is set |
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
| `GET /api/device/state` | what a device shows: the day (its theme, virtue over vice, chakra, note, and its menu and light colours), the season, the one next step, its daemon, what it holds and its INDEX entry, **the party and their routines** (GAME ROUTINES), and **the clock** (for the watch) |
| `POST /api/device/battery` | `{percent, mv, charging, full, usb}` -- the handheld's charge, when it changes; shown on the DEVICE tab |
| `POST /api/device/talk` | a handheld's recording (a WAV, raw): the daemon's answer, and a link to its voice |
| `POST /api/device/speak` | the carried daemon's INDEX entry, aloud: a link to its voice |
| `GET /api/device/voice/:id` | that voice, as 16 kHz 16-bit mono samples, for a handheld to stream (kept ten minutes) |
| `POST /api/ai/talk` | `{text}` or `{audioBase64, audioMime}` -- the phone's push to talk: the answer, what was heard, and the voice as mp3 |
| `POST /api/ai/speak` | `{species}` or `{text}` -- an INDEX entry or a line in the INDEX voice, as mp3 |
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

**Only the device routes (`/api/device/*`), the two voice routes (`/api/ai/talk`, `/api/ai/speak`) and the art answer from another machine** on your network, when `host` is
`0.0.0.0`; everything else answers this machine only.

## Read next

- [**CONTEXT.md**](CONTEXT.md) -- what this project is and who it is for (read first).
- [**docs/FIELD-GUIDE.md**](docs/FIELD-GUIDE.md) -- a walk through everything, to try it.
- [**docs/vision.md**](docs/vision.md) -- what it is for and what it should feel like.
- [**docs/PLAN.md**](docs/PLAN.md) -- how each piece is built, and the questions still open.
- [**docs/INHERITANCE.md**](docs/INHERITANCE.md) -- what RoverRadio, RoverCub and their kin already did.
- [**docs/HARDWARE.md**](docs/HARDWARE.md) -- every board's pins and parts, with sources.
- [**docs/DEVICES.md**](docs/DEVICES.md) -- a daemon per device, and always connected: the design and its open questions.
- [**docs/LLM630.md**](docs/LLM630.md) -- the offline brain behind a T-Embed: what M5's code says it can do.
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
