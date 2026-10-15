# Flashing and linking

Two scripts put the companion on a board and link it to the server, both over the board's USB cable. **Only boards
need them.** The phone app and its widget never need a cable or `linkCompanion.sh`: they reach the companion over
your Wi-Fi, or through the relay away ([Host on your phone](Host-on-your-phone)).

## What you need

- **[PlatformIO](https://platformio.org)** (`pip install platformio`, or the VS Code extension). Its own Python also
  has `pyserial`, which both scripts use.
- **A USB-C cable that carries data**, not just power.
- **The companion running** -- `./bindCompanion.sh`, or `./bindCompanion.sh server`
  ([Running the companion](Running-the-companion)). `linkCompanion.sh` starts the server itself if none is answering.

## Flash: `updateCompanion.sh`

```sh
./updateCompanion.sh          # every board plugged in: asks each what it is, and flashes the right build
```

Every board running the companion says `HELLO daemons-companion <board> <version>` every three seconds, so the script
asks each port what it is and flashes its build. A running bridge holds a board's port, so it is stopped first.

| command | what it does |
|---|---|
| `./updateCompanion.sh` | asks each board on USB for its HELLO and flashes its build; with several plugged in it asks which (numbers, or `a` for all) |
| `./updateCompanion.sh --all` | every board found, without asking |
| `./updateCompanion.sh --board NAME` | say what it is, for a board with no companion firmware on it yet (it says nothing, so the script would ask) |
| `./updateCompanion.sh --port PORT` | only that one |
| `./updateCompanion.sh --link` | flash, then link |
| `./updateCompanion.sh --build` | only build every board's firmware, to check it compiles (no board needed) |
| `./updateCompanion.sh --help` | the list above |

The names `--board` takes:

| `--board` | for |
|---|---|
| `t-embed` | the T-Embed CC1101, the plain T-Embed and the T-Embed SI4732 (one build) |
| `t-watch-s3` | the T-Watch S3 |
| `t-deck` | the T-Deck and T-Deck Plus |
| `t-display-pro` | the T-Display-S3 Pro |
| `m5-sticks3` | the M5StickS3 |
| `m5-cores3` | the M5Stack CoreS3 |
| `m5-core` | the M5GO and the M5Stack Fire (one build) |
| `m5-dial` | the M5Stack Dial |
| `m5-tab5` | the M5Stack Tab5 (its own project, `firmware/tab5/`, with its own PlatformIO: `firmware/tab5/pio.sh`) |

By hand, from `firmware/esp32/`: `pio run -e t-embed -t upload` (or any build's name).

## Link: `linkCompanion.sh`

```sh
./linkCompanion.sh            # the bridge, in this terminal
./linkCompanion.sh --port PORT
```

The bridge finds the board's port, hands it the server's state every five seconds, and passes back what you do on it
-- steps ticked, routines run. The corner of the board's screen says **USB**. If no server is answering, it starts one
in the background (`.logs/server.log`) and Ctrl-C stops both; a server that was already running is used and left
running. For the site as well, run `./bindCompanion.sh` first in another terminal.

**Link each board by cable at least once.** That is when the server gives it a key of its own, the shared networks
and the relay's address -- what it needs to reach the companion over Wi-Fi at home and through the relay away
([Away from home](Away-from-home)). Forgetting a board on the DEVICE tab stops its key.

## Recovery

- **A board looks dead after flashing** -- screen dark, nothing on the cable. It is waiting in its bootloader: the
  ESP32-S3's own USB cannot always restart it, and its battery keeps it powered when unplugged. **Press RST once.**
  The script waits for the board's HELLO and says so if it does not come.
- **An upload cannot connect at all**: hold **BOOT**, press and release **RST**, let go of BOOT, and run it again;
  then press RST once more to start the new firmware.
- **The T-Deck, the first time**: its factory firmware ignores the reset, so hold its trackball while plugging it in.
- **The T-Display-S3 Pro, the first time**: hold BOOT, press RESET, let go of BOOT.
- **The M5GO and Fire** come up as a USB-serial port (`usbserial` or `wchusbserial`); the scripts find those too.
- **The M5Stack Dial is flashed in short pieces** (`firmware/esp32/flash_chunked.py`, which the script uses for it):
  while it is being flashed nothing holds its power on, and a Dial can switch itself off partway through.
- **The Tab5's toolchain is large**: its first install unpacks about 7 GB, trimmed to about 3.4 GB after each run.

## Checks down the cable

With the bridge stopped (it holds the port), from `firmware/esp32/`:

```sh
python3 shot.py screen.png    # the board's screen, saved as a PNG
python3 check_keys.py keys.png   # the three buttons (M5GO, Fire, T-Display-S3 Pro): held, let go, and heard at home
pio device monitor            # watch it start: boot: start ... boot: ready, then HELLO every three seconds
```

Commands sent down the cable: `GO TODAY`, `GO DAEMON`, `GO INDEX`, `GO ROUTINES`, `GO DAY`, `GO PARTY` turn to a
page; `KEY RIGHT`, `KEY LEFT`, `KEY PRESS`, `KEY BACK` work the controls -- and on the three-button boards
`KEY DOWN A` and `KEY UP A` (or B, C) hold and let go a button as a finger does, `KEY CANCEL` forgetting one held; `RUN <type> <n>` starts a routine; `MEM`
reports the memory; `WATCH` the touch and clock; `EARTEST` what the microphones hear.

[firmware/esp32/FLASHING.md](https://github.com/CodeMusic/daemons-companion/blob/main/firmware/esp32/FLASHING.md) has
the rest: Wi-Fi set at build time instead of the cable, and putting the factory firmware back.
