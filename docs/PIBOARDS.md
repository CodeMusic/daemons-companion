# The Linux boards: one program, a file for each board (C-457)

*The user, 2026-11-21: the Cardputer Zero and the GamePi20 both run on a Pi Zero, so the code that works on any Pi
Zero device is shared, and each device adds only a thin layer for itself -- easier to write, lighter on memory, and
faster. The ESP32 boards already work this way: `firmware/esp32/` is one firmware, and each of its thirteen boards is
an `[env:]` in `platformio.ini` with its own pins.*

`firmware/pizero/` is one C++ program for every Linux board. What differs between them is in two places, and nothing
else in the program knows which board it is on:

| Where | What | How many |
|---|---|---|
| `src/hal/` | the **side**: `device.cpp` (a framebuffer, evdev, sysfs) or `window.cpp` (an SDL window on a computer) | two, for every board |
| `src/boards/<id>.cpp` | the **board**: its name, its screen's size, keyboard or pad, its input device, the game's ten keys, and what a pad's buttons mean on a page (`src/board.h`) | one per board |

CMake's `ZERO_BOARD` picks the board file (`BOARD=gamepi20 ./build.sh`); on a device it is kept in
`~/.config/daemons/board`, written once by `tools/install.sh` (`BOARD=gamepi20 tools/install.sh codemusic@daemons-gamepi`).
Everything above them -- the game on mGBA's core, the one save kept in step with the hub (C-380, C-397), the GAMES page
(C-395), every page, LINK, the caps (C-444) -- is the same program on every board.

**The canvas.** The pages draw 320x170, the Cardputer Zero's screen. A bigger screen shows it as many whole times its
size as fit (C-468), in the middle, the rest dark: the GamePi20's 320x240 once, with 35 rows above and below; the Game
HAT's 640x480 twice, so its pixels stay square. A page laid out for the bigger screen is later work.

**A pad.** A board with no keyboard (its behaviour is `src/boards/pad.cpp`, shared by every pad board) reads its buttons as the keys the pages listen for (`board::forPage`): A is ENTER, B
is ESC, SELECT is TAB, START is ENTER, Y is BACKSPACE, X is SPACE, L and R move along a row. In the game every button is
the game's, and **SELECT and START held together** go back to HOME. A page's hint is printed through `hint()`, so
"ENTER: DONE    ESC: BACK" reads "A: DONE    B: BACK" on a pad. LINK needs the hub's code typed: on a pad it is
`daemons-zero --pair CODE` over SSH until a page for picking it with the d-pad is written.

## The boards

| Board | `ZERO_BOARD` | Pi | Screen | Keys | Sound | Started by |
|---|---|---|---|---|---|---|
| **Cardputer Zero** (C-377) | `cardputer-zero` | CM0 (a Zero 2 W's chip) | 320x170 ST7789, `panel-mipi-dbi` | the TCA8418's 56 keys | ES8389, PipeWire | M5Stack's APPLaunch (an entry per app, C-509) |
| **Game HAT** (Waveshare; C-468) | `gamehat` | a full Pi: 3B, 3B+ or 4 | 3.5-inch 480x320 IPS on the HDMI (sent 640x480) | d-pad, A B X Y, START, SELECT, L, R on GPIO | the HDMI's sound, to its speaker | `daemons@<user>.service` at boot |
| **GamePi20** (Waveshare) | `gamepi20` | Zero 2 W (a first Zero or Zero W runs the companion; the game at full speed is unlikely) | 2-inch 320x240 ST7789VW on SPI0 | d-pad, A B X Y, START, SELECT, L, R on GPIO | a speaker on PWM (GPIO 18) | `daemons@<user>.service` at boot |
| **uConsole** (ClockworkPi; C-514) | `uconsole` | CM4 (to confirm) | 5-inch 1280x720 IPS on DSI (a 720x1280 panel, turned; the canvas four times its size) | its own keyboard (a USB HID: keys, a trackball, a joystick), d-pad, A B X Y, SELECT, START | PWM to two speakers and the jack; a microphone through the jack | the desktop, or `daemons@<user>.service` with `boot` |

### The GamePi20

Waveshare's wiki (GamePi20) gives the pins; `tools/boards/gamepi20.sh` turns them on, once, with sudo, then a reboot:

- **The screen**: `dtoverlay=mipi-dbi-spi` on SPI0 CE0, DC 25, RESET 27, backlight 24, told the ST7789VW's start-up by
  `/lib/firmware/panel.bin`, which the script writes (the kernel's own form for it; MADCTL 0x60 turns it 320 wide, and
  `GAMEPI_MADCTL=0xA0` turns it the other way up). Waveshare's own image used `fbcp-ili9341` instead; the kernel's
  driver needs nothing built. `hal/device.cpp` finds the panel's framebuffer by its name, so a monitor in the HDMI
  never takes it.
- **The buttons**: one `gpio-keys` device, `daemons-pad.dtbo`, compiled by the script: UP 12, DOWN 20, LEFT 21, RIGHT 13,
  A 23, B 4, X 22, Y 17, START 26, SELECT 16, L 5, R 6 (BCM), pulled up and pressed low, each sending the gamepad code
  it is named for (BTN_A, BTN_START...). One device, not twelve `gpio-key` lines: the program reads one.
- **The sound**: `audremap,pins_18_19` puts the Pi's PWM audio on the speaker's pin; no mic.
- **The cell**: a 14500, not included. No fuel gauge the kernel knows, so the bar shows no percentage.
- **Seen on the device: not yet** (DRAFT). The overlay's parameter names and the panel's turn are the first things to
  check when it first boots.

**Setting one up**: Raspberry Pi Imager writes **Raspberry Pi OS Lite** to a microSD (64-bit for a Zero 2 W, 32-bit for a
first Zero), with the hostname `daemons-gamepi`, the user, the Wi-Fi (2.4 GHz) and SSH set there. The Pi Zero has no
storage of its own: without a card it does nothing, and the screen stays dark. Then from the computer:
`BOARD=gamepi20 tools/install.sh codemusic@daemons-gamepi`, which builds on the device and prints the two lines to run
there with sudo (the setup and the package), and a reboot.

### The Game HAT

A HAT for a full-size Pi (3B, 3B+, 4B), from Waveshare's wiki (Game_HAT); `tools/boards/gamehat.sh` makes it ready:

- **The screen** is on the Pi's **HDMI**, not SPI: a short HDMI bridge from the Pi to the HAT. Waveshare sends it
  640x480 (`hdmi_cvt=640 480 60 1 0 0 0`), which the HAT fits to its 480x320 panel; the kernel's driver ignores
  `hdmi_cvt`, so the script also puts `video=HDMI-A-1:640x480@60D` in `cmdline.txt`. The program draws on that HDMI's
  framebuffer, the canvas twice its size. A Pi 4 has a second HDMI, free for a TV (THE DESK, C-449); a Pi 3 has one.
- **The buttons**: UP 5, DOWN 6, LEFT 13, RIGHT 19, A 26, B 12, X 16, Y 20, START 21, SELECT 4, L 18, R 23 (BCM). Waveshare
  read them with `mk_arcade_joystick_rpi`; we make the same one gpio-keys device as the GamePi20's.
- **The sound** comes down the HDMI to its speaker and earphone jack: nothing to turn on.
- **The cell**: an 18650, not included; 1 to 2 hours of play by Waveshare's count. Its switch is OFF before the cell goes
  in, and nothing over 7 V may reach its charger.
- **Seen on the device: not yet** (DRAFT).

**Setting one up**: Raspberry Pi OS Lite (64-bit) on a microSD with Raspberry Pi Imager (hostname, user, Wi-Fi, SSH),
then `BOARD=gamehat tools/install.sh codemusic@<its name>`, the two lines it prints, and a reboot.

### The uConsole (C-514)

ClockworkPi's uConsole is a whole computer, keyboard and desktop included, on a Raspberry Pi CM4 (the user's, to be
confirmed on the device), with HackerGadgets' AIO board in its expansion slot (also to confirm). Its screen, keys, sound
and cells already work under its desktop, so `tools/boards/uconsole.sh` adds only what DAEMONS needs:

- **The screen**: a 5-inch 720x1280 panel held landscape, so the canvas is turned a quarter (`ZERO_ROTATE`, a drop-in for
  `daemons@.service`) and drawn four times its size, 1280x680, in the middle. It draws on the framebuffer, so the
  desktop must not hold the screen: `uconsole.sh <user> boot` starts DAEMONS at boot in the desktop's place
  (`systemctl set-default graphical.target` brings the desktop back). DAEMONS in a window on the desktop is the other
  way, once the build can make the window side on the device (to come).
- **The keys**: one USB HID from the keyboard's own chip -- the keys, the trackball as a mouse, and a joystick. A switch
  on its back sets A B X Y SELECT START to keys (A `j`, B `k`, X `u`, Y `i`, SELECT space, START enter) or to joystick
  buttons; the d-pad is always the arrows. **DAEMONS plays in the keys' mode** while the program reads one input device.
  No shoulder buttons: X and Y are L and R (Q and P too).
- **The sound**: PWM on GPIO 12 and 13 (`audremap,pins_12_13`, in the uConsole's own config) to its amplifier and the
  jack; the jack takes a headset's microphone. Nothing is turned on for sound.
- **The cells**: two 18650s read by the AXP228 (`axp20x-battery`): the percentage shows.
- **The radios**: the AIO's, in `docs/CAPS.md`. The script adds its lines to config.txt where missing (SPI1, the UART,
  I2C, the RTC) and takes the serial console off the GPS's UART; it powers nothing on.
- **Seen on the device: not yet** (DRAFT).

**Setting one up**: put it on Tailscale, then `BOARD=uconsole tools/install.sh <user>@<its name>`, the lines it prints,
and a reboot. `tools/install.sh <user>@<its name> probe` first, to read what it has.

**What the two handhelds' setups share** is `tools/boards/common.sh`: the buttons as one gpio-keys device from twelve pins
(`pad_buttons`), our lines in config.txt between two marks (`config_lines`), and DAEMONS at boot (`start_at_boot`). A
board's own script is then only its pins and its screen.

## Adding a board

1. `src/boards/<id>.cpp`, from the nearest of the three (a pad board calls `boards/pad.cpp`): its `ID` (the start of the name it gives the hub), `NAME`, screen,
   `KEYBOARD`, `INPUTS`, the game's keys, `forPage` and `word`.
2. If it has no launcher: `tools/boards/<id>.sh`, its pins and screen, using `common.sh` for the rest.
3. A row in the table above, and in `LAYOUT.md` if a folder moved.

Next in line: a 3.5-inch 480x320 SPI screen on a Zero 2 W (the user, 2026-11-21) -- a board file, and the canvas once
its size (480 is not two times 320).

## Mind and machine

The companion's rule (`LAYOUT.md`, C-387) holds here too: what is the daemon's own mind is written in the words of
psychology, what renders or routes a model in the words of machines, and a mind module never calls a model itself. The
Linux program has no mind module yet -- its daemon is the hub's -- so a board, a screen or a radio is neither.
