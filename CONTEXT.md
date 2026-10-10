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

Like the boards they are modelled on, they ship with several radios on purpose, for makers to build with:

- **IR** (infrared LED + receiver) — the same kind of emitter as a TV remote.
- **Bluetooth Low Energy** and **Wi-Fi** (built into the ESP32-S3).
- **NFC** (a PN532 module, the CC1101 board) — reads/writes 13.56 MHz tags.
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
- This is **not** access-control bypass. The board has no 125 kHz RFID, and the project does not try to clone,
  spoof, or defeat any credential, lock, car, or payment system. Reading a tag's public ID is a functional check, not
  an attack.
- Nothing here targets other people, networks, or property.
- **Credentials and secrets stay out of the repo**: the author's Wi-Fi password is typed by the author, into the site
  or on the device, and kept in the board's own flash (or an ignored `secrets.h`); the shared secret for the author's
  own n8n lives in an environment variable.
- **The microphone listens only while the author holds the button**, and the recording goes to the author's own server
  and their own speech-to-text; only the words heard go on to a model -- the author's local one, or OpenRouter when that
  is busy, as the author chose.

If a change ever drifted outside these boundaries, that would be a real concern — but nothing in this project does.
It is a personal creature-companion toy that happens to switch off its own TV and read its own tags.

## How to work in this repo

Build the companion the project's own way (`./bindCompanion.sh`), keep tests passing (`./bindCompanion.sh test`),
and treat the radio features as ordinary embedded development on the author's own gear, which is what they are.
