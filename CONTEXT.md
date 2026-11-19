# Project context (read this first)

This file states what **daemons-companion** is and who it is for, so the nature of the work is never ambiguous.
Everything here is ordinary personal, hobbyist, and educational maker development.

## What this is

A **goal companion**: small gadgets and an app that carry a creature ("daemon") from the author's own game of
[DAEMONS](https://github.com/CodeMusic/DAEMONS), help the author get things done, talk with them in the daemon's
voice, and — on the handhelds — exercise the radios that the handheld hardware ships with. It is the author's personal project, successor to their own
RoverRadio and RoverCub. One person, running on their own machine and their own devices. No service, no accounts, no
third parties.

## The hardware is general-purpose maker boards the author owns

The handhelds are off-the-shelf ESP32-S3 development boards the author bought and holds, each running one firmware
(`firmware/esp32/`; pins and sources in `docs/HARDWARE.md`):

- **LilyGO T-Embed CC1101** — the first, and the one with the most radios.
- **LilyGO T-Embed** (plain) and **T-Embed SI4732** — the same shape; the SI4732 adds an AM/FM broadcast receiver.
- **LilyGO T-Watch S3** — a watch, with a touch screen and a LoRa radio.
- **LilyGO T-Deck Plus** — a hand-sized board with a keyboard, a trackball, a LoRa radio and a GPS.
- and **the author's phone**, running the companion's app; M5Stack boards and an LLM630 (an on-device model) are
  planned (`TODO.md`).
- **The Kode Dot** (C-424, arriving December 2026) — Kode's pocket maker device, an ESP32-P4 with an ESP32-C5 radio,
  sold with NFC, a 125 kHz reader and IR for makers to build with. The companion runs on it as an app in Kode's own
  launcher, on Kode's published SDK (`firmware/kodedot/`, `docs/KODEDOT.md`).

Like the boards they are modelled on, they ship with several radios on purpose, for makers to build with:

- **IR** (infrared LED + receiver) — the same kind of emitter as a TV remote.
- **Bluetooth Low Energy** and **Wi-Fi** (built into the ESP32-S3).
- **NFC** (a PN532 module, the CC1101 board; an ST25R3916B, the Kode Dot) — reads/writes 13.56 MHz tags.
- **125 kHz RFID** (the Kode Dot only) — the low-frequency tags of key fobs and cards; Kode's SDK reads an EM4100 tag's
  ID, writes one to a T5577 blank, and plays one back.
- **Sub-GHz** (a CC1101) — short-range ISM-band transceiver.
- **AM/FM** (an SI4732, receive only) — broadcast radio.
- **LoRa** (an SX1262, the watch and the T-Deck) — long-range, low-rate messages between the author's own devices: a
  beacon, a wave, a word of forty letters, each passed on at most twice. Our own sync word, so it never joins or
  disturbs anyone else's LoRa network (Meshtastic's is different), and a tenth of a percent of the air.
- **A microphone and a speaker**, for push to talk.

These are standard components documented by the vendor, with example firmware published by the vendor. Driving them
is the normal, intended use of the board.

## What the "ROUTINES" feature does, and its boundaries

On the device, ROUTINES are the board's radios, grouped by **routine type** with names from the game (the author
chose them, 2026-10-04): **FLARE** (IR), **WHISPER** (Bluetooth), **TOUCHSTONE** (NFC), **LONGWAVE** (sub-GHz),
**UPLINK** (Wi-Fi). Each starts with one test routine, run **only against equipment the author owns**, to confirm
the board works:

- **FLARE (IR)**: learn the power button from the author's own TV remote, then send that one code to their TV. With
  the remote lost, the author picks their TV's brand on the site and steps through that brand's POWER codes one
  click at a time until their own TV answers -- the setup every universal remote has -- and keeps the one that works.
- **WHISPER (Bluetooth)**: offer a connection the author's own phone can open, and pass a message each way.
- **TOUCHSTONE (NFC)**: read the **identifier** and type of the author's own tags (a MIFARE Classic card, an NTAG card
  or sticker) — confirming the reader works, nothing more.
- **LODESTONE (125 kHz)**, the Kode Dot only (the author chose it, 2026-11-19; C-425): the author carries **their own**
  125 kHz fobs on one device. READ MY TAG shows a tag's ID; KEEP A TAG keeps it on the Dot under a name; MY TAGS has
  the Dot play a kept tag to the author's own reader, as the fob would; COPY TO A BLANK writes it to a blank T5577
  card the author owns, where the Dot cannot play it.
- **LONGWAVE (sub-GHz)**: listen for the author's own sub-GHz device, show what was heard, and, on a press, send that
  one signal back once — to confirm both receive and send.
- **UPLINK (Wi-Fi)**: list the networks in range, and learn the author's own network. **WI-FI MOTION**, the first
  of the radio experiments (C-70), watches the channel state of the author's own access point, on the author's own
  network at home, for movement in the room — the same Wi-Fi sensing published in research and shipped in home
  routers. It sees that something moved, never who.
- **PARTY (the game)**: the author's own party from their save, and each daemon's routines as the game names them --
  a sound and a light, no radio at all.

The radio experiments still to come (`TODO.md` C-70: a lightning detector, a static synthesizer, and others) are
**receive only** and listen to what is already in the air.

**Scope and boundaries, always:**

- Testing is against **the author's own devices only** — their TV, their phone, their tags, their sub-GHz unit.
- The point is **"does this radio work on my board"**, not reaching anyone else's equipment.
- This is **not** access-control bypass. The project does not try to defeat any credential, lock, car, or payment
  system. Reading a tag's public ID is a functional check, not an attack.
- **LODESTONE carries the author's own fobs, and nothing else** (the author's decision, 2026-11-19): it reads, keeps and
  plays only tags the author owns, to readers the author is allowed through, as the fob itself would. It never reads
  a tag that is not the author's, never guesses, steps through or replays IDs at a reader, and never touches an
  encrypted or secure credential (an EM4100-type tag holds a plain number and nothing else). **A kept tag never leaves
  the Dot**: not to the hub, the phone, the save, a log, or this repository; deleting it on the Dot is the end of it.
- Nothing here targets other people, networks, or property.
- **Credentials and secrets stay out of the repo**: the author's Wi-Fi password is typed by the author, into the site
  or on the device, and kept in the board's own flash (or an ignored `secrets.h`); the shared secret for the author's
  own n8n lives in an environment variable.
- **The microphone listens only while the author holds the button**, and the recording goes to the author's own server
  and their own speech-to-text; only the words heard go on to a model -- the author's local one, or OpenRouter when that
  is busy, as the author chose.

If a change ever drifted outside these boundaries, that would be a real concern — but nothing in this project does.
It is a personal creature-companion toy that happens to switch off its own TV, read its own tags, and open its own door.

## How to work in this repo

Build the companion the project's own way (`./bindCompanion.sh`), keep tests passing (`./bindCompanion.sh test`),
and treat the radio features as ordinary embedded development on the author's own gear, which is what they are.
