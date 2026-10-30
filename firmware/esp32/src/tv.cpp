// C-256 (the user, 2026-10-30: "I really want that feature for the t-watch ultra"): TV -- a remote for the TVs added on the
// companion's SETTINGS. The Ultra has no IR light, so a button is a request to the companion (POST /api/device/tv), which
// presses it the TV's own way: a Roku directly, an Apple TV, a Google TV or a Fire TV through Home Assistant (server/src/
// tv.ts). It needs the home's Wi-Fi, where the TV is.
//
// Twelve buttons in four rows -- POWER HOME BACK, the arrows round OK, then VOL- PLAY VOL+ and MUTE -- tapped where they
// are; the crown or a swipe moves the mark and a press presses it, for a board without touch; a swipe across chooses
// another TV; a hold goes back. Every word DRAFT.
#include "app.h"
#include "watch.h"

void haptic(uint8_t effect);

static JsonDocument tvList;
static int tvAt = 0, keyAt = 8;                    // the TV shown, and the button marked (OK)
static uint32_t pressedAt = 0; static int pressed = -1; static String tvSaid;

// the buttons, by the server's names (tv.ts KEYS), with what each says and where it sits on a 3-wide grid of 5 rows
struct TvKey { const char *key, *label; uint8_t col, row; };
static const TvKey KEYS[] = {
  { "power", "POWER", 0, 0 }, { "home", "HOME", 1, 0 }, { "back", "BACK", 2, 0 },
  { "up", "^", 1, 1 },
  { "left", "<", 0, 2 }, { "ok", "OK", 1, 2 }, { "right", ">", 2, 2 },
  { "down", "v", 1, 3 },
  { "voldown", "VOL-", 0, 4 }, { "play", "PLAY", 1, 4 }, { "volup", "VOL+", 2, 4 },
  { "mute", "MUTE", 0, 3 },
};
static const int NKEYS = sizeof KEYS / sizeof KEYS[0];
static int gx, gy, gw, gh;                          // the grid's place on the canvas, set as it is drawn

static void keyRect(int i, int &x, int &y, int &w, int &h) {
  w = gw / 3; h = gh / 5;
  x = gx + KEYS[i].col * w; y = gy + KEYS[i].row * h;
}

static String drawTv(uint16_t day, uint16_t ink) {
  canvas.setTextDatum(TL_DATUM); canvas.setTextFont(2); canvas.setTextColor(readable(day));
  int n = tvList["tvs"].size();
  String name = n ? String((const char *)(tvList["tvs"][tvAt]["name"] | "TV")) : "TV";
  canvas.drawString(n > 1 ? "< " + name + " >" : name, 10, 28);
  if (tvSaid.length()) { canvas.setTextColor(PAPER); canvas.drawString(tvSaid, 10, 44); }
  gx = 8; gy = 62; gw = W - 16; gh = H - gy - 22;
  canvas.setTextDatum(MC_DATUM);
  for (int i = 0; i < NKEYS; i++) {
    int x, y, w, h; keyRect(i, x, y, w, h);
    bool lit = i == pressed && millis() - pressedAt < 250;
    if (lit) canvas.fillRoundRect(x + 3, y + 3, w - 6, h - 6, 8, day);
    else canvas.drawRoundRect(x + 3, y + 3, w - 6, h - 6, 8, i == keyAt ? PAPER : day);
    canvas.setTextColor(lit ? ink : PAPER);
    canvas.drawString(KEYS[i].label, x + w / 2, y + h / 2);
  }
  canvas.setTextDatum(TL_DATUM);
  return n > 1 ? "tap: press   swipe across: TV   hold: back" : "tap: press   hold: back";                       // DRAFT
}

static void press(int i) {
  pressed = i; pressedAt = millis(); keyAt = i; tvSaid = "";
  haptic(1);
  progress("");
  JsonDocument b; b["id"] = tvList["tvs"][tvAt]["id"]; b["key"] = KEYS[i].key;
  String body; serializeJson(b, body);
  bool ok; String got = http("POST", "/api/device/tv", body, &ok);
  JsonDocument r;
  if (!ok) tvSaid = "THE COMPANION DID NOT ANSWER";                                                              // DRAFT
  else if (!deserializeJson(r, got) && !(r["ok"] | false)) tvSaid = String((const char *)(r["error"] | "NOT PRESSED"));   // DRAFT
  tvSaid.toUpperCase();
  progress("");
}

String runTv() {
  if (!online()) return "TV NEEDS THE HOME'S WI-FI";                                                             // DRAFT
  bool ok; String got = http("GET", "/api/device/tvs", "", &ok);
  tvList.clear();
  if (!ok || deserializeJson(tvList, got)) return "THE COMPANION DID NOT ANSWER";                                // DRAFT
  if (!tvList["tvs"].size()) return "No TV yet -- add one on the companion's SETTINGS, TV.";                     // DRAFT
  tvAt = constrain(tvAt, 0, (int)tvList["tvs"].size() - 1); tvSaid = ""; pressed = -1;
  runPanel = drawTv;
  progress("");
  while (true) {
    int step, ev; routineInput(step, ev);
    if (routineQuit()) ev = -1;
    if (ev == -1) break;
    int n = tvList["tvs"].size();
    if (step && watchGestureAcross() && n > 1) { tvAt = (tvAt + n + step) % n; tvSaid = ""; progress(""); }
    else if (step) { keyAt = (keyAt + NKEYS + step) % NKEYS; progress(""); }
    if (ev == 1) {
      int x, y, hit = keyAt;
      if (watchTapPoint(x, y)) {
        hit = -1;
        for (int i = 0; i < NKEYS && hit < 0; i++) { int kx, ky, kw, kh; keyRect(i, kx, ky, kw, kh); if (x >= kx && x < kx + kw && y >= ky && y < ky + kh) hit = i; }
      }
      if (hit >= 0) press(hit);
    }
    if (pressed >= 0 && millis() - pressedAt > 260) { pressed = -1; progress(""); }
    delay(10);
  }
  runPanel = nullptr; tvList.clear();
  return "";
}
