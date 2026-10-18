# Flashing and linking

Two scripts put the companion on a board and link it to the server, both over the board's USB cable. **Only boards
need them.** The phone app and its widget never need a cable or `linkCompanion.sh`: they reach the companion over
your Wi-Fi, or through the relay away ([Host on your phone](Host-on-your-phone)). The ESP32-S3-BOX-3 has a script of
its own ([below](#the-box-3-firmwarebox3box3sh)).

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
| `t-display-amoled` | the T-Display-S3 AMOLED 1.91 |
| `m5-sticks3` | the M5StickS3 |
| `m5-stickc-plus` | the M5StickC-Plus 1.1 |
| `m5-cardputer` | the M5Stack Cardputer and Cardputer ADV (one build) |
| `m5-cores3` | the M5Stack CoreS3 |
| `m5-core` | the M5GO and the M5Stack Fire (one build) |
| `m5-dial` | the M5Stack Dial |
| `m5-tab5` | the M5Stack Tab5 (its own project, `firmware/tab5/`, with its own PlatformIO: `firmware/tab5/pio.sh`) |

By hand, from `firmware/esp32/`: `pio run -e t-embed -t upload` (or any build's name). Asked what a silent board is,
the script lists them one line a board, under LilyGO and M5Stack.

**Say what a silent board is only when you are sure.** A board that says no HELLO may be one this firmware is not for,
and the wrong build flashed over it replaces what it had. The **ESP32-S3-BOX-3** runs ESPHome and never says HELLO:
skip it here (any answer that is not a number skips a board) and use its own script.

## Link: `linkCompanion.sh`

```sh
./linkCompanion.sh            # the bridge, in this terminal
./linkCompanion.sh --port PORT
```

The bridge finds the board's port, hands it the server's state every five seconds, and passes back what you do on it
-- steps ticked, routines run, broadcasts sent and heard, the CASINO's results. The corner of the board's screen says
**USB**. If no server is answering, it starts one in the background (`.logs/server.log`) and Ctrl-C stops both; a
server that was already running is used and left running. For the site as well, run `./bindCompanion.sh` first in
another terminal.

**Link each board by cable at least once.** That is when the server gives it a key of its own, the shared networks
and the relay's address -- what it needs to reach the companion over Wi-Fi at home and through the relay away
([Away from home](Away-from-home)). A board that has lost the companion's address (the computer moved to a new one)
is handed the current one the next time it is linked. Forgetting a board on the DEVICE tab stops its key.

## The BOX-3: `firmware/box3/box3.sh`

The ESP32-S3-BOX-3 runs **ESPHome**, not the companion's firmware, so it has its own script, its own ESPHome (in
`~/.esphome-venv`) and its own toolchain (about 2 GB the first time; the script wants 4 GB free):

```sh
cp firmware/box3/box3.example.yaml firmware/box3/box3.yaml   # once: set companion_url in it
firmware/box3/box3.sh run                     # build and flash -- over Wi-Fi if the box is on the network, else it asks
firmware/box3/box3.sh run --device PORT       # down the cable
firmware/box3/box3.sh logs                    # its log
```

`box3.yaml` is never committed. A box already on your Wi-Fi keeps it, so no Wi-Fi goes in the file. More on
[Home Assistant and the BOX-3](Home-Assistant-and-the-BOX-3).

## Recovery

- **A board looks dead after flashing** -- screen dark, nothing on the cable. It is waiting in its bootloader: the
  ESP32-S3's own USB cannot always restart it, and its battery keeps it powered when unplugged. **Press RST once.**
  The script waits for the board's HELLO and says so if it does not come.
- **An upload cannot connect at all**: hold **BOOT**, press and release **RST**, let go of BOOT, and run it again;
  then press RST once more to start the new firmware.
- **The T-Deck, the first time**: its factory firmware ignores the reset, so hold its trackball while plugging it in.
- **The T-Display-S3 Pro, the first time**: hold BOOT, press RESET, let go of BOOT.
- **The M5GO and Fire** come up as a USB-serial port (`usbserial` or `wchusbserial`); the scripts find those too.
- **The M5StickC-Plus** is a USB-serial port too, and its chip holds only 115200 baud, so its upload takes about a
  minute and a half. **With the Thermal HAT on, a reset can leave it in its download mode** -- a black screen, because
  the HAT holds a line the chip reads as it starts. Hold the power button six seconds, then press it; or, with the
  bridge stopped, `python3 firmware/esp32/hatfree.py`.
- **The M5Stack Dial is flashed in short pieces** (`firmware/esp32/flash_chunked.py`, which the script uses for it):
  while it is being flashed nothing holds its power on, and a Dial can switch itself off partway through.
- **The Tab5's toolchain is large**: its first install unpacks about 7 GB, trimmed to about 3.4 GB after each run.

## Checks down the cable

With the bridge stopped (it holds the port), from `firmware/esp32/`:

```sh
python3 shot.py screen.png    # the board's screen, saved as a PNG
python3 check_keys.py keys.png   # the three buttons (M5GO, Fire, T-Display-S3 Pro): held, let go, and heard at home
python3 bench.py bench/       # every board on the cable: at rest, its buttons, its daemon in five expressions -- a sheet each
python3 hatfree.py            # a StickC-Plus held in its download mode by its HAT, started again
pio device monitor            # watch it start: boot: start ... boot: ready, then HELLO every three seconds
```

Commands sent down the cable: `GO TODAY`, `GO DAEMON`, `GO INDEX`, `GO ROUTINES`, `GO DAY`, `GO PARTY` turn to a
page; `KEY RIGHT`, `KEY LEFT`, `KEY PRESS`, `KEY BACK` work the controls -- and on the three-button boards
`KEY DOWN A` and `KEY UP A` (or B, C) hold and let go a button as a finger does, `KEY CANCEL` forgetting one held; on a
keyboard board `KEY TYPE <letters>`, `KEY ENTER` and `KEY BKSP` type as its keys do. `RUN <type> <n>` starts a routine;
`MEM` reports the memory; `WATCH` the touch and clock; `EARTEST` what the microphones hear; `OUTBOX` the last report
sent to the companion, how long it took and which way; `CASTS?` the broadcasts the board holds, each with its ways,
and `CAST act WAVE` or `CAST say hello` sends one (with a daemon hosted); `MESH?` the LoRa radio
([Meeting others nearby](Meeting-others-nearby)).

**The Tab5** answers `SHOT`, `GO <tab>` (any of its tabs by name), `TAP <x> <y>` and `SCROLL <dy>` down its cable, and
`firmware/tab5/shot.py` takes its screen with them:

```sh
python3 firmware/tab5/shot.py tab5.png --go LIBRARY --tap 360 400 --scroll 300
```

[firmware/esp32/FLASHING.md](https://github.com/CodeMusic/daemons-companion/blob/main/firmware/esp32/FLASHING.md) has
the rest: Wi-Fi set at build time instead of the cable, and putting the factory firmware back.
