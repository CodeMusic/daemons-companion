// C-468: the Waveshare Game HAT on a full Raspberry Pi (a 3 or a 4) -- a 3.5-inch 480x320 IPS fed by the Pi's HDMI
// (Waveshare sends it 640x480, which the HAT fits to its panel; the canvas is drawn twice its size), a d-pad, A B X Y,
// START, SELECT, L and R on the Pi's pins, an 18650, and its speaker fed by the HDMI's sound. Its buttons reach us as
// one evdev device made by tools/boards/gamehat.sh, as the GamePi20's do (boards/pad.cpp); the pins are Waveshare's
// (docs/PIBOARDS.md). A Pi 4's second HDMI is free for a TV, as the Cardputer Zero's is (THE DESK, C-449).
#include "board.h"
#include "boards/pad.h"

namespace board {
const char *const ID = "gamehat";
const char *const NAME = "Game HAT";   // DRAFT
const int SCREEN_W = 640, SCREEN_H = 480;   // the picture the Pi sends; the HAT shows it at 480x320
const bool KEYBOARD = false;
const char *const INPUTS[] = { "/dev/input/by-path/platform-daemons-pad-event", nullptr };

void gameKeyDefaults(Key m[GBA_KEYS][2]) { pad::gameKeys(m); }
bool forPage(KeyEvent &e, const bool *held, bool inGame) { return pad::forPage(e, held, inGame); }
const char *word(Key k) { return pad::word(k); }
Key rawKey(int) { return Key::None; }
const bool CAP_HEADER = false;
const bool RADIOS = false;
void builtInRadios(caps::Found &) {}
}  // namespace board
