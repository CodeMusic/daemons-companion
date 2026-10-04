# The plan -- daemons-companion

*The high-level picture is [vision.md](vision.md); this is the detail. Started 2026-10-03, the anniversary sprint -- a month to the day since DAEMONS moved to the GBA. Design before code; a decision recorded here is one the user made, and
everything marked OPEN is a question for them.*

## 1. What it is

A **companion for getting things done** -- the word for it is a *goal companion* rather than a tracker: it does not
only keep the list, it walks beside you through it. Three pieces and a game:

```
  DEVICE (ESP32-S3 handheld, or a Pi Zero board)      APP (Expo: local site now, iOS later)
     shows your daemon, today's step, the day's            your goals, their steps, your devices,
     colour / note / virtue; you tick a step off           your DAEMONS save and its party
                 \                                          /
                  \---- Wi-Fi ---- SERVER (local, Node) ---/
                                   goals + steps (SQLite), the AI that breaks goals down,
                                   device sync, the DAEMONS save reader and writer
                                          |
                                   DAEMONS .sav (a copy, always backed up)
```

## 2. Goals, steps, and the day (what RoverRadio began)

- **A goal is a ticket.** You add one ("redo the garage"). The AI breaks it into **sub-items, each with steps** small
  enough to start right now -- and you edit the result; the AI proposes, you decide.
- **Through the day the device holds one thing: the next step of the first open sub-item**, and nudges you toward it.
  Ticking it off moves to the next. Nothing else competes for the screen.
- **The day has a character.** Each weekday has its **colour** (the UI's tones), its **musical note**, its
  **chakra**, and its **virtue** with a statement ("charity cures greed"), and the nudges lean toward that virtue.
  The game already uses the same week (DAEMONS vision 9.21: the rainbow in order and the notes C to B, Sunday first),
  so the table is **one table, exported from DAEMONS**, never typed twice. **RoverRadio's own pairing is taken**
  (docs/INHERITANCE.md): Sunday red, C, Root, *Chastity cures Lust*; Monday orange, D, Sacral, *Temperance cures
  Gluttony*; Tuesday yellow, E, Solar Plexus, *Charity cures Greed*; Wednesday green, F, Heart, *Diligence cures Sloth*;
  Thursday blue, G, Throat, *Forgiveness cures Wrath*; Friday indigo, A, Third Eye, *Kindness cures Envy*; Saturday
  violet, B, Crown, *Humility cures Pride*. *(The user's own design; change it here and in the export if wanted.)*
- **The AI is Musai's shape**, which is also the game's: one pass reasons **logically** (what are the real steps, in
  what order, how long), one **associatively** (why this matters to you, what would make it easier to start, what it
  connects to), and a third reads both, notes where they **agree** and where they **don't**, and writes the plan that
  holds both. Models go through DAEMONS' LiteLLM config (`DAEMONS/ai/`), so a local model or a frontier one is a
  setting. *Nothing calls a paid model without the user turning it on.*

## 3. The daemon you carry (the link to DAEMONS)

**Decided by the user, 2026-10-03, and reshaped 2026-10-04** (DAEMONS T-358 and T-370 are the game's side):

- **One daemon at a time.** The companion carries one daemon. The game will not offer SEND while one is AWAY or
  asked for, and the app refuses a second.
- **One button in the app: SYNC.** It reads the save and brings everything across -- the trainer, the INDEX, the
  party (section 6, the PROFILE in section 5). **If the game is waiting to send a daemon, the same button receives
  it; if it is waiting to call one home, the same button returns it.** Otherwise it only syncs. There is no separate
  "receive" or "send" to choose between.
- **SEND appears in the game only after the first SYNC.** The app writes a flag into the save the first time it
  syncs it, and the game shows SEND (and the people on the CHECKPOINT's second floor talk about the companion) only
  once that flag is set. A player who never uses the companion never sees it.
- **Sending starts in the game.** A party daemon's menu offers SEND; the game **saves** and tells the player to open
  the save in the app. SYNC checks the daemon is in the active party and matches, writes **AWAY**, and takes it.
- **Coming home is the same, reversed**, and brings back the friendship it built.
- **The emergency way home, without the app.** So a daemon is never stuck in limbo when the app is out of reach, the
  game also offers to bring an AWAY daemon home **on its own**. It warns first: the companion still thinks it is
  out, so **to send another, release it in the app** -- and the next SYNC sees it home and settles both sides anyway.
- **The app is married to one save.** The first save it syncs is *its* game, known by the trainer's ID and secret ID
  (which never change) and the trainer's name. **Load a different save and the app says so** -- this belongs to a
  different game. It will still sync it and show that save's data, but **a daemon carried for the first game can
  only go home to the first game's save.** That stops a daemon received from one save being returned into another.
- **While AWAY**: washed out everywhere in the game (party, PORT, summary); it **cannot battle, be traded or be
  released**; it **can** go into the PORT and come back out.
- **What comes home: friendship**, built by the steps finished with it and the others it met (section 9).

**How it works:**

- **Which daemon it is**: a Gen 3 daemon is identified by its *personality value* and *original trainer ID*
  together, which never change -- the server keys on those, never on a party slot.
- **Where the marks live in the save**: every daemon's record has **four unused bits** in its flags byte (beside *is
  egg* and *bad egg*; `struct BoxPokemon`'s `unused:4`). Two of them carry the link: **AWAY**, and **ASKED** (the
  game's half of a send or a return, waiting for the app). They travel with the daemon through the PORT.
- **Editing the save safely**: Gen 3 keeps **two copies** of the save and uses the newer valid one; the writer edits
  that one, recomputes its section checksums, reads it back, and **always keeps a backup**. The game must be
  **closed** while the save is edited. *Development never touches the user's own save -- tests run on copies.*
- **No duplicates**: the save keeps the daemon (the master copy); the device holds its picture, its INDEX entry and
  its life (section 7).

**Still OPEN:** the menu's words (SEND, CALL HOME, STAY and the messages are drafts in the game).

## 4. The devices

- **The handheld: the LilyGO T-Embed CC1101** (the user, 2026-10-04: the board in hand) -- ESP32-S3, ST7789 170x320,
  an encoder, 8 WS2812s, PN532 NFC, a BQ25896 charger, CC1101, SD, IR, I2S audio. RoverCodeBase's pins match it, but its
  `platformio.ini` targets `esp32dev` and does not build from a fresh clone (docs/INHERITANCE.md), so the firmware
  starts clean for the S3, keeping RoverCodeBase's brain-region layout where it helps: first the day, the step and
  the daemon on screen over Wi-Fi, then ticking a step off with the encoder. *Whether it can count steps (an
  accelerometer) is to be checked on the board.*
- **The Pi Zero device: a Pi Zero 2 W** (the user, 2026-10-04). *OPEN: which screen* (RoverRevival used a Waveshare
  1.44" 128x128 LCD with a joystick). Python means the save reader and the step logic can be shared code.
- **A phone can be the device too** (the user, 2026-10-04): the app on iOS and Android carries the daemon and finds
  others nearby over Bluetooth, so anyone can take part without the hardware -- and keep the same daemon if they get
  a device later.
- **All of them speak the same small sync protocol** to the server (HTTP + JSON over Wi-Fi: pull the day, the step
  and the daemon; push ticks). The server listens on this machine only until a device needs it; then it listens on
  the local network, with nothing secret on it.
- **Wi-Fi credentials never go in the repo** -- a local, ignored file on the device's side, set at flashing.

## 5. The app

**Expo / React Native** (the user, 2026-10-03): one TypeScript codebase, running as a **local site** first and built
to **iOS** later. **Tamagui** for its components and themes (the user, 2026-10-04): the day's colour themes the
whole app, as the device is themed. *One (onestack.dev) was weighed the same day and left for now: its strengths --
a server-rendered site, a sync engine for many users -- belong to C-11. OPEN until then: whether to move to it.*

Screens:

- **Today** -- the day's colour, note and virtue; the season; the one next step.
- **Goals** -- add one, let the AI break it down, edit, tick steps off.
- **Daemon** -- the party, who is away, and **SYNC** (section 3).
- **INDEX** -- the save's INDEX, as the game keeps it (section 6).
- **Profile** -- whichever save was synced: the trainer's name, play time, daemons seen and bound, MARKS, and how far
  the game has gone; and whether this save is the one the app is married to.
- **Devices** -- pair, last sync.

## 6. Every daemon carries its INDEX entry

The device shows the daemon's **INDEX entry** -- its category and its entry in **its own edition's voice** (CONTENT's
for a CONTENT save, CONTEXT's for a CONTEXT one), exported from DAEMONS with the rest (C-03).

**The app has the INDEX too** (the user, 2026-10-04): **it reflects the synced save's own INDEX** -- the daemons seen
and bound, shown as the game shows them -- so the app and the device read the same entries. **If the save holds OPUS,
the app shows OPUS's margins beside each entry it has** (the page is wide enough for both).

**The words always match the game's.** INDEX entries and margins change as the game is written, so the export
carries them (DAEMONS `tools/companion_export.py`), and **a check fails whenever the companion's copy differs from
what the game is built from** -- run in DAEMONS' push routine, so a release never ships words the companion does not
have.

## 7. The daemon's life (the user, 2026-10-03; the base rules 2026-10-04)

A daemon on the device has **state, with many variables**, each from something real:

| | moves with |
|---|---|
| **fed** | feeding it -- **three meals a day**, which is also a cue for you to eat |
| **watered** | giving it water, the same way |
| **trained** | training it -- for now, choosing TRAIN; later small games shaped like your own tasks (matching socks when the laundry is waiting) |
| **active** | anything it can notice without being asked -- **your steps**, where the device can count them -- satisfies it as training does |
| **mood** | how you interact with it, and the steps you finish |
| **friendship** | the steps finished with it, and the others it meets nearby (section 9) -- this is what goes home |
| **tired** | the real hour: it is tired at night |
| **season** | the real date, in **its edition's hemisphere** (section 8) |

**It must never pester you** (the user's rule). You should not have to babysit it:

- **Small effects.** Missing a meal or a session costs a little, never much.
- **Interaction makes it happier and calmer**; that is the reward, not a penalty avoided.
- **A day with no interaction at all makes it a little less happy** -- each such day a little more -- **and any
  interaction brings it back quickly.**
- **It never nags.** A meal time can be a gentle cue on the screen; nothing repeats, buzzes or escalates.

## 8. Seasons, by edition (the user, 2026-10-03)

**CONTENT keeps the northern year and CONTEXT the southern**: from December 21 to March 21 it is **winter** for
CONTENT and **summer** for CONTEXT; CONTEXT's autumn is CONTENT's spring, and so on. *(Flipped by the user the same
day: CONTENT is the calendar as lived where the game is made, CONTEXT the same date reframed -- DAEMONS vision 9.21.)* The device uses the season of
the daemon's edition, and **the game will too** (DAEMONS T-359), so a daemon's season is the same in both places.

## 9. Meeting others nearby

- **Passing someone else carrying a daemon** is an event: **your INDEX "sees" their daemon** -- written into your
  save as *seen* at the next sync -- and **your daemon's friendship grows**.
- **Bluetooth first** (the user, 2026-10-04): the T-Embed's ESP32-S3, the Pi Zero 2 W and every phone all speak
  Bluetooth Low Energy, so it is the one radio that lets every kind of companion find every other. A short, slow
  advertising beacon and an occasional scan keep it light on power.
- **LoRa and the mesh are later** (C-16): a mesh would pass messages through every unit, so a daemon could be known to
  be in the mesh though out of radio range. The T-Embed also carries a CC1101 (sub-GHz), which RadioLib can drive;
  it is kept for that later work.

## 10. The device's ROUTINES -- its radios, in the game's words (the user, 2026-10-04)

The handheld is a maker board with several radios (IR, Bluetooth, NFC, sub-GHz, Wi-Fi; `CONTEXT.md`). On the device,
the daemon's **ROUTINES** drive them -- and **using a routine at all keeps the daemon happy** (C-13), because tending
your companion and using it are the same act.

**How it reads, in the game's frame.** The game's own **SIGNAL** type is "a carrier" (DAEMONS vision 2.2) -- so the
radios are SIGNAL's family, each a *routine type*. In the menu:

1. **Routine type** -- one of the board's radios, a game name with the raw name in brackets, e.g. `WHISPER (Bluetooth)`.
2. **A routine under it** -- a named action. The list grows over time; **empty is fine**, with a **back** button.
3. **Run it.**

**The proposed names (the user to confirm -- grounded in the game; the raw name always in brackets):**

| radio | proposed name | why |
|---|---|---|
| **IR** | `FLARE` *(IR)* | infrared is invisible light, thrown in a line -- a flare is a directed burst of it |
| **Bluetooth** | `WHISPER` *(Bluetooth)* | the short-range, person-to-person link: a word said close |
| **NFC** | `TOUCHSTONE` *(NFC)* | you touch a tag to it; a touchstone is a thing you press against to read what it is |
| **sub-GHz** | `LONGWAVE` *(sub-GHz)* | the one that reaches furthest, heard on the open air |
| **Wi-Fi** | `UPLINK` *(Wi-Fi)* | the known network link home |

*(Alternatives if any jar: IR `GLIMMER`/`PILOT`; Bluetooth `TETHER`/`HANDSHAKE`; NFC `IMPRINT`/`CONTACT`;
sub-GHz `CARRIER`/`AETHER`; Wi-Fi `GRID`. `MESH` is held for the LoRa future, C-16.)* ***Confirmed by the user 2026-10-04: FLARE, WHISPER, TOUCHSTONE, LONGWAVE; UPLINK stands.***

**One test routine per type first (C-28), each against the author's own gear, to confirm the radio works:**

- **FLARE (IR)** -- send a power code to the author's own TV and see it turn off.
- **WHISPER (Bluetooth)** -- a request to the author's own phone.
- **TOUCHSTONE (NFC)** -- read the **identifier** of the author's own tag (a MIFARE Classic card, an NTAG card or sticker): just
  the ID, to confirm the reader. (The board has no 125 kHz RFID, so door fobs are out of scope.)
- **LONGWAVE (sub-GHz)** -- listen for the author's own sub-GHz device, show basic info, and echo a signal back, to
  confirm both receive and send.

**Boundaries (see `CONTEXT.md`):** every test is against the author's own equipment, to answer "does my board's radio
work", never to reach anyone else's devices and never to defeat a lock, credential, or payment system.

**Build order:** the names are confirmed by the user first; then the firmware, with the board present, one radio at a
time, each verified on the author's own gear before the next.

## 11. Later, by design

- **The LoRa epic**: every unit a node in a **mesh**, and the AI-powered daemons on them **talking to each other**.
- **Trading** between devices: complicated -- it means editing two saves, and returning means more. Back burner.
- **Battling** between devices: back burner; the core comes first.
- **Many users**, accounts, hosting (C-11).

## 12. What comes from where

| Source | Taken |
|---|---|
| RoverByte/RoverCodeBase | the ESP32 firmware's structure and drivers |
| RoverByte/The RoverVerse/RoverOSpi, RoverCub | the Pi Zero device |
| RoverByte/RoverByteOS (CodeMusai, TheDogHouse, RoverRemote) | ideas for the server and the AI's memory; read before writing the server |
| Musai | the three-pass AI |
| DAEMONS | the daemon art (`gfx/daemons/`), names and species table (exported), the week's table, the save format |

## 13. Phases

1. **Foundations (the anniversary sprint)**: this plan, the repo, the save reader on copies, the server and app
   skeletons talking to each other, the week's table exported from DAEMONS.
2. **Goals**: the three-pass breakdown, Today, the step on a screen.
3. **The device**: the ESP32-S3 firmware showing the daemon and the step, syncing; then the Pi Zero.
4. **The link**: AWAY in the game (DAEMONS T-358, decided), send and receive; the daemon's life (section 7).
5. **Meeting others**: seen and friendship over the radio; then the LoRa epic.
6. **Later**: trading, battling, many users, hosting, accounts.
