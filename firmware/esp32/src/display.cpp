#include "display.h"
#include "board.h"

Display tft;
LGFX_Sprite canvas(&tft);
int W = 320, H = 170;

#if !BOARD_CORES3 && !BOARD_DIAL
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
                            : board.panel == Panel::ILI9342E ? (lgfx::Panel_Device &)ili9342e : (lgfx::Panel_Device &)st7789;
  bool ili = board.panel != Panel::ST7789;
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
    cfg.spi_3wire = true;                // as M5GFX drives the CoreS3 (its D/C pin is also the SD card's MISO)
    bus.config(cfg);
    panel.setBus(&bus);
  }
  {
    auto cfg = panel.config();
    cfg.pin_cs = board.lcdCs;
    cfg.pin_rst = board.lcdRst;
    cfg.pin_busy = -1;
    cfg.memory_width = ili ? 320 : 240;
    cfg.memory_height = ili ? 240 : 320;
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

void backlight(bool on) {
  if (board.pmuBacklight) { pmuBacklight(on); return; }   // C-75: the CoreS3's is its power chip's
#if BOARD_DIAL
  tft.setBrightness(on ? 160 : 0); return;                // C-102: M5GFX's PWM on GPIO 9
#endif
  if (board.lcdBl >= 0) { pinMode(board.lcdBl, OUTPUT); digitalWrite(board.lcdBl, on ? HIGH : LOW); }
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
  tft.fillScreen(0x18E4);                // INK, so it does not flash white
  backlight(true);
  // C-75: the M5GO has no PSRAM, and a whole 320x240 screen at 16 bits (150 KB) will not fit beside Wi-Fi and Bluetooth:
  // there it draws in 256 colours (75 KB). Every other board has PSRAM.
  bool psram = psramFound();
  canvas.setColorDepth(psram || W * H * 2 <= 96000 ? 16 : 8);   // C-102: the Dial's 200 square fits in 16 bits (80 KB)
  canvas.setPsram(psram);
  canvas.createSprite(W, H);
}
