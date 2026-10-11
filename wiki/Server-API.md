# Server API

The companion's server answers on <http://127.0.0.1:4730>: JSON in, JSON out. The code is
[`server/src/api.ts`](https://github.com/CodeMusic/daemons-companion/blob/main/server/src/api.ts).

## Who may ask

- **This machine** may ask anything.
- **Another machine on your network** (with `host` at `0.0.0.0`, see [Settings](Settings)) reaches only the device
  routes (`/api/device/*`), the two voice routes (`/api/ai/talk`, `/api/ai/speak`) and the art -- unless it is a
  **paired phone**, whose key (`Authorization: Bearer <key>`) opens everything but what is this machine's own.
- **Through the relay** ([Away from home](Away-from-home)), a paired phone reaches everything but what is this
  machine's own, and a board reaches only the device routes, with the key it was given down its cable. Pairing is
  refused.
- **This machine's own**, never through the relay: `/api/pair/code`, `/api/pair/phones`, `/api/pair/forget`,
  `/api/settings/network`, `/api/settings/pick`, `/api/settings/reveal`, `/api/settings/relay`.

A device names itself with an `x-device` header, or `?device=` through the relay.

## The day, goals and the walk

| route | what it does |
|---|---|
| `GET /api/today` | the day (colour, note, virtue), the season of the daemon's edition, and the one next step |
| `GET /api/goals` | every goal, its sub-items and steps |
| `POST /api/goals` | `{title, breakdown?: true}` -- a goal, broken down when asked |
| `GET`/`POST /api/goal`, `POST /api/goal/remove` | the current goal, its milestones and steps |
| `POST /api/steps/:id/done` (`/undo`) | tick a step off, or undo it |
| `GET`/`POST /api/walk` | the walking goal and today's steps |

## The game

| route | what it does |
|---|---|
| `GET /api/party` | the party of the configured save copy |
| `GET /api/profile` | the save's trainer, play time, INDEX counts, MARKS, DIPLOMA, OPUS, and where it was saved |
| `GET /api/index` | the save's INDEX: seen and bound, each entry, and OPUS's margins |
| `GET /api/species/:id` | one daemon's name, types, category and its edition's INDEX entry |
| `POST /api/sync` | **SYNC**: read the save, bring a daemon across or home, link the save the first time |
| `POST /api/away/answer` | answer the game's requests to send or bring home a daemon, after a backup |
| `GET /art/<name>_front.png` | a daemon's art, from DAEMONS' own `gfx/daemons/` |
| `GET /art/party/<slot>.png` | a party daemon as the game draws it, its streaks painted for its routines |
| `GET /art/species/<id>.png` | a species as the INDEX draws it |
| `GET /api/art` | the same pictures as JSON, so they cross the relay |

## The daemon's life

| route | what it does |
|---|---|
| `GET /api/daemon/life` | the hosted daemon's life: mood, fed, watered, trained, tired, a cue at a meal time |
| `POST /api/daemon/feed` (`water`, `train`) | tend it |

## Devices

| route | what it does |
|---|---|
| `GET /api/device/state` | what a device shows -- **for the device asking**: the day (its theme, virtue over vice, chakra, note, and its menu and light colours), the season, the one next step, its daemon, what it holds and its INDEX entry, the party and their routines, and the clock |
| `GET /api/device/art` | the hosted daemon's front sprite, as sixteen RGB565 colours and 4-bit pixels |
| `POST /api/device/battery` | `{percent, mv, charging, full, usb}` -- a board's charge, when it changes |
| `POST /api/device/ticks` | `{steps: [ids]}` -- the steps a device ticked off; answers with the new state |
| `POST /api/device/interact` | `{kind, detail}` -- a device was used (a routine run): tending the daemon |
| `GET /api/device/link` | (this machine) the board: linked or not and how, its routines, their results, and every device with its daemon |
| `GET /api/devices` | every device heard -- when, how, its firmware and battery, and which daemon it hosts -- and every daemon away |
| `POST /api/devices/carry` | `{id, personality}` -- put a daemon that is away in that device (`null`: none); it leaves the device that had it |
| `POST /api/devices/forget` | `{id}` -- forget a device; its key stops working |
| `POST /api/device/run` | `{routine}` -- run one of the board's routines |
| `GET /api/device/commands` | (the board) what the site sent it; `POST /api/device/results` and `/api/device/routines` answer |
| `GET`/`POST /api/device/settings` | the board's settings: home, sleep, sound, volume, ring, meeting, LoRa band |
| `POST /api/device/wifi` | `{ssid, password}` -- the board's Wi-Fi, sent down its cable only |
| `GET`/`POST /api/networks` | the one list of networks every device shares (names only here) |
| `POST /api/device/ir` | `{protocol, code, bits, keep?}` -- one IR code, tried (and kept for SEND TO MY TV) |
| `GET /api/ir/brands` | TV power codes by brand, for FLARE's search |
| `POST /api/device/met`, `POST /api/device/message` | a meeting nearby, and a wave or word between daemons ([Meeting others nearby](Meeting-others-nearby)) |
| `GET /api/meetings` | the meetings, and the latest waves and words |

## Voice

| route | what it does |
|---|---|
| `POST /api/device/talk` | a board's recording (a WAV, raw): the daemon's answer, and a link to its voice |
| `POST /api/device/speak` | the hosted daemon's INDEX entry -- or `{species}`, any entry -- aloud: a link to its voice |
| `GET /api/device/voice/:id` | that voice, as 16 kHz 16-bit mono samples, for a board to stream (kept ten minutes) |
| `POST /api/ai/talk` | `{text}` or `{audioBase64, audioMime}` -- the phone's push to talk: the answer, what was heard, and the voice as mp3 |
| `POST /api/ai/speak` | `{species}` or `{text}` -- an INDEX entry or a line in the INDEX voice, as mp3 |
| `GET`/`POST /api/talk/settings` | who answers: `auto`, `local` or `openrouter` |

## Settings and pairing

| route | what it does |
|---|---|
| `GET /api/settings` | the save path, where it came from, and whether it is a save |
| `POST /api/settings` | `{savePath}` -- set it (kept by the server; overrides `config.json`) |
| `POST /api/settings/pick` | a native file picker, on a Mac |
| `POST /api/settings/reveal` | open the save's folder in Finder |
| `GET`/`POST /api/settings/network` | whether the server is open to your network (takes effect at the next start) |
| `GET`/`POST /api/settings/relay` | the relay's address and secret |
| `POST /api/pair/code` | a six-digit pairing code, good once for ten minutes |
| `POST /api/pair` | `{code, name}` -- pair a phone: answers with its key and the relay's address |
| `GET /api/pair/phones`, `POST /api/pair/forget` | the paired phones, and forgetting one |
| `GET /api/version` | the server's commit, and whether the app has changed since a build |
