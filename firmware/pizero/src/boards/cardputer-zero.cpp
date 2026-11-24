// C-457: the Cardputer Zero (a Raspberry Pi CM0; C-377) -- the first board, and the one everything was written on: a
// 320x170 screen, a keyboard of 56 keys (the TCA8418 on I2C1), no arrow keys but F Z X C printed as them.
#include "board.h"

namespace board {
const char *const ID = "cardputer-zero";
const char *const NAME = "Cardputer Zero";   // DRAFT
const int SCREEN_W = 320, SCREEN_H = 170;
const bool KEYBOARD = true;
// M5Stack's launcher reads the TCA8418 here; failing it, the search finds the first device with letter keys
const char *const INPUTS[] = { "/dev/input/by-path/platform-3f804000.i2c-event", nullptr };

void gameKeyDefaults(Key m[GBA_KEYS][2]) {
  const Key d[GBA_KEYS][2] = {
    { Key::L, Key::None },        // A: under the right thumb, to the right of B as on a GBA
    { Key::K, Key::None },        // B
    { Key::Space, Key::None },    // SELECT
    { Key::Enter, Key::None },    // START
    { Key::C, Key::Right },       // the pad: the device's printed arrows (a computer's arrows too)
    { Key::Z, Key::Left },
    { Key::F, Key::Up },
    { Key::X, Key::Down },
    { Key::P, Key::None },        // R and L: the top row's two ends
    { Key::Q, Key::None },
  };
  for (int i = 0; i < GBA_KEYS; i++) { m[i][0] = d[i][0]; m[i][1] = d[i][1]; }
}

bool forPage(KeyEvent &, const bool *, bool) { return true; }   // a keyboard: every key as it is

const char *word(Key k) { return keyName(k); }
Key rawKey(int) { return Key::None; }
const bool CAP_HEADER = true;   // the EXT header (C-444)
const bool RADIOS = false;
void builtInRadios(caps::Found &) {}
}  // namespace board
