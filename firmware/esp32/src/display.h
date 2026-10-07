#pragma once
// C-67: the screen, configured from `board` at start (LovyanGFX takes its pins at run time, which TFT_eSPI cannot), and
// the sprite everything is drawn into whole and then pushed, so nothing flickers.
#define LGFX_USE_V1
#include <LovyanGFX.hpp>

class Display : public lgfx::LGFX_Device {
  lgfx::Panel_ST7789 panel;
  lgfx::Bus_SPI bus;
 public:
  void configure();   // from `board`, before init()
};

extern Display tft;
extern LGFX_Sprite canvas;
extern int W, H;      // the screen as the app draws it (landscape on the T-Embeds, square on the watch)

void displayBegin();          // configure, init, rotate, clear, and make the sprite
void backlight(bool on);
