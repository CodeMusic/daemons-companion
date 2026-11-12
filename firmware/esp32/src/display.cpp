#include "display.h"
#include "board.h"
#if BOARD_TGLASS
#include <Preferences.h>
#include "glass.h"
#endif

Display tft;
LGFX_Sprite canvas(&tft);
int W = 320, H = 170;

#if BOARD_TGLASS
// C-262: LilyGO's own start-up for the JD9613 (src/initSequence.cpp, MIT), as LovyanGFX lists commands: the command,
// how many bytes follow, the bytes. Out of sleep and on at the end, as LilyGO's driver does after it.
const uint8_t *Panel_JD9613::getInitCommands(uint8_t listno) const {
  static constexpr uint8_t list0[] = {
    0xFE, 1, 0x01,
    0xF7, 3, 0x96, 0x13, 0xa9,
    0x90, 1, 0x01,
    0x2C, 14, 0x19, 0x0b, 0x24, 0x1b, 0x1b, 0x1b, 0xaa, 0x50, 0x01, 0x16, 0x04, 0x04, 0x04, 0xd7,
    0x2D, 3, 0x66, 0x56, 0x55,
    0x2E, 9, 0x24, 0x04, 0x3f, 0x30, 0x30, 0xa8, 0xb8, 0xb8, 0x07,
    0x33, 12, 0x03, 0x03, 0x03, 0x19, 0x19, 0x19, 0x13, 0x13, 0x13, 0x1a, 0x1a, 0x1a,
    0x10, 13, 0x0b, 0x08, 0x64, 0xae, 0x0b, 0x08, 0x64, 0xae, 0x00, 0x80, 0x00, 0x00, 0x01,
    0x11, 5, 0x01, 0x1e, 0x01, 0x1e, 0x00,
    0x03, 5, 0x93, 0x1c, 0x00, 0x01, 0x7e,
    0x19, 1, 0x00,
    0x31, 6, 0x1b, 0x00, 0x06, 0x05, 0x05, 0x05,
    0x35, 4, 0x00, 0x80, 0x80, 0x00,
    0x12, 1, 0x1b,
    0x1A, 8, 0x01, 0x20, 0x00, 0x08, 0x01, 0x06, 0x06, 0x06,
    0x74, 7, 0xbd, 0x00, 0x01, 0x08, 0x01, 0xbb, 0x98,
    0x6C, 9, 0xdc, 0x08, 0x02, 0x01, 0x08, 0x01, 0x30, 0x08, 0x00,
    0x6D, 9, 0xdc, 0x08, 0x02, 0x01, 0x08, 0x02, 0x30, 0x08, 0x00,
    0x76, 9, 0xda, 0x00, 0x02, 0x20, 0x39, 0x80, 0x80, 0x50, 0x05,
    0x6E, 9, 0xdc, 0x00, 0x02, 0x01, 0x00, 0x02, 0x4f, 0x02, 0x00,
    0x6F, 9, 0xdc, 0x00, 0x02, 0x01, 0x00, 0x01, 0x4f, 0x02, 0x00,
    0x80, 7, 0xbd, 0x00, 0x01, 0x08, 0x01, 0xbb, 0x98,
    0x78, 9, 0xdc, 0x08, 0x02, 0x01, 0x08, 0x01, 0x30, 0x08, 0x00,
    0x79, 9, 0xdc, 0x08, 0x02, 0x01, 0x08, 0x02, 0x30, 0x08, 0x00,
    0x82, 9, 0xda, 0x40, 0x02, 0x20, 0x39, 0x00, 0x80, 0x50, 0x05,
    0x7A, 9, 0xdc, 0x00, 0x02, 0x01, 0x00, 0x02, 0x4f, 0x02, 0x00,
    0x7B, 9, 0xdc, 0x00, 0x02, 0x01, 0x00, 0x01, 0x4f, 0x02, 0x00,
    0x84, 10, 0x01, 0x00, 0x09, 0x19, 0x19, 0x19, 0x19, 0x19, 0x19, 0x19,
    0x85, 10, 0x19, 0x19, 0x19, 0x03, 0x02, 0x08, 0x19, 0x19, 0x19, 0x19,
    0x20, 12, 0x20, 0x00, 0x08, 0x00, 0x02, 0x00, 0x40, 0x00, 0x10, 0x00, 0x04, 0x00,
    0x1E, 12, 0x40, 0x00, 0x10, 0x00, 0x04, 0x00, 0x20, 0x00, 0x08, 0x00, 0x02, 0x00,
    0x24, 12, 0x20, 0x00, 0x08, 0x00, 0x02, 0x00, 0x40, 0x00, 0x10, 0x00, 0x04, 0x00,
    0x22, 12, 0x40, 0x00, 0x10, 0x00, 0x04, 0x00, 0x20, 0x00, 0x08, 0x00, 0x02, 0x00,
    0x13, 3, 0x63, 0x52, 0x41,
    0x14, 3, 0x36, 0x25, 0x14,
    0x15, 3, 0x63, 0x52, 0x41,
    0x16, 3, 0x36, 0x25, 0x14,
    0x1D, 3, 0x10, 0x00, 0x00,
    0x2A, 2, 0x0d, 0x07,
    0x27, 6, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05,
    0x28, 6, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05,
    0x26, 2, 0x01, 0x01,
    0x86, 2, 0x01, 0x01,
    0xFE, 1, 0x02,
    0x16, 5, 0x81, 0x43, 0x23, 0x1e, 0x03,
    0xFE, 1, 0x03,
    0x60, 1, 0x01,
    0x61, 15, 0x00, 0x00, 0x00, 0x00, 0x11, 0x00, 0x0d, 0x26, 0x5a, 0x80, 0x80, 0x95, 0xf8, 0x3b, 0x75,
    0x62, 15, 0x21, 0x22, 0x32, 0x43, 0x44, 0xd7, 0x0a, 0x59, 0xa1, 0xe1, 0x52, 0xb7, 0x11, 0x64, 0xb1,
    0x63, 11, 0x54, 0x55, 0x66, 0x06, 0xfb, 0x3f, 0x81, 0xc6, 0x06, 0x45, 0x83,
    0x64, 15, 0x00, 0x00, 0x11, 0x11, 0x21, 0x00, 0x23, 0x6a, 0xf8, 0x63, 0x67, 0x70, 0xa5, 0xdc, 0x02,
    0x65, 15, 0x22, 0x22, 0x32, 0x43, 0x44, 0x24, 0x44, 0x82, 0xc1, 0xf8, 0x61, 0xbf, 0x13, 0x62, 0xad,
    0x66, 11, 0x54, 0x55, 0x65, 0x06, 0xf5, 0x37, 0x76, 0xb8, 0xf5, 0x31, 0x6c,
    0x67, 15, 0x00, 0x10, 0x22, 0x22, 0x22, 0x00, 0x37, 0xa4, 0x7e, 0x22, 0x25, 0x2c, 0x4c, 0x72, 0x9a,
    0x68, 15, 0x22, 0x33, 0x43, 0x44, 0x55, 0xc1, 0xe5, 0x2d, 0x6f, 0xaf, 0x23, 0x8f, 0xf3, 0x50, 0xa6,
    0x69, 11, 0x65, 0x66, 0x77, 0x07, 0xfd, 0x4e, 0x9c, 0xed, 0x39, 0x86, 0xd3,
    0xFE, 1, 0x05,
    0x61, 15, 0x00, 0x31, 0x44, 0x54, 0x55, 0x00, 0x92, 0xb5, 0x88, 0x19, 0x90, 0xe8, 0x3e, 0x71, 0xa5,
    0x62, 15, 0x55, 0x66, 0x76, 0x77, 0x88, 0xce, 0xf2, 0x32, 0x6e, 0xc4, 0x34, 0x8b, 0xd9, 0x2a, 0x7d,
    0x63, 11, 0x98, 0x99, 0xaa, 0x0a, 0xdc, 0x2e, 0x7d, 0xc3, 0x0d, 0x5b, 0x9e,
    0x64, 15, 0x00, 0x31, 0x44, 0x54, 0x55, 0x00, 0xa2, 0xe5, 0xcd, 0x5c, 0x94, 0xcf, 0x09, 0x4a, 0x72,
    0x65, 15, 0x55, 0x65, 0x66, 0x77, 0x87, 0x9c, 0xc2, 0xff, 0x36, 0x6a, 0xec, 0x45, 0x91, 0xd8, 0x20,
    0x66, 11, 0x88, 0x98, 0x99, 0x0a, 0x68, 0xb0, 0xfb, 0x43, 0x8c, 0xd5, 0x0e,
    0x67, 15, 0x00, 0x42, 0x55, 0x55, 0x55, 0x00, 0xcb, 0x62, 0xc5, 0x09, 0x44, 0x72, 0xa9, 0xd6, 0xfd,
    0x68, 15, 0x66, 0x66, 0x77, 0x87, 0x98, 0x21, 0x45, 0x96, 0xed, 0x29, 0x90, 0xee, 0x4b, 0xb1, 0x13,
    0x69, 11, 0x99, 0xaa, 0xba, 0x0b, 0x6a, 0xb8, 0x0d, 0x62, 0xb8, 0x0e, 0x54,
    0xFE, 1, 0x07,
    0x3E, 1, 0x00,
    0x42, 2, 0x03, 0x10,
    0x4A, 1, 0x31,
    0x5C, 1, 0x01,
    0x3C, 6, 0x07, 0x00, 0x24, 0x04, 0x3f, 0xe2,
    0x44, 4, 0x03, 0x40, 0x3f, 0x02,
    0x12, 10, 0xaa, 0xaa, 0xc0, 0xc8, 0xd0, 0xd8, 0xe0, 0xe8, 0xf0, 0xf8,
    0x11, 15, 0xaa, 0xaa, 0xaa, 0x60, 0x68, 0x70, 0x78, 0x80, 0x88, 0x90, 0x98, 0xa0, 0xa8, 0xb0, 0xb8,
    0x10, 15, 0xaa, 0xaa, 0xaa, 0x00, 0x08, 0x10, 0x18, 0x20, 0x28, 0x30, 0x38, 0x40, 0x48, 0x50, 0x58,
    0x14, 16, 0x03, 0x1f, 0x3f, 0x5f, 0x7f, 0x9f, 0xbf, 0xdf, 0x03, 0x1f, 0x3f, 0x5f, 0x7f, 0x9f, 0xbf, 0xdf,
    0x18, 12, 0x70, 0x1a, 0x22, 0xbb, 0xaa, 0xff, 0x24, 0x71, 0x0f, 0x01, 0x00, 0x03,
    0xFE, 1, 0x00,
    0x3A, 1, 0x55,
    0xC4, 1, 0x80,
    0x2A, 4, 0x00, 0x00, 0x00, 0x7d,
    0x2B, 4, 0x00, 0x00, 0x01, 0x25,
    0x35, 1, 0x00,
    0x53, 1, 0x28,
    0x51, 1, 0xff,
    0x11, 0 + CMD_INIT_DELAY, 120,
    0x29, 0 + CMD_INIT_DELAY, 120,
    0xFF, 0xFF,
  };
  return listno == 0 ? list0 : nullptr;
}
bool glassMirror = false;
static int glassTurn = 0, glassRow = 168, glassBright = 200;
void glassPanelSettings() {                 // kept by GLASS down the cable (glass.cpp); V2's prism: upright, the last 126 rows
  Preferences p; p.begin("glass", true);
  glassTurn = p.getInt("turn", 0) & 3; glassMirror = p.getBool("mirror", false);
  glassRow = p.getInt("row", 168); glassBright = p.getInt("bright", 200);
  p.end();
  tft.setRotation(0);                       // MADCTL again, with the mirror as it is now
  tft.fillScreen(TFT_BLACK);
  tft.setBrightness(glassBright);
}
void Display::configure() {
  {
    auto cfg = bus.config();
    cfg.spi_host = SPI3_HOST; cfg.spi_mode = 0; cfg.freq_write = 40000000; cfg.freq_read = 16000000;
    cfg.pin_sclk = 15; cfg.pin_mosi = 16; cfg.pin_miso = -1; cfg.pin_dc = 21;
    cfg.spi_3wire = false; cfg.dma_channel = SPI_DMA_CH_AUTO;
    bus.config(cfg);
    panel.setBus(&bus);
  }
  {
    auto cfg = panel.config();
    cfg.pin_cs = 17; cfg.pin_rst = 18; cfg.pin_busy = -1;
    cfg.panel_width = cfg.memory_width = 126; cfg.panel_height = cfg.memory_height = 294;
    cfg.offset_x = cfg.offset_y = 0; cfg.offset_rotation = 0; cfg.readable = false; cfg.invert = false;
    cfg.rgb_order = true;                   // MADCTL's colour bit left clear, as LilyGO leaves it
    cfg.bus_shared = false;
    panel.config(cfg);
  }
  setPanel(&panel);
}
#elif BOARD_TWATCH_ULTRA
void Display::configure() {                 // C-173: LilyGO's pins (pins_arduino.h for lilygo_twatch_ultra)
  {
    auto cfg = bus.config();
    cfg.freq_write = 80000000; cfg.freq_read = 20000000;
    cfg.pin_sclk = 40; cfg.pin_io0 = 38; cfg.pin_io1 = 39; cfg.pin_io2 = 42; cfg.pin_io3 = 45;
    cfg.spi_host = SPI3_HOST;               // SPI2 is the LoRa radio's (FSPI, lora.cpp): shared, it took the screen's pins cfg.spi_mode = SPI_MODE0; cfg.dma_channel = SPI_DMA_CH_AUTO;
    bus.config(cfg);
    panel.setBus(&bus);
  }
  {
    auto cfg = panel.config();
    cfg.pin_cs = 41; cfg.pin_rst = -1;                // LilyGO starts it without its reset line (DISP_RST, 37, unused)
    cfg.panel_width = 410; cfg.panel_height = 502; cfg.memory_width = 480; cfg.memory_height = 502;
    cfg.offset_x = 22; cfg.offset_y = 0; cfg.readable = false;
    panel.config(cfg);
  }
  setPanel(&panel);
}
#elif BOARD_TDISPLAY_AMOLED
void Display::configure() {                 // C-135: LovyanGFX 1.2.19's own settings for this board
  {
    auto cfg = bus.config();
    cfg.freq_write = 75000000; cfg.freq_read = 20000000;
    cfg.pin_sclk = 47; cfg.pin_io0 = 18; cfg.pin_io1 = 7; cfg.pin_io2 = 48; cfg.pin_io3 = 5;
    cfg.spi_host = SPI2_HOST; cfg.spi_mode = SPI_MODE0; cfg.dma_channel = SPI_DMA_CH_AUTO;
    bus.config(cfg);
    panel.setBus(&bus);
  }
  {
    auto cfg = panel.config();
    cfg.pin_rst = 17; cfg.pin_cs = 6; cfg.panel_width = 240; cfg.panel_height = 536; cfg.readable = true;
    panel.config(cfg);
  }
  setPanel(&panel);
}
#elif !BOARD_CORES3 && !BOARD_DIAL
// M5GFX's list for the ILI9342E (lgfx/v1/panel/Panel_ILI9342.hpp in M5Stack's fork): its own EXTC (DDh), power and
// gamma registers. The C's list must not be sent to it.
const uint8_t *Panel_ILI9342E::getInitCommands(uint8_t listno) const {
  static constexpr uint8_t list0[] = {
    0xDD, 1, 0x01,
    0xD5, 1, 0x00,
    0xB1, 1, 0x22,
    0xC8, 1, 0x38,
    0xCB, 1, 0x1C,
    0xC9, 1, 0x1A,
    0xCA, 1, 0x1A,
    0xB7, 4, 0x5A, 0x41, 0x11, 0x19,
    0xE4, 15, 0x04, 0x08, 0x11, 0x06, 0x12, 0x07, 0x3A, 0x76, 0x47, 0x07, 0x0F, 0x0A, 0x11, 0x19, 0x05,
    0xE5, 15, 0x02, 0x03, 0x07, 0x06, 0x12, 0x07, 0x36, 0x5F, 0x48, 0x06, 0x10, 0x0C, 0x16, 0x14, 0x09,
    0x38, 0,                                        // idle mode off
    0x29, 0,                                        // display on
    0x11, 0 + CMD_INIT_DELAY, 120,                  // out of sleep
    0xFF, 0xFF,
  };
  return listno == 0 ? list0 : nullptr;
}

void Display::configure() {
  lgfx::Panel_Device &panel = board.panel == Panel::ILI9342C ? (lgfx::Panel_Device &)ili9342c
                            : board.panel == Panel::ILI9342E ? (lgfx::Panel_Device &)ili9342e
                            : board.panel == Panel::ST7796 ? (lgfx::Panel_Device &)st7796 : (lgfx::Panel_Device &)st7789;
  bool ili = board.panel == Panel::ILI9342C || board.panel == Panel::ILI9342E;
  bool st7796Panel = board.panel == Panel::ST7796;   // C-105: 320x480 memory, the 222 columns of glass at 49
  {
    auto cfg = bus.config();
    cfg.spi_host = SPI3_HOST;            // the CC1101 build ran on TFT_eSPI's HSPI, which is SPI3 on the S3
    cfg.spi_mode = 0;
    cfg.freq_write = 40000000;
    cfg.freq_read = 20000000;
    cfg.pin_sclk = board.lcdSclk;
    cfg.pin_mosi = board.lcdMosi;
    cfg.pin_miso = board.lcdMiso;
    cfg.pin_dc = board.lcdDc;
    // as M5GFX drives the CoreS3 (its D/C pin is also the SD card's MISO) -- but not with a LoRa433 module on an M5GO
    // or Fire: there the radio reads on the same host (C-123), and a half-duplex host never hears its MISO
    cfg.spi_3wire = !(board.kind == BoardKind::M5Core && board.loraChip != LoraChip::None);
    bus.config(cfg);
    panel.setBus(&bus);
  }
  {
    auto cfg = panel.config();
    cfg.pin_cs = board.lcdCs;
    cfg.pin_rst = board.lcdRst;
    cfg.pin_busy = -1;
    cfg.memory_width = ili || st7796Panel ? 320 : 240;
    cfg.memory_height = ili ? 240 : st7796Panel ? 480 : 320;
    cfg.panel_width = board.lcdPanelW;
    cfg.panel_height = board.lcdPanelH;
    cfg.offset_x = board.lcdOffsetX;
    cfg.offset_y = board.lcdOffsetY;
    cfg.offset_rotation = ili ? 3 : 0;  // C-75: M5GFX's turn for the CoreS3's panel
    cfg.invert = board.lcdInvert;        // C-75: the M5GO and Fire's panels differ (board.cpp reads which)
    cfg.readable = false;
    cfg.bus_shared = true;               // the CC1101 shares this bus with its radio and SD card
    panel.config(cfg);
  }
  setPanel(&panel);
}
#endif

uint8_t powerBright();   // power.cpp: C-243 dims it
#if BOARD_TWATCH_S3 && !BOARD_TWATCH_ULTRA
// C-347: the T-Watch S3's backlight (GPIO 45) driven by PWM, not switched full on -- the LCD's light is most of what its
// 400 mAh cell spends awake, so it shines at BATTERY's level (200, 70 in low power) as the Ultra's AMOLED does, and the
// night's glance is dim. Channel 7 at 5 kHz: the watch's other PWM (none) is elsewhere.
static void s3Light(uint8_t level) {
  static bool ready = false;
  if (!ready) { ledcSetup(7, 5000, 8); ledcAttachPin(board.lcdBl, 7); ready = true; }
  ledcWrite(7, level);
}
#endif
// C-242: the always-on face's glow -- the AMOLEDs only (powerAod asks for the Ultra alone); C-347 the S3's glance
void backlightDim() {
#if BOARD_TDISPLAY_AMOLED || BOARD_TWATCH_ULTRA
  tft.setBrightness(18);
#elif BOARD_TWATCH_S3
  s3Light(24);
#endif
}
// C-255: the Ultra's AMOLED put to sleep (its SLPIN) while the watch sleeps without the always-on face -- dark at
// brightness 0 it still scans; asleep it draws almost nothing, and keeps what it held
void panelRest(bool rest) {
#if BOARD_TWATCH_ULTRA || BOARD_TGLASS || BOARD_TWATCH_S3   // C-262: the glasses' too; C-347 the S3's ST7789 (SLPIN)
  static bool resting = false;
  if (rest == resting) return;
  resting = rest;
#if BOARD_TWATCH_S3 && !BOARD_TWATCH_ULTRA
  void watchBacklightRail(bool on);                       // watch.cpp: C-347, the light's rail off while it rests
  if (!rest) watchBacklightRail(true);
#endif
  if (rest) tft.sleep(); else tft.wakeup();
#if BOARD_TWATCH_S3 && !BOARD_TWATCH_ULTRA
  if (rest) watchBacklightRail(false);
#endif
#endif
}
void backlight(bool on) {
  if (board.pmuBacklight) { pmuBacklight(on); return; }   // C-75: the CoreS3's is its power chip's
#if BOARD_TGLASS
  tft.setBrightness(on ? glassBright : 0); return;        // C-262: the AMOLED's register (0x51)
#endif
#if BOARD_DIAL
  tft.setBrightness(on ? 160 : 0); return;                // C-102: M5GFX's PWM on GPIO 9
#endif
#if BOARD_TDISPLAY_AMOLED || BOARD_TWATCH_ULTRA
  tft.setBrightness(on ? powerBright() : 0); return;      // C-135: the AMOLED's own register (0x51); C-173 the Ultra's; C-243 dimmer when low
#endif
#if BOARD_TWATCH_S3 && !BOARD_TWATCH_ULTRA
  s3Light(on ? powerBright() : 0); return;                // C-347: the S3's, by PWM
#endif
  if (board.lcdBl >= 0) { pinMode(board.lcdBl, OUTPUT); digitalWrite(board.lcdBl, on ? HIGH : LOW); }
}

volatile int screenOY = 0;

// The canvas to the panel. C-173: on the Ultra (board.zoom) every panel pixel takes the canvas pixel under it, a band of
// rows at a time while the band before goes out by DMA; a face (faceRows high) is centred in the canvas's height, and
// what lies above and below it is the face's own black.
void present(int faceRows) {
#if BOARD_TGLASS
  // C-262: the 126 square turned as GLASS TURN says, into the rows the prism shows (GLASS ROW)
  static lgfx::swap565_t *gbuf = (lgfx::swap565_t *)heap_caps_malloc(126 * 126 * 2, MALLOC_CAP_DMA);
  const lgfx::swap565_t *gsrc = (const lgfx::swap565_t *)canvas.getBuffer();
  if (!gbuf || W != 126 || H != 126) { canvas.pushSprite(0, glassRow); return; }
  for (int y = 0; y < 126; y++) for (int x = 0; x < 126; x++) {
    int sx = x, sy = y;
    switch (glassTurn) { case 1: sx = y; sy = 125 - x; break; case 2: sx = 125 - x; sy = 125 - y; break; case 3: sx = 125 - y; sy = x; break; }
    gbuf[y * 126 + x] = gsrc[sy * 126 + sx];
  }
  tft.pushImageDMA(0, glassRow, 126, 126, gbuf); tft.waitDMA();
  return;
#endif
  if (board.zoom == 1) { canvas.pushSprite(board.screenX, board.screenY); return; }
  const int PW = (int)(W * board.zoom + 0.5f), PH = (int)(H * board.zoom + 0.5f), BAND = 16;
  static lgfx::swap565_t *buf[2]; static int16_t *xmap; static int mapW = 0;
  if (!buf[0]) for (auto &b : buf) b = (lgfx::swap565_t *)heap_caps_malloc(PW * BAND * 2, MALLOC_CAP_DMA);
  if (mapW != PW) { free(xmap); xmap = (int16_t *)malloc(PW * 2); for (int x = 0; x < PW; x++) xmap[x] = x * W / PW; mapW = PW; }
  if (!buf[0] || !buf[1] || !xmap) { canvas.pushSprite(board.screenX, board.screenY); return; }
  int oy = faceRows ? (H - faceRows) / 2 : 0, rows = faceRows ? faceRows : H;
  screenOY = oy;
  const lgfx::swap565_t *src = (const lgfx::swap565_t *)canvas.getBuffer();
  tft.startWrite();
  for (int y0 = 0, k = 0; y0 < PH; y0 += BAND, k ^= 1) {
    int n = min(BAND, PH - y0);
    lgfx::swap565_t *out = buf[k];
    for (int r = 0; r < n; r++, out += PW) {
      int ly = (y0 + r) * H / PH - oy;
      if (ly < 0 || ly >= rows) { memset(out, 0, PW * 2); continue; }
      const lgfx::swap565_t *row = src + ly * W;
      for (int x = 0; x < PW; x++) out[x] = row[xmap[x]];
    }
    tft.waitDMA();                                    // the other band has gone, so this one may follow it
    tft.pushImageDMA(board.screenX, board.screenY + y0, PW, n, buf[k]);
  }
  tft.waitDMA();
  tft.endWrite();
}

void displayBegin() {
  W = board.width; H = board.height;
  tft.configure();
  tft.init();
#if BOARD_CORES3
  // C-98: M5GFX spoke to the AW9523 and the power chip on its own I2C port, on the same two pins; the touch, the clock
  // and the power chip are read through Wire, so the pins go back to it
  Serial.printf("boot: screen %s\n", tft.getBoard() == m5gfx::board_t::board_M5StackCoreS3 ? "CoreS3"
                                    : tft.getBoard() == m5gfx::board_t::board_M5StackCoreS3SE ? "CoreS3 SE" : "not found");
  Wire.end(); Wire.begin(board.sda, board.scl);
#elif BOARD_DIAL
  // C-102: M5GFX took the touch's pins (11, 12) for its own I2C port; the touch and the clock are read through Wire
  Serial.printf("boot: screen %s\n", tft.getBoard() == m5gfx::board_t::board_M5Dial ? "Dial" : "not found");
  Wire.end(); Wire.begin(board.sda, board.scl);
#endif
  tft.setRotation(board.rotation);
  tft.fillScreen(board.zoom == 1 ? 0x18E4 : TFT_BLACK);   // INK, so it does not flash white -- C-173: the Ultra's corners black
  backlight(true);
  // C-75: the M5GO has no PSRAM, and a whole 320x240 screen at 16 bits (150 KB) will not fit beside Wi-Fi and Bluetooth:
  // there it draws in 256 colours (75 KB). Every other board has PSRAM.
  bool psram = psramFound();
  canvas.setColorDepth(psram || W * H * 2 <= 96000 ? 16 : 8);   // C-102: the Dial's 200 square fits in 16 bits (80 KB)
  canvas.setPsram(psram);
  canvas.createSprite(W, H);
#if BOARD_TGLASS
  glassPanelSettings();                     // C-262: the turn, mirror, row and brightness kept in flash
#endif
}
