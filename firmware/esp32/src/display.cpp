#include "display.h"
#include "board.h"

Display tft;
LGFX_Sprite canvas(&tft);
int W = 320, H = 170;

void Display::configure() {
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
    bus.config(cfg);
    panel.setBus(&bus);
  }
  {
    auto cfg = panel.config();
    cfg.pin_cs = board.lcdCs;
    cfg.pin_rst = board.lcdRst;
    cfg.pin_busy = -1;
    cfg.memory_width = 240;
    cfg.memory_height = 320;
    cfg.panel_width = board.lcdPanelW;
    cfg.panel_height = board.lcdPanelH;
    cfg.offset_x = board.lcdOffsetX;
    cfg.offset_y = board.lcdOffsetY;
    cfg.invert = true;
    cfg.readable = false;
    cfg.bus_shared = true;               // the CC1101 shares this bus with its radio and SD card
    panel.config(cfg);
  }
  setPanel(&panel);
}

void backlight(bool on) {
  if (board.lcdBl >= 0) { pinMode(board.lcdBl, OUTPUT); digitalWrite(board.lcdBl, on ? HIGH : LOW); }
}

void displayBegin() {
  W = board.width; H = board.height;
  tft.configure();
  tft.init();
  tft.setRotation(board.rotation);
  tft.fillScreen(0x18E4);                // INK, so it does not flash white
  backlight(true);
  canvas.setColorDepth(16);
  canvas.setPsram(true);
  canvas.createSprite(W, H);
}
