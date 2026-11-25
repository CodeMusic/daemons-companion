// C-512: the DAEMICOM (DRAFT; the DAEMICOM Interactive Computer, DCM-001) -- a Raspberry Pi 5 booting from its SSD, with
// the generic "3.5inch RPi Display" on its pins (LCD35 / MPI3501: an ILI9486 at 480x320 behind shift registers on SPI0,
// the kernel's piscreen overlay, and an XPT2046 for touch, the kernel's ads7846), a microphone and a speaker. Its own
// screen is the daemon's (the damagotchi, C-567); its two HDMI ports are for SHEWSTONES (C-565). It has no buttons:
// the screen is touched (touch.h: a tap is ENTER, a hold ESC, a swipe an arrow, found by hal/device.cpp on any board),
// and a SIGIL plugged in or paired is read as a pad (boards/pad.cpp), as the Game HAT's buttons are.
#include "board.h"
#include "boards/pad.h"

namespace board {
const char *const ID = "daemicom";
const char *const NAME = "DAEMICOM";   // DRAFT
const int SCREEN_W = 480, SCREEN_H = 320;
const bool KEYBOARD = false;
const char *const INPUTS[] = { nullptr };   // a SIGIL is found by its gamepad buttons; the touch screen by hal/device.cpp

void gameKeyDefaults(Key m[GBA_KEYS][2]) { pad::gameKeys(m); }
bool forPage(KeyEvent &e, const bool *held, bool inGame) { return pad::forPage(e, held, inGame); }
// A hint as the hand reads it: the screen is touched; a SIGIL's buttons say themselves
const char *word(Key k) {
  switch (k) {
    case Key::Enter: return "TAP";
    case Key::Esc: return "HOLD";
    default: return pad::word(k);
  }
}
Key rawKey(int) { return Key::None; }
const bool CAP_HEADER = false;
const bool RADIOS = false;
void builtInRadios(caps::Found &) {}
}  // namespace board
