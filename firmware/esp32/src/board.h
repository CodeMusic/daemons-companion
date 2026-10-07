#pragma once
// C-67: the board this firmware is running on, and what that board can do. Everything above this file asks `board`
// instead of naming a pin, so one build runs on every T-Embed and the watch shares everything but this layer.
//
// The three T-Embeds are one build: they tell themselves apart at start by what answers on I2C (docs/HARDWARE.md).
// The T-Watch S3 is its own build (env:t-watch-s3, BOARD_TWATCH_S3): its power, screen and input are different.
#include <Arduino.h>

enum class BoardKind { TEmbedCC1101, TEmbed, TEmbedSI4732, TWatchS3 };
enum class Lights { None, WS2812, APA102 };
enum class Power { None, GaugeBQ27220, AdcDivider, PmuAXP2101 };
enum class Mic { None, Pdm, Es7210 };

struct Board {
  BoardKind kind = BoardKind::TEmbedCC1101;
  const char *id = "t-embed-cc1101";   // what HELLO says, so updateCompanion.sh knows what is plugged in
  const char *name = "T-Embed CC1101";
  int width = 320, height = 170, rotation = 3;
  // the display: an ST7789 on SPI
  int lcdCs = -1, lcdDc = -1, lcdSclk = -1, lcdMosi = -1, lcdMiso = -1, lcdRst = -1, lcdBl = -1;
  int lcdPanelW = 170, lcdPanelH = 320, lcdOffsetX = 35, lcdOffsetY = 0;
  // input: a dial and its press, and a second button where there is one (the CC1101's top button)
  int encA = -1, encB = -1, encKey = -1, sideKey = -1;
  // the peripherals' power switch, and the shared I2C bus
  int pwrEn = -1, sda = -1, scl = -1;
  // sound out (I2S) and the microphone
  int i2sBclk = -1, i2sLrclk = -1, i2sDout = -1;
  Mic mic = Mic::None; int micData = -1, micClk = -1;
  // the ring of lights
  Lights lights = Lights::None; int ledData = -1, ledClk = -1, ledCount = 0;
  // the battery: a fuel gauge, a voltage divider on an ADC pin, or the watch's power chip
  Power power = Power::None; int battAdc = -1;
  // radios beyond Wi-Fi and Bluetooth, and the rest
  bool ir = false, nfc = false, cc1101 = false, si4732 = false, lora = false, touch = false;
  bool hasSideKey() const { return sideKey >= 0; }
};

extern Board board;
void boardBegin();   // first thing in setup(): find the board and switch on its peripherals
const String &deviceId();   // C-80: this board's own name, its kind and the end of its MAC ("t-embed-cc1101-36f484")
