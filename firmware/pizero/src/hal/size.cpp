// C-593: the canvas's size, and how big it and the game are shown on the board's screen -- the same on both sides.
#include <algorithm>

#include "hal/hal.h"

namespace hal {
int W = 320, H = 170;
int screenW = 320, screenH = 170;

void canvasSize(int w, int h, int onW, int onH) {
  W = w;
  H = h;
  screenW = std::max(onW, w);
  screenH = std::max(onH, h);
}
// as many whole times as fit, so pixels stay square and sharp (C-468); the game as many whole times as fit the canvas's
// own part of the screen, never smaller than the canvas would show it
int zoom() { return std::max(1, std::min(screenW / W, screenH / H)); }
int gameZoom() { return std::max(zoom(), std::min(W * zoom() / 240, H * zoom() / 160)); }
}  // namespace hal
