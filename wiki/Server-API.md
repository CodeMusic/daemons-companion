# Server API

The companion's server answers on <http://127.0.0.1:4730>: JSON in, JSON out. The code is
[`server/src/api.ts`](https://github.com/CodeMusic/daemons-companion/blob/main/server/src/api.ts), and
[`server/src/routes.ts`](https://github.com/CodeMusic/daemons-companion/blob/main/server/src/routes.ts) for the
requests a phone hosting on its own answers the same way (C-111) -- marked *alone too* below.

## Who may ask

- **This machine** may ask anything.
- **Another machine on your network** (with `host` at `0.0.0.0`, see [Settings](Settings)) reaches only the device
  routes (the board's side of the Devices table below), the two voice routes (`/api/ai/talk`, `/api/ai/speak`) and the
  art -- unless it is a **paired phone**, whose key (`Authorization: Bearer <key>`) opens everything but what is this
  machine's own.
- **Through the relay** ([Away from home](Away-from-home)), a paired phone reaches everything but what is this
  machine's own, and a board reaches only the device routes, with the key it was given down its cable. Pairing is
  refused.
- **This machine's own**, never through the relay: `/api/pair/code`, `/api/pair/phones`, `/api/pair/forget`,
  `/api/settings/network`, `/api/settings/pick`, `/api/settings/reveal`, `/api/settings/relay`, `/api/settings/home`.
- **Home Assistant's door**, `/ollama/<key>/...`, answers only the key in its address, and never through the relay
  ([below](#home-assistants-conversation-agent)).

A device names itself with an `x-device` header, or `?device=` through the relay.

## The day, goals and the walk

| route | what it does |
|---|---|
| `GET /api/today` | the day (colour, note, virtue over its shadow), the season of the daemon's edition, and the one next step (*alone too*) |
| `GET /api/goals` | every goal, its sub-items and steps (*alone too*) |
| `POST /api/goals` | `{title, breakdown?: true}` -- a goal, broken down when asked |
| `GET`/`POST /api/goal` | the one goal (`{title, replace?}`), its milestones and steps (*alone too*) |
| `POST /api/goal/step` | `{text, milestone?}` -- a step, in a milestone if one is named (*alone too*) |
| `POST /api/goal/milestone` | `{title}` -- a milestone (*alone too*) |
| `POST /api/goal/remove` | `{step}` or `{milestone}` (*alone too*) |
| `POST /api/steps/:id/done` (`/undo`) | tick a step off, or undo it (*alone too*) |
| `GET`/`POST /api/walk` | the walking goal and today's steps (*alone too*) |

## The game

| route | what it does |
|---|---|
| `GET /api/party` | the party of the configured save copy (*alone too*) |
| `GET /api/profile` | the save's trainer, the player's choice and rival, play time, money, shoes, INDEX counts, MARKS and their wisdom, ROOTS, the DIPLOMA, OPUS, the places visited, the groves found, where it was saved, whether it is the companion's game -- and `casino`: what the CASINO has won or lost since the last SYNC (`pending`, `spins`, `balance`) (*alone too*) |
| `GET /api/index` | the save's INDEX: seen and bound, each entry, OPUS's margins, and each entry's NATIVE lines (*alone too*) |
| `GET /api/species/:id` | one daemon's name, types, category and its edition's INDEX entry (*alone too*) |
| `GET /api/notebook` | the NOTEBOOK pages the save holds, by section: each page's words, its kind (a song is `song`), whether it is still unread in the game, where it was found, and its link where the game draws a QR code (*alone too*) |
| `GET /api/progress` | GAME EVENTS -- every row held, not yet (and then unnamed) or unknown -- and CALLOW SCHOOL: the floors stood on, the TEXTBOOK, the DIPLOMA, the best and last mark, the sittings and the grade (*alone too*) |
| `GET /api/guide` | whether the save has found THE GUIDE, and once it has, the book by part and chapter (*alone too*) |
| `GET /api/marks` | each MARK's and understanding's words, colours and towns -- no save needed (*alone too*) |
| `GET /api/regions` | the two region maps' cells -- no save needed (*alone too*) |
| `GET /api/groves` | the groves' universes, signs and who lives in each -- no save needed (*alone too*) |
| `GET /api/school` | CALLOW SCHOOL's floors, syllabi, boards and the paper -- no save needed (*alone too*) |
| `POST /api/sync` | **SYNC**: read the save, bring a daemon across or home, link the save the first time, and write in the meetings, the experience earned and what the boards' CASINO won or lost (the money kept between 0 and 999999) (*alone too*) |
| `GET /art/<name>_front.png` | a daemon's art, from DAEMONS' own `gfx/daemons/` |
| `GET /art/party/<slot>.png` | a party daemon as the game draws it, its streaks painted for its routines; `?expression=` shades it |
| `GET /art/species/<id>.png` | a species as the INDEX draws it |
| `GET /api/art` | the same pictures as JSON, so they cross the relay: `?party=<slot>` (and `&expression=`), `?species=<id>`, `?all=species`, `?player=reason` or `instinct` (and `&walk=1`), `?mark=1` to `8`, `?guide=cover` |

## The daemon's life

| route | what it does |
|---|---|
| `GET /api/daemon/life` | the hosted daemon's life: mood, fed, watered, trained, drowsy or asleep, a cue at a meal time or bedtime, and its expression (*alone too*) |
| `POST /api/daemon/feed` (`water`, `train`, `sleep`, `wake`) | tend it -- `water` is DRINK on the screens; `sleep` puts it to bed, `wake` only wakes it (*alone too*) |

## Broadcasts

[docs/BROADCAST.md](https://github.com/CodeMusic/daemons-companion/blob/main/docs/BROADCAST.md) has the design.

| route | what it does |
|---|---|
| `GET /api/broadcasts?since=` | the broadcasts kept (the last sixty), each once, with the ways it came (*alone too*) |
| `GET /api/broadcast/acts` | the acts a daemon can do, from `server/data/acts.json` (*alone too*) |
| `POST /api/broadcast` | `{kind: say, act or reply, text or act, replyTo?, as?}` -- from the app, the site or the Tab5, as one of the daemons away (*alone too*) |
| `POST /api/device/broadcast` | a board's broadcast, sent (`dir: out`) or heard by LoRa or Bluetooth (`via`), kept once (*alone too*) |

Every device's state carries the last ten minutes' broadcasts as `casts`.

## Devices

| route | what it does |
|---|---|
| `GET /api/device/state` | what a device shows -- **for the device asking**: the day (its theme, virtue over its shadow, chakra, note, and its menu and light colours), the season, the one next step, its daemon (what it holds, its INDEX entry, its life, its `expression` and `den`, OPUS's margin), the party and their routines, the clock, the settings, `holiday` (how a board dresses today), `casino` (`{money, pending, balance, seen, friends}`: the save's money, what waits for SYNC, what the board plays with, which of its reports are counted, and the party's other slots for the reels), `casts`, and a note waiting for a card. `?expression=` draws it in another expression, for a check |
| `GET /api/device/art` | the hosted daemon's front sprite, as sixteen RGB565 colours and 4-bit pixels; `?slot=0` to `5`, a party daemon's, for the CASINO's reels |
| `POST /api/device/hello` | `{firmware}` -- a device's build (the Tab5) |
| `POST /api/device/battery` | `{percent, mv, charging, full, usb}` -- a board's charge, when it changes |
| `POST /api/device/ticks` | `{steps: [ids]}` -- the steps a device ticked off; answers with the new state and what to celebrate |
| `POST /api/device/untick` | `{step}` -- a step ticked by accident, undone |
| `POST /api/device/interact` | `{kind, detail}` -- a device was used (a routine run, a care): tending the daemon. `kind: casino` is a CASINO result, kept until SYNC writes it into the save |
| `GET /api/device/link` | (this machine) the board: linked or not and how, its routines, their results, and every device with its daemon |
| `GET /api/devices` | every device heard -- when, how, its firmware and battery, and which daemon it hosts -- and every daemon away |
| `POST /api/devices/carry` | `{id, personality}` -- put a daemon that is away in that device (`null`: none); it leaves the device that had it |
| `POST /api/devices/forget` | `{id}` -- forget a device; its key stops working |
| `POST /api/device/run` | `{routine}` -- run one of the board's routines |
| `GET /api/device/commands` | (the board) what the site sent it; `POST /api/device/results` and `/api/device/routines` answer |
| `GET`/`POST /api/device/settings` | the board's settings: home, sleep, sound, volume, ring, colours, meeting, LoRa band |
| `POST /api/device/wifi` | `{ssid, password}` -- the board's Wi-Fi, sent down its cable only |
| `POST /api/device/networks` | the networks a board knows; a device that has proved itself is handed the whole shared list back |
| `POST /api/device/network` | `{op: forget, ssid}` -- a network forgotten everywhere |
| `GET`/`POST /api/networks` | the one list of networks every device shares (names only here), and adding to it |
| `POST /api/device/remotes` | the board's remotes, as it reports them |
| `POST /api/device/remote` | `{op, ...}` -- `activate`, `remove` or `rename` one of its remotes, or `add` a brand's whole remote |
| `POST /api/device/ir` | `{protocol, code, bits, keep?}` -- one IR code, tried (and kept) |
| `GET /api/ir/brands` | TV power codes by brand, for FLARE's search |
| `POST /api/device/beacon` | `{peer}` -- one of our own beacon tags, so it is never counted as a meeting |
| `GET /api/beacons` | what the phone needs for its beacon, our own tags, and the last listen |
| `POST /api/device/listen` | a board's last Bluetooth listen, for the check |
| `POST /api/device/met` | `{species, peer, how?, hops?}` -- a meeting nearby, by Bluetooth, LoRa or a card |
| `POST /api/device/message` | a wave or a word over LoRa, heard or sent (eighty letters at most) |
| `GET /api/meetings` | the meetings, and the latest waves and words |
| `POST /api/device/card` | `{uid, op}` -- a card held to a board: `read` what each holds, `put` the board's daemon on it, `take` the card's, or `swap` |
| `POST /api/device/note` | `{text}` -- a note for a card, typed on the T-Deck, kept until a reader writes it |
| `POST /api/device/note/written` | a reader has written the note onto a card |
| `GET /api/device/face` | (the BOX-3) its face's revision, the daemon's name and its den |
| `GET /art/face/<phase>-<frame>.png` | (the BOX-3) the daemon's face in a voice phase -- `idle`, `listening`, `thinking`, `replying`, `error`, `muted`, `timer` -- two frames each (0, 1) |

## Voice

| route | what it does |
|---|---|
| `POST /api/device/talk` | a board's recording (a WAV, raw): the daemon's answer, and a link to its voice |
| `POST /api/device/speak` | the hosted daemon's INDEX entry -- or `{species}`, any entry -- aloud: a link to its voice |
| `GET /api/device/voice/:id` | that voice, as 16 kHz 16-bit mono samples, for a board to stream (kept ten minutes) |
| `POST /api/ai/talk` | `{text}` or `{audioBase64, audioMime}` -- the phone's push to talk: the answer, what was heard, and the voice as mp3 |
| `POST /api/ai/speak` | `{species}` or `{text}` -- an INDEX entry or a line in the INDEX voice, as mp3 |
| `GET`/`POST /api/talk/settings` | who answers: `auto`, `local` or `openrouter` |

## HOME: Home Assistant

| route | what it does |
|---|---|
| `GET /api/home` | the home's rooms and what HOME can show in each: lights, switches, fans, covers, scenes, scripts, media players, heating; locks shown, never opened |
| `POST /api/home/act` | `{id, action}` -- only an action that kind allows; answered at once, never kept for later |
| `POST /api/home/ask` | `{text, conversationId?}` -- Home Assistant's conversation agent, in words |
| `GET`/`POST /api/settings/home` | (this machine) Home Assistant's address and a long-lived token -- the token is never returned -- and the daemon-as-assistant address; `{renewAgentKey: true}` makes a new one |

## Home Assistant's conversation agent

`/ollama/<key>/` speaks enough of Ollama's API for Home Assistant's own Ollama integration to take a daemon as its
model (C-142): `/`, `GET /api/version`, `GET /api/tags` (`daemon` -- the one the BOX-3 hosts -- then each daemon away
by its name), `POST /api/show`, `GET /api/ps`, `POST /api/pull` and `POST /api/chat`, streamed as Ollama streams. The
answers come from the companion's own talk ([Talk to your daemon](Talk-to-your-daemon)). The key is on the site's
SETTINGS, Home Assistant card; see [Home Assistant and the BOX-3](Home-Assistant-and-the-BOX-3).

## Settings and pairing

| route | what it does |
|---|---|
| `GET /api/settings` | the save path, where it came from, and whether it is a save |
| `POST /api/settings` | `{savePath}` -- set it (kept by the server; overrides `config.json`) |
| `POST /api/settings/pick` | a native file picker, on a Mac |
| `POST /api/settings/reveal` | open the save's folder in Finder |
| `GET`/`POST /api/settings/network` | whether the server is open to your network (takes effect at the next start), and the computer's address, its own name (`<name>.local`) and the port |
| `GET`/`POST /api/settings/relay` | the relay's address and secret |
| `GET /api/settings/away` | the relay's address, for a paired phone to keep |
| `POST /api/pair/code` | a six-digit pairing code, good once for ten minutes |
| `POST /api/pair` | `{code, name}` -- pair a phone: answers with its key and the relay's address |
| `GET /api/pair/phones`, `POST /api/pair/forget` | the paired phones, and forgetting one |
| `GET /api/version` | the server's commit, and whether the app has changed since a build |
