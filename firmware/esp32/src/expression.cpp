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
  String key = artKeyHave + "/" + expression.name;
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
  for (int j = 0; j < 64; j++) {
    int row = bottom - (int)roundf((bottom - j) * expression.squash) + expression.dy;
    for (int i = 0; i < 64; i++) {
      uint8_t b = artPix[(j * 64 + i) >> 1], c = (i & 1) ? (b & 15) : (b >> 4);
      if (!c) continue;
      uint16_t colour = shaded[c];
      for (int k = 0; k < expression.patches; k++) {
        const Patch &p = expression.patch[k];
        if (i >= p.x && i < p.x + p.w && j >= p.y && j < p.y + p.h) colour = p.colour;   // the later patch wins (the line)
      }
      canvas.fillRect(x + (mirrored ? 63 - i : i) * scale, y + row * scale, scale, scale, colour);
    }
  }
}

// The mark: above its head, at the back -- the game's sprites face left, so the back is the right (mirrored, the left)
void drawMark(int x, int y, int scale, bool mirrored) {
  if (!expression.marked) return;
  ready();
  int px = max(2, (scale * 3 + 2) / 4);                     // a mark's pixel: three quarters of a sprite's, at least two
  int mx = mirrored ? x + (63 - (rightmost - 2)) * scale - 8 * px : x + (rightmost - 2) * scale;
  int my = y + (top + expression.dy) * scale - 8 * px - 4;
  for (int r = 0; r < 8; r++) for (int c = 0; c < 8; c++) {
    int bit = 0x80 >> c;                                       // the mark is never mirrored: "zz" reads the same way round
    if (expression.ink[r] & bit) canvas.fillRect(mx + c * px, my + r * px, px, px, expression.markColour);
    else if (expression.white[r] & bit) canvas.fillRect(mx + c * px, my + r * px, px, px, PAPER);
  }
}
