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

static long lastGiven() { Preferences p; p.begin("subtle", true); long t = p.getLong("last", 0); p.end(); return t; }
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

// ---- every pass ------------------------------------------------------------------------------------------------------------
void intuitionLoop(uint32_t now) {
  static uint32_t rainAt = 0; static bool wasAsleep = true;
  if (readShowing()) { static uint32_t at = 0; if (now - at > 250) { at = now; dirty = true; } }
  if (underUntil && (int32_t)(underUntil - now) > -300) { static uint32_t at = 0; if (now - at > 250) { at = now; dirty = true; } }   // C-204
  if (noticeUntil && (int32_t)(noticeUntil - now) > -300) { static uint32_t at = 0; if (now - at > 60) { at = now; dirty = true; } }
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
