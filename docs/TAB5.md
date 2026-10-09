# The Tab5: the control center (C-77)

*Planned 2026-10-08. The user: "it should be a hybrid of the phone app and the device ... it will still link to the
phone but with the screen it will be a control center ... ideally we also download the index and everything to it."*

## What it is

**The phone app's screens on a 5-inch touch screen, and a device of its own.**

- **Like the app**: TODAY, GOALS (add one with the on-screen keyboard, tick steps), DAEMON (the party, SYNC), the INDEX
  (every entry and its art, read aloud), DEVICES (every device and which daemon each carries, chosen here), PROFILE,
  SETTINGS -- in the day's colours, as the app is.
- **Like a device**: its own name (`m5-tab5-xxxxxx`), a daemon of its own from the party (C-80) -- home is that daemon,
  large -- push to talk (its microphones and speaker), its battery, and meeting others nearby.
- **Everything kept on it** (as the phone keeps it, C-62/C-86): the day, goals, the party, profile, devices, and **the
  whole INDEX with every daemon's art**, in its own flash (9 MB of LittleFS). It opens on what it holds at once, and
  brings it up to date whenever the companion answers. **Anything changed while nothing answers is kept and sent in
  order** (C-87).

## How it reaches the companion

1. **Its own Wi-Fi**, chosen on its screen (scan, tap a network, type the password on the on-screen keyboard).
2. **Paired like a phone**: the site's PAIR A PHONE code typed on the Tab5. A paired key opens the whole API -- the
   control center needs goals and the INDEX, not only the device's door -- **at home and through the relay**, which it
   learns at pairing as the phone does. It names itself as a device with `?device=` (the relay passes only
   `authorization`, so not a header).
3. **The phone**, over Bluetooth, the way the handhelds link (C-55): when the Tab5 has no Wi-Fi, the phone carries it.
   On the Tab5 Bluetooth is the ESP32-C6 beside the P4, through ESP-Hosted: Arduino-ESP32 enabled BLE that way in
   September 2025 (arduino-esp32 PR #11804; in 3.3.x). **This is the last step, and the one least proven on the board.**

## How it is built

- **Its own project, `firmware/tab5/`**: the Tab5 is an **ESP32-P4**, which needs **Arduino 3.3 on ESP-IDF 5.5**
  (pioarduino's platform, release 55.03.312, with its own `m5stack-tab5-p4` board); the handhelds are Arduino 2.0 on
  IDF 4.4, and their Bluetooth library does not build on 3.x. pioarduino needs **PlatformIO Core 6.2**, so the Tab5 has
  its own (`firmware/tab5/pio.sh`: a virtual environment and `~/.platformio-tab5`), and the handhelds' is not touched.
- **M5Stack's own libraries for the hardware**: M5GFX knows the Tab5's three panels (ILI9881C, ST7121, ST7123) and two
  touch chips (GT911, ST) and picks at start; M5Unified does the speaker (ES8388), the microphones (ES7210), the power
  and battery, and the clock.
- **LVGL 9 for the screens**: tabs, scrolling lists, images, a keyboard -- what a control center is made of -- drawn
  through M5GFX, in PSRAM (32 MB).
- **The server, two small changes**: read aloud for any species as the samples a device streams (today
  `/api/device/speak` reads only the carried daemon's entry), and `?device=` honoured through the relay.

## Steps

1. **Bring-up**: the board, LVGL on its screen and touch. ***Built 2026-10-08.***
2. **Wi-Fi and pairing** on its screen; the store; everything downloaded and kept. ***Built 2026-10-08***: SETTINGS looks
   for networks and joins one (the password on the keyboard), pairs with the site's code, and downloads everything --
   the day, goals, party, profile, devices, its own daemon, the INDEX and all 386 pictures (700 KB, one request) and the
   party's -- into LittleFS, again every ten minutes and after every change; the day and its daemon every 30 s (two
   minutes away). Writes go to an outbox and are sent in order; SYNC with the game is never kept for later (it writes
   the save). The clock comes from the companion's state.
3. **The screens**: TODAY, GOALS, DAEMON, INDEX (art grid, entry, LISTEN), DEVICES, PROFILE, SETTINGS. ***Built
   2026-10-08, but LISTEN and PROFILE***: TODAY (the theme, virtue over vice, the next step and DONE), GOALS (each goal,
   its steps ticked or unticked with a tap, + NEW GOAL on the keyboard, broken down by the companion), DAEMON (this
   Tab5's daemon large, its entry; the party; SYNC WITH THE GAME), INDEX (pages of eighteen, a tap opens the entry with
   its picture six times over), DEVICES (each device and its daemon, chosen with a tap), SETTINGS. A status bar: the
   day, HOME / AWAY / KEPT, changes waiting, the battery.
4. **The device half**: its daemon at home, push to talk, battery, meeting.
5. **The phone link** over Bluetooth.

Each step is built, then run on a Tab5 on the cable.

## The toolchain, and the disk

The first install unpacks about 7 GB: Arduino's libraries for every ESP32 chip, and the RISC-V compiler twice (an
unpacking copy and the one used). On 2026-10-08 that filled the Mac's disk twice. `pio.sh` now trims what the Tab5 never
uses after every run -- the other chips' libraries, the unpacking copy, the downloaded archives -- leaving 3.4 GB, and a
clean rebuild after that reinstalls nothing. **Do not run pioarduino's platform from the handhelds' PlatformIO**: it
needs Core 6.2, and the handhelds' is 6.1.

## Waiting on

- **A Tab5 on the cable** to run it: `./updateCompanion.sh --board m5-tab5` (or `firmware/tab5/pio.sh run -t upload`).
  Not yet run: which panel and touch M5GFX finds, the touch's way round, Wi-Fi through the C6, LVGL's speed at
  1280 x 720.
- Steps 4 and 5: the device half (push to talk, LISTEN, meeting) and the phone over Bluetooth.

*Sources: pioarduino/platform-espressif32 (boards/m5stack-tab5-p4.json, release 55.03.312, which needs PlatformIO
Core >= 6.2.0); espressif/arduino-esp32 PR #11804 (BLE for the ESP32-P4 through esp-hosted, merged 2025-09-11);
docs.m5stack.com/en/arduino/m5tab5/program (M5Unified >= 0.2.23, M5GFX >= 0.2.30); M5GFX src/M5GFX.cpp (the Tab5's
panels and touch); M5Unified src/M5Unified.inl (its microphones, speaker and pins).*
