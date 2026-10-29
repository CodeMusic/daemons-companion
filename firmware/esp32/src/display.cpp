#include "display.h"
#include "board.h"

Display tft;
LGFX_Sprite canvas(&tft);
int W = 320, H = 170;

#if BOARD_TWATCH_ULTRA
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
// C-242: the always-on face's glow -- the AMOLEDs only (powerAod asks for the Ultra alone)
void backlightDim() {
#if BOARD_TDISPLAY_AMOLED || BOARD_TWATCH_ULTRA
  tft.setBrightness(18);
#endif
}
void backlight(bool on) {
  if (board.pmuBacklight) { pmuBacklight(on); return; }   // C-75: the CoreS3's is its power chip's
#if BOARD_DIAL
  tft.setBrightness(on ? 160 : 0); return;                // C-102: M5GFX's PWM on GPIO 9
#endif
#if BOARD_TDISPLAY_AMOLED || BOARD_TWATCH_ULTRA
  tft.setBrightness(on ? powerBright() : 0); return;      // C-135: the AMOLED's own register (0x51); C-173 the Ultra's; C-243 dimmer when low
#endif
  if (board.lcdBl >= 0) { pinMode(board.lcdBl, OUTPUT); digitalWrite(board.lcdBl, on ? HIGH : LOW); }
}

volatile int screenOY = 0;

// The canvas to the panel. C-173: on the Ultra (board.zoom) every panel pixel takes the canvas pixel under it, a band of
// rows at a time while the band before goes out by DMA; a face (faceRows high) is centred in the canvas's height, and
// what lies above and below it is the face's own black.
void present(int faceRows) {
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
}
