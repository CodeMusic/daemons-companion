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
- **Making the game**: `build/window/daemons-zero --make FireRed.gba`. It checks your ROM against `server/data/patches.json`,
  fetches our patch from the release, applies and checks it, and keeps the game in `~/.local/share/daemons/`.
- **A testing build**: `--rom engineGba/daemonsContent_debug.gba` plays any ROM as it is.
- **The hub**: `--hub http://<hub>:4730`, or one line in `~/.config/daemons/hub`. `none` asks nothing.
- **Never on your own save**: `DAEMONS_HOME=/some/scratch` moves everything it keeps (the game, the save, settings).

**Pictures without a window**, for review sheets:

```sh
build/window/daemons-zero --headless --page play --frames 3460 --press 1800:L,2100:L --shot out.bmp --every 300
```

This runs 3460 frames unseen, presses A at those frames, and writes a 320x170 BMP at the end (and every 300 frames).

**Speed**: `--bench 3000` runs the game as fast as it goes. The Mac does about 1,300 frames a second, and the GBA needs 59.7.

## On the device

```sh
tools/install.sh <user>@<device> probe    # what the device really is -> build/probe-<device>.txt (reads only)
tools/install.sh <user>@<device>          # copy the source across, build it there, make the .deb, install it
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
| `src/hal/` | `window.cpp` (SDL) and `device.cpp` (framebuffer, evdev, power_supply): the only two halves that differ |
| `src/canvas.*` | the 320x170 LovyanGFX sprite every page draws into, and a picture of it |
| `src/keys.*` | the device's keys by name, and the game's map (`~/.config/daemons/keys.conf`, `A = L`) |
| `src/sound.*` | miniaudio, and a ring between the game and the speaker |
| `src/game/` | SHA-1 and CRC32, BPS (a port of `server/src/game/bps.ts`), the ROM made (C-187's rules), mGBA's core |
| `src/hub/` | libcurl, and the device state asked every thirty seconds as every board asks it |
| `src/pages/` | HOME, PLAY, MAKE THE GAME |
| `test/` | the checks `./build.sh` runs |
| `tools/` | `install.sh`, `probe.sh`, `make_deb.sh` |
| `packaging/` | the launcher's entry and icon |

What it is built from is fetched at pinned versions and checked by hash. None of it is kept here: mGBA 0.10.5
(MPL-2.0), LovyanGFX 1.1.16 (FreeBSD), miniaudio 0.11.21 (MIT-0) and ArduinoJson 7.2.1 (MIT).
