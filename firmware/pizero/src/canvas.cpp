// C-378: the canvas, and a picture of it.
#include "canvas.h"

#include <cstdio>
#include "hal/hal.h"

LGFX_Sprite canvas;

void canvasBegin() {
  canvas.setColorDepth(16);
  canvas.createSprite(hal::W, hal::H);
  canvas.setTextWrap(false);
  canvas.fillScreen(TFT_BLACK);
}
uint16_t *canvasPixels() { return (uint16_t *)canvas.getBuffer(); }
uint16_t rgb(uint8_t r, uint8_t g, uint8_t b) { return lgfx::color565(r, g, b); }
uint16_t hex(const std::string &css, uint16_t otherwise) {
  if (css.size() != 7 || css[0] != '#') return otherwise;
  unsigned v = 0;
  if (sscanf(css.c_str() + 1, "%6x", &v) != 1) return otherwise;
  return rgb(v >> 16 & 255, v >> 8 & 255, v & 255);
}

bool canvasShot(const std::string &path) {
  const int w = hal::W, h = hal::H, row = (w * 3 + 3) & ~3;
  FILE *f = fopen(path.c_str(), "wb");
  if (!f) return false;
  auto le32 = [&](uint32_t v) { for (int i = 0; i < 4; i++) fputc(v >> (8 * i) & 255, f); };
  auto le16 = [&](uint16_t v) { fputc(v & 255, f); fputc(v >> 8, f); };
  fputc('B', f); fputc('M', f); le32(54 + row * h); le32(0); le32(54);
  le32(40); le32(w); le32(h); le16(1); le16(24); le32(0); le32(row * h); le32(2835); le32(2835); le32(0); le32(0);
  const uint16_t *px = canvasPixels();
  for (int y = h - 1; y >= 0; y--) {
    for (int x = 0; x < w; x++) {
      uint16_t c = (uint16_t)(px[y * w + x] << 8 | px[y * w + x] >> 8);
      uint8_t r = (c >> 11) & 31, g = (c >> 5) & 63, b = c & 31;
      fputc(b << 3 | b >> 2, f); fputc(g << 2 | g >> 4, f); fputc(r << 3 | r >> 2, f);
    }
    for (int p = w * 3; p < row; p++) fputc(0, f);
  }
  return fclose(f) == 0;
}
