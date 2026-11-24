// C-457: the Waveshare GamePi20 -- a Pi Zero (2 W, for the game at full speed) in a handheld: a 2-inch 320x240 IPS
// screen (ST7789VW on SPI0), a d-pad, A B X Y, START, SELECT, L and R on the Pi's own pins, a speaker on PWM (GPIO 18),
// no keyboard and no mic. Its buttons reach us as one evdev device made by tools/boards/gamepi20.sh's gpio-key lines,
// each sending the gamepad code its name says (BTN_A, BTN_START...), so hal/device.cpp reads them as Key::PadA and
// the rest. docs/PIBOARDS.md has the pins (Waveshare's wiki).
#include "board.h"
#include "boards/pad.h"

namespace board {
const char *const ID = "gamepi20";
const char *const NAME = "GamePi20";   // DRAFT
const int SCREEN_W = 320, SCREEN_H = 240;
const bool KEYBOARD = false;
const char *const INPUTS[] = { "/dev/input/by-path/platform-daemons-pad-event", nullptr };   // else the search finds BTN_A

void gameKeyDefaults(Key m[GBA_KEYS][2]) { pad::gameKeys(m); }
bool forPage(KeyEvent &e, const bool *held, bool inGame) { return pad::forPage(e, held, inGame); }
const char *word(Key k) { return pad::word(k); }
Key rawKey(int) { return Key::None; }
const bool CAP_HEADER = false;
const bool RADIOS = false;
void builtInRadios(caps::Found &) {}
}  // namespace board
