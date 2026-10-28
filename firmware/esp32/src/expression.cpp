// C-119: see expression.h. The same sums as server/src/expressions.ts's shade(); what is drawn is held to the reference
// tools/expressions.ts draws from the same description.
#include "app.h"
#include "expression.h"

Expression expression;
static uint16_t shaded[16];                 // the art's colours in the expression's shade, made again when either changes
static String shadedFor;                    // the art and the expression they were made for
static int top = 0, bottom = 63, rightmost = 63;   // the sprite's own extent, for the pose and the mark

static uint16_t rgb565(int r, int g, int b) { return ((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3); }

static uint16_t shade(uint16_t c) {
  float r = ((c >> 11) & 31) / 31.0f, g = ((c >> 5) & 63) / 63.0f, b = (c & 31) / 31.0f;
  float mx = max(r, max(g, b)), mn = min(r, min(g, b)), d = mx - mn, s = mx == 0 ? 0 : d / mx, v = mx, h = 0;
  if (d) h = mx == r ? fmodf((g - b) / d, 6) : mx == g ? (b - r) / d + 2 : (r - g) / d + 4;
  if (h < 0) h += 6;
  float s2 = min(1.0f, s * expression.sat), v2 = min(1.0f, v * expression.val), cc = v2 * s2;
  float x = cc * (1 - fabsf(fmodf(h, 2) - 1)), m = v2 - cc;
  float rr, gg, bb;
  if (h < 1) { rr = cc; gg = x; bb = 0; } else if (h < 2) { rr = x; gg = cc; bb = 0; } else if (h < 3) { rr = 0; gg = cc; bb = x; }
  else if (h < 4) { rr = 0; gg = x; bb = cc; } else if (h < 5) { rr = x; gg = 0; bb = cc; } else { rr = cc; gg = 0; bb = x; }
  auto mixed = [&](float y, int i) { return (int)constrain((y + m) * 255 * (1 - expression.mix) + expression.tint[i] * expression.mix, 0.0f, 255.0f); };
  return rgb565(mixed(rr, 0), mixed(gg, 1), mixed(bb, 2));
}

static void ready() {
  String key = artKeyHave + "/" + expression.name + "/" + String(expression.sat, 3) + "/" + String(expression.val, 3);   // C-207: the week nudges the shade
  if (key == shadedFor) return;
  for (int i = 0; i < 16; i++) shaded[i] = i >= 1 && i <= 10 ? shade(artPal[i]) : artPal[i];
  top = 64; bottom = 0; rightmost = 0;
  for (int j = 0; j < 64; j++) for (int i = 0; i < 64; i++) {
    uint8_t b = artPix[(j * 64 + i) >> 1], c = (i & 1) ? (b & 15) : (b >> 4);
    if (c) { top = min(top, j); bottom = max(bottom, j); rightmost = max(rightmost, i); }
  }
  shadedFor = key;
}

void takeExpression(JsonVariant e) {
  Expression x;
  if (!e.isNull()) {
    x.name = e["name"] | "awake";
    JsonVariant s = e["shade"];
    x.sat = s["sat"] | 1.0f; x.val = s["val"] | 1.0f; x.mix = s["mix"] | 0.0f;
    for (int i = 0; i < 3; i++) x.tint[i] = s["tint"][i] | 0;
    JsonVariant p = e["pose"];
    x.dy = p["dy"] | 0; x.squash = p["squash"] | 1.0f; x.bob = p["bob"] | 1.0f; x.still = p["still"] | false; x.shake = p["shake"] | false;
    JsonVariant m = e["mark"];
    if (!m.isNull()) {
      x.marked = true;
      x.markColour = rgb565(m["rgb"][0] | 255, m["rgb"][1] | 255, m["rgb"][2] | 255);
      for (int r = 0; r < 8; r++) {
        const char *row = m["rows"][r] | "........";
        for (int c = 0; c < 8 && row[c]; c++) {
          if (row[c] == '#') x.ink[r] |= 0x80 >> c;
          if (row[c] == 'o') x.white[r] |= 0x80 >> c;
        }
      }
    }
    for (JsonVariant q : e["patch"].as<JsonArray>()) {
      if (x.patches >= 16) break;
      x.patch[x.patches++] = { (uint8_t)(q["x"] | 0), (uint8_t)(q["y"] | 0), (uint8_t)(q["w"] | 0), (uint8_t)(q["h"] | 0),
                               rgb565(q["rgb"][0] | 0, q["rgb"][1] | 0, q["rgb"][2] | 0) };
    }
  }
  if (x.name != expression.name) shadedFor = "";
  expression = x;
}

// The sprite in the expression: its colours shaded, its eyes patched, lowered by dy and squashed toward its feet
void drawSprite(int x, int y, int scale, bool mirrored) {
  if (!artKeyHave.length() || artKeyHave != st.daemon.artKey) return;
  ready();
  auto rowOf = [](int j) { return bottom - (int)roundf((bottom - j) * expression.squash) + expression.dy; };
  for (int j = 0; j < 64; j++) {
    int row = rowOf(j), tall = max(1, rowOf(j + 1) - row);   // stretched, a row reaches down to the next: no gap
    for (int i = 0; i < 64; i++) {
      uint8_t b = artPix[(j * 64 + i) >> 1], c = (i & 1) ? (b & 15) : (b >> 4);
      if (!c) continue;
      uint16_t colour = shaded[c];
      for (int k = 0; k < expression.patches; k++) {
        const Patch &p = expression.patch[k];
        if (i >= p.x && i < p.x + p.w && j >= p.y && j < p.y + p.h) colour = p.colour;   // the later patch wins (the line)
      }
      canvas.fillRect(x + (mirrored ? 63 - i : i) * scale, y + row * scale, scale, scale * tall, colour);
    }
  }
}

// The mark: above its head, at the back -- the game's sprites face left, so the back is the right (mirrored, the left)
void drawMark(int x, int y, int scale, bool mirrored, int minY) {
  if (!expression.marked) return;
  ready();
  int px = max(2, (scale * 3 + 2) / 4);                     // a mark's pixel: three quarters of a sprite's, at least two
  int mx = mirrored ? x + (63 - (rightmost - 2)) * scale - 8 * px : x + (rightmost - 2) * scale;
  // C-121's bench: on a short den (the T-Embeds, the T-Display-S3 Pro) a tall daemon's mark rose past the den's top
  // and was cut off -- glad's heart most, as glad lifts it; it is kept inside, beside the head if it must be
  int my = max(minY + 2, y + (top + expression.dy) * scale - 8 * px - 4);
  for (int r = 0; r < 8; r++) for (int c = 0; c < 8; c++) {
    int bit = 0x80 >> c;                                       // the mark is never mirrored: "zz" reads the same way round
    if (expression.ink[r] & bit) canvas.fillRect(mx + c * px, my + r * px, px, px, expression.markColour);
    else if (expression.white[r] & bit) canvas.fillRect(mx + c * px, my + r * px, px, px, PAPER);
  }
}

// ---- C-207: the week, worn -------------------------------------------------------------------------------------------
Thrive thrive;
void takeThrive(JsonVariant t) {
  Thrive x;
  if (!t.isNull()) { x.glow = constrain((int)(t["glow"] | 0), 0, 100); x.stars = constrain((int)(t["stars"] | 0), 0, 5); x.moon = t["moon"] | false; }
  thrive = x;
}
static uint16_t blend565(uint16_t a, uint16_t b, float f) {   // a toward b by f
  int ar = a >> 11, ag = (a >> 5) & 63, ab = a & 31, br = b >> 11, bg = (b >> 5) & 63, bb = b & 31;
  return ((int)(ar + (br - ar) * f) << 11) | ((int)(ag + (bg - ag) * f) << 5) | (int)(ab + (bb - ab) * f);
}
// a soft halo: what is already drawn there (the sky, the ground) lifted toward the day's colour, most at the middle and
// fading to nothing at its edge -- a third of the way at its brightest, so it is felt more than seen
void drawGlow(int cx, int cy, int r, uint16_t day) {
  if (thrive.glow <= 0 || r <= 0) return;
  float g = thrive.glow / 100.0f * 0.33f;
  for (int y = max(0, cy - r); y <= min(H - 1, cy + r); y++)
    for (int x = max(0, cx - r); x <= min(W - 1, cx + r); x++) {
      float d = sqrtf((float)((x - cx) * (x - cx) + (y - cy) * (y - cy))) / r;
      if (d >= 1) continue;
      float f = g * (1 - d) * (1 - d);
      if (f > 0.01f) canvas.drawPixel(x, y, blend565(canvas.readPixel(x, y), day, f));
    }
}
static void star(int x, int y, uint16_t c) {
  canvas.drawFastHLine(x - 2, y, 5, c); canvas.drawFastVLine(x, y - 2, 5, c); canvas.drawPixel(x, y, 0xFFFF);
}
void drawThriveMarks(int x, int y, int side) {
  for (int i = 0; i < thrive.stars; i++) star(x + 4 + i * 7, y + 4 + (i & 1) * 3, 0xFF60);   // gold, in a little row
  if (thrive.moon) { canvas.fillCircle(x + side - 6, y + 6, 4, 0xFFF4); canvas.fillCircle(x + side - 4, y + 5, 3, 0x0841); }   // a crescent
}
