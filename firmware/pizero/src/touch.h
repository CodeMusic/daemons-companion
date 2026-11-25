#pragma once
// C-512: a resistive touch screen read as the keys the pages already listen for -- the DAEMICOM's XPT2046 (the kernel's
// ads7846). No page has to know about touch: a tap is ENTER, a hold is ESC (back; in the game, back to HOME), and a
// swipe is an arrow, which is how the companion's swipes (CARE, ROUTINES) move on the phone. Pure: no Linux here, so
// it is checked on a computer (test/tests.cpp); hal/device.cpp feeds it evdev's ABS_X, ABS_Y and BTN_TOUCH.
#include <cstdint>
#include <deque>
#include <string>
#include "keys.h"

namespace touch {
// The raw readings' span, and how they lie against the screen as it is held. ads7846 reports 0..4095 on each axis;
// ~/.config/daemons/touch.conf (or ZERO_TOUCH; read by hal/device.cpp) holds "minX maxX minY maxY swapXY invX invY" when a screen differs.
struct Cal {
  int minX = 0, maxX = 4095, minY = 0, maxY = 4095;
  bool swapXY = false, invX = false, invY = false;
};
bool parse(const std::string &line, Cal &c);   // false: left as it was

constexpr double SWIPE = 0.12;    // a swipe: moved at least this share of the screen
constexpr uint64_t HOLD_MS = 600; // a hold: down this long without a swipe's move

class Gestures {
 public:
  explicit Gestures(Cal c = {}) : cal(c) {}
  // One evdev report (at SYN_REPORT): the latest raw position and whether the screen is pressed
  void report(int rawX, int rawY, bool down, uint64_t ms);
  // The next key event a gesture made (each key goes down, then up), or false
  bool next(KeyEvent &e);
  // Where the last touch is, from 0 to 1 across the screen as held (for a page that later wants a point)
  double x() const { return nx; }
  double y() const { return ny; }

 private:
  void norm(int rawX, int rawY);
  void press(Key k);
  Cal cal;
  bool pressed = false, held = false;
  double nx = 0, ny = 0, sx = 0, sy = 0;
  uint64_t since = 0;
  std::deque<KeyEvent> out;
};
}  // namespace touch
