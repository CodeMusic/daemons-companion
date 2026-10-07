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
