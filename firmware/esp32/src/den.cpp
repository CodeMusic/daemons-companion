// C-113: the daemon's den on a board -- its type's place, as the widget draws it (app/targets/widget/Den.swift) from
// the same description (server/src/dens.ts, `daemon.den` in the state): the wall over its deep, the motif faint across
// it, the floor it stands on. Drawn into the canvas each frame with the board's own primitives; no words.
#include "app.h"
#include "display.h"

static uint32_t rgbOf(const String &h) { return h.length() == 7 ? (uint32_t)strtol(h.c_str() + 1, nullptr, 16) : 0x67625a; }
static uint16_t mix565(uint32_t a, uint32_t b, float k) {   // a toward b by k, as RGB565
  auto ch = [&](int s) { return (int)(((a >> s) & 255) * (1 - k) + ((b >> s) & 255) * k); };
  return tft.color565(ch(16), ch(8), ch(0));
}

// The same scatter every time for a motif, so a den does not shuffle itself between frames.
struct Scatter {
  uint32_t s;
  explicit Scatter(const String &seed) : s(2166136261u) { for (unsigned i = 0; i < seed.length(); i++) s = (s ^ (uint8_t)seed[i]) * 16777619u; }
  float next() { s = s * 1664525u + 1013904223u; return (s >> 8) / 16777216.0f; }
};

void drawDen(int x0, int y0, int w, int h, int floorY) {
  const Den &d = st.daemon.den;
  uint32_t wall = rgbOf(d.wall), deep = rgbOf(d.deep), glow = rgbOf(d.glow);
  int fy = floorY - y0;
  for (int j = 0; j < fy; j++) canvas.drawFastHLine(x0, y0 + j, w, mix565(wall, deep, (float)j / max(1, fy)));
  uint32_t mid = (((wall >> 16 & 255) + (deep >> 16 & 255)) / 2) << 16 | (((wall >> 8 & 255) + (deep >> 8 & 255)) / 2) << 8 | ((wall & 255) + (deep & 255)) / 2;
  uint16_t ink = mix565(mid, glow, 0.24f);           // the motif, faint: the widget draws it at 0.22 over the wall
  Scatter r(d.motif);
  float u = min(w, h) / 40.0f;                        // one unit, so the motif keeps its grain on every screen
  auto X = [&](float f) { return x0 + (int)(f * w); };
  auto Y = [&](float f) { return y0 + (int)(f * fy); };
  const String &m = d.motif;
  canvas.setClipRect(x0, y0, w, fy);
  if (m == "waves") {
    for (int row = 0; row < 4; row++) {
      int y = floorY - (int)(row * 6 * u + 3 * u), py = y;
      for (int x = 0; x <= w; x += 2) { int ny = y + (int)(sinf(x / (5 * u) + row) * 1.6f * u); if (x) canvas.drawLine(x0 + x - 2, py, x0 + x, ny, ink); py = ny; }
    }
  } else if (m == "grass") {
    for (int i = 0, n = (int)(w / (2.2f * u)); i < n; i++) { int x = X(r.next()); float t = (3 + r.next() * 6) * u, lean = (r.next() - 0.5f) * 3 * u; canvas.drawLine(x, floorY, x + (int)lean, floorY - (int)t, ink); }
  } else if (m == "strata") {
    for (int i = 0; i < 5; i++) {
      int y = floorY - (int)(i * 4.5f * u), py = y;
      for (int x = 0; x <= w; x += 6) { int ny = y - (int)(sinf(x / (13 * u) + i * 1.7f) * u); if (x) canvas.drawLine(x0 + x - 6, py, x0 + x, ny, ink); py = ny; }
    }
  } else if (m == "cairn") {
    float sw = 9 * u; int y = floorY, x = X(0.84f);
    for (int i = 0; i < 5; i++) { float sh = sw * 0.45f; canvas.fillEllipse(x, y - (int)(sh / 2), (int)(sw / 2), max(1, (int)(sh / 2)), ink); y -= (int)(sh * 0.9f); sw *= 0.78f; }
  } else if (m == "specks") {
    for (int i = 0; i < 70; i++) canvas.fillCircle(X(r.next()), Y(r.next()), max(0, (int)((0.5f + r.next()) * u / 2)), ink);
  } else if (m == "rings") {
    for (int i = 1; i <= 6; i++) canvas.drawCircle(x0 + w / 2, y0 + (int)(fy * 0.55f), (int)(i * 5 * u), ink);
  } else if (m == "embers") {
    for (int i = 0; i < 40; i++) { float yy = 1 - powf(r.next(), 0.6f); canvas.fillCircle(X(r.next()), Y(yy), max(0, (int)((0.4f + 1.2f * yy) * u / 2)), ink); }
  } else if (m == "drips") {
    for (int i = 0, n = (int)(w / (4 * u)); i < n; i++) { int x = X(r.next()), l = (int)((3 + r.next() * 12) * u); canvas.drawFastVLine(x, y0, l, ink); canvas.fillCircle(x, y0 + l, max(1, (int)u), ink); }
  } else if (m == "carrier") {
    for (int k = 0; k < 2; k++) {
      float f = k ? 0.5f : 1.0f, a = k ? 2 : 4; int py = 0;
      for (int x = 0; x <= w; x += 2) { int ny = Y(0.45f) + (int)(sinf(x / (4 * u) * f) * a * u); if (x) canvas.drawLine(x0 + x - 2, py, x0 + x, ny, ink); py = ny; }
    }
  } else if (m == "grid") {
    for (float x = 0; x <= w; x += 6 * u) canvas.drawFastVLine(x0 + (int)x, y0, fy, ink);
    for (float y = 0; y <= fy; y += 6 * u) canvas.drawFastHLine(x0, y0 + (int)y, w, ink);
  } else if (m == "plates") {
    for (float x = 0; x <= w; x += 12 * u) {
      canvas.drawFastVLine(x0 + (int)x, y0, fy, ink);
      for (float y = 3 * u; y < fy; y += 9 * u) { canvas.fillCircle(x0 + (int)(x + 2.2f * u), y0 + (int)y, max(1, (int)(0.7f * u)), ink); canvas.fillCircle(x0 + (int)(x + 9.8f * u), y0 + (int)y, max(1, (int)(0.7f * u)), ink); }
    }
  } else if (m == "flecks") {
    for (int i = 0; i < 26; i++) {
      int x = X(r.next()), y = Y(r.next()); float a = (0.8f + r.next()) * u;
      for (int k = 0; k < 3; k++) { float t = k * PI / 3; canvas.drawLine(x - (int)(cosf(t) * a), y - (int)(sinf(t) * a), x + (int)(cosf(t) * a), y + (int)(sinf(t) * a), ink); }
    }
  } else if (m == "facets") {
    for (int i = 0; i < 18; i++) {
      int x = X(r.next()), y = Y(r.next()), a = max(2, (int)((1 + r.next() * 1.6f) * u)), b = max(1, (int)(a * 0.6f));
      canvas.fillTriangle(x, y - a, x + b, y, x - b, y, ink); canvas.fillTriangle(x, y + a, x + b, y, x - b, y, ink);
    }
  } else if (m == "box") {
    for (int i = 1; i <= 3; i++) { int k = (int)(i * 3.5f * u); canvas.drawRect(x0 + k, y0 + k, w - 2 * k, fy - k + 1, ink); }
  } else if (m == "fog") {
    uint16_t faint = mix565(mid, glow, 0.12f);
    for (int i = 0; i < 8; i++) { int x = X(r.next()), y = Y(r.next()), a = (int)((6 + r.next() * 10) * u); canvas.fillEllipse(x, y, a, max(1, a / 2), faint); }
  } else if (m == "streaks") {
    for (int i = 0; i < 14; i++) { int x = X(r.next()), y = Y(r.next()); float l = (6 + r.next() * 14) * u; canvas.drawLine(x, y, x + (int)l, y - (int)(l * 0.35f), ink); }
  } else {                                            // CONTENT, the nest: somewhere soft, and nothing else asked of it
    for (int i = 0; i < 3; i++) { int a = (int)((14 - i * 3) * u); canvas.drawEllipse(x0 + w / 2, floorY, a, max(1, (int)(a * 0.22f)), ink); }
  }
  canvas.clearClipRect();
  canvas.fillRect(x0, floorY, w, y0 + h - floorY, mix565(rgbOf(d.floor), 0, 0));
  canvas.drawFastHLine(x0, floorY, w, mix565(rgbOf(d.floor), glow, 0.25f));
}
