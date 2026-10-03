# The plan -- daemons-companion

*The high-level picture is [vision.md](vision.md); this is the detail. Started 2026-10-03, the first sprint. Design before code; a decision recorded here is one the user made, and
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
  so the table is **one table, exported from DAEMONS**, never typed twice. *OPEN: RoverRadio's day-to-virtue pairing
  is in RoverCodeBase; DAEMONS pairs the seven virtues with its seven leaders (T-318) but not with days. Use
  RoverRadio's, or make one?*
- **The AI is Musai's shape**, which is also the game's: one pass reasons **logically** (what are the real steps, in
  what order, how long), one **associatively** (why this matters to you, what would make it easier to start, what it
  connects to), and a third reads both, notes where they **agree** and where they **don't**, and writes the plan that
  holds both. Models go through DAEMONS' LiteLLM config (`DAEMONS/ai/`), so a local model or a frontier one is a
  setting. *Nothing calls a paid model without the user turning it on.*

## 3. The daemon you carry (the link to DAEMONS)

**Decided by the user, 2026-10-03** (DAEMONS T-358 is the game's side):

- **Sending is started in the game.** A daemon in the party has an option to go to the device. The game **saves**
  and tells the player to open their save in the app. In the app, **"receive daemon"** reads the save, **checks that
  daemon is in the active party and matches**, and only then writes **AWAY** into the save and takes the daemon.
- **Coming home is the same, reversed.** With an away daemon in the party, its option starts the return: the game
  saves, and the app's **"send daemon"** checks the daemon is in the party and matches, clears AWAY, and writes back
  what it brought home (its friendship).
- **While AWAY**: its sprites are **washed out** everywhere (party, PORT, summary), so the player always knows it is
  on the device. It **cannot battle, be traded or be released.** It **can be deposited in the PORT and withdrawn**, so
  the player can still play with six fighting daemons.
- **What comes home: friendship**, built by the steps finished with it and the others it met (section 9). The site is
  gamified in the game's own look, so carrying a daemon feels part of the game.

**How it works:**

- **Which daemon it is**: a Gen 3 daemon is identified by its *personality value* and *original trainer ID*
  together, which never change -- the server keys on those, never on a party slot.
- **Where the marks live in the save**: every daemon's record has **four unused bits** in its flags byte (beside *is
  egg* and *bad egg*; `struct BoxPokemon`'s `unused:4`), outside the part the game checksums. Two of them carry the
  link: **AWAY**, and **ASKED** (the game's half of a send or a return, waiting for the app). They travel with the
  daemon through the PORT, because the whole record moves.
- **Editing the save safely**: Gen 3 keeps **two copies** of the save and uses the newer valid one; the writer edits
  that one, recomputes its section checksums, reads it back to validate, and **always keeps a backup**. The game must
  be **closed** while the save is edited (an emulator: quit it; an EZ-Flash: copy the `.sav` to the computer, edit,
  copy back). *The DAEMONS rule stands: development never touches the user's own save -- tests run on copies.*
- **No duplicates**: the save keeps the daemon (the master copy); the device holds its picture, its INDEX entry and
  its life (section 7). The server refuses to send one daemon twice.

**Still OPEN:** the option's name in the game's register (to send, and to call home).

## 4. The devices

- **The handheld, ESP32-S3** -- RoverCodeBase is PlatformIO + Arduino (`env:esp32dev`) with TFT_eSPI, a rotary
  encoder, a CC1101 radio, PN532 NFC, IR and M5Unified: that looks like a LilyGO T-Embed-class board. *OPEN: which
  exact board is in hand?* Its brain-region layout (AuditoryCortex, PrefrontalCortex, VisualCortex...) is kept; the
  first firmware job is a clean build of RoverCodeBase's skeleton on the S3, then the daemon and the step on screen,
  then sync.
- **The Pi Zero device** -- RoverCub (Python, the Penphin assistant, buttons, pixels) and RoverOSpi in RoverVerse.
  Python means the save reader and the step logic can be shared code. *OPEN: which Pi Zero board and screen?*
- **Both speak the same small sync protocol** to the server (HTTP + JSON over Wi-Fi to start: pull today's step and
  the daemon's picture and mood, push ticks). RoverSeer was going to be Redmine-backed; this server takes its role
  without Redmine, and can import from it later if wanted.

## 5. The app

**Expo / React Native** (the user, 2026-10-03): one TypeScript codebase, running as a **local site** first and built
to **iOS** later. Screens to start: **Today** (the day's colour, note, virtue; the one step), **Goals** (add one, let
the AI break it down, edit), **Daemon** (open a save, see the party, send one, see who is away), **Devices** (pair,
last sync).

## 6. Every daemon carries its INDEX entry

The device shows the daemon's **INDEX entry** -- its category and its entry in **its own edition's voice** (CONTENT's
for a CONTENT save, CONTEXT's for a CONTEXT one), exported from DAEMONS with the rest (C-03).

## 7. The daemon's life (the user, 2026-10-03)

A daemon on the device has **state, with many variables**, each from something real:

| | moves with |
|---|---|
| **fed** | feeding it -- it gets hungry over the day |
| **trained** | training it |
| **mood** | how you interact with it, and the steps you finish |
| **friendship** | the steps finished with it, and the others it meets over radio (section 9) -- this is what goes home |
| **tired** | the real hour: it is tired at night |
| **season** | the real date, in **its edition's hemisphere** (section 8) |

*OPEN: the exact rules (how fast hunger rises, what training does, how a missed day lands -- tired, never ruined).*

## 8. Seasons, by edition (the user, 2026-10-03)

**CONTEXT keeps the northern year and CONTENT the southern**: from December 21 to March 21 it is **winter** for
CONTEXT and **summer** for CONTENT; CONTENT's autumn is CONTEXT's spring, and so on. The device uses the season of
the daemon's edition, and **the game will too** (DAEMONS T-359), so a daemon's season is the same in both places.

## 9. Meeting others (the device's radio)

- **Passing someone else carrying a device** is an event: **your INDEX "sees" their daemon** -- written into your
  save as *seen* at the next sync -- and **your daemon's friendship grows**.
- **The radio**: RoverCodeBase uses RadioLib with a CC1101 (sub-GHz). LoRa needs an SX126x/SX127x radio; RadioLib
  drives both. *OPEN: which radio the chosen board carries -- a CC1101 can find nearby units, but LoRa reaches far
  and is what the mesh wants.*

## 10. Later, by design

- **The LoRa epic**: every unit a node in a **mesh**, and the AI-powered daemons on them **talking to each other**.
- **Trading** between devices: complicated -- it means editing two saves, and returning means more. Back burner.
- **Battling** between devices: back burner; the core comes first.
- **Many users**, accounts, hosting (C-11).

## 11. What comes from where

| Source | Taken |
|---|---|
| RoverByte/RoverCodeBase | the ESP32 firmware's structure and drivers |
| RoverByte/The RoverVerse/RoverOSpi, RoverCub | the Pi Zero device |
| RoverByte/RoverByteOS (CodeMusai, TheDogHouse, RoverRemote) | ideas for the server and the AI's memory; read before writing the server |
| Musai | the three-pass AI |
| DAEMONS | the daemon art (`gfx/daemons/`), names and species table (exported), the week's table, the save format |

## 12. Phases

1. **Foundations (the first sprint)**: this plan, the repo, the save reader on copies, the server and app
   skeletons talking to each other, the week's table exported from DAEMONS.
2. **Goals**: the three-pass breakdown, Today, the step on a screen.
3. **The device**: the ESP32-S3 firmware showing the daemon and the step, syncing; then the Pi Zero.
4. **The link**: AWAY in the game (DAEMONS T-358, decided), send and receive; the daemon's life (section 7).
5. **Meeting others**: seen and friendship over the radio; then the LoRa epic.
6. **Later**: trading, battling, many users, hosting, accounts.
