#pragma once
// C-378: the 320x170 canvas every page draws into whole, then shown at once -- LovyanGFX's sprite, the boards' own
// (firmware/esp32/src/display.cpp), so a board's drawing moves here with its calls unchanged.
#include <LovyanGFX.hpp>
#include <string>

extern LGFX_Sprite canvas;
void canvasBegin();
uint16_t *canvasPixels();                       // RGB565, high byte first, as LovyanGFX keeps it
uint16_t rgb(uint8_t r, uint8_t g, uint8_t b);  // a colour for the drawing calls
uint16_t hex(const std::string &css, uint16_t otherwise);   // "#5b6b8c", as the hub sends the day's colours
bool canvasShot(const std::string &bmpPath);    // the canvas as a 24-bit BMP: for review sheets, from any side
