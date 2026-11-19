# DAEMONS on the Kode Dot (C-424)

An app for Kode's launcher, kodeOS, written in C on Kode's SDK: a daemon to carry, and its ROUTINES -- the Dot's radios
in the game's words. The plan, and why it is built this way, is `docs/KODEDOT.md`.

**This folder is GPL-3.0-or-later** (`LICENSE`, `NOTICE.md`), because the SDK it links is.

## What runs today

The ROUTINES menu: FLARE (IR), WHISPER (Bluetooth), TOUCHSTONE (NFC), LODESTONE (125 kHz) and UPLINK (Wi-Fi). The pad
moves, TOP opens or runs, BOTTOM goes back and, from the menu, home to kodeOS; a tap on a row does what TOP does. Each
move ticks the haptic and lights the LED in the type's colour.

LODESTONE has its first routine, **READ MY TAG**: five seconds listening for an EM4100 tag, then its ID on the glass.
The ID is shown there and nowhere else -- never logged, never kept.

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
| `main/idf_component.yml` | the SDK's version, the one pin |
| `scenarios/` | what `seer.sh review` plays in the simulator |
| `appdata/` | the launcher's colour, description and icon (a placeholder) |
