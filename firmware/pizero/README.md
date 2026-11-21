# DAEMONS on the Cardputer Zero (C-377)

M5Stack's CardputerZero is a Raspberry Pi CM0 with a 320x170 screen and 46 keys. This folder is the program it runs:
**the game, played on it** (made on the device from the player's own ROM), and **the companion around it**. One C++
program. On a computer it runs in an SDL window, so it is written and played before the device is in hand. On the
device it uses the screen (`/dev/fb0`) and the keys (evdev). The plan and the hardware are in
[docs/CARDPUTERZERO.md](../../docs/CARDPUTERZERO.md).

Nothing of Nintendo's is here or in what it builds. The player brings their own FireRed or LeafGreen, and
`.gitignore` refuses `*.gba`, `*.bps` and `*.sav`.

## On a computer

Needs CMake, a C++17 compiler, SDL2 and libcurl (macOS: `brew install sdl2`; curl comes with the system).

```sh
./build.sh                       # build/window/daemons-zero, and its checks (BPS, SHA-1, CRC32)
./build.sh run                   # build, then open the window (x3); --scale 4 for bigger
```

- **The keys**: the arrows or **F Z X C** move; **L** is A, **K** is B, **ENTER** START, **SPACE** SELECT, **Q** and **P** L and R;
  **ESC** leaves the game for HOME. **F1** is SYM and **F2** is FN, as in M5Stack's own simulator.
- **Making the game**: `build/window/daemons-zero --make FireRed.gba`. It checks your ROM against `server/data/patches.json`
  (read from GitHub as the app reads it), fetches our patch from the release, applies and checks it, and keeps the game in
  `~/.local/share/daemons/`.
- **Both games (C-395)**: **GAMES** on HOME keeps CONTENT (from FireRed) and CONTEXT (from LeafGreen), each as the newest
  release or as the **TESTING** build. The testing build is made with the DEBUG patch the paired hub holds (C-216: at home only;
  `./syncCompanion.sh debug` sends the newest). ENTER plays the game chosen, or makes it first, or remakes it when a newer one is
  out. From the command line: `--make content|context`, `--make-testing content|context`, `--game content-testing`
  (choose), `--games` (list).
- **One save (C-397)**: every game plays the ONE save (`~/.local/share/daemons/daemons.sav`), which the hub mirrors, as the
  app's testing build plays the companion's save.
- **A daemon sent from the game (C-397)**: SEND it in the game's party menu and save. Back on HOME, the Zero SYNCs, as
  the app does after each save (C-261), and shows **RECEIVED** for each arrival: who, the daemon, where it is now, and
  from whom (ENTER puts each away). A daemon sent goes into the Zero when it carries none. If the hub refuses (one daemon
  always stays in the party), HOME says so in the hub's words. The game then goes on from the SYNC's save (CONTINUE).
  `--saved` starts HOME as if the game had just saved, for checks.
- **A testing build**: `--rom engineGba/daemonsContent_debug.gba` plays any ROM as it is.
- **The hub**: `--hub http://<hub>:4730`, or one line in `~/.config/daemons/hub`. `none` asks nothing.
- **Never on your own save**: `DAEMONS_HOME=/some/scratch` moves everything it keeps (the game, the save, settings).

**Linked to the hub (C-380).** Choose LINK on HOME and type the code the hub shows, or run
`build/window/daemons-zero --hub http://<hub>:4730 --pair CODE`. Over SSH to the hub, the code comes from
`curl -s -X POST http://127.0.0.1:4730/api/pair/code`. Pairing keeps a key in `~/.config/daemons/token`, readable only by
you, and the hub lists the device among its phones. From then on the save is kept in step, as the app keeps it:

- **Before the game starts**, and each time it comes back from HOME, the hub's copy is asked for:
  - while this device's save hasn't moved since the two last agreed, the hub's copy is taken;
  - if only this device moved, its save goes out;
  - if both moved, the hub's truth decides (by default the hub's copy, with this device's set aside in the hub's trail
    first).
- **After every save the game writes**, the save goes out once it has held still for a second. The strip shows SAVED,
  then SENT, or HERE when it stayed on the device.
- **On a computer the mirror is read only**: the window takes the hub's copy to play on, and never writes the hub's
  save. `--mirror send` changes that, `--mirror off` asks nothing, and the device's own default is `send`.
- **SYNC** is on HOME while saves are sent. With the game paused, this device's save goes out, the hub SYNCs (only the
  game it follows), and what it wrote comes back into the game.
- **Another game's save** (a new game begun here) is refused as the hub's mirror. HOME then asks, as the app does,
  whether to keep it on the hub as a save of its own (C-215). Yes keeps it there at each save after.
- `--mirror-in`, `--send-save`, `--sync` and `--keep-there` each do one step and stop, for checking a hub.
- **Away from home (C-56)**: pairing keeps the relay's address (the user's n8n webhook; `~/.config/daemons/away`,
  refreshed from home once a run). Every request goes like this:
  - home first, waiting briefly for it to connect;
  - then the relay, as an envelope with this device's key, the device naming itself with `?device=`;
  - the route that worked is kept a minute;
  - a 502 from the relay rests it 30 s, and home is then asked once more in full;
  - the band says AWAY while the relay is the way.

  Daemon pictures are kept by artKey in `~/.local/share/daemons/art/`, so the relay is asked only for new ones.

**The companion's screens (C-381)**, along HOME's row and drawn from the hub's device state:

- **CARE:** feed, water, train, sleep or wake.
- **STEP:** tick the next step; BACKSPACE takes it back.
- **PARTY:** the party's routines.
- **SAY:** a word to every daemon nearby, as the one carried.

`--page care` (or `step`, `party`, `say`, `games`, `link`, `play`, `caps`) starts on one.

**CAPS (C-444, [docs/CAPS.md](../../docs/CAPS.md))**: which cap is on the EXT header -- the **CC1101 + NFC** or the
**LoRa-1262** -- found by asking its chips (I2C 0x43, then the CC1101's PARTNUM and VERSION, read only), and what it
offers. For the CC1101: its band (315, 433 or 915; never 868, the user being in North America), switched by RF_SW0
(GPIO14) and RF_SW1 (the chip's own GDO2), the antenna said to be on, and what is heard on that band now. It never
transmits. **Switch the Zero off before fitting or removing a cap.** `--caps` says what is fitted and stops; `--band 433`
sets the band, reads the switch back from the chip and listens for two seconds; `--cap cc1101|lora|none` stands a pretend
cap in on a computer.

**Pictures without a window**, for review sheets:

```sh
build/window/daemons-zero --headless --page play --frames 3460 --press 1800:L,2100:L --shot out.bmp --every 300
```

This runs 3460 frames unseen, presses A at those frames, and writes a 320x170 BMP at the end (and every 300 frames).

**Speed**: `--bench 3000` runs the game as fast as it goes. The Mac does about 1,300 frames a second, the Zero 131.5 (one core
at 1 GHz), and the GBA needs 59.7.

## On the device

```sh
tools/install.sh <user>@<device> probe    # what the device really is -> build/probe-<device>.txt (reads only)
tools/install.sh <user>@<device>          # copy the source across, build it there, make the .deb, install it
tools/shot.sh <user>@<device> out.png     # a picture of the screen now (/dev/fb0), for review sheets and qa
```

It builds on the device itself, using four A53 cores and two jobs at a time to fit in 512 MB. The first build fetches
mGBA, LovyanGFX and miniaudio and takes several minutes. `tools/make_deb.sh` packages it as the launcher expects:
`/usr/share/APPLaunch/bin/daemons-zero` and its entry in `applications/`. DAEMONS then shows on HOME.

Until the probe says otherwise, these environment variables cover what is not yet seen: `ZERO_FB`
(another framebuffer), `ZERO_ROTATE` (0-3), `ZERO_KEYS` (the keyboard's `/dev/input/event*`), `ZERO_GRAB=1` (take the
keys while running), `ZERO_KEYLOG=1` (print key codes it does not know).

## What is where

| | |
|---|---|
| `src/main.cpp` | the loop, the arguments, the shared drawing |
| `src/hal/` | `window.cpp` (SDL) and `device.cpp` (framebuffer, evdev, power_supply): the two sides |
| `src/board.h`, `src/boards/` | C-457: the board -- `cardputer-zero.cpp` or `gamepi20.cpp`, picked by CMake's `ZERO_BOARD` (`BOARD=gamepi20 ./build.sh`): its name, screen, keys or pad, and the game's keys (docs/PIBOARDS.md) |
| `tools/boards/` | a board with no launcher made ready once on the device: `gamepi20.sh` (its screen, buttons and sound in config.txt) and `daemons@.service` (DAEMONS at boot) |
| `src/canvas.*` | the 320x170 LovyanGFX sprite every page draws into, and a picture of it |
| `src/keys.*` | the device's keys by name, and the game's map (`~/.config/daemons/keys.conf`, `A = L`) |
| `src/sound.*` | miniaudio, and a ring between the game and the speaker |
| `src/game/` | SHA-1 and CRC32, BPS (a port of `server/src/game/bps.ts`), the games made (C-187's rules; both editions, release or testing: `games/`, `saves/`, `originals/`), mGBA's core |
| `src/hub/` | libcurl; the device state asked every thirty seconds as every board asks it, and pairing (`hub.cpp`); the save's mirror (`mirror.cpp`) |
| `src/pages/` | HOME, PLAY, GAMES (`make.cpp`), LINK, CARE, STEP, PARTY, SAY, CAPS, and what they share (`parts.*`) |
| `src/caps/` | the cap layer (C-444): the buses by ioctl (`bus.*`: spidev, GPIO v2, I2C), the CC1101 (`cc1101.*`), finding the cap and its band (`cap.*`) |
| `test/` | the checks `./build.sh` runs |
| `tools/` | `install.sh`, `probe.sh`, `make_deb.sh`, `shot.sh` |
| `packaging/` | the launcher's entry and icon |

What it is built from is fetched at pinned versions and checked by hash. None of it is kept here: mGBA 0.10.5
(MPL-2.0), LovyanGFX 1.1.16 (FreeBSD), miniaudio 0.11.21 (MIT-0) and ArduinoJson 7.2.1 (MIT).
