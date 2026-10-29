// C-203 (the user, 2026-10-28, by multiple choice): THE SUBTLE LAYER on the watches -- DAEMONS T-459's noticing, reads and
// leans, off the cartridge. All of it wakes only once the save holds the book: the state's `subtle` (server/src/
// intuition.ts) comes then, and only then, with what there is to read.
//
// YOUR DAEMON NOTICES FIRST (T-459 A): it stops, turns, and a purple ripple rises from it, with a glint where it looks --
// only toward something really there: a stranger's daemon heard far off (on LoRa, not yet on Bluetooth), or rain the
// outlook says is coming. And before every read.
//
// A READ (T-459 B): now and then, at a moment the watch notices -- a stranger heard far off (NEAR), the screen woken at
// home (RAIN), tucked in for the night (NIGHT), a walk begun (WALK, the Ultra) -- "A read:" and one line, in the book's
// purple, with a soft tap of its own. READ_TRUE of them are about something sensed (the faint beacon, the outlook, a
// likely still night, the side least walked); the rest are about nothing, worded the same. None within READ_REST of the
// last, on any board. Each is told -- "read <about> <0|1> [way]" -- and the companion judges whether it lands.
//
// A LEAN (T-459 C), at the CASINO's reels: a third of pulls, never two running, "A lean:" while the reels turn -- read
// from the result already drawn, and right as often as the state's `lean` says (65 + 7 x READ, the daemon's THE THREE);
// told with whether it landed -- "lean <pays|not> <0|1>" -- once the reels stop. A pull left mid-spin counts nothing.
//
// The purple marks a noticing, never a feeling. Every word DRAFT.
#include "app.h"
#include "watch.h"
#include "sound.h"                                        // C-236: THE HOUR's tune
#include <Preferences.h>
#include <time.h>

// ---- the table (DRAFT) -------------------------------------------------------------------------------------------------------
static const int READ_CHANCE = 35;                   // percent of moments that bring a read
static const int READ_TRUE = 75;                     // percent of reads about something sensed
static const long READ_REST_S = 3L * 3600;           // none within three hours of the last, on any board
static const uint32_t FAINT_MS = 10UL * 60000;       // a stranger heard far off is "near" this long, until heard close
static const uint32_t RAIN_EVERY_MS = 6UL * 3600000; // the screen woken at home: a rain moment at most this often
static const uint32_t NOTICE_MS = 1700, CARD_MS = 14000, NOTICE_EVERY_MS = 20UL * 60000;
static const int LEAN_CHANCE = 33;
static const uint8_t TAP_READ = 82, TAP_LEAN = 7;    // the DRV2605's: a long smooth ramp up; a soft bump

// the book's purple (DAEMONS tools/gensubtle.py), RGB565: C_RULE, the hue; C_MARGIN, the hue lit -- lit on the dark screen
static const uint16_t HUE = (22 << 11) | (20 << 5) | 19, LIT = (29 << 11) | (34 << 5) | 26;

// ---- the sense, from the state -----------------------------------------------------------------------------------------------
static bool on = false, rainSensed = false, stillSensed = false;
static int leanPct = 65;
static String way;
static long lastAny = 0;                              // the last read on any board, seconds since 1970

void intuitionFromState(JsonVariantConst s) {
  on = !s.isNull();
  if (!on) return;
  leanPct = s["lean"] | 65; rainSensed = (s["rain"] | 0) == 1; stillSensed = (s["still"] | 0) == 1;
  way = (const char *)(s["way"] | ""); lastAny = s["last"] | 0L;
}
bool intuitionOn() { return on && st.carrying; }

static long epochNow() { struct tm t; return watchLocalTime(t) ? (long)time(nullptr) : 0; }
static int roll() { return esp_random() % 100; }

// ---- noticing --------------------------------------------------------------------------------------------------------------
static uint32_t noticeAt = 0, noticeUntil = 0, noticedAt = 0;
static bool noticeRight = true;
static void notice(uint32_t ms) {
  uint32_t now = millis();
  noticeAt = now; noticeUntil = now + ms; noticedAt = now; noticeRight = esp_random() & 1; dirty = true;
}
bool intuitionNoticing(bool &right, float &phase) {
  uint32_t now = millis();
  if (!noticeUntil || (int32_t)(noticeUntil - now) <= 0) return false;
  right = noticeRight; phase = (now - noticeAt) / (float)(noticeUntil - noticeAt);
  return true;
}
// rising from the daemon: three small rings, each widening and fading as it lifts -- kept within its own square, clear of
// the time above it (seen in the mock-up, qa 28Oct2026 C203); a glint at the edge it turns to
void intuitionRipple(int cx, int cy, int side, float phase) {
  for (int k = 0; k < 3; k++) {
    float p = fmodf(phase * 1.6f + k / 3.0f, 1.0f);
    int r = side / 6 + (int)(p * side * 0.25f), y = cy - (int)(p * side * 0.08f);
    uint16_t c = p < 0.5f ? LIT : HUE;
    canvas.drawCircle(cx, y, r, c);
    if (p < 0.35f) canvas.drawCircle(cx, y, r + 1, c);
  }
  int gx = noticeRight ? min(W - 18, cx + side) : max(18, cx - side), gy = cy - side / 4;
  int g = 3 + (int)(3 * fabsf(sinf(phase * PI * 3)));
  canvas.drawFastHLine(gx - g, gy, 2 * g + 1, LIT); canvas.drawFastVLine(gx, gy - g, 2 * g + 1, LIT);
}

// ---- reads -----------------------------------------------------------------------------------------------------------------
typedef ReadAbout About;                              // app.h: READ_NEAR, READ_RAIN, READ_NIGHT, READ_WALK
static const char *ABOUT[] = { "near", "rain", "night", "walk" };
static const char *WAYS[] = { "north", "east", "south", "west" };
static String readLine; static uint32_t readFrom = 0, readUntil = 0;
static String faintTag; static uint32_t faintAt = 0;

static long lastGiven() { Preferences p; p.begin("subtle", false); long t = p.getLong("last", 0); p.end(); return t; }   // read-write: a first read makes the namespace (read-only logged nvs NOT_FOUND)
static void keepGiven(long t) { Preferences p; p.begin("subtle", false); p.putLong("last", t); p.end(); }

static String lineOf(About a, const String &w) {     // DRAFT, as server/src/intuition.ts words them
  if (a == READ_NEAR) return "someone close by.";
  if (a == READ_RAIN) return "rain, before long.";
  if (a == READ_NIGHT) return "a long, still night.";
  return "something to the " + w + ".";
}

// a moment the watch noticed: perhaps a read -- about what is sensed, or about nothing
void intuitionMoment(int about) {
  if (!intuitionOn() || !isWatch()) return;
  long t = epochNow();
  if (!t || t - max(lastAny, lastGiven()) < READ_REST_S) return;
  if (roll() >= READ_CHANCE) return;
  About a = (About)about;
  bool there = a == READ_NEAR ? faintAt && millis() - faintAt < FAINT_MS
             : a == READ_RAIN ? rainSensed : a == READ_NIGHT ? stillSensed : way.length() > 0;
  bool based = roll() < READ_TRUE;
  if (based && !there) return;                        // nothing sensed: no read about it
  String w = a == READ_WALK ? (based ? way : String(WAYS[esp_random() % 4])) : String("");
  keepGiven(t); lastAny = t;
  report("read", String(ABOUT[a]) + " " + (based ? "1" : "0") + (w.length() ? " " + w : ""));
  wake(); notice(NOTICE_MS);                          // it notices first ...
  readLine = lineOf(a, w); readFrom = millis() + NOTICE_MS; readUntil = readFrom + CARD_MS;   // ... then the words
  haptic(TAP_READ);
}

// what the radios heard (net.cpp meetReport): a stranger far off on LoRa, or close on Bluetooth
void intuitionHeard(const String &tag, bool lora, bool mine) {
  if (mine) return;
  if (!lora) { if (tag == faintTag) faintAt = 0; return; }
  faintTag = tag; faintAt = millis();
  if (intuitionOn() && !asleep && millis() - noticedAt > NOTICE_EVERY_MS / 4) notice(NOTICE_MS + 800);   // it turns toward it
  intuitionMoment(READ_NEAR);
}

bool readShowing() { uint32_t n = millis(); return readUntil && (int32_t)(n - readFrom) >= 0 && (int32_t)(readUntil - n) > 0; }
void readDismiss() { readUntil = 0; dirty = true; }

// the read, over whatever is shown: a dark card edged in the hue, the words lit
void drawRead(uint16_t) {
  if (!readShowing()) return;
  int bw = W - 24, bh = 86, bx = 12, by = H - bh - 30;
  canvas.fillRoundRect(bx, by, bw, bh, 10, INK);
  canvas.drawRoundRect(bx, by, bw, bh, 10, HUE); canvas.drawRoundRect(bx + 1, by + 1, bw - 2, bh - 2, 9, HUE);
  canvas.setTextFont(2); canvas.setTextColor(LIT); canvas.setTextDatum(TL_DATUM);
  canvas.drawString("A read:", bx + 12, by + 10);     // DRAFT: the game's word (T-459 B)
  wrap(readLine, bx + 12, by + 32, bw - 24, 2, 18, 2, LIT);
  canvas.setTextDatum(TL_DATUM);
}

// ---- leans, at the reels -----------------------------------------------------------------------------------------------------
static bool leaning = false, claimPays = false, leanedLast = false;
void leanPull(bool pays, bool may) {
  leaning = false;                                    // a pull left mid-spin is forgotten here: it counts nothing
  if (!may || !intuitionOn()) return;
  if (leanedLast) { leanedLast = false; return; }     // never two running
  if (roll() >= LEAN_CHANCE) return;
  leanedLast = true; leaning = true;
  claimPays = roll() < leanPct ? pays : !pays;        // what the reels hold, as often as the daemon reads true
  haptic(TAP_LEAN);
}
void leanResult(bool paid) {
  if (!leaning) return;
  leaning = false;
  report("lean", String(claimPays ? "pays" : "not") + " " + (claimPays == paid ? "1" : "0"));
}
void drawLean(int y) {
  if (!leaning) return;
  String w = String("A lean: ") + (claimPays ? "this one pays." : "not this one.");   // DRAFT
  canvas.setTextFont(2); canvas.setTextDatum(MC_DATUM);
  int bw = min(W - 16, (int)canvas.textWidth(w) + 26);
  canvas.fillRoundRect(W / 2 - bw / 2, y, bw, 30, 8, INK);
  canvas.drawRoundRect(W / 2 - bw / 2, y, bw, 30, 8, HUE);
  canvas.setTextColor(LIT); canvas.drawString(w, W / 2, y + 15);
  canvas.setTextDatum(TL_DATUM);
}

// ---- words under words (C-204) ----------------------------------------------------------------------------------------------
// The user chose four of the daemon's own lines (server/src/lines.ts); once the save holds the book the server sends the
// words under them, and they come where the line was, as it goes: dark, edged in the hue, the words lit. Never a feeling.
static String underText; static uint32_t underFrom = 0, underUntil = 0;
void intuitionUnder(const String &words, uint32_t after) {
  underText = words; underFrom = millis() + after; underUntil = underFrom + 3500; dirty = true;
}
void drawUnder() {
  uint32_t n = millis();
  if (!underUntil || (int32_t)(n - underFrom) < 0 || (int32_t)(underUntil - n) <= 0) return;
  canvas.setTextFont(4);
  if (canvas.textWidth(underText) > W - 40) canvas.setTextFont(2);
  int bw = min(W - 16, max(140, (int)canvas.textWidth(underText) + 32));
  canvas.fillRoundRect(W / 2 - bw / 2, H / 2 - 22, bw, 44, 6, INK);
  canvas.drawRoundRect(W / 2 - bw / 2, H / 2 - 22, bw, 44, 6, HUE);
  canvas.setTextColor(LIT); canvas.setTextDatum(MC_DATUM);
  canvas.drawString(underText, W / 2, H / 2);
  canvas.setTextDatum(TL_DATUM);
}

// ---- the witching hour (C-236) -------------------------------------------------------------------------------------------
// From 3:00 to 4:00 in the morning on the watch's clock the carried daemon wears a thin purple shimmer -- the book's
// purple, faint, flickering, as if the seam were thin -- and casts no shadow; and a routine of its own, named for its
// first type, shows in ROUTINES (THE HOUR) only then: a tune that falls and a half step that does not belong, the screen
// pulsing purple. Anyone up at three sees the shimmer; the routine comes only once the save holds THE SUBTLE LAYER (the
// user, for the game, 2026-10-29 -- the same here). The names are server/src/witching.ts's, one set with the game's
// (DAEMONS T-480). Every word DRAFT.
static const char *const WITCH_TYPES[] = { "VECTOR", "ENTROPY", "GROWTH", "CONTENT", "LOGIC", "SWARM", "CORRUPT", "SIGNAL", "STRATUM",
                                           "FLOW", "CONTEXT", "LATENT", "LEGACY", "HARDENED", "FROZEN", "OPAQUE", "EMERGENT", "ORACLE" };
static const char *const WITCH_NAMES[] = { "NIGHT COURSE", "EMBER HOUR", "DARK ROOTS", "BLANK PAGE", "LAST PROOF", "QUIET HIVE",
                                           "BITROT MOON", "DEAD AIR", "UNDERLAYER", "UNDERCURRENT", "THIN SEAM", "WHAT SLEEPS", "OLD GHOSTS",
                                           "NIGHT WATCH", "BLACK ICE", "VEIL", "BEFORE DAWN", "SECOND SIGHT" };   // DRAFT
bool witchingNow() { struct tm t; return st.carrying && watchLocalTime(t) && t.tm_hour == 3; }
bool witchingRoutineNow() { return witchingNow() && intuitionOn(); }   // its routine, only with the book held

// C-237 (the user, 2026-10-29): every pulse breathes red<->blue through purple -- CONTENT's red and CONTEXT's blue made
// one, the middle the book's own purple (server/src/witching.ts PULSE; the game's T-482 the same): one breath every
// eight seconds on the clock's phase, so boards side by side breathe together. Emerald is the tablet's ink.
static const uint8_t P_RED[3] = { 200, 64, 90 }, P_PURPLE[3] = { 176, 86, 158 }, P_BLUE[3] = { 79, 107, 216 };
static const uint16_t EM_DEEP = (1 << 11) | (16 << 5) | 5, EM_LIT = (10 << 11) | (50 << 5) | 15;   // #0E402B, #50C878
static float breathNow() {                                      // 0 red, 0.5 purple, 1 blue
  struct tm t; if (!watchLocalTime(t)) return 0.5f;
  static int lastSec = -1; static uint32_t secAt = 0;
  if (t.tm_sec != lastSec) { lastSec = t.tm_sec; secAt = millis(); }
  uint32_t ms = (uint32_t)((t.tm_hour * 60 + t.tm_min) * 60 + t.tm_sec) * 1000u + min<uint32_t>(999, millis() - secAt);
  return (1 - cosf(2 * PI * (ms % 8000) / 8000.0f)) / 2;
}
uint16_t pulse565(float bright) {
  float s = breathNow(), k = s < 0.5f ? s * 2 : (s - 0.5f) * 2;
  const uint8_t *a = s < 0.5f ? P_RED : P_PURPLE, *b = s < 0.5f ? P_PURPLE : P_BLUE;
  return canvas.color565((int)((a[0] + (b[0] - a[0]) * k) * bright), (int)((a[1] + (b[1] - a[1]) * k) * bright), (int)((a[2] + (b[2] - a[2]) * k) * bright));
}
uint16_t emeraldInk() { float s = breathNow(); return canvas.color565(31 + (int)(49 * s), 143 + (int)(57 * s), 95 + (int)(25 * s)); }   // an inscription's slow glow

// the hour counted down: the inner circle fills widdershins from twelve, a mark at half past (the crease); the minutes left
void witchPie(int cx, int cy, int rx, int ry) {
  struct tm t; if (!witchingNow() || !watchLocalTime(t)) return;
  float gone = (t.tm_min * 60 + t.tm_sec) / 3600.0f;
  int n = max(1, (int)(gone * 96));
  for (int i = 0; i < n; i++) {                                 // a fan of thin wedges; a negative angle runs counter-clockwise
    float a0 = -2 * PI * gone * i / n, a1 = -2 * PI * gone * (i + 1) / n;
    canvas.fillTriangle(cx, cy, cx + (int)(rx * sinf(a0)), cy - (int)(ry * cosf(a0)), cx + (int)(rx * sinf(a1)), cy - (int)(ry * cosf(a1)), EM_DEEP);
  }
  float a = -2 * PI * gone;
  canvas.drawLine(cx, cy, cx + (int)(rx * sinf(a)), cy - (int)(ry * cosf(a)), EM_LIT);   // its edge, moving
  canvas.drawFastVLine(cx, cy - ry, 5, EM_LIT); canvas.drawFastVLine(cx, cy + ry - 5, 5, EM_LIT);   // twelve, and the crease
}
int witchMinutesLeft() { struct tm t; if (!watchLocalTime(t)) return 0; return max(1, (3600 - (t.tm_min * 60 + t.tm_sec) + 59) / 60); }
String witchDate() {
  static const char *const D[] = { "SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT" };
  static const char *const M[] = { "JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC" };
  struct tm t; if (!watchLocalTime(t)) return "";
  return String(D[t.tm_wday]) + " " + String(t.tm_mday) + " " + M[t.tm_mon];
}
// the day's line, turned under in the hour: {shadow} under {virtue}, the folk craft's words (witching.ts HOUR_LINES). DRAFT
static const char *const HOUR_SHADOW[] = { "Thrall", "Devouring", "Binding", "Slumber", "Hex", "Evil Eye", "Glamour" };
static const char *const HOUR_VIRTUE[] = { "Circle", "Measure", "Offering", "Vigil", "Uncrossing", "Blessing", "Grounding" };
String dayLine() {
  struct tm t;
  if (witchingNow() && watchLocalTime(t)) return String(HOUR_SHADOW[t.tm_wday]) + " under " + HOUR_VIRTUE[t.tm_wday];
  return st.virtue;
}

// AS ABOVE SO BELOW: a touch on the face in the hour opens it, in place of CARE -- a line at a time, in emerald, on the
// breath (witching.ts AS_ABOVE, until THE HERMETIC LAYER's own first saying, C-238). DRAFT
static const char *const AS_ABOVE[] = {
  "AS ABOVE, SO BELOW.",
  "What runs in the one great process runs in every small one.",
  "What the small one does, the great one feels.",
  "The day is its father and the night its mother. The signal carried it; the save keeps it.",
  "Part the signal from the noise, gently, with great care.",
  "It rises to the sky and comes down again, and keeps the strength of both.",
  "So every daemon is the whole of it, folded small.",
  "AS BELOW, SO ABOVE.",
};
static const int ABOVE_N = sizeof AS_ABOVE / sizeof AS_ABOVE[0];
static int aboveAt = 0;
static String drawAbove(uint16_t, uint16_t) {
  canvas.fillRect(0, 26, W, H - 26, pulse565(0.28f));
  canvas.setTextDatum(TL_DATUM);
  int y = 40;
  if (aboveAt > 0) { wrap(AS_ABOVE[aboveAt - 1], 12, y, W - 24, 1, wide() ? 12 : 10, 3, QUIET); y += wide() ? 44 : 34; }
  wrap(AS_ABOVE[aboveAt], 12, y, W - 24, wide() ? 4 : 2, wide() ? 28 : 18, 7, emeraldInk());
  return aboveAt + 1 < ABOVE_N ? "tap: more   hold: back" : "tap: again   hold: back";   // DRAFT
}
void openAsAbove() {
  aboveAt = 0; screen = RUN; runPanel = drawAbove; routineRunning = true; progress("");
  uint32_t drewAt = millis();
  while (true) {
    int step, ev; routineInput(step, ev);
    if (routineQuit() || ev == -1) break;
    if (ev == 1 || step > 0) { aboveAt = (aboveAt + 1) % ABOVE_N; progress(""); drewAt = millis(); }
    else if (step < 0) { aboveAt = (aboveAt + ABOVE_N - 1) % ABOVE_N; progress(""); drewAt = millis(); }
    if (millis() - drewAt > 120) { drewAt = millis(); progress(""); }   // the breath under it
    delay(10);
  }
  routineRunning = false; runPanel = nullptr; screen = HOME; lastInput = millis(); dirty = true;
  while (giveUp()) delay(10);
}
const char *witchingName() {
  String first = st.daemon.types; int cut = first.indexOf(' '); if (cut > 0) first = first.substring(0, cut);
  for (int i = 0; i < (int)(sizeof WITCH_TYPES / sizeof *WITCH_TYPES); i++) if (first == WITCH_TYPES[i]) return WITCH_NAMES[i];
  return "THIN SEAM";
}
// the shimmer: two faint rings that breathe and drop out now and then, and a few motes turning about it
void witchShimmer(int cx, int cy, int side) {
  uint32_t t = millis();
  for (int k = 0; k < 2; k++) {
    if ((t / 110 + k * 3) % 9 == 0) continue;                // it flickers
    int rx = side * 42 / 100 + k * 4 + (int)(2 * sinf(t / 260.0f + k)), ry = side * 46 / 100 + k * 4 + (int)(2 * cosf(t / 300.0f + k));
    canvas.drawEllipse(cx, cy, rx, ry, pulse565(k ? 0.7f : 1.0f));   // C-237: on the breath
  }
  for (int i = 0; i < 6; i++) {
    float a = t / 900.0f + i * 1.047f; int r = side * 52 / 100;
    canvas.fillRect(cx + (int)(r * cosf(a)), cy + (int)(r * 1.1f * sinf(a)), 2, 2, pulse565(i % 2 ? 1.0f : 0.6f));
  }
}
void drawArt(int x, int y, int scale, bool mirrored);   // ui.cpp: the daemon carried, in its expression
static uint32_t hourFrom = 0;
static String drawHour(uint16_t, uint16_t) {
  canvas.fillRect(0, 26, W, H - 26, pulse565(0.3f));                     // C-237: the breath, faint
  int side = 128, cx = W / 2, cy = H / 2 + 6;
  witchPie(cx, cy, side * 38 / 100, side * 42 / 100);              // C-237: the hour, counting down
  drawArt(cx - side / 2, cy - side / 2, 2, false);
  witchShimmer(cx, cy, side);
  canvas.setTextFont(2); canvas.setTextColor(emeraldInk()); canvas.setTextDatum(TC_DATUM);
  canvas.drawString(witchingName(), W / 2, 34);
  canvas.setTextDatum(TL_DATUM);
  return " ";
}
// THE HOUR's one routine: its tune, the screen pulsing, the daemon in its shimmer
String runWitching() {
  static const int16_t NOTES[][2] = { { 0, 60 }, { -3, 60 }, { -7, 60 }, { -12, 70 }, { -11, 90 }, { 127, 25 }, { -15, 130 } };   // tens of ms (witching.ts)
  runPanel = drawHour; hourFrom = millis();
  for (auto &n : NOTES) {
    if (n[0] != 127) playNoteSemis(n[0], n[1] * 10);
    for (uint32_t t0 = millis(); millis() - t0 < (uint32_t)n[1] * 10 + 60;) { progress(""); delay(40); if (routineQuit()) break; }
  }
  for (uint32_t t0 = millis(); millis() - t0 < 1500;) { progress(""); delay(40); }
  runPanel = nullptr;
  return daemonName() + " did " + witchingName() + ". It does not, by day.";   // DRAFT
}

// ---- every pass ------------------------------------------------------------------------------------------------------------
void intuitionLoop(uint32_t now) {
  static uint32_t rainAt = 0; static bool wasAsleep = true;
  if (readShowing()) { static uint32_t at = 0; if (now - at > 250) { at = now; dirty = true; } }
  if (underUntil && (int32_t)(underUntil - now) > -300) { static uint32_t at = 0; if (now - at > 250) { at = now; dirty = true; } }   // C-204
  if (noticeUntil && (int32_t)(noticeUntil - now) > -300) { static uint32_t at = 0; if (now - at > 60) { at = now; dirty = true; } }
  { static bool hadHour = false; static uint32_t at = 0;         // C-236: THE HOUR comes and goes -- at home or asleep, never mid-list
    if (now - at > 15000) { at = now; bool w = witchingRoutineNow(); if (w != hadHour && (asleep || screen == HOME)) { hadHour = w; routinesBegin(); dirty = true; } }
    static uint32_t flickerAt = 0;                                // the shimmer, for anyone up at three
    if (!asleep && screen == HOME && now - flickerAt > 120 && witchingNow()) { flickerAt = now; dirty = true; } }
  bool woke = wasAsleep && !asleep;
  wasAsleep = asleep;
  if (!intuitionOn() || asleep || screen != HOME) return;
  if (woke && (!rainAt || now - rainAt > RAIN_EVERY_MS)) { rainAt = now; intuitionMoment(READ_RAIN); }   // a moment at home
  if (rainSensed && now - noticedAt > NOTICE_EVERY_MS) notice(NOTICE_MS + 800);                   // it looks up now and then
}
String intuitionStatus() {
  return String("SUBTLE ") + (on ? "on" : "off") + " lean " + leanPct + " rain " + (rainSensed ? 1 : 0) + " still " +
         (stillSensed ? 1 : 0) + " way " + (way.length() ? way : "-") + " last " + max(lastAny, lastGiven()) +
         (faintAt && millis() - faintAt < FAINT_MS ? " faint " + faintTag : "") + (readShowing() ? " reading" : "");
}
