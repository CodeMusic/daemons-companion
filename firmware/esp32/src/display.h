#pragma once
// C-67: the screen, configured from `board` at start (LovyanGFX takes its pins at run time, which TFT_eSPI cannot), and
// the sprite everything is drawn into whole and then pushed, so nothing flickers.
#define LGFX_USE_V1
#include <LovyanGFX.hpp>

// C-75: the later CoreS3s' ILI9342E takes a different start-up (M5GFX's Panel_ILI9342E; LovyanGFX 1.1.16 has only the C).
struct Panel_ILI9342E : public lgfx::Panel_ILI9342 {
 protected:
  const uint8_t *getInitCommands(uint8_t listno) const override;
};

class Display : public lgfx::LGFX_Device {
  lgfx::Panel_ST7789 st7789;
  lgfx::Panel_ILI9342 ili9342c;     // C-75: the CoreS3
  Panel_ILI9342E ili9342e;
  lgfx::Bus_SPI bus;
 public:
  void configure();   // from `board`, before init()
};

extern Display tft;
extern LGFX_Sprite canvas;
extern int W, H;      // the screen as the app draws it (landscape on the T-Embeds, square on the watch)

void displayBegin();          // configure, init, rotate, clear, and make the sprite
void backlight(bool on);
