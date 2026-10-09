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

1. **Bring-up**: the board, LVGL on its screen and touch. *(Written; waits on the toolchain -- see below.)*
2. **Wi-Fi and pairing** on its screen; the store; everything downloaded and kept.
3. **The screens**: TODAY, GOALS, DAEMON, INDEX (art grid, entry, LISTEN), DEVICES, PROFILE, SETTINGS.
4. **The device half**: its daemon at home, push to talk, battery, meeting.
5. **The phone link** over Bluetooth.

Each step is built, then run on a Tab5 on the cable.

## Waiting on

- **Disk space** (2026-10-08): the P4 toolchain is about 5 GB unpacked (Arduino's libraries for every ESP32 chip and a
  RISC-V compiler), and the Mac had 4.4 GB free.
- **A Tab5 on the cable** to run each step.

*Sources: pioarduino/platform-espressif32 (boards/m5stack-tab5-p4.json, release 55.03.312, which needs PlatformIO
Core >= 6.2.0); espressif/arduino-esp32 PR #11804 (BLE for the ESP32-P4 through esp-hosted, merged 2025-09-11);
docs.m5stack.com/en/arduino/m5tab5/program (M5Unified >= 0.2.23, M5GFX >= 0.2.30); M5GFX src/M5GFX.cpp (the Tab5's
panels and touch); M5Unified src/M5Unified.inl (its microphones, speaker and pins).*
