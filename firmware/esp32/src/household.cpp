// C-327 (the user, 2026-11-11: "trading if wihtin the house-hold could be a way to just swap the selection of the device
// ... a similar option for when you play together and the two daemons enter the same screen space ( shown on each of the
// social devices ), and if u care on any device u see it on the other too (e.g. feeding it will make the food appear in
// the center which each of the 2 daemons to each side eating it"): the watch's half of the household's spaces. The hub
// keeps them (server/src/household.ts, docs/TRADING.md); here TOGETHER and SWAP are chosen from the daemon's tiles (a
// device of the household, as tiles), and a care given on either device is drawn between the two daemons -- C-302's
// PROVISION, the same pixels as the app's (app/screens/daemon/Provision.tsx), eaten or drunk in four stages. Every word
// DRAFT.
#include "app.h"
#include "board.h"
#include <vector>

// ---- the PROVISION, as the app draws it: 12 rows of letters, each its colour -------------------------------------------
static const char *const FRUIT[4][12] = {
  { "......s.....", "......sll...", "...rrrsrr...", "..rrrrrrrr..", ".rhhrrrrrrr.", ".rhrrrrrrrr.",
    ".rrrrrrrrrr.", ".rrrrrrrrrr.", ".rrrrrrrrrd.", "..rrrrrrdd..", "...rrrrdd...", "....rr.rr..." },
  { "......s.....", "......sll...", "...rrrsrr...", "..rrrrrrrf..", ".rhhrrrrf...", ".rhrrrrf....",
    ".rrrrrrf....", ".rrrrrrrf...", ".rrrrrrrrf..", "..rrrrrrdf..", "...rrrrdd...", "....rr.rr..." },
  { "......s.....", "......sll...", "....rrsr....", "....frrf....", ".....frf....", ".....frf....",
    ".....frf....", ".....frf....", "....frrrf...", "...frrrrdf..", "...rrrrdd...", "....rr.rr..." },
  { "............", "............", "............", "............", "............", "............",
    "............", "............", "............", "............", "............", "..f....f..f." },
};
static uint16_t inkOf(char c, bool drink) {
  if (drink) switch (c) {
    case 'g': return canvas.color565(225, 240, 250);
    case 'w': return canvas.color565(0x4F, 0xA3, 0xE0);
    case 'h': return canvas.color565(0xBF, 0xE3, 0xFA);
    default: return 0;
  }
  switch (c) {
    case 'r': return canvas.color565(0xD8, 0x44, 0x3C);
    case 'h': return canvas.color565(0xF3, 0x94, 0x86);
    case 'd': return canvas.color565(0xA8, 0x30, 0x2B);
    case 's': return canvas.color565(0x6B, 0x4A, 0x2B);
    case 'l': return canvas.color565(0x5C, 0xAE, 0x4A);
    case 'f': return canvas.color565(0xF4, 0xE3, 0xB0);
    default: return 0;
  }
}
// a small glass of water, the water a third lower each stage (app: glass(level), 10 wide)
static char glassAt(int level, int x, int y) {
  if (y == 11) return x == 0 || x == 9 ? '.' : 'g';
  if (y == 0) return x == 0 || x == 9 ? 'g' : '.';
  if (x == 0 || x == 9) return 'g';
  if (y < 11 - level) return '.';
  return y == 11 - level && (x == 1 || x == 8) ? 'h' : 'w';
}

static String servedAt;            // the care's own time, so each is played once
static uint32_t servedFrom = 0;
static bool servedDrink = false;
void servedDraw(int cx, int floorY, int px) {
  const Together &t = st.together;
  if (t.on && t.careAt.length() && t.careAt != servedAt && (t.careKind == "feed" || t.careKind == "water")) {
    servedAt = t.careAt; servedFrom = millis(); servedDrink = t.careKind == "water";
  }
  if (!servedFrom) return;
  const uint32_t step = 400, age = millis() - servedFrom;
  if (age > step * 3 + 650) { servedFrom = 0; return; }            // empty a moment, then gone
  const int stage = min(3, (int)(age / step)), w = servedDrink ? 10 : 12;
  const int x0 = cx - w * px / 2, y0 = floorY - 12 * px;
  for (int y = 0; y < 12; y++) for (int x = 0; x < w; x++) {
    char c = servedDrink ? glassAt(9 - 3 * stage, x, y) : FRUIT[stage][y][x];
    if (c == '.') continue;
    canvas.fillRect(x0 + x * px, y0 + y * px, px, px, inkOf(c, servedDrink));
  }
  dirty = true;                                                     // the stages go on without a touch
}

// ---- TOGETHER and SWAP: a device of the household, chosen as a tile --------------------------------------------------
static int hMode = 0, hAt = 0;
static std::vector<String> hIds, hWords;
static String drawHousehold(uint16_t day, uint16_t ink) {
  if (hIds.empty()) {
    canvas.setTextDatum(TL_DATUM); canvas.setTextFont(2); canvas.setTextColor(readable(day));
    canvas.drawString(hMode ? "SWAP" : "TOGETHER", 10, 32);                                 // DRAFT
    canvas.setTextColor(QUIET); canvas.drawString("Asking the household...", 10, 56);         // DRAFT
    return "crown: back";
  }
  drawTiles(hIds.size(), hAt, hWords.data(), hMode ? "SWAP WITH" : "TOGETHER WITH", [](int i, int cx, int cy) {   // DRAFT
    canvas.drawRoundRect(cx - 12, cy - 16, 24, 32, 5, PAPER);          // a device
    canvas.fillCircle(cx, cy + 10, 2, QUIET);
  }, day, ink);
  return " ";
}
String runHousehold(int mode) {
  hMode = mode; hAt = 0; hIds.clear(); hWords.clear();
  runPanel = drawHousehold;
  progress("");
  bool ok; String got = http("GET", "/api/household", "", &ok);
  JsonDocument d;
  if (!ok || deserializeJson(d, got)) { runPanel = nullptr; return online() ? "NOT NOW" : "NEEDS WI-FI"; }   // DRAFT
  for (JsonPair p : d["carrying"].as<JsonObject>()) {
    String id = p.key().c_str();
    if (id == deviceId()) continue;
    String nick = p.value()["nickname"] | "", name = p.value()["name"] | "";
    hIds.push_back(id);
    hWords.push_back(tileWord(nick.length() ? nick : name.length() ? name : id, (W - 24) / 2));
  }
  if (hIds.empty()) { runPanel = nullptr; return "NO ONE ELSE"; }   // DRAFT: no other device of the household carries one
  progress("");
  String said;
  while (true) {
    int step, ev; routineInput(step, ev);
    if (routineQuit() || ev == -1) break;
    const int n = hIds.size();
    if (step) { hAt = tilesPage(hAt, n, step); progress(""); }
    if (ev == 1 && tilesTap(hAt, n)) {
      String body = "{\"b\":\"" + hIds[hAt] + "\"}";
      String r = http("POST", mode ? "/api/household/swap" : "/api/household/together", body, &ok);
      JsonDocument e; String err = !ok && !deserializeJson(e, r) ? String((const char *)(e["error"] | "")) : String("");
      said = ok ? String(mode ? "SWAPPED" : "TOGETHER") : err.length() && err.length() <= 18 ? upper(err) : String("NOT NOW");   // DRAFT; the box holds a word
      break;
    }
    delay(10);
  }
  runPanel = nullptr; hIds.clear(); hWords.clear();
  return said;
}
