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
