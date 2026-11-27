#pragma once
// C-378: the hardware, one file per side -- window.cpp (SDL, on a computer) and device.cpp (/dev/fb0, evdev, sysfs).
// Everything above this is the same on both.
#include <cstdint>
#include <string>
#include "keys.h"

namespace hal {
// C-593: the canvas every page draws is the board's own (board::CANVAS_W, CANVAS_H): the whole of the Cardputer
// Zero's 320x170, and the whole of the HackberryPi's 720x720 at half its size (360x360). A page places what it draws
// by these (app.h's lay), never by a number that fits only the first screen. Set once, before the canvas is made.
extern int W, H;
extern int screenW, screenH;                  // the screen it is shown on, as held (the framebuffer's own, once open)
void canvasSize(int w, int h, int onW, int onH);

bool begin(int scale, bool headless);         // headless: nothing shown and no keys read (checks, pictures)
void present(const uint16_t *swapped565);     // the canvas as LovyanGFX keeps it: RGB565, high byte first

// C-593: the game's picture, where the screen can show it bigger than the canvas does (the HackberryPi: a canvas
// pixel is two of the screen's, a pixel of the game three). zoom() and gameZoom() say both, so a page knows how much
// of the canvas the game covers: 240 * gameZoom() / zoom() across. Where gameDirect() is true the page hands the
// picture to game(), and present() draws it over the canvas from (x, y) of the canvas; where it is false (the two are
// one size, or a computer, or unseen) the page draws it into the canvas itself.
int zoom();
int gameZoom();
bool gameDirect();
void game(const uint32_t *video, int stride, int w, int h, int canvasX, int canvasY);   // nullptr: no picture
bool poll(KeyEvent &e);                       // the next key that went down or up; false when there is none
bool closed();                                // the window was closed
void end();

struct Power { int percent = -1; bool charging = false; };   // -1: not known
Power power();
const char *side();                           // "window" or "device"
std::string deviceId();                       // "<board::ID>-<6 hex>", from the machine, as the boards name themselves
}
