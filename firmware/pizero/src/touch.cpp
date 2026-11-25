// C-512: touch as keys (touch.h)
#include "touch.h"
#include <cmath>
#include <sstream>
#include <utility>

namespace touch {
bool parse(const std::string &line, Cal &c) {
  std::istringstream in(line);
  Cal n;
  int s = 0, ix = 0, iy = 0;
  if (!(in >> n.minX >> n.maxX >> n.minY >> n.maxY)) return false;
  if (n.maxX == n.minX || n.maxY == n.minY) return false;
  in >> s >> ix >> iy;   // the three flags may be left off
  n.swapXY = s != 0; n.invX = ix != 0; n.invY = iy != 0;
  c = n;
  return true;
}

static double unit(int v, int lo, int hi) {
  double u = double(v - lo) / double(hi - lo);
  return u < 0 ? 0 : u > 1 ? 1 : u;
}

void Gestures::norm(int rawX, int rawY) {
  double a = unit(rawX, cal.minX, cal.maxX), b = unit(rawY, cal.minY, cal.maxY);
  if (cal.swapXY) std::swap(a, b);
  if (cal.invX) a = 1 - a;
  if (cal.invY) b = 1 - b;
  nx = a; ny = b;
}

void Gestures::press(Key k) {
  KeyEvent d; d.key = k; d.down = true;
  KeyEvent u; u.key = k; u.down = false;
  out.push_back(d);
  out.push_back(u);
}

void Gestures::report(int rawX, int rawY, bool down, uint64_t ms) {
  if (down || pressed) norm(rawX, rawY);   // the lift's report carries the last place too
  if (down && !pressed) { pressed = true; held = false; sx = nx; sy = ny; since = ms; return; }
  if (!down && !pressed) return;
  const double dx = nx - sx, dy = ny - sy;
  const bool moved = std::fabs(dx) >= SWIPE || std::fabs(dy) >= SWIPE;
  if (down) {
    // a hold is told as soon as it is one, so the finger need not lift to go back
    if (!held && !moved && ms - since >= HOLD_MS) { held = true; press(Key::Esc); }
    return;
  }
  pressed = false;
  if (held) return;
  if (moved) press(std::fabs(dx) >= std::fabs(dy) ? (dx > 0 ? Key::Right : Key::Left) : (dy > 0 ? Key::Down : Key::Up));
  else press(Key::Enter);
}

bool Gestures::next(KeyEvent &e) {
  if (out.empty()) return false;
  e = out.front();
  out.pop_front();
  return true;
}
}  // namespace touch
