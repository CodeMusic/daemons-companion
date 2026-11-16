// C-333 (the user, 2026-11-11, by multiple choice: "a map of the walks, offline"): WALKS, on the Ultra's BOOKS after
// MUSIC. Every walk's fixes are kept on the card as they are told (gps.cpp keepFix: walks/<day>.txt), so the map is
// drawn here with no network: a day's walks as lines, fitted to the screen with north up, where each began (a ring)
// and ended (a dot), the distance and a scale bar. A swipe turns to the day before or after. Never sent anywhere from
// here (C-174). The streets under them -- map tiles kept on the card -- wait on where they may come from. Every word DRAFT.
#include "app.h"
#include "card.h"

#if !defined(BOARD_TWATCH_ULTRA)

String runWalks() { return "NO CARD"; }                    // DRAFT

#else

#include <vector>
#include <algorithm>
#include <math.h>

void listRow(int i, int at, const String &text, uint16_t day, uint16_t ink, int width);   // ui.cpp
struct Fix { float lat, lon; bool begins; };
static std::vector<String> days;
static std::vector<Fix> fixes;
static int wAt = 0, wOpen = -1;
static String wWhy;
static double wMetres = 0;

static double metresBetween(double a1, double o1, double a2, double o2) {   // haversine, the earth's mean radius
  const double r = 6371000.0, p = PI / 180;
  double da = (a2 - a1) * p, dn = (o2 - o1) * p;
  double h = sin(da / 2) * sin(da / 2) + cos(a1 * p) * cos(a2 * p) * sin(dn / 2) * sin(dn / 2);
  return 2 * r * asin(min(1.0, sqrt(h)));
}
static void openDay(int i) {
  fixes.clear(); wMetres = 0;
  String body = cardRead("walks/" + days[i]);
  bool next = true;
  int from = 0;
  while (from < (int)body.length()) {
    int nl = body.indexOf('\n', from); if (nl < 0) nl = body.length();
    String l = body.substring(from, nl); l.trim(); from = nl + 1;
    if (l == "-") { next = true; continue; }
    int sp = l.indexOf(' ');
    if (sp < 0) continue;
    Fix f{ l.substring(0, sp).toFloat(), l.substring(sp + 1).toFloat(), next };
    if (!f.begins && !fixes.empty()) {
      double m = metresBetween(fixes.back().lat, fixes.back().lon, f.lat, f.lon);
      if (m < 2000) wMetres += m; else f.begins = true;      // a gap, not a stride
    }
    fixes.push_back(f); next = false;
  }
  wOpen = i;
}
static String dayWords(const String &file) { return file.substring(0, min(10, (int)file.length())); }

static String drawWalks(uint16_t day, uint16_t ink) {
  canvas.setTextDatum(TL_DATUM); canvas.setTextFont(2); canvas.setTextColor(readable(day));
  if (wWhy.length()) { canvas.drawString("WALKS", 10, 32); wrap(wWhy, 10, 56, W - 20, 2, 18, 6, PAPER); return "hold: back"; }   // DRAFT
  if (wOpen < 0) {
    int n = days.size();
    if (gridLists()) {
      static std::vector<String> words;
      words.assign(n, String());
      for (int i = 0; i < n; i++) words[i] = dayWords(days[i]);
      drawTiles(n, wAt, words.data(), "WALKS", [](int, int cx, int cy) {                                  // a path, winding
        canvas.drawLine(cx - 14, cy + 10, cx - 4, cy - 2, PAPER); canvas.drawLine(cx - 4, cy - 2, cx + 6, cy + 4, PAPER);
        canvas.drawLine(cx + 6, cy + 4, cx + 14, cy - 10, PAPER); canvas.fillCircle(cx + 14, cy - 10, 3, PAPER);
      }, day, ink);
      return " ";
    }
    canvas.drawString("WALKS", 10, 30);                                                                  // DRAFT
    int fit = listRowsFit(), top = max(0, wAt - (fit - 1));
    for (int i = top; i < n && i < top + fit; i++) listRow(i - top, wAt - top, dayWords(days[i]), day, ink, W - 12);
    return "turn: choose   press: open   hold: back";                                                   // DRAFT
  }
  canvas.drawString(dayWords(days[wOpen]), 10, 28);
  String far = wMetres >= 1000 ? String(wMetres / 1000, 2) + " KM" : String((long)wMetres) + " M";    // DRAFT
  canvas.setTextDatum(TR_DATUM); canvas.drawString(far, W - 10, 28); canvas.setTextDatum(TL_DATUM);
  if (fixes.size() < 2) { wrap("Too few fixes that day to draw.", 10, 60, W - 20, 2, 18, 3, PAPER); return "swipe: another day   hold: back"; }   // DRAFT
  // north up; a degree of longitude shrunk by the latitude's cosine, so the shape is true
  float a0 = 90, a1 = -90, o0 = 180, o1 = -180;
  for (auto &f : fixes) { a0 = min(a0, f.lat); a1 = max(a1, f.lat); o0 = min(o0, f.lon); o1 = max(o1, f.lon); }
  const float k = cosf((a0 + a1) / 2 * PI / 180);
  const int bx = 14, by = 50, bw = W - 28, bh = H - by - 46;
  float spanX = max(1e-5f, (o1 - o0) * k), spanY = max(1e-5f, a1 - a0), sc = min(bw / spanX, bh / spanY);
  int offX = bx + (int)((bw - spanX * sc) / 2), offY = by + (int)((bh - spanY * sc) / 2);
  auto px = [&](const Fix &f) { return offX + (int)((f.lon - o0) * k * sc); };
  auto py = [&](const Fix &f) { return offY + (int)((a1 - f.lat) * sc); };
  canvas.drawRoundRect(bx - 4, by - 4, bw + 8, bh + 8, 8, QUIET);
  for (size_t i = 0; i < fixes.size(); i++) {
    if (fixes[i].begins) canvas.drawCircle(px(fixes[i]), py(fixes[i]), 4, PAPER);   // where a walk began
    else {
      int x0 = px(fixes[i - 1]), y0 = py(fixes[i - 1]), x1 = px(fixes[i]), y1 = py(fixes[i]);
      canvas.drawLine(x0, y0, x1, y1, day); canvas.drawLine(x0 + 1, y0, x1 + 1, y1, day);
    }
    if (i + 1 == fixes.size() || fixes[i + 1].begins) canvas.fillCircle(px(fixes[i]), py(fixes[i]), 4, PAPER);   // where it ended
  }
  // a scale bar: the roundest length that fits a third of the width
  double mPerPx = 111320.0 / sc, want = mPerPx * bw / 3, bar = 1;
  for (double s : { 1.0, 2.0, 5.0, 10.0, 20.0, 50.0, 100.0, 200.0, 500.0, 1000.0, 2000.0, 5000.0, 10000.0 }) if (s <= want) bar = s;
  int bl = (int)(bar / mPerPx);
  canvas.drawFastHLine(bx, H - 34, bl, PAPER); canvas.drawFastVLine(bx, H - 38, 8, PAPER); canvas.drawFastVLine(bx + bl, H - 38, 8, PAPER);
  canvas.setTextFont(1); canvas.setTextColor(QUIET);
  canvas.drawString(bar >= 1000 ? String((int)(bar / 1000)) + " km" : String((int)bar) + " m", bx + bl + 6, H - 38);
  canvas.setTextDatum(TR_DATUM); canvas.drawString("N ^", W - bx, H - 38); canvas.setTextDatum(TL_DATUM);
  return "swipe: another day   hold: back";                                                            // DRAFT
}

String runWalks() {
  wAt = 0; wOpen = -1; wWhy = ""; fixes.clear();
  runPanel = drawWalks;
  if (!cardReady()) wWhy = "No card in the watch.";                                                     // DRAFT
  else {
    days.clear();
    for (auto &n : cardList("walks")) if (n.endsWith(".txt")) days.push_back(n);
    std::reverse(days.begin(), days.end());                  // the newest first
    if (days.empty()) wWhy = "No walk kept yet. Take the daemon for a walk with GPS on.";                // DRAFT
  }
  progress("");
  while (true) {
    int step, ev; routineInput(step, ev);
    if (routineQuit()) ev = -1;
    if (ev == -1) { if (wOpen >= 0 && !wWhy.length()) { wOpen = -1; fixes.clear(); progress(""); continue; } break; }
    if (wWhy.length()) { delay(10); continue; }
    int n = days.size();
    if (wOpen >= 0) {
      if (step) { openDay((wOpen + n + (step > 0 ? 1 : -1)) % n); progress(""); }
    } else {
      if (step && n) { wAt = gridLists() ? tilesPage(wAt, n, step) : (wAt + n + step) % n; progress(""); }
      if (ev == 1 && n && gridLists() && !tilesTap(wAt, n)) ev = 0;
      if (ev == 1 && n) { openDay(wAt); progress(""); }
    }
    delay(10);
  }
  runPanel = nullptr; fixes.clear(); days.clear();
  return "";
}

#endif
