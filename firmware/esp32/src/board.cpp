#include <Wire.h>
#include "board.h"
#include "watch.h"

// C-67. Pins are LilyGO's own: T-Embed-CC1101 examples/utilities.h and its V1.0 schematic; T-Embed
// examples/factory/pin_config.h and schematic/T-Embed-SI4732.pdf; TTGO_TWatch_Library (t-watch-s3) src/utilities.h.
// docs/HARDWARE.md has the table and the sources.
Board board;

const String &deviceId() {
  static String id;
  if (!id.length()) {
    uint64_t mac = ESP.getEfuseMac();                      // the factory MAC, low byte first
    char tail[7]; snprintf(tail, sizeof tail, "%02x%02x%02x", (uint8_t)(mac >> 24), (uint8_t)(mac >> 32), (uint8_t)(mac >> 40));
    id = String(board.id) + "-" + tail;
  }
  return id;
}

#ifdef BOARD_TWATCH_S3

void boardBegin() {
  board.kind = BoardKind::TWatchS3; board.id = "t-watch-s3"; board.name = "T-Watch S3";
  board.width = 240; board.height = 240; board.rotation = 2;
  board.lcdCs = 12; board.lcdDc = 38; board.lcdSclk = 18; board.lcdMosi = 13; board.lcdBl = 45;
  board.lcdPanelW = 240; board.lcdPanelH = 240; board.lcdOffsetX = 0; board.lcdOffsetY = 80;
  board.encKey = 0;                                  // BOOT; the power button is read through the AXP2101
  board.sda = 10; board.scl = 11;
  board.i2sBclk = 48; board.i2sLrclk = 15; board.i2sDout = 46;
  board.mic = Mic::Pdm; board.micData = 47; board.micClk = 44;
  board.power = Power::PmuAXP2101;
  board.ir = true; board.lora = true; board.touch = true;
  watchPower();                                      // the PMU switches every rail: on before anything else starts
}

#elif defined(BOARD_STICKS3)

// C-74: the M5Stack StickS3 -- docs.m5stack.com/en/core/StickS3 for the pins (screen MOSI 39, SCK 40, CS 41, DC 45,
// RST 21, backlight 38; KEY1 11, KEY2 12; I2C SDA 47, SCL 48; I2S MCLK 18, BCLK 17, LRCK 15, DOUT 14, DIN 16; IR TX 46,
// RX 42), M5GFX's autodetect for the panel (ST7789, 135x240, offsets 52/40, inverted) and for switching the screen's
// power on through the M5PM1 before it is touched, and M5Unified for the M5PM1's registers and the ES8311's.
static const uint8_t PM1 = 0x6E;
static void pm1Write(uint8_t reg, uint8_t v) { Wire.beginTransmission(PM1); Wire.write(reg); Wire.write(v); Wire.endTransmission(); }
static uint8_t pm1Read(uint8_t reg) {
  Wire.beginTransmission(PM1); Wire.write(reg);
  if (Wire.endTransmission(false) != 0 || Wire.requestFrom(PM1, (uint8_t)1) != 1) return 0;
  return Wire.read();
}
static void pm1Bits(uint8_t reg, uint8_t mask, bool on) { uint8_t v = pm1Read(reg); pm1Write(reg, on ? v | mask : v & ~mask); }

// M5PM1 GPIO n as a push-pull output (0x16 function, 0x10 direction, 0x13 drive), then 0x11 its level.
void pm1Gpio(uint8_t pin, bool high) {
  uint8_t bit = 1 << pin;
  pm1Bits(0x16, bit, false);
  pm1Bits(0x10, bit, true);
  pm1Bits(0x13, bit, false);
  pm1Bits(0x11, bit, high);
}

void boardBegin() {
  board.kind = BoardKind::M5StickS3; board.id = "m5-sticks3"; board.name = "M5StickS3";
  board.width = 240; board.height = 135; board.rotation = 1;              // on its side: the companion's screens are wide
  board.lcdCs = 41; board.lcdDc = 45; board.lcdSclk = 40; board.lcdMosi = 39; board.lcdRst = 21; board.lcdBl = 38;
  board.lcdPanelW = 135; board.lcdPanelH = 240; board.lcdOffsetX = 52; board.lcdOffsetY = 40;
  board.encKey = 11; board.sideKey = 12;                                  // KEY1, the face; KEY2, the side
  board.sda = 47; board.scl = 48;
  board.i2sMclk = 18; board.i2sBclk = 17; board.i2sLrclk = 15; board.i2sDout = 14;
  board.mic = Mic::Es8311; board.micData = 16;                            // the ES8311's microphone shares the speaker's clocks
  board.power = Power::PmuM5PM1;
  board.ir = true;
  Wire.begin(board.sda, board.scl);
  pm1Write(0x09, 0x00);                // the M5PM1's I2C idle sleep off (it is always powered, and keeps what was set)
  pm1Write(0x0A, 0x00);                // and its watchdog
  pm1Gpio(2, true);                    // the screen's power on
  pm1Gpio(3, false);                   // the speaker's amplifier off until a sound plays (sound.cpp)
  delay(100);
}

#elif defined(BOARD_CORES3)

// C-75: the M5Stack CoreS3 (and the CoreS3 SE, the same board without a camera). Everything from M5Stack's own sources,
// as docs/HARDWARE.md says: M5GFX's autodetect for the screen (an ILI9342 on SPI: MOSI 37, SCK 36, CS 3, and GPIO 35 as
// its D/C -- shared with the SD card's MISO, which this firmware never reads -- its reset on the AW9523 expander's P1_1,
// its backlight the AXP2101's DLDO1) and for the AW9523's start-up; M5Unified for the AXP2101's rails, the AW88298
// amplifier (I2C 0x36) and the ES7210 microphones (I2C 0x40), which share BCLK 34 and LRCK 33 (speaker out 13,
// microphones in 14, their MCLK 0). The touch (FT6336, 0x38), the clock (BM8563, 0x51) and the power chip all sit on
// the one I2C bus, SDA 12 / SCL 11. The power key reaches only the AXP2101, so it is read from the AXP's own registers.
#include <Preferences.h>
static const uint8_t AXP = 0x34, AW9523 = 0x58, AW88298 = 0x36, ES7210 = 0x40;
static void i2cWrite(uint8_t addr, uint8_t reg, uint8_t v) { Wire.beginTransmission(addr); Wire.write(reg); Wire.write(v); Wire.endTransmission(); }
static uint8_t i2cRead(uint8_t addr, uint8_t reg) {
  Wire.beginTransmission(addr); Wire.write(reg);
  if (Wire.endTransmission(false) != 0 || Wire.requestFrom(addr, (uint8_t)1) != 1) return 0;
  return Wire.read();
}
static void i2cBits(uint8_t addr, uint8_t reg, uint8_t mask, bool on) { uint8_t v = i2cRead(addr, reg); i2cWrite(addr, reg, on ? v | mask : v & ~mask); }
static void aw88298Write(uint8_t reg, uint16_t v) { Wire.beginTransmission(AW88298); Wire.write(reg); Wire.write(v >> 8); Wire.write(v & 0xFF); Wire.endTransmission(); }

void boardBegin() {
  board.kind = BoardKind::M5CoreS3; board.id = "m5-cores3"; board.name = "M5Stack CoreS3";
  board.width = 320; board.height = 240; board.rotation = 1;
  board.lcdCs = 3; board.lcdDc = 35; board.lcdSclk = 36; board.lcdMosi = 37;
  board.lcdPanelW = 320; board.lcdPanelH = 240; board.lcdOffsetX = 0; board.lcdOffsetY = 0;
  board.pmuBacklight = true;
  board.sda = 12; board.scl = 11;
  board.i2sBclk = 34; board.i2sLrclk = 33; board.i2sDout = 13;
  board.mic = Mic::Es7210Shared; board.micData = 14; board.micMclk = 0;
  board.power = Power::PmuAXP2101;
  board.touch = true;                                   // no key of its own: GPIO 0 is the microphones' MCLK here
  // The panel: the C by default; the E (later boards) when the cable has said PANEL E (net.cpp), since telling them
  // apart means reading the panel back through the pin it shares with the SD card.
  Preferences p; p.begin("board", true); board.panel = p.getString("panel", "C") == "E" ? Panel::ILI9342E : Panel::ILI9342C; p.end();
  Wire.begin(board.sda, board.scl);
  // The AW9523, as M5GFX starts it: P0 touch reset, the AW88298's reset and (bit 1) the bus's 5 V out, which stays off;
  // P1 the screen's reset, and the boost converter (P1_7) for the speaker.
  i2cBits(AW9523, 0x02, 0b00000101, true);
  i2cBits(AW9523, 0x03, 0b10000011, true);
  i2cWrite(AW9523, 0x04, 0b00011000); i2cWrite(AW9523, 0x05, 0b00001100);
  i2cWrite(AW9523, 0x11, 0b00010000); i2cWrite(AW9523, 0x12, 0xFF); i2cWrite(AW9523, 0x13, 0xFF);
  // The AXP2101, as M5Unified starts it: a dip on a weak USB supply restarts the chip rather than switching the board
  // off; every LDO on (ALDO1 1.8 V the amplifier, ALDO2 3.3 V the microphones, ALDO3 the camera, ALDO4 the SD card,
  // DLDO1 the backlight); the power key held 1 s is a long press and 4 s switches off; the ADCs on for the battery.
  i2cBits(AXP, 0x23, 0x1F, false);
  i2cWrite(AXP, 0x90, 0xBF);
  i2cWrite(AXP, 0x92, 18 - 5); i2cWrite(AXP, 0x93, 33 - 5); i2cWrite(AXP, 0x94, 33 - 5); i2cWrite(AXP, 0x95, 33 - 5);
  i2cWrite(AXP, 0x27, 0x00); i2cWrite(AXP, 0x69, 0x11); i2cWrite(AXP, 0x10, 0x30); i2cWrite(AXP, 0x30, 0x0F);
  pmuBacklight(true);
  watchPower();                                         // watch.cpp: the AXP2101 read for the battery and the power key
}

// The backlight is DLDO1's voltage: M5GFX's full brightness is 28 (3.3 V); off, the LDO itself.
void pmuBacklight(bool on) {
  i2cBits(AXP, 0x90, 0x80, on);
  if (on) i2cWrite(AXP, 0x99, 28);
}

// M5Unified's writes for the AW88298: its reset released (AW9523 P0_2), boost off, I2S on, the rate from its table,
// full volume. Off: I2S off and held in reset.
void coreS3Speaker(bool on, int rate) {
  if (!on) { aw88298Write(0x04, 0x4000); i2cBits(AW9523, 0x02, 0b00000100, false); return; }
  i2cBits(AW9523, 0x02, 0b00000100, true);
  static const uint8_t RATES[] = { 4, 5, 6, 8, 10, 11, 15, 20, 22, 44 };
  uint16_t i = 0; int r = (rate + 1102) / 2205;
  while (r > RATES[i] && ++i < sizeof RATES) {}
  aw88298Write(0x61, 0x0673);
  aw88298Write(0x04, 0x4040);
  aw88298Write(0x05, 0x0008);
  aw88298Write(0x06, i | 0x14C0);
  aw88298Write(0x0C, 0x0064);
}

// M5Unified's writes for the ES7210: reset, clocks, 16-bit I2S, the first two microphones at its gain, the others off.
void coreS3Mic() {
  static const uint8_t R[][2] = { {0x00, 0xFF}, {0x00, 0x41}, {0x01, 0x1F}, {0x06, 0x00}, {0x07, 0x20}, {0x08, 0x10},
    {0x09, 0x30}, {0x0A, 0x30}, {0x20, 0x0A}, {0x21, 0x2A}, {0x22, 0x0A}, {0x23, 0x2A}, {0x02, 0xC1}, {0x04, 0x01},
    {0x05, 0x00}, {0x11, 0x60}, {0x40, 0x42}, {0x41, 0x70}, {0x42, 0x70}, {0x43, 0x1B}, {0x44, 0x1B}, {0x45, 0x00},
    {0x46, 0x00}, {0x47, 0x00}, {0x48, 0x00}, {0x49, 0x00}, {0x4A, 0x00}, {0x4B, 0x00}, {0x4C, 0xFF}, {0x01, 0x14} };
  for (auto &w : R) i2cWrite(ES7210, w[0], w[1]);
}

// The AXP2101 switches everything off (M5Unified's powerOff); the power key starts the board again.
bool boardPowerOff() { i2cBits(AXP, 0x10, 0x01, true); delay(100); return true; }

#else

// Does anything answer at this address with the bus on these pins? (The CC1101 board's SDA/SCL are the T-Embed's
// SCL/SDA, so a probe on the wrong pair simply finds nothing.)
static bool answers(int sda, int scl, uint8_t addr) {
  Wire.begin(sda, scl);
  Wire.beginTransmission(addr);
  bool ok = Wire.endTransmission() == 0;
  Wire.end();
  return ok;
}

static void cc1101() {
  board.kind = BoardKind::TEmbedCC1101; board.id = "t-embed-cc1101"; board.name = "T-Embed CC1101";
  board.lcdCs = 41; board.lcdDc = 16; board.lcdSclk = 11; board.lcdMosi = 9; board.lcdMiso = 10; board.lcdBl = 21;
  board.encA = 4; board.encB = 5; board.encKey = 0; board.sideKey = 6;
  board.pwrEn = 15; board.sda = 8; board.scl = 18;
  board.i2sBclk = 46; board.i2sLrclk = 40; board.i2sDout = 7;
  board.mic = Mic::Pdm; board.micData = 42; board.micClk = 39;
  board.lights = Lights::WS2812; board.ledData = 14; board.ledCount = 8;
  board.power = Power::GaugeBQ27220;
  board.ir = true; board.nfc = true; board.cc1101 = true;
}

static void tEmbed(bool si4732) {
  board.kind = si4732 ? BoardKind::TEmbedSI4732 : BoardKind::TEmbed;
  board.id = si4732 ? "t-embed-si4732" : "t-embed";
  board.name = si4732 ? "T-Embed SI4732" : "T-Embed";
  board.lcdCs = 10; board.lcdDc = 13; board.lcdSclk = 12; board.lcdMosi = 11; board.lcdRst = 9; board.lcdBl = 15;
  board.encA = 2; board.encB = 1; board.encKey = 0;   // no second button: the dial does its work (ui.cpp)
  board.pwrEn = 46; board.sda = 18; board.scl = 8;
  board.i2sBclk = 7; board.i2sLrclk = 5; board.i2sDout = 6;
  board.mic = Mic::Es7210;                            // two microphones through an ES7210 (I2C 0x40)
  board.micBclk = 47; board.micClk = 21; board.micData = 14; board.micMclk = 48;   // LilyGO's examples/mic/pin_config.h
  board.lights = Lights::APA102; board.ledData = 42; board.ledClk = 45; board.ledCount = 7;
  board.power = Power::AdcDivider; board.battAdc = 4;
  board.si4732 = si4732;
}

void boardBegin() {
  // Both boards' power switches on first (each pin is harmless on the other board: IO15 is the T-Embed's backlight,
  // IO46 the CC1101's amplifier clock), and the SI4732 out of reset (IO16), so whatever is there can answer.
  pinMode(15, OUTPUT); digitalWrite(15, HIGH);
  pinMode(46, OUTPUT); digitalWrite(46, HIGH);
  pinMode(16, OUTPUT); digitalWrite(16, HIGH);
  delay(30);
  if (answers(8, 18, 0x55) || answers(8, 18, 0x6B)) cc1101();               // the CC1101's gauge or charger
  else tEmbed(answers(18, 8, 0x63) || answers(18, 8, 0x11));                 // the SI4732 module, or a plain T-Embed
  pinMode(board.pwrEn, OUTPUT); digitalWrite(board.pwrEn, HIGH);
  Wire.begin(board.sda, board.scl);                                          // the shared bus, from here on
}

#endif

#ifndef BOARD_STICKS3
void pm1Gpio(uint8_t, bool) {}         // C-74: only the StickS3 has an M5PM1
#endif
#ifndef BOARD_CORES3
void coreS3Speaker(bool, int) {}       // C-75: only the CoreS3 has these
void coreS3Mic() {}
void pmuBacklight(bool) {}
bool boardPowerOff() { return false; }
#endif
