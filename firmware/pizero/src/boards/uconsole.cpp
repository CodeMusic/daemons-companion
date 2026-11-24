// C-514: the ClockworkPi uConsole (a Raspberry Pi CM4, to be confirmed on the device) -- a 5-inch 1280x720 IPS on DSI
// (the panel is 720x1280, portrait; the desktop turns it), a keyboard of its own (a USB HID from the keyboard's own
// chip: keys, the trackball as a mouse, and a joystick), a d-pad and A B X Y, SELECT and START above the keys, PWM
// sound to its two speakers and the jack, the cells read by the AXP228 (axp20x-battery). Its radios are the
// HackerGadgets AIO's, not a cap on a header (docs/PIBOARDS.md, docs/CAPS.md). Everything here is from ClockworkPi's
// firmware and the community's notes, not yet seen on this uConsole (DRAFT).
//
// The keyboard's switch on its back sets what A B X Y SELECT START send: as keys (A j, B k, X u, Y i, SELECT space,
// START enter) or as joystick buttons. This program reads one input device, the keyboard, so the keys' mode is the one
// it plays in until the board layer reads several (C-514 asks it of C-509's restructure). The d-pad is always the
// arrow keys. The uConsole has no shoulder buttons: X and Y stand in for L and R (and Q and P, as on the Zero).
#include "board.h"

namespace board {
const char *const ID = "uconsole";
const char *const NAME = "uConsole";   // DRAFT
const int SCREEN_W = 1280, SCREEN_H = 720;   // as held, landscape; the canvas four times its size fits (1280x680)
const bool KEYBOARD = true;
// Its name under /dev/input/by-id is seen on the first day; until then the search finds the first device with letters
const char *const INPUTS[] = { nullptr };

void gameKeyDefaults(Key m[GBA_KEYS][2]) {
  const Key d[GBA_KEYS][2] = {
    { Key::J, Key::L },           // A: the A button in key mode (j); L as on the Zero
    { Key::K, Key::None },        // B: the B button (k)
    { Key::Space, Key::None },    // SELECT: the SELECT button (space)
    { Key::Enter, Key::None },    // START: the START button (enter), and the keyboard's own
    { Key::Right, Key::None },    // the d-pad: the arrow keys
    { Key::Left, Key::None },
    { Key::Up, Key::None },
    { Key::Down, Key::None },
    { Key::I, Key::P },           // R: the Y button (i), or P
    { Key::U, Key::Q },           // L: the X button (u), or Q
  };
  for (int i = 0; i < GBA_KEYS; i++) { m[i][0] = d[i][0]; m[i][1] = d[i][1]; }
}

bool forPage(KeyEvent &, const bool *, bool) { return true; }   // a keyboard: every key as it is

const char *word(Key k) { return keyName(k); }
}  // namespace board
