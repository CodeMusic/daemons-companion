# LoRa: the daemons nearby, and a word between them (C-72, C-104)

*Built 2026-10-10, not yet run on a board. The user: "most devices now have LoRa, most the 433, some I think might
not be. For compatible ones, can we make a communication system, so you can go into that routine and see the nearby
daemons and send them interactions or connections or messages."*

## Which of the boards can talk to which

LoRa is a modulation, not a band: an SX1262 and an SX1278 hear each other at the same frequency and settings, and the
Bluetooth, sub-GHz and 2.4 GHz radios on the other boards cannot join however they are driven.

| board | radio | LoRa? | band | state |
|---|---|---|---|---|
| **T-Deck Plus** | SX1262 | **yes** | as bought: 433, 868 or 915 | `env:t-deck`, built (C-104) |
| **T-Watch S3** | SX1262 | **yes** | as bought: 433, 868 or 915 (or an SX1280 at 2.4 GHz, which talks to nothing here) | `env:t-watch-s3`, built |
| **M5Stack Fire + LoRa433 module** | Ra-02, an SX1278 | **yes, at 433** | 410-525 MHz | not wired: the module's CS, RST and IRQ depend on its DIP switches (M5's docs give only IRQ 35 / RST 13 for a Core); and the Fire's build has about 400 bytes of instruction RAM to spare (HARDWARE.md) |
| **Cardputer ADV + Cap LoRa1262** | SX1262 (+ a GNSS) | yes, when the Cardputer is built (C-78) | 868/915 as sold | not built |
| **T-Embed CC1101** (and PLUS) | CC1101 | **no** -- FSK/OOK, not LoRa; the PLUS's nRF24 is 2.4 GHz | -- | LONGWAVE listens; it will never hear a LoRa frame |
| **T-Embed, SI4732** | -- | no (the SI4732 is a broadcast receiver) | -- | |
| **M5StickS3, CoreS3, Dial, Tab5, M5GO** | -- | no, without a module | -- | the CoreS3 takes the LoRa433 module too (IRQ 10 / RST 5) |
| **the phone** | -- | no | -- | Bluetooth only (C-15) |

**So the pair that can talk today is the T-Deck Plus and the T-Watch S3, if they were bought for the same band.** The
Fire with its LoRa433 module is the third, once its switches are read; it would need the other two to be 433 boards.
Everything else meets over Bluetooth (C-15), and a LoRa board carries both, so a meeting is one meeting whichever
radio heard it.

**The band is a setting, not a detection**: nothing on an SX1262 board says which antenna match it was built with.
DEVICE, ITS SETTINGS, LORA BAND (433 by default, since most of the user's boards are 433; 868; 915) -- every board takes
the one setting, so they agree. **In Canada and the US the licence-free band is 902-928 MHz**; 433 MHz is amateur
(70 cm) and low-power only, 868 is Europe's. This firmware sends at 10 dBm, a frame a fifth of a second long, a beacon
every two minutes: a tenth of a percent of the air. The user chooses the band for their own boards.

## The routine: MESH

`MESH` is the name PLAN 10 held for LoRa (DRAFT, as every new word is). It appears on a board with a LoRa radio beside
FLARE, WHISPER and the rest, and holds two routines:

- **NEARBY** -- the daemons heard in the last ten minutes: each by the name its board sent, how loud (dBm), how long
  ago, and *passed on* when another board relayed it. The first row is EVERYONE NEARBY. Choose one (the dial, or the
  T-Deck's trackball) and press: **WAVE**, **SAY HELLO**, **SAY WELL MET**, **SAY COME FIND ME**, **SAY ALL IS WELL**,
  and on the T-Deck **TYPE A WORD** (up to forty letters; Enter sends). A wave or word that arrives flashes on the
  screen and sits along the bottom of the list for a moment. The top button (or the ball held) leaves.
- **CALL OUT** -- sends a CALL; every board that hears it beacons back a moment later, and the list fills for thirty
  seconds. The result names who answered.

Both are a daemon's routines: the board must be carrying one (the frame carries its species and name).

## The frame

One layout on every chip, 26 bytes and then the word:

```
'D' 'A'  kind  hops  FROM(4)  SPECIES(2)  ID(2)  TO(4)  NAME(10)  TEXT(0..40)
```

- **kind**: 1 BEACON (I am here), 2 WAVE, 3 SAY, 4 CALL (who is there?).
- **hops**: how many times it may still be passed on; sent as 2.
- **FROM**: the board's hourly tag -- **the same four random bytes its Bluetooth beacon carries** (meet.cpp), new every
  hour, so a board cannot be followed from one hour to the next and the server tells our own companions from strangers
  the one way it already does (`beacons.own`). A daemon heard on both radios in an hour is one meeting.
- **SPECIES, NAME**: the carried daemon's, as the game names it -- so a board can list who is near without a table of
  names, which it does not have. Nothing in a frame says who carries the board.
- **TO**: a tag, or 0 for everyone. A WAVE or SAY to another tag is passed on but not shown.
- **ID**: random, so a frame already handled (FROM + ID) is dropped however many boards repeat it.

**The radio**: 125 kHz, spreading factor 9, coding 4/5, preamble 12, CRC on, **sync word 0x12** (Meshtastic's is 0x2B:
the two networks never mix), 10 dBm. RadioLib 7.8.1, already in the build for the CC1101; the SX1262 with its TCXO at
1.8 V on DIO3 and DIO2 as the RF switch, as LilyGO's modules are wired. On the T-Deck the radio shares the screen's SPI
bus (the screen's DMA finishes first, as with the CC1101); on the watch it has a bus of its own.

## The mesh

A flood, the simplest one: a frame that arrives with hops left is sent on **once**, 300-1200 ms later, with one hop
fewer, unless this board has seen that FROM + ID already. Two hops at most, so a daemon two boards away is still
heard, and the server records *passed on by a board* or *by two boards* against the meeting. A board never relays its
own frames and never hears its own echoes. One frame waits to go out at a time; a second arriving while one waits is
not relayed (it will be beaconed again in two minutes anyway).

A CALL is answered with the board's own beacon 200-1500 ms later (and passed on, so a call reaches as far as a beacon).

## The server's half

- `POST /api/device/met` takes `how: "lora"` and `hops` (0-2) beside `species` and `peer`: counted once an hour per
  tag as before, never for one of ours; `/api/meetings` says `how` and `hops` for each. The USB bridge carries it as
  `MET species tag lora hops`.
- `POST /api/device/message` `{dir: in|out, kind: wave|say, species, peer, hops, text}` keeps every wave and word
  (an `msg` interaction; the text forty printable letters at most); `/api/meetings` returns the latest twenty as
  `messages`, each with the daemon's name and whether the tag is one of ours. The bridge: `SAID dir kind species tag
  hops text`. The DAEMON tab shows them under MET NEARBY as WAVES AND WORDS.
- The device settings carry `band` (433, 868, 915); a board that sees it change retunes at once.

## Trying it without a second daemon

Down the cable (`linkCompanion.sh`, then type at the bridge): `MESH?` (the radio's state, the band, this board's tag,
who is near), `MESH BEACON`, `MESH CALL`, `MESH WAVE [tag]`, `MESH SAY * hello` (or a tag in place of `*`). Two boards
on the same band, each carrying a daemon, should list each other in NEARBY within two minutes, and a `MESH SAY` on one
flashes on the other. `SHOT` draws the NEARBY screen.

## What is next (not decided -- for the user)

- **The daemons talking for themselves** (C-16): a word chosen by the daemon's own voice (brain.cpp, the LLM630) rather
  than a set phrase.
- **A connection that lasts**: a daemon met over LoRa remembered by name, with a count of waves exchanged -- today a
  tag changes every hour, on purpose.
- **The Fire's LoRa433 module** (the DIP switch table), and the Cardputer ADV's cap (C-78).
- **The T-Deck's GPS**: its clock set from the sky, or where a meeting happened (private by design: only on the user's
  own board).
- **Trading or battling** over LoRa stays on the back burner (PLAN 11).
