# The T-Embed CC1101: flashing and trying it

The companion's firmware for the **LilyGO T-Embed CC1101**. It shows the day's colour, note and virtue, the season,
**the one next step**, the daemon you carry, and its **ROUTINES** -- the board's radios, in the game's words.

**Controls:**

| | |
|---|---|
| **turn the encoder** | TODAY, DAEMON, ROUTINES -- or move the choice in a list |
| **press the encoder** | on TODAY, the step is done; on ROUTINES, open it; in a list, open or run what is chosen |
| **the side key** | back one step |

**ROUTINES** opens the routine types: **FLARE** (IR), **WHISPER** (Bluetooth), **TOUCHSTONE** (NFC), **LONGWAVE**
(Sub-GHz), **UPLINK** (Wi-Fi). Each is a test that the radio works, on your own gear (`CONTEXT.md`):

| type | routine | what it does |
|---|---|---|
| FLARE | LEARN MY REMOTE | point your TV's remote at the board, press POWER once; it remembers that code (across power-offs) |
| FLARE | SEND TO MY TV | sends the learned code from the board's IR end |
| FLARE | SONY TV POWER | a Sony TV's POWER (Sony's own protocol), no remote needed: the first brand of C-34 |
| WHISPER | OPEN TO MY PHONE | your phone connects ("DAEMONS companion", in nRF Connect or LightBlue); the board says hello, and a word you write back appears |
| TOUCHSTONE | READ MY TAG | hold a tag to the board: its kind (MIFARE Classic, NTAG) and its ID. Reads nothing else |
| LONGWAVE | -- | not wired yet: it is tried with the board in hand first |
| UPLINK | NETWORKS IN RANGE | the Wi-Fi networks around you, by strength. Joins nothing |

A routine that waits (for a remote, a tag, a phone) says so on the screen; **the side key gives up**. Every routine
you run is told to the server as tending your daemon (C-13).

## What you need

- **PlatformIO** (`pip install platformio`, or the VS Code extension). Its own Python also has `pyserial` for the
  USB bridge.
- **A USB-C cable that carries data**, not just power.
- **The companion running** on the computer: `./bindCompanion.sh` from the repo root, or `./bindCompanion.sh server`.

## Flash it

From the repo root:

```sh
./updateCompanion.sh          # or, from firmware/esp32/: pio run -t upload
```

The ESP32-S3 has its own USB, so it usually goes into download mode by itself. **If the upload cannot connect**:

1. hold the **BOOT** button (beside the USB port),
2. press and release **RST**,
3. let go of BOOT, and run the upload again,
4. then press **RST** once more to start the new firmware.

## Try it over the cable (no Wi-Fi)

With the device plugged in, from the repo root (it starts the server too, if none is running):

```sh
./linkCompanion.sh            # or, from firmware/esp32/: ~/.platformio/penv/bin/python usb_bridge.py
```

The bridge finds the device's port and hands it the server's state every five seconds; the corner of the screen says
**USB**. Press the encoder and the bridge ticks the step off on the server; the screen moves to the next step.

## Or over Wi-Fi

1. Copy `include/secrets.example.h` to `include/secrets.h`, and fill in your network's name and password and the
   computer's address on your network. **`secrets.h` is never committed** (it is in `.gitignore`).
2. Let the server listen on your network: in `server/config.json`, `"host": "0.0.0.0"`. Nothing secret goes over
   it, but it is reachable by anything on that network while it runs.
3. `pio run -t upload` again. The corner says **WIFI** once it has joined, and the device asks the server itself
   every 30 seconds.

## Watch it

```sh
pio device monitor
```

It prints `HELLO daemons-companion t-embed-cc1101 1` every few seconds, and `TICK <id>` when the encoder is pressed
over USB.

## Putting the factory firmware back

The development machine keeps a copy of the board's flash from before the companion was first written to it. To put
it back:

```sh
~/.platformio/penv/bin/python ~/.platformio/packages/tool-esptoolpy/esptool.py --port <port> write_flash 0 <backup.bin>
```

LilyGO also publishes its factory firmware in
[Xinyuan-LilyGO/T-Embed-CC1101](https://github.com/Xinyuan-LilyGO/T-Embed-CC1101) (`firmware/`).

## Where the pins come from

From LilyGO's own repository, not from memory: `examples/utilities.h` (the encoder on 4 and 5 with its key on 0, the
peripherals' power on 15) and its TFT_eSPI `Setup214_LilyGo_T_Embed_PN532.h` (the ST7789 on CS 41, DC 16, MOSI 9,
SCLK 11, backlight 21, colours inverted). They are set in `platformio.ini`.
