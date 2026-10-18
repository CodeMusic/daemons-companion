# Broadcasts: a word, or a thing a daemon does, to every daemon (C-134)

*Built 2026-10-16. The user: "messages can be broadcast, and if u have lora it picks up further without network, if u
have network all linked devices get it -- and if u have bluetooth nearby devices get it -- all managed so u only see one
instance of the broadcast's ping."* Every word here is DRAFT.

## What a broadcast is

- **A word** (SAY): typed on a board with a keyboard (the T-Deck, the Cardputers), or on the app, the site or the Tab5.
- **An act**: a thing a daemon does -- WAVE, BOW, HUM A TUNE, DANCE, SHARE A BERRY, GLOW, CALL OUT, SETTLE TO REST,
  CHEER, INVITE TO PLAY (`firmware/common/acts.py`, which writes `server/data/acts.json` and `firmware/common/acts.h`).
  A board without a keyboard chooses one; so can every screen.
- **An answer** (REPLY): every daemon that receives an act answers it, once, 1.5-5 s later ("ARCHIVER bows in return").
  An answer is never answered; a word is read, not answered; our own are not answered.

It is sent **as a daemon** -- the one the board hosts, or, from the app, site or Tab5, one of the daemons away (the
first, unless one is named). A board that hosts none can hear but not send.

## Shown once

A broadcast's **id** is its sender's hourly tag and its own number: twelve hex digits. The tag is the same four bytes as
the board's Bluetooth beacon and LoRa frames (meet.cpp) when MEET OTHERS NEARBY is on; otherwise a tag of its own, as
random and as hourly. Every board and the companion keep the ids they have seen: a broadcast arriving a second way only
adds that way to its `via` (L LoRa, B Bluetooth, N the companion) -- it is not shown again.

## The three ways

| | how | reach |
|---|---|---|
| **LoRa** | lora.cpp's frame (docs/LORA.md): kind 3 SAY to everyone, **5 ACT** (the code), **6 REPLY** (the answered id, a space, the code), with the broadcast's own number as the frame's ID; passed on by the two-hop mesh | far, with no network -- the boards on the same band |
| **Bluetooth** | up to eight pieces, each a 128-bit service UUID `dae1....` turning in the scan response for twelve seconds (a fifth of a second each); every board listens lightly all the time between the meetings' listens | the room; a word at most 43 letters this way |
| **The companion** | a board tells it (`POST /api/device/broadcast`, or `CAST {json}` down the cable's bridge); every device gets the last ten minutes' in its state (`casts`) | every linked device, wherever it is (the relay included) |

**A Bluetooth piece**: `DA E1  K|N|P  FROM(4)  ID(2)  7 bytes`, K the kind (2 bits), N the pieces less one (3), P this
piece (3). The message they carry: SPECIES(2), the name's length and the name (up to 10), then the word, or the code,
or for an answer the answered FROM(4) ID(2) and the code.

**The phone** sends and hears through the companion, and over its own Bluetooth too (C-141): while MEET OTHERS NEARBY is
on, app/beacon.ts sends a broadcast as the same pieces, each a 128-bit service UUID (the one thing iOS lets an app
advertise), rotated every 200 ms for 12 s, and gathers the pieces it hears (server/src/blecast.ts, Node-free).

## On a board: CHORUS

Every board has the type **CHORUS** (*every way*) with two routines:

- **TO EVERY DAEMON** -- the acts as a list (and TYPE A WORD first on a keyboard board); choose and press to send.
- **WHAT CAME** -- the last ten, newest first, each with how it came (L B N); ours in grey.

A broadcast arriving flashes the board's light and shows its words for a moment -- never a sound, never on a sleeping
board. A word on a keyboard board stays until read, as C-123's do.

**Bench checks down the cable**: `CASTS?` (what this board has, each with its ways), `CAST act WAVE`, `CAST say hello`
(needs a daemon hosted). Checked 2026-10-16 on the T-Display-S3 AMOLED: a WAVE sent from the companion arrived once by N,
and twice more of the same state kept one. **Bluetooth between two boards confirmed 2026-10-18**: the CC1101 heard the T-Deck's WAVE by Bluetooth and by the
companion, and showed it once ([BN]). LoRa between two boards is not yet checked.

## The companion's half

`server/src/broadcast.ts` (no Node, so a phone hosting alone answers too): `GET /api/broadcasts?since=`,
`GET /api/broadcast/acts`, `POST /api/broadcast {kind, text|act, as?}`, `POST /api/device/broadcast` (a board's, sent or
heard). The last sixty are kept. The app, the site and the Tab5 show them on the DAEMON tab as NEARBY (the controller
session's half).

## Bands

LoRa only reaches boards on the same band. The site's band is one setting for every board; the Cardputer ADV's cap is
made for 868-923 MHz, so a 433 setting is taken as 868 on it. A board with both bands -- or the companion with a radio of
each -- could pass broadcasts between them later; the ids already keep that from showing anything twice.
