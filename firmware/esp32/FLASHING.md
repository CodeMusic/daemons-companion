# The handhelds: flashing and trying them

The companion's firmware for the **LilyGO T-Embed CC1101, T-Embed and T-Embed SI4732** (one build, `env:t-embed`: each
board knows which it is at start) and the **T-Watch S3** (its own build, `env:t-watch-s3`). It shows the day -- its
theme, virtue over vice, chakra and note -- the season, **the one next step**, the daemon you carry, and its
**ROUTINES**: the board's radios in the game's words, and your party's own routines from the game.

**Controls:**

| | the CC1101 | the plain T-Embed, the SI4732 | the T-Watch S3 | the T-Deck (C-104) |
|---|---|---|---|---|
| choose | turn the dial | turn the dial | swipe | roll the trackball |
| open, confirm | press the dial (acts when let go) | tap the dial | tap | click the ball, or Enter |
| back | the top button | hold the dial half a second | hold, or the crown | hold the ball half a second, or Backspace |
| **talk** | **hold the dial** half a second at home | **hold the dial** at home (just after ticking a step, the hold undoes it instead) | **hold TALK** on the face | **hold the ball** at home |
| sleep | hold the top button, press the dial | hold the dial two seconds | hold the crown | hold the ball two seconds |
| wake | **the top button only** | hold the dial | the crown | hold the ball, or any key |

**The T-Display-S3 Pro** (C-105, `env:t-display-pro`) is a touch screen first: swipe to choose, tap to open, hold to go
back, and its home key under the glass goes home. Its three buttons do the same (as the M5GO's A, B and C): the left one
(BOOT) turns back and held goes back, the lower right presses, the upper right turns on and held two seconds sleeps;
asleep, only the lower right held wakes it. It has no microphone or speaker. The first flash needs its download mode:
hold BOOT, press and release RESET, let go of BOOT.

On the T-Deck the keyboard types a Wi-Fi password straight in (Enter joins), and a word to a daemon nearby in MESH / NEARBY.

The pages: TODAY (press: the step is done; back undoes it for fifteen seconds), DAEMON (press: CARE, and its INDEX
entry, read aloud on a press), ROUTINES and the DAY; the watch's face comes first.

**ROUTINES** opens the routine types this board has: **FLARE** (IR), **WHISPER** (Bluetooth), **TOUCHSTONE** (NFC),
**LONGWAVE** (Sub-GHz), **PARTY** (the game), **UPLINK** (Wi-Fi). A board with no radios of its own opens the party
first, with its Bluetooth and Wi-Fi a row below. Each radio routine is a test that the radio works, on your own gear
(`CONTEXT.md`):

| type | routine | what it does |
|---|---|---|
| FLARE | TEACH A REMOTE | your daemon learns a remote: press POWER, VOLUME UP, VOLUME DOWN on it in turn; kept, and chosen |
| FLARE | POWER, VOLUME UP, VOLUME DOWN | sends that button from the remote in use |
| FLARE | THEATER MODE | the routine the site cannot send: run on the board itself |
| FLARE | WHAT REMOTE IS THIS | point any of your remotes at it and press: each press named -- its protocol (for most, the maker), bits and code. Listening only, for a minute |
| FLARE | CHOOSE A REMOTE | which of the remotes it knows (up to six) FLARE uses; the site can add one by brand |
| WHISPER | PAIR MY PHONE, OPEN TO MY PHONE, FORGET MY PHONES | the phone app's link over Bluetooth (C-55) |
| TOUCHSTONE | READ MY TAG | hold a tag to the board: its kind (MIFARE Classic, NTAG) and its ID. Reads nothing else |
| LONGWAVE | WHAT'S ON THE AIR | listens (never sends) at 315, 433.92, 868.35 and 915 MHz -- weather stations, doorbells, meters: each band's level against its learnt quiet, and the bursts counted, for 90 seconds |
| LONGWAVE | FIND IT | a hot-and-cold finder for one of your own transmitters: turn to choose its band, then walk -- the level, warmer or colder, and ticks that quicken as it gets louder |
| MESH | NEARBY | the daemons heard over LoRa in the last ten minutes -- name, how loud, how long ago, passed on or not; choose one (or EVERYONE) and send a WAVE, one of four words, or on the T-Deck a word you type. What arrives shows along the bottom (C-72, DRAFT) |
| MESH | CALL OUT | asks who is there; every board that hears it answers, and the list fills for thirty seconds (C-72, DRAFT) |
| PARTY | your party, then a daemon's routines | the game's own routines, in their streak colours: one used plays its phrase, the ring lit its colour (C-68) |
| UPLINK | NETWORKS IN RANGE | the Wi-Fi networks it hears, those it knows marked * |
| UPLINK | TEACH A NETWORK | your daemon learns a network: choose one, spell its password on the wheel; it joins any it knows when near |
| UPLINK | WI-FI MOTION | the first radio experiment (C-70): five seconds learning the still room from the access point's channel state, then movement as a multiple of it, for 45 seconds. It senses movement near the line to the access point, not who moved |

The radio routines are the carried daemon's: they need one on the board, and speak in its name. The party's do not.

A routine that waits (for a remote, a tag, a phone) says so on the screen; **the top button gives up**. Every routine
you run is told to the server as tending your daemon (C-13).

## What you need

- **PlatformIO** (`pip install platformio`, or the VS Code extension). Its own Python also has `pyserial` for the
  USB bridge.
- **A USB-C cable that carries data**, not just power.
- **The companion running** on the computer: `./bindCompanion.sh` from the repo root, or `./bindCompanion.sh server`.

## Flash it

From the repo root:

```sh
./updateCompanion.sh                        # asks each board what it is, and flashes the right build
./updateCompanion.sh --board t-watch-s3     # a board with no companion firmware yet says nothing: say what it is
```

By hand, from `firmware/esp32/`: `pio run -e t-embed -t upload` or `pio run -e t-watch-s3 -t upload`.

**After an upload the board can stay in its bootloader and look dead** -- the screen dark, nothing on the cable. The
S3's own USB cannot always restart it, and its battery keeps it powered when unplugged, so unplugging does not either:
**press RST once.** The script waits for the board's HELLO and says so if it does not come.

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
3. `pio run -e t-embed -t upload` again. The corner says **WIFI** once it has joined, and the device asks the server itself
   every 30 seconds.

## See its screen on the computer

With the bridge stopped (it holds the port), from `firmware/esp32/`:

```sh
python3 shot.py screen.png
```

The board answers `SHOT` with its screen buffer, and `shot.py` saves it as a PNG. `GO TODAY`, `GO DAEMON`, `GO INDEX`,
`GO ROUTINES`, `GO DAY` and `GO PARTY` sent down the cable turn to a page first, and `KEY RIGHT`, `KEY LEFT`, `KEY PRESS` and `KEY BACK` work
the controls -- so every screen can be reached and checked without touching the board.

## Watch it

```sh
pio device monitor
```

At start it says each step as it takes it (`boot: start`, `boot: board t-embed-cc1101`, `boot: display` ... `boot:
ready`), so a board that stops part-way says where. Then it prints `HELLO daemons-companion <board> 3` (the board:
t-embed-cc1101, t-embed, t-embed-si4732 or t-watch-s3) every three seconds, and `TICK <id>` when a step is ticked over USB.

## Putting the factory firmware back

The development machine keeps a copy of the board's flash from before the companion was first written to it. To put
it back:

```sh
~/.platformio/penv/bin/python ~/.platformio/packages/tool-esptoolpy/esptool.py --port <port> write_flash 0 <backup.bin>
```

LilyGO also publishes its factory firmware in
[Xinyuan-LilyGO/T-Embed-CC1101](https://github.com/Xinyuan-LilyGO/T-Embed-CC1101) (`firmware/`).

## Where the pins come from

From LilyGO's own repositories and schematics, not from memory: `src/board.cpp` sets each board's pins at start, and
[`docs/HARDWARE.md`](../../docs/HARDWARE.md) has the table and the sources. The screen is LovyanGFX, configured from
`board` at run time (`src/display.cpp`), which is what lets one build drive three T-Embeds.
