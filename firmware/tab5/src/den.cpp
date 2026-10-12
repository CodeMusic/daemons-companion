// C-113: the daemon's den on the Tab5 -- its type's place, as the widget (app/targets/widget/Den.swift) and the boards
// (firmware/esp32/src/den.cpp) draw it from the same description (server/src/dens.ts, `daemon.den` in the state).
// LVGL 9.2 cannot mirror an image, and the daemon faces the way it walks, so the den and the daemon are drawn here into
// a picture of our own: the den once, then a frame every tick with the sprite (decoded by LVGL's lodepng) walking it.
#include <Arduino.h>
#include <lvgl.h>
#include <esp_heap_caps.h>
// LVGL's own lodepng (LV_USE_LODEPNG); its header drags C++'s <string> inside extern "C", so the one call is declared here
extern "C" unsigned lodepng_decode32(unsigned char **out, unsigned *w, unsigned *h, const unsigned char *in, size_t insize);
#include "den.h"
#include "store.h"

namespace {

struct Stage {
  int w = 0, h = 0, floorY = 0, scale = 4;
  uint16_t *bg = nullptr, *frame = nullptr;     // the den alone, and the den with the daemon in it
  uint8_t *sprite = nullptr; unsigned sw = 0, sh = 0;   // RGBA, as lodepng gives it
  bool asleep = false;
  // C-119: its expression (server/src/expressions.ts) -- the picture comes already shaded; the pose, the eyes and the mark
  // are drawn here. top/bottom/right: the sprite's own extent, for the squash and for where the mark goes.
  bool still = false, shake = false; float bob = 1, squash = 1; int dy = 0;
  struct Patch { int x, y, w, h; uint16_t c; } patch[16]; int patches = 0;
  bool marked = false; uint8_t ink8[8] = {}, white8[8] = {}; uint16_t markC = 0;
  int top = 0, bottom = 63, right = 63;
  lv_image_dsc_t dsc = {};
  lv_obj_t *img = nullptr;
  lv_timer_t *timer = nullptr;
  uint16_t ink = 0;                             // the den's glow, for the z
};

uint32_t rgbOf(const char *h) { return h && strlen(h) == 7 ? (uint32_t)strtol(h + 1, nullptr, 16) : 0x67625a; }
uint16_t c565(uint32_t c) { return ((c >> 8) & 0xF800) | ((c >> 5) & 0x07E0) | ((c >> 3) & 0x001F); }
uint32_t mixRgb(uint32_t a, uint32_t b, float k) {
  auto ch = [&](int s) { return (uint32_t)(((a >> s) & 255) * (1 - k) + ((b >> s) & 255) * k) & 255; };
  return ch(16) << 16 | ch(8) << 8 | ch(0);
}

// A few shapes into an RGB565 buffer, clipped to it (and to `clipH` rows: the motif stays above the floor).
struct Pen {
  uint16_t *px; int w, h, clipH;
  void dot(int x, int y, uint16_t c) { if (x >= 0 && y >= 0 && x < w && y < clipH) px[y * w + x] = c; }
  void disc(float cx, float cy, float r, uint16_t c) {
    int r0 = (int)ceilf(r);
    for (int y = -r0; y <= r0; y++) for (int x = -r0; x <= r0; x++) if (x * x + y * y <= r * r + 0.5f) dot((int)cx + x, (int)cy + y, c);
  }
  void line(float x0, float y0, float x1, float y1, float lw, uint16_t c) {
    float dx = x1 - x0, dy = y1 - y0; int n = (int)max(fabsf(dx), fabsf(dy)) + 1;
    for (int i = 0; i <= n; i++) { float t = (float)i / n; if (lw <= 1.2f) dot((int)(x0 + dx * t), (int)(y0 + dy * t), c); else disc(x0 + dx * t, y0 + dy * t, lw / 2, c); }
  }
  void ellipse(float cx, float cy, float rx, float ry, uint16_t c, bool fill, float lw = 1) {
    if (fill) { for (int y = (int)-ry; y <= (int)ry; y++) { float k = sqrtf(max(0.f, 1 - (y * y) / (ry * ry))) * rx; for (int x = (int)-k; x <= (int)k; x++) dot((int)cx + x, (int)cy + y, c); } return; }
    int n = (int)(6 * max(rx, ry)) + 12; float px0 = cx + rx, py0 = cy;
    for (int i = 1; i <= n; i++) { float a = 2 * PI * i / n, x = cx + cosf(a) * rx, y = cy + sinf(a) * ry; line(px0, py0, x, y, lw, c); px0 = x; py0 = y; }
  }
  void diamond(float x, float y, float a, uint16_t c) {
    for (int j = (int)-a; j <= (int)a; j++) { float k = (a - fabsf(j)) * 0.6f; for (int i = (int)-k; i <= (int)k; i++) dot((int)x + i, (int)y + j, c); }
  }
};

struct Scatter {
  uint32_t s;
  explicit Scatter(const char *seed) : s(2166136261u) { for (const char *p = seed; p && *p; p++) s = (s ^ (uint8_t)*p) * 16777619u; }
  float next() { s = s * 1664525u + 1013904223u; return (s >> 8) / 16777216.0f; }
};

// The den: the wall over its deep, the motif faint across it, the floor -- as Den.swift draws it.
void paintDen(Stage &s, JsonObject den) {
  const char *motif = den["motif"] | "nest";
  uint32_t wall = rgbOf(den["wall"] | "#67625a"), deep = rgbOf(den["deep"] | "#3b3832"), glow = rgbOf(den["glow"] | "#e4ded3");
  uint32_t floorC = rgbOf(den["floor"] | "#2b2924");
  int w = s.w, h = s.h, fy = s.floorY;
  for (int y = 0; y < fy; y++) { uint16_t c = c565(mixRgb(wall, deep, (float)y / fy)); for (int x = 0; x < w; x++) s.bg[y * w + x] = c; }
  uint16_t ink = c565(mixRgb(mixRgb(wall, deep, 0.5f), glow, 0.24f));
  s.ink = c565(glow);
  Pen p{ s.bg, w, h, fy };
  Scatter r(motif);
  float u = min(w, h) / 40.0f;
  String m = motif;
  if (m == "waves") {
    for (int row = 0; row < 4; row++) { float y = fy - row * 6 * u - 3 * u, py = y;
      for (int x = 2; x <= w; x += 2) { float ny = y + sinf(x / (5 * u) + row) * 1.6f * u; p.line(x - 2, py, x, ny, max(1.f, u * (1.2f - row * 0.2f)), ink); py = ny; } }
  } else if (m == "grass") {
    for (int i = 0, n = (int)(w / (2.2f * u)); i < n; i++) { float x = r.next() * w, t = (3 + r.next() * 6) * u, lean = (r.next() - 0.5f) * 3 * u; p.line(x, fy, x + lean, fy - t, max(1.f, u * 0.7f), ink); }
  } else if (m == "strata") {
    for (int i = 0; i < 5; i++) { float y = fy - i * 4.5f * u, py = y - sinf(i * 1.7f) * u;
      for (int x = 6; x <= w; x += 6) { float ny = y - sinf(x / (13 * u) + i * 1.7f) * u; p.line(x - 6, py, x, ny, u * (1.6f - i * 0.25f), ink); py = ny; } }
  } else if (m == "cairn") {
    float sw = 9 * u, y = fy, x = w * 0.84f;
    for (int i = 0; i < 5; i++) { float sh = sw * 0.45f; p.ellipse(x, y - sh / 2, sw / 2, sh / 2, ink, true); y -= sh * 0.9f; sw *= 0.78f; }
  } else if (m == "specks") {
    for (int i = 0; i < 70; i++) { float x = r.next() * w, y = r.next() * fy; p.disc(x, y, (0.5f + r.next()) * u / 2, ink); }
  } else if (m == "rings") {
    for (int i = 1; i <= 6; i++) p.ellipse(w / 2.f, fy * 0.55f, i * 5 * u, i * 5 * u, ink, false, u * 0.6f);
  } else if (m == "embers") {
    for (int i = 0; i < 40; i++) { float y = fy * (1 - powf(r.next(), 0.6f)); float x = r.next() * w; p.disc(x, y, (0.4f + 1.2f * y / fy) * u / 2, ink); }
  } else if (m == "drips") {
    for (int i = 0, n = (int)(w / (4 * u)); i < n; i++) { float x = r.next() * w, l = (3 + r.next() * 12) * u; p.line(x, 0, x, l, u * 0.9f, ink); p.disc(x, l, u, ink); }
  } else if (m == "carrier") {
    for (int k = 0; k < 2; k++) { float f = k ? 0.5f : 1, a = k ? 2 : 4, py = fy * 0.45f;
      for (int x = 2; x <= w; x += 2) { float ny = fy * 0.45f + sinf(x / (4 * u) * f) * a * u; p.line(x - 2, py, x, ny, u * 0.8f * f + 0.5f, ink); py = ny; } }
  } else if (m == "grid") {
    for (float x = 0; x <= w; x += 6 * u) p.line(x, 0, x, fy, 1, ink);
    for (float y = 0; y <= fy; y += 6 * u) p.line(0, y, w, y, 1, ink);
  } else if (m == "plates") {
    for (float x = 0; x <= w; x += 12 * u) { p.line(x, 0, x, fy, u * 0.8f, ink);
      for (float y = 3 * u; y < fy; y += 9 * u) { p.disc(x + 2.2f * u, y, 0.7f * u, ink); p.disc(x + 9.8f * u, y, 0.7f * u, ink); } }
  } else if (m == "flecks") {
    for (int i = 0; i < 26; i++) { float x = r.next() * w, y = r.next() * fy, a = (0.8f + r.next()) * u;
      for (int k = 0; k < 3; k++) { float t = k * PI / 3; p.line(x - cosf(t) * a, y - sinf(t) * a, x + cosf(t) * a, y + sinf(t) * a, 1, ink); } }
  } else if (m == "facets") {
    for (int i = 0; i < 18; i++) { float x = r.next() * w, y = r.next() * fy, a = (1 + r.next() * 1.6f) * u; p.diamond(x, y, a, ink); }
  } else if (m == "box") {
    for (int i = 1; i <= 3; i++) { float k = i * 3.5f * u; p.line(k, k, w - k, k, u * 0.5f, ink); p.line(k, k, k, fy, u * 0.5f, ink); p.line(w - k, k, w - k, fy, u * 0.5f, ink); }
  } else if (m == "fog") {
    uint16_t faint = c565(mixRgb(mixRgb(wall, deep, 0.5f), glow, 0.12f));
    for (int i = 0; i < 8; i++) { float x = r.next() * w, y = r.next() * fy, a = (6 + r.next() * 10) * u; p.ellipse(x, y, a, a / 2, faint, true); }
  } else if (m == "streaks") {
    for (int i = 0; i < 14; i++) { float x = r.next() * w, y = r.next() * fy, l = (6 + r.next() * 14) * u; p.line(x, y, x + l, y - l * 0.35f, u * 0.6f, ink); }
  } else {                                     // CONTENT, the nest: somewhere soft, and nothing else asked of it
    for (int i = 0; i < 3; i++) { float a = (14 - i * 3) * u; p.ellipse(w / 2.f, fy, a, a * 0.22f, ink, false, u * 0.8f); }
  }
  uint16_t fl = c565(floorC), edge = c565(mixRgb(floorC, glow, 0.25f));
  for (int y = fy; y < h; y++) for (int x = 0; x < w; x++) s.bg[y * w + x] = y == fy ? edge : fl;
}

// A frame: the den, its shadow, and the daemon where the walk has it -- mirrored when it goes right.
void tick(lv_timer_t *t) {
  Stage &s = *(Stage *)lv_timer_get_user_data(t);
  uint32_t ms = millis();
  float walk = s.still ? 0.5f : 0.5f + 0.5f * sinf(ms / 5200.0f);
  bool right = !s.still && cosf(ms / 5200.0f) > 0;
  int bob = s.still ? 0 : (int)roundf(4 * s.bob * sinf(ms / 420.0f));
  int side = 64 * s.scale, ax = (int)((s.w - side) * walk) + (s.shake ? ((ms / 70) % 2 ? s.scale : -s.scale) : 0);
  int ay = s.floorY - side + 4 * s.scale + bob;
  memcpy(s.frame, s.bg, s.w * s.h * 2);
  Pen p{ s.frame, s.w, s.h, s.h };
  p.ellipse(ax + side / 2.f, s.floorY + 3, side / 4.f, s.scale * 2.5f, 0x0000, true);   // its shadow
  if (s.sprite) {
    int k = s.scale;
    for (unsigned j = 0; j < s.sh; j++) for (unsigned i = 0; i < s.sw; i++) {
      const uint8_t *q = s.sprite + 4 * (j * s.sw + i);
      if (q[3] < 128) continue;
      uint16_t c = ((q[0] & 0xF8) << 8) | ((q[1] & 0xFC) << 3) | (q[2] >> 3);
      for (int n = 0; n < s.patches; n++) {    // C-119: its eyes, as it feels (the later patch wins: the line over the fill)
        const auto &e = s.patch[n];
        if ((int)i >= e.x && (int)i < e.x + e.w && (int)j >= e.y && (int)j < e.y + e.h) c = e.c;
      }
      auto rowOf = [&](int jj) { return s.bottom - (int)roundf((s.bottom - jj) * s.squash) + s.dy; };   // lowered, squashed toward its feet
      int row = rowOf((int)j), tall = max(1, rowOf((int)j + 1) - row);   // stretched, a row reaches down to the next: no gap
      int x = ax + (right ? (int)(s.sw - 1 - i) : (int)i) * k, y = ay + row * k;
      for (int b = 0; b < k * tall; b++) for (int a = 0; a < k; a++) p.dot(x + a, y + b, c);
    }
  }
  if (s.marked) {                              // C-119: its mark above its head, at the back (never mirrored)
    int px = max(2, (s.scale * 3 + 2) / 4);
    int mx = right ? ax + (63 - (s.right - 2)) * s.scale - 8 * px : ax + (s.right - 2) * s.scale;
    int my = ay + (s.top + s.dy) * s.scale - 8 * px - 6;
    for (int r = 0; r < 8; r++) for (int c = 0; c < 8; c++) {
      uint16_t col = (s.ink8[r] & (0x80 >> c)) ? s.markC : (s.white8[r] & (0x80 >> c)) ? 0xFFFF : 0;
      if (!col) continue;
      for (int b = 0; b < px; b++) for (int a = 0; a < px; a++) p.dot(mx + c * px + a, my + r * px + b, col);
    }
  } else if (s.asleep) {                       // a z, and a smaller one: drawn, as the board's has no font here
    for (int n = 0; n < 2; n++) {
      float z = (n ? 10 : 16) * s.scale / 4.0f, zx = ax + side - 30 + n * 26, zy = ay + 10 - n * 22;
      p.line(zx, zy, zx + z, zy, 3, s.ink); p.line(zx + z, zy, zx, zy + z, 3, s.ink); p.line(zx, zy + z, zx + z, zy + z, 3, s.ink);
    }
  }
  lv_image_cache_drop(&s.dsc);
  lv_obj_invalidate(s.img);
  if (s.still && !s.shake) lv_timer_pause(t);   // asleep it stays put: one frame is enough
}

void gone(lv_event_t *e) {
  Stage *s = (Stage *)lv_event_get_user_data(e);
  if (s->timer) lv_timer_delete(s->timer);
  lv_image_cache_drop(&s->dsc);
  heap_caps_free(s->bg); heap_caps_free(s->frame);
  if (s->sprite) lv_free(s->sprite);
  delete s;
}

}  // namespace

lv_obj_t *denStage(lv_obj_t *parent, JsonObject d, int w, int h) {
  Stage *s = new Stage();
  s->w = w; s->h = h; s->floorY = (int)(h * 0.82f);
  s->scale = max(1, min((h - 30) / 64, (w * 3 / 5) / 64));
  s->asleep = String((const char *)(d["life"]["tired"] | "awake")) == "asleep";
  s->still = s->asleep;
  JsonObject e = d["expression"];
  String look = e.isNull() ? String("awake") : String((const char *)(e["name"] | "awake"));
  if (!e.isNull()) {                           // C-119
    s->still = e["pose"]["still"] | false; s->shake = e["pose"]["shake"] | false;
    s->bob = e["pose"]["bob"] | 1.0f; s->squash = e["pose"]["squash"] | 1.0f; s->dy = e["pose"]["dy"] | 0;
    for (JsonObject q : e["patch"].as<JsonArray>()) {
      if (s->patches >= 16) break;
      uint32_t rgb = ((uint32_t)(q["rgb"][0] | 0) << 16) | ((uint32_t)(q["rgb"][1] | 0) << 8) | (uint32_t)(q["rgb"][2] | 0);
      s->patch[s->patches++] = { q["x"] | 0, q["y"] | 0, q["w"] | 0, q["h"] | 0, c565(rgb) };
    }
    JsonObject m = e["mark"];
    if (!m.isNull()) {
      s->marked = true;
      s->markC = c565(((uint32_t)(m["rgb"][0] | 255) << 16) | ((uint32_t)(m["rgb"][1] | 255) << 8) | (uint32_t)(m["rgb"][2] | 255));
      for (int r = 0; r < 8; r++) {
        const char *row = m["rows"][r] | "........";
        for (int c = 0; c < 8 && row[c]; c++) { if (row[c] == '#') s->ink8[r] |= 0x80 >> c; if (row[c] == 'o') s->white8[r] |= 0x80 >> c; }
      }
    }
  }
  s->bg = (uint16_t *)heap_caps_malloc(w * h * 2, MALLOC_CAP_SPIRAM);
  s->frame = (uint16_t *)heap_caps_malloc(w * h * 2, MALLOC_CAP_SPIRAM);
  size_t n = 0;
  String plain = "p" + String((int)(d["slot"] | 0));
  uint8_t *png = look != "awake" ? loadArt(plain + "-" + look, n) : nullptr;   // C-119: in its shade, once it is kept
  if (!png) png = loadArt(plain, n);
  if (png) { if (lodepng_decode32(&s->sprite, &s->sw, &s->sh, png, n)) s->sprite = nullptr; heap_caps_free(png); }
  if (s->sprite) {                             // its own extent: the squash keeps its feet down, the mark sits on its head
    s->top = (int)s->sh; s->bottom = 0; s->right = 0;
    for (unsigned j = 0; j < s->sh; j++) for (unsigned i = 0; i < s->sw; i++)
      if (s->sprite[4 * (j * s->sw + i) + 3] >= 128) { s->top = min(s->top, (int)j); s->bottom = max(s->bottom, (int)j); s->right = max(s->right, (int)i); }
  }
  paintDen(*s, d["den"]);
  s->dsc.header.magic = LV_IMAGE_HEADER_MAGIC;
  s->dsc.header.cf = LV_COLOR_FORMAT_RGB565;
  s->dsc.header.w = w; s->dsc.header.h = h; s->dsc.header.stride = w * 2;
  s->dsc.data = (const uint8_t *)s->frame; s->dsc.data_size = w * h * 2;
  s->img = lv_image_create(parent);
  lv_obj_set_size(s->img, w, h);
  lv_obj_set_style_radius(s->img, 12, 0); lv_obj_set_style_clip_corner(s->img, true, 0);
  lv_obj_remove_flag(s->img, LV_OBJ_FLAG_CLICKABLE);
  s->timer = lv_timer_create(tick, 90, s);
  tick(s->timer);
  lv_image_set_src(s->img, &s->dsc);
  lv_obj_add_event_cb(s->img, gone, LV_EVENT_DELETE, s);
  return s->img;
}
