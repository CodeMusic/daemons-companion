# The Cardputer Zero (C-377)

*The user, 2026-11-15: "I have a new device coming this week, the Cardputer Zero ... it runs full linux and has a
larger screen and more ... it is more than the other companions, it will have some of the companion app features in
it, such as being able to fully play the game on it. can we plan out this devices implementation and start crafting
it so it is ready for when it arrives."*

M5Stack's **CardputerZero** is a Raspberry Pi in a Cardputer's body. It is the first board that is also the app: **the
game is played on it**, in its own save, kept in step with the hub as the phone keeps it (docs/ONEAPP.md), and **the
companion is around it**: what every board shows, and the library from the app. It is C-78's "later its Pi Zero
version", and the same RP3A0 chip the planned Pi Zero 2 W device would use (C-08), so its program lives in
`firmware/pizero/`.

| Ticket | What | When |
|---|---|---|
| **C-378** | the program: one C++ program on a computer (SDL) and on the device (framebuffer, evdev) | before it arrives |
| **C-379** | the game: the player's ROM made into DAEMONS on the device; mGBA's core at 1:1 | before it arrives, measured on it |
| **C-380** | one save with the hub: paired as a phone, the mirror | the first week |
| **C-381** | the companion: the boards' screens, and the library | next |
| **C-382** | the radios (Bluetooth, IR, the LoRa cap), the IMU, the camera, HDMI | later |

## The first day (2026-11-17): what the device is

It arrived on 2026-11-16: the **full model** (the IMX219 camera and the BMI270 + BMM150 are on its bus), its 32 GB card
in the slot. The probe (`tools/install.sh <user>@<device> probe`) found the plan right almost everywhere:

| | seen |
|---|---|
| system | Debian 13 (trixie), kernel 6.18 `rpt-rpi-v8`, aarch64; "Raspberry Pi Compute Module 0 Rev 1.0"; four cores, 1 GHz, `ondemand` |
| memory | **352 MB, not 512**: `gpu_mem=128` (for the camera) and `cma-64`. **124 MB free** with the launcher and PipeWire running; 351 MB of swap |
| card | 29 GB, 22 GB free |
| screen | `/dev/fb0` is `panel-mipi-dbi`, **320x170, 16 bpp, stride 640, rotate 0**: what `hal/device.cpp` writes. The backlight's sysfs reads 0 of 100 while lit (not ours to touch yet) |
| keys | `/dev/input/by-path/platform-3f804000.i2c-event` is event3, `tca8418c` (`tca8418_keypad_m5stack` + `matrix_keymap`): the path the program opens first |
| sound | the ES8389 is card 1, held by **PipeWire** (`pipewire-pulse` running): miniaudio plays through it |
| cell | `power_supply/bq27220-0`, a Battery: what `hal::power()` reads |
| caps | `/dev/spidev0.1` free on the cap header's bus. M5Stack ships apps for both caps, preinstalled: `cap-cc1101-nfc`, `cap-cc1101-subg-chat`, `cap-lora-1262` (+ `-gps`), with `ir-chat` and `ir-remote` (C-391, C-382) |
| launcher | APPLaunch 0.6.105, `/usr/share/APPLaunch/applications/*.desktop` as planned |
| to build | gcc, g++, ninja, git and pkg-config there; cmake and libcurl's headers installed once with `sudo` |
| Wi-Fi | **2.4 GHz only**: it cannot join a 5 GHz network |

**The first build on the device took 17 minutes**, one compiler at a time (`build.sh` now picks one below 300 MB free),
and its checks passed: the device half (`hal/device.cpp`) compiled for the first time. **A copy by `tar` kept the Mac's
file times**, older than the device's objects, so a second install remade nothing; `install.sh` now copies by content
with `rsync -c`, so the device remakes exactly what changed, and keeps its own `build/`.

**Both games (C-395)**: the player's FireRed and LeafGreen are kept on it, and GAMES makes CONTENT and CONTEXT, each as
a release or a TESTING build, each with its own save (`firmware/pizero/README.md`).

## Where it stands (2026-11-16, before the device)

**Built and seen on the Mac** (`firmware/pizero/`, its `README.md`):

- **The game is made from the player's own ROM in C++.** BPS, SHA-1 and CRC32 are written out, and `--make` ran C-187's
  whole path against the retail-identical FireRed 1.0: the patch fetched from v11.375.1's release, checked, applied, and
  the result's SHA-1 equal to the release's (`e3793be0`). The checks run with every build: vectors from DAEMONS' own
  `tools/bps.py`, a TargetCopy, and each of the three CRCs refusing.
- **The game plays at 1:1** on mGBA 0.10.5's core, with the strips either side. It was filmed from boot through the
  CodeMusic splash, the title, CONTROLS and the new game to CRYSTAL CLEAR's greeting, the keys scripted.
- **The game's speed on the Mac** is about 1,300 frames a second (`--bench`). The device's 1 GHz A53 is many times
  slower: measured on the first day.
- **HOME** shows the daemon carried and the next step from `/api/device/state`, seen against a stand-in hub on this
  machine (never the user's hub). It falls back to "asking", "not answering" or "not linked".
- **MAKE THE GAME** lists the `.gba` files where a player would put one, makes the game on a thread, and says each step.
- **The save** is written when the game's save has held still for a second, on ESC, and on SIGINT (APPLaunch's long
  press).
- **One save with the hub (C-380, 2026-11-16).** It pairs (LINK, or `--pair CODE`) and keeps the mirror as the app
  does. Every case was run against scratch companions on the Mac, with synthetic saves from the server's own test
  builder:
  - no mirror yet; the first send; in step;
  - a SYNC taken back;
  - a save made while the hub was away sent on;
  - both moved: the hub's taken, this device's in the trail first with its note;
  - another game's save refused (409);
  - a late save after a SYNC refused, then settled at the next look;
  - read only, writing nothing.

  End to end, the game's own SAVE (START, SAVE, YES) went out by itself: the strip said SENT, and the hub's
  `mirror.sav` matched the device's byte for byte. **The Mac build is paired with the user's hub** as "Cardputer Zero
  (a computer)", in read-only mode. It read the device state and took a copy of the hub's mirror, into scratch, since
  deleted. Nothing was written to the hub.
- **Only this device moved is "keep".** A game saved while the hub was away, the hub's copy still the agreed one:
  this device's goes out. Found here first; the app's `mirrorChoice` (server/src/game/mirror.ts) read it as both
  moved and, with the companion as the truth, set the newer save aside for the older. It has the same case since
  C-384, and the two rules are worded alike.
- **A SYNC asked on the device, and C-215's question (C-380, 2026-11-16).** SYNC is a choice on HOME, with the game
  paused there. This device's save goes out first, the hub must follow this game (`/api/profile`), the hub SYNCs, and
  what it wrote is taken back into the game, which starts again from it. On a computer, read only, it is refused.
  When the hub refuses this game's save as another game's, HOME asks, in the app's words, whether to keep it on the
  companion as a save of its own. The question survives a restart until answered (`offer.json`). Yes keeps it there
  now and at each save after (`kept.json`, `/api/saves/keep`); ESC puts it away until the next refusal. Run against a
  scratch companion that holds RELAY:
  - the first SYNC wrote the save and took it back, device and hub byte for byte; a second had nothing to change;
  - read only refused;
  - another game's save was refused, then kept as "This device's other game", while the hub's own game stayed its
    mirror.
- **Away from home (C-380 with C-56, 2026-11-16).** The relay's address comes with pairing and is refreshed from home.
  Every request goes as the app's do:
  - home first, waiting briefly for it to connect;
  - then the relay's envelope with this device's key, the device naming itself in the path;
  - the route kept a minute;
  - one request at a time until the relay answers;
  - a 502 rests it 30 s, and then home is asked once more in full.

  The band says AWAY. Run against a scratch companion behind a stand-in for the n8n workflow (its envelope, its secret,
  its 502), with home unreachable: the save sent, a SYNC, the copy taken, the state, the pictures and a FEED all went
  through it. The relay down was said plainly; home again went home. Pictures are kept by artKey, so the relay is
  asked only for new ones.
- **The companion's screens (C-381, 2026-11-16).** All drawn from `/api/device/state` with the boards' own calls,
  against a scratch companion with a synthetic save (DAEMONS qa 16Nov2026 C381):
  - **HOME:** the daemon in its den (its picture from `/api/device/art`), its mood word, care pips, the next step, and
    a row of everything.
  - **CARE:** feed, water, train, sleep or wake, and what it says back.
  - **STEP:** tick the next step, and take it back within fifteen seconds.
  - **PARTY:** each daemon's picture and its four routines in their streak colours.
  - **SAY:** CHORUS typed on the keys, as the carried daemon, and what was heard.

**Written, not yet compiled**: `src/hal/device.cpp` (the framebuffer, evdev, power_supply), LovyanGFX's framebuffer
platform, `tools/make_deb.sh`. No Linux machine was at hand (Docker was not running, and roverbyteseer is a Mac). The
first build on the device is their first compile.

**Not yet**:
- SEND and RETURN asked on the device (the game's PORT does them now, then SYNC);
- the rest of C-381: the CASINO, the routines run as the boards run them, and from the app the library (the NOTEBOOK,
  the GUIDE, the INDEX cards, the books);
- the daemon's picture in PLAY's strip;
- the sound (wired through miniaudio, not yet heard);
- anything of C-382.

## The hardware, as M5Stack publishes it

**To be checked on the device the day it arrives** (`firmware/pizero/tools/probe.sh`, below). The **CardputerZero** has
a 32 GB microSD, an 8 MP camera and an IMU. The **Lite** has none of the three.

| | |
|---|---|
| compute | **Raspberry Pi CM0**: RP3A0 (BCM2837), four Cortex-A53 at **1 GHz**, aarch64; **512 MB** LPDDR2; microSD |
| screen | **1.9" 320 x 170**, ST7789V3 over SPI (MOSI 10, SCLK 11, DC 25, CS 8, TE 5); backlight and reset on the M5IOE1 expander (0x4F). The launcher's top **20 px** is its status bar |
| keys | **46**, a **TCA8418 (I2C 0x34)** on I2C1 (SDA 2, SCL 3), INT on 27; Shift, Sym, Fn (each held, once, or twice to lock, with a light); TAB, ESC, OK/ENTER, SPACE, Backspace. **No arrow keys: F Z X C are the arrows** (fn + F up, X down, Z left, C right; apps take them plain) |
| sound | **ES8389** codec (0x10), I2S 18-21; **AW8737A** amplifier (enable on 24) into a **1 W** speaker; one MEMS microphone; a **3.5 mm TRRS** jack (detect on 17, the speaker off while a plug is in) |
| power | **1750 mAh** at 3.7 V with an NTC; **BQ27220** gauge; RX8130CE clock (0x32); charged by the right USB-C, 5 V 2 A; **2.5 W idle**; a slide switch (software shutdown still needs it moved) |
| radios | Wi-Fi 2.4 GHz b/g/n; Bluetooth; **IR send (12) and receive (13)**; 10/100 Ethernet (SR9900A, host mode) |
| ports | **USB-A 2.0**; two USB-C (OTG on the right one; a switch picks host or device); a "digital HD audio/video output, 1080P 30fps"; **Grove** (UART on 14/15 or I2C1, switched by 4); the **EXT 2.54-14P** cap header (SPI0, I2C1, UART, two lines that can be USB) |
| sensors | **BMI270 + BMM150** (full model only); IMX219 camera, CSI 4-lane, 8 MP (full model only) |
| size | 84.0 x 54.0 x 23.1 mm, 95 g |

**Its caps.** M5Stack lists the **Cap LoRa-1262** and the **Cap CC1101** for it. The Cap LoRa-1262 is the one on the
user's Cardputer ADV (C-136). Moving the cap across is C-382.

## The software it comes with

- **The OS**: M5Stack's Raspberry Pi OS image (their `pi-gen` fork), written to the microSD by **M5 Imager**. M5 Imager is their
  fork of the Raspberry Pi Imager and sets the user, Wi-Fi and SSH. `rpiboot` can also expose the card over USB.
- **APPLaunch** is its HOME screen: an LVGL 9.5 program run as the user service `APPLaunch.service`. It reads
  `/usr/share/APPLaunch/applications/*.desktop` about every three seconds. `Exec` is a path, never a shell line.
  `Terminal=true` runs a command in its own terminal page. A **five-second press of Home sends SIGINT**, then SIGKILL
  three seconds later, so the program keeps its save on SIGINT.
- **Apps are `.deb` packages.** Files go under `/usr/share/APPLaunch/` (`bin/`, `lib/`, `share/images/`) with a
  `.desktop` entry. M5Stack's **Store** installs only packages its registry has approved (CardputerZero/AppBuilder:
  `app-builder.json`, a 320x170 screenshot, an icon, an author, a video of it on a device). **Ours is installed over SSH
  with `dpkg -i`**. Whether DAEMONS ever goes to their Store is the user's call (open, below).
- **The screen** is a framebuffer, **`/dev/fb0`** (the launcher's default, `LV_LINUX_FBDEV_DEVICE`). **The keys** are evdev,
  `/dev/input/by-path/platform-3f804000.i2c-event` (`LV_LINUX_KEYBOARD_DEVICE`). **Sound** goes through miniaudio. The
  **battery** is in `power_supply` sysfs. **ADB** (Settings > Developer) and SSH both reach a shell.

## How it is built: one C++ program

`firmware/pizero/` is **one C++17 program**, built by CMake, in three ways:

| | screen | keys | sound |
|---|---|---|---|
| **a computer** (the Mac, now) | an SDL window, 320x170 at x3 | the computer's keys, mapped to the device's | miniaudio |
| **the device** (built on it) | `/dev/fb0`, written from the canvas | evdev (the TCA8418) | miniaudio |
| later: **cross-built** | the same | the same | the same |

So the program is written, built and played on the Mac **before the device arrives**, and built on the device itself
the day it does (four cores, a few minutes). A cross-build in Docker waits until the Mac has disk to spare.

**The layers:**

- **`hal/`**: the screen, the keys, the sound and the power, one file per side. Everything above it is the same on both sides.
- **The canvas**: **LovyanGFX** (1.1.16, the boards' own drawing library; its `sdl` and `framebuffer` platforms are in that
  release). A page draws into a 320x170 sprite with the calls every board's `ui.cpp` uses, so code drawn for a board
  moves across with its calls unchanged, and the look stays the boards' look.
- **`game/`**: BPS, SHA-1 and CRC32, the ROM made from the player's own (C-187), and **mGBA's core** (libmgba **0.10.5**,
  MPL-2.0). It is fetched at that tag when built and never kept in this repository. It is the core EmulatorJS runs in the
  app and the playground, so a save moves between them unchanged.
- **`hub/`**: the companion over HTTP (libcurl). It says HELLO and reads `/api/device/state` as a board does, and holds
  the mirror (`/api/save/mirror`) as a paired phone does.
- **`pages/`**: what is in front. GAME, the companion's pages, and PAIR (typing the hub's code).

**Why not the other ways:**

- **The boards' firmware, recompiled.** It is Arduino on FreeRTOS: tasks, NimBLE, Preferences, I2S. Taking its drawing
  across (LovyanGFX, above) keeps most of what it offers, without a second operating system's worth of shims.
- **The app in a browser.** 512 MB and an SPI screen with no GPU path. EmulatorJS needs a browser that would not fit.
- **Python.** The game's sixty frames and its sound want C. The device's own apps are C and C++, so its toolchain and
  packaging are too.
- **LVGL**, the device's own toolkit. Every board's look is drawn pixel by pixel, and LovyanGFX keeps it one look.
  LVGL may come back for long text entry.

## The screen: the game at 1:1

**240 x 160 fits 320 x 170 exactly once**, with **40 px either side and 5 above and below**. There is no scaling and no
blur. The two side strips are the companion's (DRAFT):

```
+--------+------------------------------------+--------+
| the    |                                    |  time  |
| daemon |          the game, 240 x 160       |  cell  |
| carried|                                    |  save  |
| (32px) |                                    |  mark  |
+--------+------------------------------------+--------+
   40                     240                     40
```

- **Left**: the daemon carried, its sprite from the hub's art, nudged by its mood.
- **Right**: the hour (the WATCH's DAWN DAY DUSK NIGHT colour), the cell, and a mark while the save is on its way to the hub.

Over the 30 fps the SPI screen may hold (see the risks below), only the strips' changes and the game's 240x160 are sent.

## The keys (DRAFT, until the user holds it)

| GBA | key | why |
|---|---|---|
| the pad | **F** up, **Z** left, **X** down, **C** right | the arrows printed on the device; every app of M5Stack's takes them plain |
| A / B | **L** / **K** | under the right thumb, A to the right of B as on a GBA |
| L / R | **Q** / **P** | the top row's two ends |
| START / SELECT | **ENTER** / **SPACE** | |
| leave the game | **ESC** | the game pauses and the companion is in front. ESC again goes back |

Kept in `~/.config/daemons/keys.conf`, so the user can change them on the device. On the Mac the arrow keys work as well.

## One save (C-380)

The device's save is the real one, as on the phone (docs/ONEAPP.md): `~/.local/share/daemons/daemons.sav`.

- **Paired as a phone.** The hub shows its code, and the code is typed on the device's keys (`POST /api/pair`). The
  token gives the whole API, the mirror included. The board's own door (`/api/device/*`, an `x-device` id) answers on
  the home network without it.
- **The mirror**, by C-188 and C-365's rule. The device takes the mirror at open, while its own save has not moved
  since they agreed, or when the companion is the truth. It sends its save after every save the game writes. mGBA settles
  its save memory about a second after the game writes it, and the program watches for that.
- **Paused around SYNC.** ESC pauses the game. A SYNC, SEND or RETURN asked on the device waits for the save to cross first.
- **Away from home**, through the relay (C-56), as a paired phone goes. **Offline it plays**, and the mirror catches up later.

## The ROM (C-379)

C-187's rules, unchanged:

- The player gives their **own** FireRed or LeafGreen (USA 1.0 or Rev 1) once: on a USB stick in its USB-A port, or by
  SCP or ADB into `~/DAEMONS/`. Later, sent from the paired phone.
- It is known by SHA-1 against `server/data/patches.json`, fetched live from GitHub, with the built-in copy used offline.
- Our BPS comes from the release, checked by size and SHA-1, and is applied on the device. The result is checked against
  the target's SHA-1.
- The player's file is copied untouched beside the game, so a new release is one key.
- **Nothing of Nintendo's is ever in the package or this repository.** `firmware/pizero/.gitignore` refuses
  `*.gba`, `*.bps` and `*.sav`.

## The companion on it (C-381)

- **From the boards**, drawn at 320x170 with their own calls from `/api/device/state`: the day and the season, the ONE
  next step and its tick, the daemon carried and its care, the routines, the CASINO, **CHORUS typed on real keys**, and
  MET NEARBY.
- **From the app** (C-186's fourth step): the NOTEBOOK, the GUIDE, the INDEX cards and the books, read while the game is
  paused.

## Radios and the rest (C-382, later)

- **Bluetooth** through BlueZ: the meeting beacon (C-15), the same frame `meet.cpp` sends.
- **IR** through LIRC: FLARE, and its own IR chat.
- **The Cap LoRa-1262** on the EXT header: RadioLib's Linux side, `lora.cpp`'s frames (C-72).
- **The IMU** for motion (full model only).
- **The camera** (full model only).
- **The game on a television** through its HD output.
- **The companion itself on the device**, hosting alone as the phone does, if 512 MB allows Node.

## The first day

1. **The user flashes the stock image** with M5 Imager (a user, the home Wi-Fi, SSH on). The imager writes their card,
   so it is the user's step.
2. **`tools/install.sh <user>@<device> probe`** runs `tools/probe.sh` over SSH and writes what the device really is:
   the OS and kernel, `/dev/fb*` and its geometry, the input devices, the sound cards, `power_supply`, the CPU, the free
   memory, the boot overlays and APPLaunch's version. `I2C=1` adds `i2cdetect -y 1`. It reads only, and leaves out
   serial numbers and MAC and network addresses.
3. **`tools/install.sh <user>@<device>`** copies the source across, installs what a build needs (cmake, g++, ninja,
   libcurl's headers; `sudo` there), builds it on the device, makes the `.deb` and installs it. DAEMONS then shows on
   HOME. The player's ROM goes into `~/DAEMONS/` on the device (or on a USB stick), and MAKE THE GAME does the rest.
4. **Measured**: the game's frames per second at 1 GHz (`daemons-zero --bench 1800`, or `BENCH=1` with the probe), the
   screen's real refresh, and two arrows held at once (the TCA8418's ghosting). These decide the frame skip, and gpSP
   if mGBA cannot hold sixty.
5. **The user holds it**, and the keys are settled.

## Risks

- **mGBA at 1 GHz.** A Pi Zero 2 W (the same chip) runs most of the GBA at full speed. FireRed is light. gpSP, a
  dynarec, is the fallback.
- **The SPI screen's refresh.** A framebuffer over SPI may refresh at 20-30 fps. The game runs at 60 and shows every
  second frame, and only its 240x160 is sent.
- **The cell.** About 6.5 Wh at 2.5 W idle is roughly two and a half hours of play. The WATCH's low power applies.
- **APPLaunch and the framebuffer.** How the launcher hands the screen to a program it starts is seen on the first day.

## Open (the user's)

1. **The keys**, once it is in hand.
2. **The strips** (DRAFT above).
3. **M5Stack's Store.** Nothing of Nintendo's is in the package, but publishing needs an author, a share code and a video.
   Not now.
4. **Which model** is on its way: the CardputerZero (camera, IMU, card) or the Lite.

*Sources: docs.m5stack.com/en/CardputerZero, /en/compute/cardputerzero/usage, /image, /adb (pin map, I2C addresses,
keys, flashing); github.com/CardputerZero: AppBuilder (README, docs/APP_BUILDER_JSON.md), Template (README,
.agents/skills/cardputerzero-peripherals), launcher (README, docs/APPLaunch-App-packaging-guide-ja.md), Emulator
(src/keyboard_map.cpp), Store; shop.m5stack.com/pages/m5-cardputerzero; cnx-software.com 2026-05-25; linuxgizmos.com.*
