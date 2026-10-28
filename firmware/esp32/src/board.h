#pragma once
// C-67: the board this firmware is running on, and what that board can do. Everything above this file asks `board`
// instead of naming a pin, so one build runs on every T-Embed and the watch shares everything but this layer.
//
// The three T-Embeds are one build: they tell themselves apart at start by what answers on I2C (docs/HARDWARE.md).
// The T-Watch S3 is its own build (env:t-watch-s3, BOARD_TWATCH_S3): its power, screen and input are different. So are
// the M5StickS3 (env:m5-sticks3, C-74) and the M5Stack CoreS3 (env:m5-cores3, C-75), which shares the watch's watch.cpp,
// as the M5Stack Dial does (env:m5-dial, C-102). The M5StickC-Plus (env:m5-stickc-plus, C-148) is the StickS3's shape on
// the ORIGINAL ESP32, with an AXP192 for its power.
#include <Arduino.h>

enum class BoardKind { TEmbedCC1101, TEmbed, TEmbedSI4732, TWatchS3, TWatchUltra, M5StickS3, M5CoreS3, M5Core, M5Dial, TDeck, TDisplayPro, TDisplayAmoled, Cardputer, CardputerAdv, M5StickCPlus };   // C-135, C-136; C-148 the StickC-Plus   // TDisplayPro: C-105   // TDeck: C-104   // M5Dial: C-102   // M5Core: the M5GO and the Fire (C-75)
enum class Lights { None, WS2812, APA102 };
enum class Power { None, GaugeBQ27220, AdcDivider, PmuAXP2101, PmuM5PM1, PmuIP5306, ChargerSY6970, PmuAXP192 };   // SY6970: C-105; AXP192: C-148
enum class Mic { None, Pdm, Es7210, Es8311, Es7210Shared, Analog };   // Shared: the CoreS3's, on the speaker's clocks;
                                                                     // Analog: the M5GO base's, read by the ADC
enum class Panel { ST7789, ILI9342C, ILI9342E, ST7796 };       // C-75: the CoreS3 has shipped with either ILI9342; C-105 the T-Display-S3 Pro's ST7796
enum class LoraChip { None, SX1262, SX1278 };                  // C-72: the watch's and the T-Deck's, or an M5 LoRa433 module's

struct Board {
  BoardKind kind = BoardKind::TEmbedCC1101;
  const char *id = "t-embed-cc1101";   // what HELLO says, so updateCompanion.sh knows what is plugged in
  const char *name = "T-Embed CC1101";
  int width = 320, height = 170, rotation = 3;
  // the display: an ST7789 on SPI
  int lcdCs = -1, lcdDc = -1, lcdSclk = -1, lcdMosi = -1, lcdMiso = -1, lcdRst = -1, lcdBl = -1;
  int lcdPanelW = 170, lcdPanelH = 320, lcdOffsetX = 35, lcdOffsetY = 0;
  Panel panel = Panel::ST7789; bool pmuBacklight = false;   // C-75: the CoreS3's backlight is its power chip's DLDO1
  bool lcdInvert = true;                                    // C-75: the M5GO and Fire's panels differ, and say so on RST
  // input: a dial and its press, and a second button where there is one (the CC1101's top button)
  int encA = -1, encB = -1, encKey = -1, sideKey = -1;
  int keyLeft = -1, keyRight = -1;   // C-75: the M5GO and Fire's buttons A and C either side of B (encKey), for a dial
  // the peripherals' power switch, and the shared I2C bus
  int pwrEn = -1, sda = -1, scl = -1;
  // sound out (I2S) and the microphone
  int i2sBclk = -1, i2sLrclk = -1, i2sDout = -1, i2sMclk = -1;   // MCLK: the StickS3's ES8311 codec
  bool dacSpeaker = false;   // C-75: the M5GO and Fire's speaker is the ESP32's own DAC (GPIO 25), not an I2S amplifier
  Mic mic = Mic::None; int micData = -1, micClk = -1, micBclk = -1, micMclk = -1;   // micClk: PDM's clock, or I2S's LRCK
  // the ring of lights
  Lights lights = Lights::None; int ledData = -1, ledClk = -1, ledCount = 0;
  // the battery: a fuel gauge, a voltage divider on an ADC pin, or the watch's power chip
  Power power = Power::None; int battAdc = -1;
  // radios beyond Wi-Fi and Bluetooth, and the rest
  bool ir = false, nfc = false, cc1101 = false, si4732 = false, lora = false, touch = false;
  int irTx = -1, irRx = -1;                // C-150: the board's own IR pins (-1: none -- a board that only sends has no irRx)
  // C-102: a round screen (the Dial's): the screens are drawn in a square inside the circle, at this offset, and the
  // face comes first; and a passive buzzer in place of a speaker (its pin), which plays the tunes but not a voice
  bool round = false; int screenX = 0, screenY = 0; int buzzer = -1;
  float zoom = 1;          // C-173: the canvas drawn this much larger on the panel (the Ultra: 240x280 at 1.6, inside its corners)
  // C-72: the LoRa radio -- its chip and pins. On the watch it has an SPI bus of its own; on the T-Deck it shares the
  // screen's (loraSck is the screen's SCLK then), as the CC1101 does on the T-Embed.
  LoraChip loraChip = LoraChip::None; int loraCs = -1, loraRst = -1, loraBusy = -1, loraDio1 = -1, loraSck = -1, loraMiso = -1, loraMosi = -1;
  // C-104: the T-Deck's keyboard (its own ESP32-C3, I2C 0x55, one character a read), its trackball (four pins that
  // toggle as the ball rolls, and BOOT as its press), its GPS (the Plus, a UART) and its SD card (held off the bus)
  bool keyboard = false; int tbUp = -1, tbDown = -1, tbLeft = -1, tbRight = -1, gpsRx = -1, gpsTx = -1, sdCs = -1;
  // C-136: the lowest band its LoRa antenna is made for (the Cardputer ADV's Cap LoRa-1262: 868-923 MHz) -- a lower band
  // chosen on the site is taken as 868 on this board, so a mixed set of boards still hears what it can
  int loraMinMhz = 0;
  // C-148: a HAT's own I2C pins, where the board has a HAT header (the StickC-Plus: SDA 0, SCL 26) -- the Thermal HAT's
  // MLX90640 is asked there (glow.cpp), on the second I2C port, only while a GLOW routine runs
  int hatSda = -1, hatScl = -1;
  // C-74, C-75: the speaker and the microphone share one set of clocks, so the speaker lets go while it listens
  bool sharedClocks() const { return mic == Mic::Es8311 || mic == Mic::Es7210Shared; }
  bool hasSideKey() const { return sideKey >= 0; }
  bool noDial() const { return encA < 0 && !touch && tbUp < 0; }   // C-74: buttons and no dial (the StickS3; C-75 the M5GO and Fire); C-104: a trackball is a dial
  bool threeKeys() const { return keyLeft >= 0; }      // C-75: A, B and C
};

extern Board board;
// C-173: the watches -- the S3 and the Ultra share the touch, the crown and the 2x2 grids
inline bool isWatch() { return board.kind == BoardKind::TWatchS3 || board.kind == BoardKind::TWatchUltra; }
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
void boardIdleOff();   // the M5GO and Fire: the IP5306 let cut the power once the board is idle, before its deep sleep
String speakerPinTry(const String &mode);   // SPK down the cable: the Fire's G25 held each way, to hear the quietest
