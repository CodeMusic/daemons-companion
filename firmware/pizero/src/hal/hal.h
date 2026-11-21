#pragma once
// C-378: the hardware, one file per side -- window.cpp (SDL, on a computer) and device.cpp (/dev/fb0, evdev, sysfs).
// Everything above this is the same on both.
#include <cstdint>
#include <string>
#include "keys.h"

namespace hal {
constexpr int W = 320, H = 170;   // the canvas every page draws: the Cardputer Zero's screen, and the middle of a bigger one (C-457)

bool begin(int scale, bool headless);         // headless: nothing shown and no keys read (checks, pictures)
void present(const uint16_t *swapped565);     // the canvas as LovyanGFX keeps it: RGB565, high byte first
bool poll(KeyEvent &e);                       // the next key that went down or up; false when there is none
bool closed();                                // the window was closed
void end();

struct Power { int percent = -1; bool charging = false; };   // -1: not known
Power power();
const char *side();                           // "window" or "device"
std::string deviceId();                       // "<board::ID>-<6 hex>", from the machine, as the boards name themselves
}
