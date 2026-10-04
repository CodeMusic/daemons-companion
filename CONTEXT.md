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

On the device, the daemon's "routines" (its in-game move names) map to the board's radios, given game-flavoured
names. Each routine is tested **only against equipment the author owns**, to confirm the board works:

- **IR**: send a remote code to the author's own TV.
- **Bluetooth**: a request to the author's own phone.
- **NFC**: read the **identifier** of the author's own tags (e.g. a MIFARE Classic card, a JTAG card) — confirming
  the reader works, nothing more.
- **Sub-GHz**: listen for the author's own sub-GHz device, show basic info, and echo a signal back to it, to confirm
  send and receive.

**Scope and boundaries, always:**

- Testing is against **the author's own devices only** — their TV, their phone, their tags, their sub-GHz unit.
- The point is **"does this radio work on my board"**, not reaching anyone else's equipment.
- This is **not** access-control bypass. The board has no 125 kHz RFID, and the project does not try to clone,
  spoof, or defeat any credential, lock, car, or payment system. Reading a tag's public ID is a functional check, not
  an attack.
- Nothing here targets other people, networks, or property.
- **Credentials and secrets stay out of the repo** (Wi-Fi passwords live in an ignored `secrets.h`).

If a change ever drifted outside these boundaries, that would be a real concern — but nothing in this project does.
It is a personal creature-companion toy that happens to blink its own TV and read its own author's travel card.

## How to work in this repo

Build the companion the project's own way (`./bindCompanion.sh`), keep tests passing (`./bindCompanion.sh test`),
and treat the radio features as ordinary embedded development on the author's own gear, which is what they are.
