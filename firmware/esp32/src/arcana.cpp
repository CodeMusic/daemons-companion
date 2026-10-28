// C-232 (the user, 2026-10-28): THE SUBTLE LAYER's cards on the watches -- in BOOKS, once the book is held: THE DAY'S
// CARD, DRAW A CARD (again with a tap -- one each, with a friend), and PAST PRESENT FUTURE (a swipe between the three).
// The deck and the draw are the companion's (GET /api/arcana/today, /api/arcana/draw?count=; server/src/arcana.ts); the
// card is drawn here as the app's face is (server/tools/arcana_backs.py): the book's purple deepening upward, the side's
// colour rising -- REASON a circuit board under green, INSTINCT a living net under gold -- a halo where the daemon
// stands (its picture as the INDEX loads it), the keyword at the top and the phrase on a dark panel below. SHINY: the
// colours inverted, a gold foil edge, glints. A prompt for noticing, never a prediction. Every word DRAFT.
#include "app.h"

bool indexArtFor(int species); void indexArtDraw(int x, int y, int sc);   // index.cpp: any daemon's picture

struct Arc { String roman, side, keyword, phrase, name, at; int n = 0, species = 0; bool shiny = false; };
static Arc arcs[3];
static int arcN = 0, arcAt = 0;
static bool arcArt = false;                               // the picture of the card shown is loaded
static String arcWhy;

static uint16_t rgb(int r, int g, int b, bool inv) {
  r = constrain(r, 0, 255); g = constrain(g, 0, 255); b = constrain(b, 0, 255);
  return inv ? canvas.color565(255 - r, 255 - g, 255 - b) : canvas.color565(r, g, b);
}
static uint32_t seed = 1;
static int roll(int lo, int hi) { seed = seed * 1103515245u + 12345u; return lo + (int)((seed >> 8) % (uint32_t)(hi - lo + 1)); }

// the face, then the daemon, then the words
static void face(const Arc &c, int x, int y, int w, int h) {
  const bool inv = c.shiny, reason = c.side == "reason";
  const int sr = reason ? 22 : 224, sg = 150, sb = reason ? 92 : 40;            // green, or gold
  for (int j = 0; j < h; j++) {
    float t = j / (float)(h - 1), up = min(1.0f, t * 1.4f), k = t < 0.35f ? 0 : powf((t - 0.35f) / 0.65f, 1.4f) * 0.7f;
    int r = 58 + (int)((176 - 58) * up), g = 24 + (int)((86 - 24) * up), b = 56 + (int)((158 - 56) * up);
    canvas.drawFastHLine(x, y + j, w, rgb(r + (int)((sr - r) * k), g + (int)((sg - g) * k), b + (int)((sb - b) * k), inv));
  }
  seed = (uint32_t)c.n * 977u + (reason ? 1 : 2);
  if (reason) {                                           // traces at right angles, a pad at each end
    uint16_t col = rgb(90, 190, 140, inv);
    for (int i = 0; i < 12; i++) {
      int px = x + roll(4, w - 4), py = y + roll(4, h - 4);
      canvas.fillCircle(px, py, 2, col);
      for (int s = 0; s < 3; s++) {
        int nx = px, ny = py;
        if (roll(0, 1)) nx = constrain(px + roll(-40, 40), x + 4, x + w - 4); else ny = constrain(py + roll(-50, 50), y + 4, y + h - 4);
        canvas.drawLine(px, py, nx, ny, col); px = nx; py = ny;
      }
      canvas.drawCircle(px, py, 2, col);
    }
  } else {                                                // nodes, and a bent line to a neighbour
    int nx[14], ny[14]; uint16_t col = rgb(200, 160, 110, inv);
    for (int i = 0; i < 14; i++) { nx[i] = x + roll(6, w - 6); ny[i] = y + roll(6, h - 6); }
    for (int i = 0; i < 14; i++) {
      int j = (i + 1 + roll(0, 2)) % 14, mx = (nx[i] + nx[j]) / 2 + roll(-12, 12), my = (ny[i] + ny[j]) / 2 + roll(-12, 12);
      canvas.drawLine(nx[i], ny[i], mx, my, col); canvas.drawLine(mx, my, nx[j], ny[j], col);
    }
    for (int i = 0; i < 14; i++) canvas.fillCircle(nx[i], ny[i], roll(1, 3), rgb(255, 214, 140, inv));
  }
  const uint16_t deep = rgb(58, 24, 56, inv);
  const int cy = y + h * 186 / 400, py = y + h * 270 / 400;
  canvas.fillEllipse(x + w / 2, cy, w * 36 / 100, w * 34 / 100, deep);          // where the daemon stands
  canvas.fillRoundRect(x + 5, py, w - 10, h * 64 / 400, 6, deep);               // the phrase's panel
  const uint16_t edge = inv ? canvas.color565(255, 226, 122) : canvas.color565(239, 140, 214);
  canvas.drawRoundRect(x, y, w, h, 8, edge); canvas.drawRoundRect(x + 1, y + 1, w - 2, h - 2, 7, edge);
  if (inv) for (int i = 0; i < 6; i++) {                  // a shiny card's glints
    int gx = x + roll(8, w - 8), gy = y + roll(8, h - 8);
    canvas.drawFastHLine(gx - 3, gy, 7, edge); canvas.drawFastVLine(gx, gy - 3, 7, edge);
  }
  if (arcArt) indexArtDraw(x + w / 2 - 32, cy - 32, 1);
  const uint16_t ink = inv ? canvas.color565(20, 10, 20) : canvas.color565(255, 244, 252);
  canvas.setTextColor(ink); canvas.setTextDatum(TC_DATUM);
  canvas.setTextFont(1); canvas.drawString(c.roman, x + w / 2, y + 5);
  canvas.setTextFont(2); if (canvas.textWidth(c.keyword) > w - 8) canvas.setTextFont(1);
  canvas.drawString(c.keyword, x + w / 2, y + 16);
  canvas.setTextFont(1); canvas.drawString(c.name, x + w / 2, y + h - 14);
  canvas.setTextDatum(TL_DATUM);
  wrap(c.phrase, x + 10, py + 5, w - 20, 1, 10, 4, ink);
}

static String drawArcana(uint16_t, uint16_t) {
  canvas.setTextDatum(TL_DATUM);
  if (arcWhy.length()) { wrap(arcWhy, 10, 40, W - 20, 2, 18, 6, PAPER); return "hold: back"; }   // DRAFT
  const Arc &c = arcs[arcAt];
  int top = arcN == 3 ? 46 : 32, h = H - top - 26, w = h * 240 / 400;
  if (w > W - 30) { w = W - 30; h = w * 400 / 240; }
  if (arcN == 3) {
    canvas.setTextFont(2); canvas.setTextColor(QUIET); canvas.setTextDatum(TC_DATUM);
    canvas.drawString(c.at + "  " + String(arcAt + 1) + " / 3", W / 2, 28); canvas.setTextDatum(TL_DATUM);   // DRAFT
  }
  face(c, W / 2 - w / 2, top, w, h);
  return arcN == 3 ? "swipe: past, present, future   hold: back" : "tap: draw again   hold: back";       // DRAFT
}

static void takeOne(Arc &a, JsonVariantConst v) {
  a.n = v["n"] | 0; a.roman = (const char *)(v["roman"] | ""); a.side = (const char *)(v["side"] | "reason");
  a.keyword = (const char *)(v["keyword"] | ""); a.phrase = (const char *)(v["phrase"] | ""); a.name = (const char *)(v["name"] | "");
  a.species = v["species"] | 0; a.shiny = v["shiny"] | false; a.at = (const char *)(v["at"] | "");
}
// the cards from the companion; the first one's picture loaded
static bool fetchCards(const String &path) {
  bool ok = false; String got = http("GET", path, "", &ok);
  JsonDocument d; arcN = 0; arcAt = 0; arcWhy = "";
  if (!ok || deserializeJson(d, got)) { arcWhy = online() ? "The companion did not answer." : "NEEDS WI-FI"; return false; }   // DRAFT
  if (!d["card"].isNull()) takeOne(arcs[arcN++], d["card"]);
  for (JsonVariantConst v : d["cards"].as<JsonArrayConst>()) if (arcN < 3) takeOne(arcs[arcN++], v);
  if (!arcN) { arcWhy = "Find THE SUBTLE LAYER in the game first."; return false; }                                         // DRAFT
  arcArt = indexArtFor(arcs[0].species);
  return true;
}

// 0 the day's card, 1 a card (a tap draws again), 2 a spread of three
String runArcana(int mode) {
  runPanel = drawArcana;
  fetchCards(mode == 0 ? "/api/arcana/today" : mode == 1 ? "/api/arcana/draw?count=1" : "/api/arcana/draw?count=3");
  progress("");
  while (true) {
    int step, ev; routineInput(step, ev);
    if (routineQuit() || ev == -1) break;
    if (arcN == 3 && step) { arcAt = (arcAt + 3 + step) % 3; arcArt = indexArtFor(arcs[arcAt].species); progress(""); }
    if (mode == 1 && ev == 1) { fetchCards("/api/arcana/draw?count=1"); progress(""); }
    delay(10);
  }
  runPanel = nullptr; arcN = 0;
  return "";
}
