# The devices (C-67)

*Researched 2026-10-07 from the makers' own repositories, schematics and product pages (sources at the end of each
section). What the companion runs on, what each board adds, and how one firmware stretches across them.*

## The T-Embed family

Three boards, two circuit boards. **The T-Embed and the T-Embed SI4732 are the same board**: the SI4732 version adds a
radio module on I2C. **The T-Embed CC1101 is a different board**: its display, encoder, sound and SD pins all differ,
and its I2C pins are swapped. Only the panel (ST7789, 170x320) and the encoder's button on GPIO0 match.

| | T-Embed CC1101 | T-Embed (and SI4732) |
|---|---|---|
| MCU | ESP32-S3, 16 MB flash, 8 MB PSRAM | ESP32-S3, 16 MB / 8 MB |
| LCD | CS 41, DC 16, SCLK 11, MOSI 9, BL 21 | CS 10, DC 13, CLK 12, MOSI 11, RST 9, BL 15 |
| Encoder | A 4, B 5, button 0; user key 6 | A 2, B 1, button 0 |
| I2C | **SDA 8, SCL 18** | **SDA 18, SCL 8** |
| Power enable | **IO15 HIGH** | **IO46 HIGH** |
| Microphone | PDM (SPM1423): DATA 42, CLK 39 | two, through an ES7210 ADC (0x40): BCLK 47, LRCK 21, DIN 14, MCLK 48 |
| Speaker | MAX98357A: BCLK 46, LRCLK 40, DIN 7 | MAX98357A: BCLK 7, WCLK 5, DOUT 6 |
| Battery | 1300 mAh; **BQ27220 gauge (0x55)** and **BQ25896 charger (0x6B)** | by voltage only: **ADC on IO4**, a 2x divider (SI4732 version: 900 mAh) |
| LEDs | 8x WS2812 on IO14 | 7x APA102 (CLK 45, DI 42) |
| Radios | Wi-Fi, BLE 5, CC1101 (SPI: SCK 11, MOSI 9, MISO 10, CS 12, GDO0 3, GDO2 38; band switch 47/48), PN532 NFC (0x24), IR TX 2 / RX 1 | Wi-Fi, BLE 5 |

**Telling them apart at start** (so one build runs on all three): set IO15 and IO46 HIGH (each is harmless on the other
board); start I2C on SDA 8 / SCL 18 and probe 0x55 or 0x6B -- an answer means the CC1101 board. Otherwise start I2C on
SDA 18 / SCL 8: 0x40 (the ES7210) means a plain T-Embed, and the SI4732 also answers there (0x63 or 0x11).

**What one firmware needs**: a pin table chosen at runtime, a display library that takes pins at runtime (LovyanGFX or
Arduino_GFX; TFT_eSPI fixes them at compile time), two battery backends (gauge + charger, or the ADC), and two microphone
backends (PDM, or the ES7210).

**The CC1101 PLUS** is the CC1101 with an **nRF24L01** added (CS 44, CE 43, on the shared SPI): a 2.4 GHz radio of its
own beside the CC1101 -- device-to-device links and cheap nRF24 sensor or mesh nodes. IO43/44 are UART0, so serial
moves to USB-CDC. Nothing else is listed as changed.

**The SI4732** (on the T-Embed's I2C, address 0x63 by its schematic; reset 16, mute 17 in LilyGO's example) receives
**FM 64-108 MHz and 150 kHz-30 MHz** -- long wave, medium wave (AM), short wave, the ham bands and CB -- with **RDS** on FM
and **SSB** (LSB/USB) through a patch. Its sound goes **straight to its own amplifier and speaker** (analog), not through
the ESP32. LilyGO's example is PU2CLR's SI4735 library.

*Sources: github.com/Xinyuan-LilyGO/T-Embed-CC1101 (examples/utilities.h, the V1.0 schematic, examples/factory/page_battery.h);
github.com/Xinyuan-LilyGO/T-Embed (examples/factory/pin_config.h, schematic/T-Embed-SI4732.pdf, examples/SI473x_Shield);
lilygo.cc product pages. Two conflicts in LilyGO's own material: the CC1101 page says the battery is read on IO04, but
IO4 is its encoder (copied from the T-Embed page); utilities.h also defines a "legacy" SDA 18 / SCL 8 for the CC1101,
which is backwards.*

## The T-Watch S3 (and S3 Plus)

ESP32-S3, 16 MB / 8 MB; **ST7789V3, 240x240**; **touch FT6336U** (0x38, its own bus: SDA 39, SCL 40, INT 16); **no
encoder** -- a power button (through the AXP2101) and BOOT. Main I2C SDA 10, SCL 11: **AXP2101 PMU (0x34)**, BMA423
accelerometer (0x19), **PCF8563 clock (0x51)**, **DRV2605 vibration (0x5A)**. Microphone PDM (DATA 47, CLK 44); speaker
MAX98357A (BCLK 48, WS 15, DOUT 46). **LoRa SX1262** (433/868/915; or SX1280 at 2.4 GHz): SCK 3, MISO 4, MOSI 1, CS 5,
RST 8, BUSY 7, DIO1 9. IR TX on 2. **The PMU switches every rail** (ALDO2 backlight, ALDO3 display and touch, ALDO4
radio), so they are turned on first. Battery through the PMU: percent, charging, voltage.

**The Plus**: a 940 mAh battery instead of 470 mAh (charging up to 300 mA), and **GNSS** (u-blox MIA-M10Q or Quectel
LS550G, RX 41 / TX 42). Otherwise the same.

**It is its own build**: power through the PMU first, touch and one button instead of an encoder, a square screen, LoRa
and a clock -- but it shares everything above the hardware layer.

*Sources: github.com/Xinyuan-LilyGO/TTGO_TWatch_Library (t-watch-s3 branch, src/utilities.h);
github.com/Xinyuan-LilyGO/LilyGoLib (docs/hardware); lilygo.cc.*

## The M5Stack StickS3 (C-74)

ESP32-S3-PICO-1-N8R8: **8 MB flash, 8 MB octal PSRAM**. **ST7789P3, 135x240** (MOSI 39, SCK 40, CS 41, DC 45, RST 21,
backlight 38; the panel at offset 52/40, inverted), used on its side as 240x135. **Two buttons, no dial**: KEY1 11 (the
face) and KEY2 12 (the side). I2C SDA 47, SCL 48: **M5PM1 power chip (0x6E)**, **ES8311 codec (0x18)**, BMI270 IMU
(0x68). The codec is both the **speaker** (an AW8737 amplifier and a 1 W speaker) and the **microphone**, on one set of
clocks: MCLK 18, BCLK 17, LRCK 15, DOUT 14 (to the codec), DIN 16 (from it). IR TX 46, RX 42. 250 mAh.

**The M5PM1 does what pins do elsewhere**: its GPIO 2 switches the screen's power on (before the screen is touched), its
GPIO 3 the speaker's amplifier; the cell's voltage is its register 0x22 and USB's 0x24 (mV, little-endian). Each of its
GPIOs is made an output by clearing 0x16 (function), setting 0x10 (direction) and clearing 0x13 (push-pull); 0x11 is
the level. Its I2C idle sleep (0x09) and watchdog (0x0A) are switched off first.

**Its own build** (`env:m5-sticks3`, `BOARD_STICKS3`): the face button is the dial's press (held at home it talks), the
side button the dial (a tap turns to the next, held half a second goes back, two seconds sleeps; asleep, only a hold
on it wakes). The speaker lets go of the codec's clocks while the microphone listens. **Built, not yet run.**

*Sources: docs.m5stack.com/en/core/StickS3 (the pins); github.com/m5stack/M5GFX src/M5GFX.cpp (the panel and the
screen's power through the M5PM1); github.com/m5stack/M5Unified src/M5Unified.inl (the amplifier and the ES8311's
speaker and microphone writes) and src/utility/power/M5PM1_Class.inl (its registers).*

## The M5Stack CoreS3 (C-75)

ESP32-S3: **16 MB flash, 8 MB quad PSRAM** (PlatformIO's own `m5stack-cores3` board; not the octal PSRAM of the
T-Embeds). **ILI9342, 320x240**, touch over it (FT6336, I2C 0x38): SPI MOSI 37, SCK 36, CS 3, and **GPIO 35 both the
screen's D/C and the SD card's MISO** -- M5GFX swaps the pin's role on every chip select; this firmware never reads
the screen or the card, so 35 is only D/C. The panel turns 3 before the app's rotation 1. **Later boards carry an
ILI9342E**, which needs its own start-up (M5GFX tells the two apart by reading the panel back through that shared pin):
this firmware starts the C, and **`PANEL E` down the cable** stores the E and restarts (`PANEL C` goes back).

One I2C bus, SDA 12 / SCL 11: **AXP2101 power chip (0x34)**, **AW9523 expander (0x58)**, **AW88298 amplifier (0x36)**,
**ES7210 microphones (0x40)**, BM8563 clock (0x51), BMI270 IMU (0x69), the touch, and the GC0308 camera (0x21; not on
the SE). **The AW9523 does what pins do elsewhere**: P0_0 the touch's reset, P0_1 the bus's 5 V out (left off), P0_2 the
amplifier's reset, P1_1 the screen's reset, P1_7 the boost converter. **The AXP2101's LDOs are the rails**: ALDO1 1.8 V
the amplifier, ALDO2 3.3 V the microphones, ALDO3 the camera, ALDO4 the SD card, and **DLDO1 the backlight** -- its
voltage is the brightness (0x99; M5GFX's full is 28). **The power key reaches only the AXP2101** and its interrupt pin is
shared with the clock's and not wired to the ESP32, so the key is read by asking the AXP ten times a second.

**Sound**: the speaker (AW88298, 16-bit registers, big-endian) and the microphones (ES7210) **share BCLK 34 and LRCK
33**; the speaker's data is 13, the microphones' 14, their MCLK **GPIO 0** -- so the BOOT pin is not a button here.

**Its own build** (`env:m5-cores3`, `BOARD_CORES3`): it shares the watch's code for the AXP2101, the clock and the touch
(`src/watch.cpp`) -- the face first, swipe to turn, tap to press, hold to go back, TALK held on the face; the power key
wakes it or goes back, held a second it sleeps; at 5% it switches itself off through the AXP2101 and the power key
starts it again. No step counter (its IMU is a BMI270). The speaker lets go of the shared clocks while the microphones
listen. **Built, not yet run**: the touch's way round is a guess to check, as the watch's was.

*Sources: github.com/m5stack/M5GFX src/M5GFX.cpp (the autodetect: the AW9523's start-up, the panel, its backlight and
touch) and src/lgfx/v1/panel/Panel_ILI9342.hpp (the E's start-up); github.com/m5stack/M5Unified src/M5Unified.inl (the
pin tables, the AW88298's and the ES7210's writes) and src/utility/Power_Class.inl (the AXP2101's rails, the power
key, and why only touch can wake it from deep sleep); PlatformIO's boards/m5stack-cores3.json.*

## The M5GO and the M5Stack Fire (C-75)

**The original ESP32, not an S3** -- so a platform of its own in the build. The Fire has 16 MB of flash and 4 MB of PSRAM;
the M5GO's Core has none, which the firmware takes as how to tell them apart (`m5-fire` / `m5go`). One build for both
(`env:m5-core`): 4 MB of flash laid out as `huge_app` (no OTA), PSRAM on for the Fire as PlatformIO's own
`m5stack-fire` board has it. **USB is a USB-serial chip** (CP2104, or CH9102 on later Cores): `/dev/cu.usbserial*` or
`wchusbserial*`, whose DTR and RTS reset the chip -- `firmware/esp32/boardport.py` finds them and opens them with both
held off, so the bridge does not restart the board.

**ILI9342C, 320x240** on SPI MOSI 23, MISO 19 (shared with the SD card), SCK 18, CS 14, D/C 27, RST 33, backlight 32;
the panel turns 3 before the app's rotation 1, and **whether it is inverted is read off RST** (driven low, then read with
a pull-down -- M5GFX's own test; the boards differ). **Buttons A 39, B 38, C 37** (pulled up on the board): A and C turn,
B presses and held at home talks, held A goes back (and undoes), C held two seconds sleeps; asleep only a held B wakes.

I2C SDA 21 / SCL 22: **IP5306 power chip (0x75)** -- set up as M5Unified sets it, but with its boost kept on under a light
load, or it switches a sleeping companion off; the charge only in quarters (0x78), charging and full from 0x70 and 0x71.
**The speaker is the ESP32's own DAC on GPIO 25** (I2S_NUM_0 in built-in DAC mode: unsigned samples, each doubled into
both halves of the frame). **The M5GO base** adds the **microphone, analog on GPIO 34** (read with the ADC at 16 kHz,
its resting level learnt as it listens) and **ten SK6812 lights on GPIO 15**; on a bare Core there are none.

**Its instruction RAM is nearly full** (about 400 bytes left): this SDK puts the Bluetooth controller (30 KB), libc's time
and stdio, and the drivers there. To fit: `strptime` is a stub on this chip (only HTTPClient's unused cookie jar calls
it, `src/esp32_classic.cpp`), the lights go out over SPI instead of Adafruit's RMT driver (`src/leds.cpp`), the IR
receiver is a stub (there is none, `src/radios.cpp`), and the Wi-Fi motion callback is not IRAM. Without PSRAM the M5GO
draws in 256 colours (a 16-bit screen will not fit beside Wi-Fi and Bluetooth) and records as long a talk as the heap
allows, down to two seconds. **Built, not yet run.**

*Sources: github.com/m5stack/M5GFX src/M5GFX.cpp (the M5Stack autodetect: the bus, the panel, its invert test, the
backlight); github.com/m5stack/M5Unified src/M5Unified.inl (the pin tables, the DAC speaker and the M5GO base's
microphone) and src/utility/Power_Class.inl, power/IP5306_Class.inl (the IP5306); PlatformIO's boards
m5stack-core-esp32.json and m5stack-fire.json.*

## The M5Stack Tab5 (C-77)

**ESP32-P4** (RISC-V, 360 MHz, 32 MB PSRAM, 16 MB flash) with an **ESP32-C6** beside it for Wi-Fi 6 and Bluetooth 5,
reached through ESP-Hosted over SDIO. A 5-inch **1280x720** MIPI-DSI screen -- an ILI9881C, ST7121 or ST7123 by when it
was made -- with GT911 or ST touch; **ES8388** speaker codec and **ES7210** microphones; a battery; microSD; a camera.
**M5Stack's own libraries drive all of it** (M5GFX finds the panel and touch at start, M5Unified the sound, microphones
and power), so the firmware names no pins. Its own project: `firmware/tab5/` -- **docs/TAB5.md** has the build, the
toolchain and what is done.

*Sources: docs.m5stack.com/en/core/Tab5; M5GFX src/M5GFX.cpp (its panels and touch); M5Unified src/M5Unified.inl;
pioarduino's boards/m5stack-tab5-p4.json.*

## The AX630C boards (on-device AI, C-75 / C-76)

**LLM630 Compute Kit**: AX630C (two A53 cores at 1.2 GHz; NPU 3.2 TOPS INT8), 4 GB RAM (2 for the NPU), 32 GB eMMC,
Gigabit Ethernet, Wi-Fi 6 through an on-board ESP32-C6, two USB-C, **PortC UART** and PortA I2C, a MIPI display and
camera connector, an IMU, **a 3.7 V battery socket with its own charger and BQ27220 gauge**; 5 V 2 A in. **No microphone,
speaker or battery in the box** -- a 5-pin MIC/SPK header with an amplifier. **90.3 x 31.6 x 12 mm**: shorter and
narrower than a T-Embed (about 120 x 45), so it fits inside a T-Embed-sized back but nothing lines up. Power draw is not
published: measure it.

**LLM Module Kit** (for the M5Stack Cores): the same AX630C (1 GB system, 3 GB NPU), **with a microphone and a 1 W
speaker**, two stacked 54 x 54 mm boards, 5 V, about 0.5 W idle and 1.5 W at full load.

**Software (StackFlow)**: units for keyword wake (kws), voice activity (vad), speech to text (whisper tiny/base/small,
sherpa), the LLM, vision (vlm, yolo) and speech (tts, **melotts**: English, Spanish, Japanese, Chinese -- one fixed voice
per language, **no custom voices** on this chip). Driven by **JSON over UART at 115200** (the Arduino library
**M5Module-LLM**, whose examples include a full KWS -> VAD -> Whisper -> LLM -> TTS voice assistant) or over TCP; and an
**OpenAI-compatible HTTP server** (`/v1/chat/completions`, `/v1/audio/transcriptions`, `/v1/audio/speech`).

| model | first token | speed |
|---|---|---|
| Qwen2.5-0.5B / Qwen3-0.6B | 0.36 s | 10.3 tokens/s |
| Llama 3.2 1B | 0.9 s | 4.5 tokens/s |
| Qwen2.5-1.5B | 3.1 s | 3.6 (4.6 at Int4) tokens/s |

About 1,000 tokens of context. **What it means**: fully offline push to talk at a few seconds a turn on a 0.5B model;
1-1.5B holds a character better, at half the speed; one stock voice (not the INDEX voice). Wired to a T-Embed by three
wires (TX, RX, GND) to its PortC; the LLM630's own battery input is the cleanest power.

*Sources: docs.m5stack.com (LLM630_Compute_Kit, Module-LLM, stackflow/models/benchmark, stackflow/openai_api,
module_llm/arduino_api, voice_assistant); github.com/m5stack/StackFlow, M5Module-LLM, ModuleLLM-OpenAI-Plugin;
cnx-software.com (2025-01-21).*
