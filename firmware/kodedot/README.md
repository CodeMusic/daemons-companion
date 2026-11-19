# DAEMONS on the Kode Dot (C-424)

An app for Kode's launcher, kodeOS, written in C on Kode's SDK: a daemon to carry, and its ROUTINES -- the Dot's radios
in the game's words. The plan, and why it is built this way, is `docs/KODEDOT.md`.

**This folder is GPL-3.0-or-later** (`LICENSE`, `NOTICE.md`), because the SDK it links is.

## What runs today

**The den** (C-426), where the app opens: the Dot's daemon, drawn from the companion, with the day, its care and the
next step, and DRINK, FEED, TRAIN and SLEEP (WAKE while it sleeps) under it. A care is drawn at once and kept until the
companion takes it, so going home to kodeOS (a reset) loses none. The Dot asks the companion again every 30 seconds.

The Dot finds the companion at the address it is given once, over its cable, at its console (`idf.py -p PORT
monitor`, or kode-sim's terminal):

```
function name="server" arg="http://HOST:4730"
```

It is kept in kodeOS's settings. At home the Dot needs no key: it is a board on the companion's device door, by its
name, `kode-dot-` and the end of its MAC.

**The ROUTINES menu**, the row under the cares: FLARE (IR), WHISPER (Bluetooth), TOUCHSTONE (NFC), LODESTONE (125 kHz) and UPLINK (Wi-Fi). The pad
moves, TOP opens or runs, BOTTOM goes back and, from the den, home to kodeOS; a tap on a row does what TOP does. Each
move ticks the haptic and lights the LED in the type's colour.

LODESTONE has its first routine, **READ MY TAG**: five seconds listening for an EM4100 tag, then its ID on the glass.
The ID is shown there and nowhere else -- never logged, never kept.

## Checking it in the simulator

```sh
./seer.sh review                       # scenarios/menu.json: ROUTINES, LODESTONE, READ MY TAG, and back
./scratch_companion.sh                 # a fresh scratch companion on roverbyteseer: a synthetic save, port 4799
./seer.sh review scenarios/den.json    # the den against it: the picture, FEED, SLEEP
```

Never point the simulator at the real companion: a care given there is given to the real daemon.

## Building

The toolchain (ESP-IDF v6.1, Rust, kode-sim) lives on roverbyteseer; `seer.sh` copies this folder there and works on it.

```sh
./seer.sh build     # the image for the board: build/daemons.bin
./seer.sh review    # kode-sim: boots kodeOS, installs the app, plays scenarios/menu.json; verdict in review/
./seer.sh run       # the Dot in a browser on this computer, http://127.0.0.1:8765
```

## Installing on the Dot

Over the USB cable, with `kcli.py` from a clone of KodeOS:

```sh
python path/to/KodeOS/tools/kcli.py -p PORT install build/daemons.bin
```

It appears in Apps. From an app that does not start, BOTTOM + LEFT held about a second resets the Dot into kodeOS.

## Where things are

| File | What it is |
|---|---|
| `main/app_main.c` | the launcher's name for the app, and its start |
| `main/daemons_ao.c` | the one Active Object: the screen, the buttons, the routines it runs |
| `main/routines.c` | the routine types and their routines, as data |
| `main/companion.c` | the companion's answers read, and the worker's job that asks for them |
| `main/den.c` | the den on the glass |
| `main/idf_component.yml` | the SDK's version, the one pin |
| `scenarios/` | what `seer.sh review` plays in the simulator; `scratch_companion.sh` is what the den's plays against |
| `appdata/` | the launcher's colour, description and icon (a placeholder) |
