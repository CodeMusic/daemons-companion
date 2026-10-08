#pragma once
// C-67: the board this firmware is running on, and what that board can do. Everything above this file asks `board`
// instead of naming a pin, so one build runs on every T-Embed and the watch shares everything but this layer.
//
// The three T-Embeds are one build: they tell themselves apart at start by what answers on I2C (docs/HARDWARE.md).
// The T-Watch S3 is its own build (env:t-watch-s3, BOARD_TWATCH_S3): its power, screen and input are different. So are
// the M5StickS3 (env:m5-sticks3, C-74) and the M5Stack CoreS3 (env:m5-cores3, C-75), which shares the watch's watch.cpp.
#include <Arduino.h>

enum class BoardKind { TEmbedCC1101, TEmbed, TEmbedSI4732, TWatchS3, M5StickS3, M5CoreS3 };
enum class Lights { None, WS2812, APA102 };
enum class Power { None, GaugeBQ27220, AdcDivider, PmuAXP2101, PmuM5PM1 };
enum class Mic { None, Pdm, Es7210, Es8311, Es7210Shared };   // Shared: the CoreS3's, on the speaker's clocks
enum class Panel { ST7789, ILI9342C, ILI9342E };               // C-75: the CoreS3 has shipped with either ILI9342

struct Board {
  BoardKind kind = BoardKind::TEmbedCC1101;
  const char *id = "t-embed-cc1101";   // what HELLO says, so updateCompanion.sh knows what is plugged in
  const char *name = "T-Embed CC1101";
  int width = 320, height = 170, rotation = 3;
  // the display: an ST7789 on SPI
  int lcdCs = -1, lcdDc = -1, lcdSclk = -1, lcdMosi = -1, lcdMiso = -1, lcdRst = -1, lcdBl = -1;
  int lcdPanelW = 170, lcdPanelH = 320, lcdOffsetX = 35, lcdOffsetY = 0;
  Panel panel = Panel::ST7789; bool pmuBacklight = false;   // C-75: the CoreS3's backlight is its power chip's DLDO1
  // input: a dial and its press, and a second button where there is one (the CC1101's top button)
  int encA = -1, encB = -1, encKey = -1, sideKey = -1;
  // the peripherals' power switch, and the shared I2C bus
  int pwrEn = -1, sda = -1, scl = -1;
  // sound out (I2S) and the microphone
  int i2sBclk = -1, i2sLrclk = -1, i2sDout = -1, i2sMclk = -1;   // MCLK: the StickS3's ES8311 codec
  Mic mic = Mic::None; int micData = -1, micClk = -1, micBclk = -1, micMclk = -1;   // micClk: PDM's clock, or I2S's LRCK
  // the ring of lights
  Lights lights = Lights::None; int ledData = -1, ledClk = -1, ledCount = 0;
  // the battery: a fuel gauge, a voltage divider on an ADC pin, or the watch's power chip
  Power power = Power::None; int battAdc = -1;
  // radios beyond Wi-Fi and Bluetooth, and the rest
  bool ir = false, nfc = false, cc1101 = false, si4732 = false, lora = false, touch = false;
  // C-74, C-75: the speaker and the microphone share one set of clocks, so the speaker lets go while it listens
  bool sharedClocks() const { return mic == Mic::Es8311 || mic == Mic::Es7210Shared; }
  bool hasSideKey() const { return sideKey >= 0; }
  bool noDial() const { return encA < 0 && !touch; }   // C-74: two buttons and no dial (the StickS3)
};

extern Board board;
void boardBegin();   // first thing in setup(): find the board and switch on its peripherals
const String &deviceId();   // C-80: this board's own name, its kind and the end of its MAC ("t-embed-cc1101-36f484")
// C-74: the StickS3's power chip (the M5PM1, I2C 0x6E) drives the screen's power (its GPIO 2) and the speaker's
// amplifier (its GPIO 3) -- switched here, as M5Stack's own libraries switch them.
void pm1Gpio(uint8_t pin, bool high);
// C-75: the CoreS3's AW88298 amplifier (on, at this sample rate; or off), its ES7210 microphones set to listen, its
// backlight (the AXP2101's DLDO1), and switching the whole board off through the AXP2101 (false where a board cannot).
void coreS3Speaker(bool on, int rate);
void coreS3Mic();
void pmuBacklight(bool on);
bool boardPowerOff();
