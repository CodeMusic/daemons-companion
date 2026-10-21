// C-163 (the user, 2026-10-18: "the background would be neat if some reflected the season (via edition) and also in
// foreground effect representing weather"; "double tab the screen from home to bring up a 2x2 grid with the 4 items,
// icons for the items with smaller text under"): what the round faces stand in -- the season's sky and the hill the
// daemon stands on, and the weather falling in front -- and the watch's CARE, four tiles. The look is the reels' own
// (casino.cpp seasonLook: the companion's dress, C-158), so a face, the reels, the phone and the Tab5 agree.
#include "app.h"
#include "display.h"
#include "sound.h"
void drawArt(int x, int y, int scale, bool mirrored);   // ui.cpp: the daemon carried, in its expression

// ---- the sky behind ---------------------------------------------------------------------------------------------
// each season's sky, top and bottom, and its hill -- dark enough that the words stay readable; a clear night its own
struct Sky { uint32_t top, bottom, hill; };
static Sky skyNow() {
  String look = seasonLook();
  if (look == "stars") return { 0x0A102E, 0x181C34, 0x161E2C };
  if (st.season == "winter") return { 0x1A283E, 0x28384E, 0xAAC4DE };
  if (st.season == "spring") return { 0x182E2C, 0x221C28, 0x2C562A };
  if (st.season == "summer") return { 0x462E0E, 0x221A16, 0x604618 };
  return { 0x3A1C10, 0x1E1618, 0x582E16 };                     // autumn, and before a state says which
}
static uint16_t mix(uint32_t a, uint32_t b, float k) {
  auto ch = [&](int s) { return (int)(((a >> s) & 255) * (1 - k) + ((b >> s) & 255) * k); };
  return canvas.color565(ch(16), ch(8), ch(0));
}
bool faceSkyOn() { return cfg.faceSky && st.season.length(); }
// the circle's inside, line by line: the sky's gradient, and the hill (an ellipse whose top is hillTop) across it
void faceSky(int hillTop) {
  if (!faceSkyOn()) return;
  Sky s = skyNow();
  int cx = W / 2, cy = H / 2, r = min(W, H) / 2 - 4;
  int hx = 180, hy = 72, hcy = hillTop + hy;                    // the hill: wider than the screen, its top at hillTop
  for (int y = cy - r; y <= cy + r; y++) {
    int dy = y - cy, half = (int)sqrtf((float)(r * r - dy * dy));
    canvas.drawFastHLine(cx - half, y, 2 * half + 1, mix(s.top, s.bottom, (float)(y - (cy - r)) / (2 * r)));
    if (y >= hillTop) {
      float e = (float)(y - hcy) / hy;
      int hh = (int)(hx * sqrtf(max(0.0f, 1 - e * e))), w = min(half, hh);
      canvas.drawFastHLine(cx - w, y, 2 * w + 1, mix(s.hill, s.bottom, min(0.35f, (y - hillTop) / 160.0f)));
    }
  }
}

// ---- the weather in front ---------------------------------------------------------------------------------------
struct Bit { float x, y, vx, vy, phase; uint32_t rgb; };
static Bit bits[20];
static String bitsLook;
static uint32_t bitsAt = 0;
static bool twinkles(const String &l) { return l == "stars" || l == "sun" || l == "frost" || l == "moon"; }
static void reset(Bit &b, const String &l, bool anywhere) {
  int r = min(W, H) / 2 - 10;
  b.x = W / 2 - r + esp_random() % (2 * r);
  b.y = twinkles(l) ? H / 2 - r + 10 + esp_random() % r : anywhere ? H / 2 - r + esp_random() % (2 * r) : H / 2 - r - 6;
  b.vx = ((int)(esp_random() % 21) - 10) / 3.0f;
  b.vy = twinkles(l) ? 0 : l == "rain" || l == "storm" ? 90 + esp_random() % 40 : 14 + esp_random() % 22;
  if (l == "hearts" || l == "fireworks") b.vy = -b.vy;           // hearts rise; sparks go up
  b.phase = (esp_random() % 628) / 100.0f;
  b.rgb = l == "snow" ? 0xFFFFFF : seasonColour(esp_random() & 1);
}
void faceWeather() {
  if (!faceSkyOn()) return;                                       // the season and its weather go together (faceSky)
  String l = seasonLook();
  if (!l.length() || l == "none") return;
  int n = l == "rain" || l == "storm" ? 20 : l == "fog" ? 6 : 14;
  uint32_t t = millis();
  if (l != bitsLook) { bitsLook = l; for (int i = 0; i < n; i++) reset(bits[i], l, true); bitsAt = t; }
  float dt = min(0.25f, (t - bitsAt) / 1000.0f); bitsAt = t;
  int cx = W / 2, cy = H / 2, r = min(W, H) / 2 - 6;
  for (int i = 0; i < n; i++) {
    Bit &b = bits[i];
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.y > cy + r + 6 || b.y < cy - r - 8 || b.x < cx - r - 8 || b.x > cx + r + 8) reset(b, l, false);
    int x = b.x + 4 * sinf(b.phase + t / 600.0f), y = b.y;
    if ((x - cx) * (x - cx) + (y - cy) * (y - cy) > (r - 4) * (r - 4)) continue;   // inside the ring only
    uint16_t c = canvas.color565((b.rgb >> 16) & 255, (b.rgb >> 8) & 255, b.rgb & 255);
    if (l == "snow" || l == "frost") canvas.fillCircle(x, y, 1 + (i % 2), c);
    else if (l == "petals") canvas.fillEllipse(x, y, 3, 2, c);
    else if (l == "leaves") { canvas.fillTriangle(x - 3, y, x, y - 4, x + 3, y, c); canvas.fillTriangle(x - 3, y, x, y + 4, x + 3, y, c); }
    else if (l == "rain" || l == "storm") canvas.drawLine(x, y, x - 3, y + 9, canvas.color565(0x60, 0xA8, 0xFF));
    else if (l == "fog") { canvas.drawFastHLine(x - 18, y, 36, canvas.color565(0x8A, 0x8E, 0x96)); canvas.drawFastHLine(x - 10, y + 3, 20, canvas.color565(0x6A, 0x6E, 0x76)); }
    else if (l == "hearts") { canvas.fillCircle(x - 2, y, 2, c); canvas.fillCircle(x + 2, y, 2, c); canvas.fillTriangle(x - 4, y + 1, x + 4, y + 1, x, y + 5, c); }
    else if (twinkles(l)) {                                        // twinkling where they are: stars, the sun's glints
      float s = 0.5f + 0.5f * sinf(b.phase + t / 260.0f);
      int k = 1 + (int)(2 * s);
      canvas.drawFastHLine(x - k, y, 2 * k + 1, c); canvas.drawFastVLine(x, y - k, 2 * k + 1, c);
    }
    else canvas.fillCircle(x, y, 2, c);                           // a holiday's own: its colours, falling
  }
  if (l == "storm" && (t / 90) % 61 == 0) canvas.drawLine(cx + 30, cy - r + 20, cx + 10, cy - 20, PAPER);   // now and then, lightning
}

// words that stay readable over the sky and the weather: edged in INK
void edgedString(const String &s, int x, int y, uint16_t colour) {
  if (faceSkyOn()) {
    canvas.setTextColor(INK);
    for (int dx = -1; dx <= 1; dx++) for (int dy = -1; dy <= 1; dy++) if (dx || dy) canvas.drawString(s, x + dx, y + dy);
  }
  canvas.setTextColor(colour);
  canvas.drawString(s, x, y);
}

// ---- CARE, four tiles -------------------------------------------------------------------------------------------
// DRINK, FEED, TRAIN, SLEEP -- the three buttons' order (C-117), SLEEP last; WAKE in its place while it sleeps
int gridAt = 0;
static const int TOP = 58, GAP = 8;
static int tileW() { return (W - 3 * GAP) / 2; }
static int tileH() { return (H - TOP - 2 * GAP) / 2; }
int careGridKind(int tile) {
  static const int KIND[4] = { 1, 0, 2, 3 };                     // careDo's kinds: water, feed, train, sleep
  return tile == 3 && st.daemon.tired == "asleep" ? 4 : KIND[tile & 3];
}
int careGridAt(int x, int y) {
  if (y < TOP) return -1;
  return (y >= TOP + tileH() + GAP / 2 ? 2 : 0) + (x >= W / 2 ? 1 : 0);
}
void openCareGrid() {
  screen = CARE_GRID; gridAt = st.daemon.tired == "drowsy" ? 3 : 0; dirty = true;   // at bedtime, SLEEP first
  soundSelect();
}
static void icon(int kind, int cx, int cy) {
  if (kind == 1) {                                               // DRINK: a drop
    uint16_t c = canvas.color565(0x60, 0xA8, 0xFF);
    canvas.fillCircle(cx, cy + 5, 10, c); canvas.fillTriangle(cx - 9, cy + 1, cx + 9, cy + 1, cx, cy - 16, c);
    canvas.fillCircle(cx - 4, cy + 6, 2, PAPER);
  } else if (kind == 0) {                                        // FEED: a fruit, its leaf and stalk
    canvas.fillCircle(cx - 5, cy + 3, 10, canvas.color565(0xE0, 0x40, 0x40));
    canvas.fillCircle(cx + 5, cy + 3, 10, canvas.color565(0xE0, 0x40, 0x40));
    canvas.drawFastVLine(cx, cy - 12, 7, canvas.color565(0x6A, 0x40, 0x20));
    canvas.fillEllipse(cx + 6, cy - 10, 5, 2, canvas.color565(0x50, 0xB0, 0x50));
  } else if (kind == 2) {                                        // TRAIN: a dumbbell
    canvas.fillRect(cx - 14, cy - 2, 28, 4, PAPER);
    canvas.fillRoundRect(cx - 20, cy - 10, 7, 20, 2, PAPER); canvas.fillRoundRect(cx + 13, cy - 10, 7, 20, 2, PAPER);
  } else if (kind == 3) {                                        // SLEEP: the moon, and a z
    canvas.fillCircle(cx - 2, cy, 12, canvas.color565(0xFF, 0xE6, 0x9A)); canvas.fillCircle(cx + 4, cy - 4, 11, INK);
    canvas.setTextFont(2); canvas.setTextDatum(MC_DATUM); canvas.setTextColor(PAPER); canvas.drawString("z", cx + 12, cy - 10);
  } else {                                                       // WAKE: the sun
    uint16_t c = canvas.color565(0xFF, 0xC8, 0x30);
    canvas.fillCircle(cx, cy, 8, c);
    for (int k = 0; k < 8; k++) { float a = k * PI / 4; canvas.drawLine(cx + 11 * cosf(a), cy + 11 * sinf(a), cx + 15 * cosf(a), cy + 15 * sinf(a), c); }
  }
}
void drawCareGrid(uint16_t day, uint16_t ink) {
  static const char *WORD[] = { "FEED", "DRINK", "TRAIN", "SLEEP", "WAKE" };   // DRAFT
  canvas.setTextDatum(MC_DATUM);
  canvas.setTextFont(2); canvas.setTextColor(readable(day));
  canvas.drawString("CARE FOR " + upper(st.daemon.nickname), W / 2, 36);       // DRAFT
  canvas.setTextFont(1); canvas.setTextColor(QUIET);
  canvas.drawString("fed " + String(st.daemon.fed) + "/3   water " + String(st.daemon.watered) + "/3", W / 2, 50);   // DRAFT
  bool bed = st.daemon.tired == "drowsy";
  for (int t = 0; t < 4; t++) {
    int x = GAP + (t & 1) * (tileW() + GAP), y = TOP + (t >> 1) * (tileH() + GAP), kind = careGridKind(t);
    bool chosen = false, lit = bed && t == 3;                    // a tap chooses; bedtime: SLEEP lit, as the buttons light it
    if (chosen) canvas.fillRoundRect(x, y, tileW(), tileH(), 8, day);
    canvas.drawRoundRect(x, y, tileW(), tileH(), 8, lit ? PAPER : day);
    if (chosen || lit) canvas.fillRoundRect(x + 10, y + 8, tileW() - 20, tileH() - 30, 6, INK);   // the icon's own ground
    icon(kind, x + tileW() / 2, y + (tileH() - 22) / 2 + 6);
    canvas.setTextFont(2); canvas.setTextDatum(MC_DATUM);
    canvas.setTextColor(chosen ? ink : PAPER);
    canvas.drawString(WORD[kind], x + tileW() / 2, y + tileH() - 12);
  }
  canvas.setTextDatum(TL_DATUM);
}

// ---- C-172: the watch's lists as 2x2 grids (the user, 2026-10-21: "the 2x2 grid with symbol and smaller text under
// where u tap on 1 of the 4 items to select it ... with swiping to go through (if there is more than 4 items) ... small
// indicators on the screen for when u can swipe") -----------------------------------------------------------------
const Page LAUNCH_PAGES[LAUNCH_N] = { TODAY, ROUTINES_PAGE, DAEMON, DAY_PAGE, SOUND_PAGE };
int launchAt = 0;
String launchWord(int i) {
  static const char *W5[LAUNCH_N] = { "TODAY", "ROUTINES", "", "THE DAY", "SETTINGS" };   // DRAFT
  return i == 2 ? (st.carrying ? upper(st.daemon.nickname) : String("DAEMON")) : String(W5[i]);
}
int launchIndex(Page p) { for (int i = 0; i < LAUNCH_N; i++) if (LAUNCH_PAGES[i] == p) return i; return -1; }
void openLaunch(int at) { screen = LAUNCH; launchAt = at; dirty = true; soundSelect(); }

// the dots: one for each page, the one here filled
void pageDots(int at, int n) {
  if (n < 2) return;
  int y = H - 7, x0 = W / 2 - (n - 1) * 5;
  for (int i = 0; i < n; i++) {
    if (i == at) canvas.fillCircle(x0 + i * 10, y, 3, PAPER); else canvas.drawCircle(x0 + i * 10, y, 2, QUIET);
  }
}

// four tiles of the n, the page the chosen one is on -- each its icon and its word; the chosen one in the day's colour
void drawTiles(int n, int sel, const String *words, const char *title, void (*icon)(int, int, int), uint16_t day, uint16_t ink) {
  const int top = title[0] ? 46 : 32, gap = 8, bottom = n > 4 ? 16 : 6;
  int tw = (W - 3 * gap) / 2, th = (H - top - bottom - gap) / 2, page = sel / 4;
  if (title[0]) {
    canvas.setTextDatum(MC_DATUM); canvas.setTextFont(2); canvas.setTextColor(readable(day));
    canvas.drawString(upper(title), W / 2, 36);
  }
  tapArea(0, top, W, H - top);
  for (int k = 0; k < 4; k++) {
    int i = page * 4 + k;
    if (i >= n) break;
    int x = gap + (k & 1) * (tw + gap), y = top + (k >> 1) * (th + gap);
    bool chosen = false;                                      // a tap chooses: none shown chosen (the user, 2026-10-21)
    if (chosen) canvas.fillRoundRect(x, y, tw, th, 8, day);
    canvas.drawRoundRect(x, y, tw, th, 8, day);
    if (chosen) canvas.fillRoundRect(x + 10, y + 6, tw - 20, th - 30, 6, INK);   // the icon's own ground
    icon(i, x + tw / 2, y + (th - 24) / 2 + 4);
    canvas.setTextDatum(MC_DATUM); canvas.setTextFont(2);
    if (canvas.textWidth(words[i]) > tw - 8) canvas.setTextFont(1);
    canvas.setTextColor(chosen ? ink : PAPER);
    canvas.drawString(words[i], x + tw / 2, y + th - 12);
    tapRect(x, y, tw, th, i - sel);
  }
  canvas.setTextDatum(TL_DATUM);
  if (n > 4) pageDots(page, (n + 3) / 4);
}

// the pages' icons: TODAY a tick, ROUTINES a bolt, the daemon itself, THE DAY its colour and note, SETTINGS a wheel
void pageIcon(int i, int cx, int cy) {
  if (i == 0) { canvas.drawCircle(cx, cy, 14, PAPER); canvas.drawWideLine(cx - 7, cy, cx - 2, cy + 6, 2.0f, PAPER); canvas.drawWideLine(cx - 2, cy + 6, cx + 8, cy - 6, 2.0f, PAPER); }
  else if (i == 1) { uint16_t c = canvas.color565(0xFF, 0xC8, 0x30); canvas.fillTriangle(cx + 3, cy - 16, cx - 9, cy + 2, cx + 1, cy + 2, c); canvas.fillTriangle(cx - 3, cy + 16, cx + 9, cy - 2, cx - 1, cy - 2, c); }
  else if (i == 2) { if (st.carrying) drawArt(cx - 32, cy - 36, 1, false); else canvas.drawCircle(cx, cy, 14, QUIET); }
  else if (i == 3) {
    long v = st.menu.length() == 7 ? strtol(st.menu.c_str() + 1, nullptr, 16) : 0x833131;
    uint16_t day = canvas.color565((v >> 16) & 255, (v >> 8) & 255, v & 255);
    canvas.fillCircle(cx, cy, 15, day); canvas.drawCircle(cx, cy, 15, PAPER);
    canvas.setTextDatum(MC_DATUM); canvas.setTextFont(2); canvas.setTextColor(PAPER); canvas.drawString(st.note.length() ? st.note : String("C"), cx, cy);
  } else {
    canvas.fillCircle(cx, cy, 10, QUIET); canvas.fillCircle(cx, cy, 4, INK);
    for (int k = 0; k < 8; k++) { float a = k * PI / 4; canvas.fillCircle(cx + 12 * cosf(a), cy + 12 * sinf(a), 3, QUIET); }
  }
}

// a routine type's icon, by its name
void typeIcon(const char *name, int cx, int cy) {
  String n = name;
  uint16_t gold = canvas.color565(0xFF, 0xC8, 0x30), blue = canvas.color565(0x60, 0xA8, 0xFF), red = canvas.color565(0xE0, 0x40, 0x40);
  canvas.setTextDatum(MC_DATUM);
  if (n == "CASINO") { canvas.setTextFont(4); canvas.setTextColor(gold); canvas.drawString("7", cx, cy); }
  else if (n == "FLARE") { canvas.fillRoundRect(cx - 14, cy - 5, 14, 10, 2, PAPER); for (int r = 6; r <= 14; r += 4) canvas.drawArc(cx + 2, cy, r, r - 1, 300, 60, red); }
  else if (n == "CHORUS") { canvas.fillCircle(cx, cy, 3, PAPER); for (int r = 7; r <= 15; r += 4) { canvas.drawArc(cx, cy, r, r - 1, 300, 60, PAPER); canvas.drawArc(cx, cy, r, r - 1, 120, 240, PAPER); } }
  else if (n == "WHISPER") { canvas.drawLine(cx - 6, cy - 7, cx + 6, cy + 6, blue); canvas.drawLine(cx - 6, cy + 7, cx + 6, cy - 6, blue); canvas.drawLine(cx, cy - 13, cx, cy + 13, blue); canvas.drawLine(cx, cy - 13, cx + 6, cy - 6, blue); canvas.drawLine(cx, cy + 13, cx + 6, cy + 6, blue); }
  else if (n == "MESH") { canvas.drawLine(cx, cy - 4, cx, cy + 14, PAPER); canvas.fillCircle(cx, cy - 6, 3, PAPER); for (int r = 8; r <= 14; r += 6) { canvas.drawArc(cx, cy - 6, r, r - 1, 300, 30, PAPER); canvas.drawArc(cx, cy - 6, r, r - 1, 150, 240, PAPER); } }
  else if (n == "UPLINK") { canvas.fillCircle(cx, cy + 9, 3, PAPER); for (int r = 8; r <= 18; r += 5) canvas.drawArc(cx, cy + 9, r, r - 2, 225, 315, PAPER); }
  else if (n == "PARTY") { for (int k = -1; k <= 1; k++) { canvas.fillCircle(cx + k * 11, cy - 4, 4, PAPER); canvas.fillRoundRect(cx + k * 11 - 5, cy + 2, 10, 9, 3, PAPER); } }
  else if (n == "TOUCHSTONE") { canvas.drawRoundRect(cx - 14, cy - 9, 28, 18, 3, PAPER); canvas.fillRect(cx - 10, cy - 4, 8, 6, gold); }
  else if (n == "LONGWAVE" || n == "LATENT" || n == "CONTEXT") { for (int x = -14; x < 14; x++) { int y = (int)(6 * sinf(x / 3.0f)); canvas.drawPixel(cx + x, cy + y, PAPER); canvas.drawPixel(cx + x, cy + y + 1, PAPER); } }
  else if (n == "GLOW") { canvas.fillTriangle(cx, cy - 15, cx - 9, cy + 4, cx + 9, cy + 4, red); canvas.fillCircle(cx, cy + 5, 9, red); canvas.fillCircle(cx, cy + 6, 4, gold); }
  else canvas.drawCircle(cx, cy, 12, PAPER);
  canvas.setTextDatum(TL_DATUM);
}
