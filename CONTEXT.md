# Project context (read this first)

This file states what **daemons-companion** is and who it is for, so the nature of the work is never ambiguous.
Everything here is ordinary personal, hobbyist, and educational maker development.

## What this is

A **goal companion**: a small gadget and app that carries a creature ("daemon") from the author's own game of
[DAEMONS](https://github.com/CodeMusic/DAEMONS), helps the author get things done, and — on the handheld — exercises
the radios that the handheld hardware ships with. It is the author's personal project, successor to their own
RoverRadio and RoverCub. One person, running on their own machine and their own devices. No service, no accounts, no
third parties.

## The hardware is a general-purpose maker board the author owns

The handheld is a **LilyGO T-Embed CC1101** — an off-the-shelf ESP32-S3 development board the author bought and holds.
Like the boards it is modelled on, it ships with several radios on purpose, for makers to build with:

- **IR** (infrared LED + receiver) — the same kind of emitter as a TV remote.
- **Bluetooth Low Energy** (built into the ESP32-S3).
- **NFC** (a PN532 module) — reads/writes 13.56 MHz tags.
- **Sub-GHz** (a CC1101) — short-range ISM-band transceiver.
- **Wi-Fi** (built in).

These are standard components documented by the vendor, with example firmware published by the vendor. Driving them
is the normal, intended use of the board.

## What the "ROUTINES" feature does, and its boundaries

On the device, ROUTINES are the board's radios, grouped by **routine type** with names from the game (the author
chose them, 2026-10-04): **FLARE** (IR), **WHISPER** (Bluetooth), **TOUCHSTONE** (NFC), **LONGWAVE** (sub-GHz),
**UPLINK** (Wi-Fi). Each starts with one test routine, run **only against equipment the author owns**, to confirm
the board works:

- **FLARE (IR)**: send a power code to the author's own TV.
- **WHISPER (Bluetooth)**: offer a connection the author's own phone can open, and pass a message each way.
- **TOUCHSTONE (NFC)**: read the **identifier** and type of the author's own tags (a MIFARE Classic card, an NTAG card
  or sticker) — confirming the reader works, nothing more.
- **LONGWAVE (sub-GHz)**: listen for the author's own sub-GHz device, show what was heard, and, on a press, send that
  one signal back once — to confirm both receive and send.
- **UPLINK (Wi-Fi)**: list the networks in range.

**Scope and boundaries, always:**

- Testing is against **the author's own devices only** — their TV, their phone, their tags, their sub-GHz unit.
- The point is **"does this radio work on my board"**, not reaching anyone else's equipment.
- This is **not** access-control bypass. The board has no 125 kHz RFID, and the project does not try to clone,
  spoof, or defeat any credential, lock, car, or payment system. Reading a tag's public ID is a functional check, not
  an attack.
- Nothing here targets other people, networks, or property.
- **Credentials and secrets stay out of the repo** (Wi-Fi passwords live in an ignored `secrets.h`).

If a change ever drifted outside these boundaries, that would be a real concern — but nothing in this project does.
It is a personal creature-companion toy that happens to switch off its own TV and read its own tags.

## How to work in this repo

Build the companion the project's own way (`./bindCompanion.sh`), keep tests passing (`./bindCompanion.sh test`),
and treat the radio features as ordinary embedded development on the author's own gear, which is what they are.
