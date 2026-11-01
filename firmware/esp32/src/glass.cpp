// C-262: the T-Glass -- one screen in front of one eye, chosen in the app's GLASSES (server/src/glass.ts). The board
// draws what its state's `glass` says: HOME (the time, the daemon, the next step), a NOTE a page at a time, the DAEMON,
// or DARK; a care's reaction (`moment`) lies over it for its few seconds. Black is the prism's clear, so everything is
// light on black. The touch button: a tap turns a note's page (elsewhere it wakes and shows HOME's clock again), a hold
// goes HOME, two taps go DARK -- told to the companion, so the app's selection follows. Something new sent buzzes once.
// Every word on the glass DRAFT.
#include "app.h"
#include "display.h"
#include "glass.h"
void drawArt(int x, int y, int scale, bool mirrored);   // ui.cpp: the daemon carried, in its expression

#if BOARD_TGLASS
#include <Preferences.h>
#include <sys/time.h>

static const uint16_t LIGHT = 0xE79F, DIM = 0x7BEF;   // near white, a little blue; grey
static const int TOUCH_PIN = 14, BOOT_PIN = 0, BUZZ_PIN = 38;

static String show = "home", title, body, momentKind, momentLine;
static long rev = -1;
static uint32_t momentUntil = 0;
static int notePage = 0, notePages = 1;
static int offsetMin = 0; static bool clockSet = false;
static uint32_t touchBase = 0;                        // the pad's reading untouched (a touch on the S3 reads higher)

static void buzz(int ms = 40) { tone(BUZZ_PIN, 1000, ms); }

bool glassDark() { return show == "dark" && !momentUntil; }

void glassFromState(JsonVariantConst doc) {
  // the clock: the state's, as the phone or the companion stamped it -- this board has no other way to know the hour
  time_t epoch = doc["clock"]["epoch"] | 0;
  if (epoch > 1700000000) { struct timeval tv = { epoch, 0 }; settimeofday(&tv, nullptr); offsetMin = doc["clock"]["offset"] | 0; clockSet = true; }
  JsonVariantConst g = doc["glass"];
  if (g.isNull()) return;
  long r = g["rev"] | 0L;
  if (r == rev) return;                              // nothing new -- and a tap's own HOME or DARK is not undone by a state sent before it was told
  String was = show + title;
  show = g["show"] | "home"; title = g["title"] | ""; body = g["body"] | "";
  JsonVariantConst m = g["moment"];
  int left = m.isNull() ? 0 : (m["left"] | 0);
  {
    if (left > 0) { momentKind = m["kind"] | ""; momentLine = m["line"] | ""; momentUntil = millis() + left * 1000UL; }
    else momentUntil = 0;                             // a new screen sent ends a reaction still showing
    if (rev >= 0 && (show + title != was || left > 0)) { wake(); buzz(); }   // something new sent: seen at once, felt once (not its own tap told back)
    if (show + title != was) notePage = 0;
    rev = r;
  }
  dirty = true;
}

void glassLoop(uint32_t now) {
  if (momentUntil && (int32_t)(now - momentUntil) >= 0) { momentUntil = 0; dirty = true; }
  static int lastMinute = -1;                         // HOME's clock moves on
  int minute = (int)(time(nullptr) / 60);
  if (show == "home" && minute != lastMinute) { lastMinute = minute; dirty = true; }

  // the touch button: a tap, two taps, a hold -- and BOOT, where a finger can reach it, as a tap
  if (!touchBase) { touchBase = touchRead(TOUCH_PIN); return; }
  uint32_t v = touchRead(TOUCH_PIN);
  bool down = v > touchBase + touchBase / 5 || digitalRead(BOOT_PIN) == LOW;
  if (!down && v < touchBase) touchBase = (touchBase * 15 + v) / 16;   // the untouched reading drifts with the day
  static bool was = false; static uint32_t downAt = 0, upAt = 0; static int taps = 0; static bool held = false;
  if (down && !was) { downAt = now; held = false; }
  if (down && !held && now - downAt > 700) { held = true; taps = 0; glassHold(); }
  if (!down && was && !held) { taps++; upAt = now; }
  if (!down && taps && now - upAt > 320) { int n = taps; taps = 0; n >= 2 ? glassTwice() : glassTap(); }
  was = down;
}

void glassTap() {
  bool woke = wake();
  if (woke) { dirty = true; return; }                 // asleep: the tap only wakes it
  if (show == "note" && notePages > 1) notePage = (notePage + 1) % notePages;
  else if (show == "dark") { show = "home"; report("glass", "home"); }
  dirty = true;
}
void glassHold() { wake(); buzz(25); show = "home"; momentUntil = 0; report("glass", "home"); dirty = true; }
void glassTwice() { wake(); buzz(25); show = "dark"; momentUntil = 0; report("glass", "dark"); dirty = true; }

static void drawTime(int y) {
  if (!clockSet) { canvas.setTextFont(2); canvas.setTextColor(DIM); canvas.setTextDatum(TL_DATUM); canvas.drawString("--:--", 4, y); return; }
  time_t t = time(nullptr) + offsetMin * 60; struct tm tm; gmtime_r(&t, &tm);
  int h = tm.tm_hour % 12 ? tm.tm_hour % 12 : 12;
  char s[8]; snprintf(s, sizeof s, "%d:%02d", h, tm.tm_min);
  canvas.setTextFont(4); canvas.setTextColor(LIGHT); canvas.setTextDatum(TL_DATUM);
  canvas.drawString(s, 4, y);
  int after = 4 + canvas.textWidth(s) + 3;
  canvas.setTextFont(1); canvas.setTextColor(DIM);
  canvas.drawString(tm.tm_hour < 12 ? "AM" : "PM", after, y + 4);
}

static void drawBattery() {
  if (!bat.present) return;
  int x = W - 22, y = 4;
  uint16_t c = bat.percent <= 15 && !bat.usb ? 0xF800 : DIM;
  canvas.drawRect(x, y, 16, 8, c); canvas.fillRect(x + 16, y + 2, 2, 4, c);
  canvas.fillRect(x + 2, y + 2, max(1, 12 * bat.percent / 100), 4, c);
}

void glassDraw() {
  static bool off = false;                            // DARK: the panel's brightness down to nothing, not only black
  if (glassDark() != off) { off = !off; backlight(!off); }
  canvas.fillSprite(TFT_BLACK);
  if (momentUntil) {                                  // a care's reaction, over whatever is shown
    if (st.carrying) drawArt((W - 64) / 2, 8, 1, false);
    wrap(momentLine, 4, 78, W - 8, 2, 16, 3, LIGHT);
  } else if (show == "dark") {
    // nothing: the prism clear
  } else if (show == "daemon") {
    if (st.carrying) {
      drawArt((W - 64) / 2, 6, 1, false);
      canvas.setTextFont(2); canvas.setTextColor(LIGHT); canvas.setTextDatum(TC_DATUM);
      canvas.drawString(upper(st.daemon.nickname), W / 2, 76);
      canvas.setTextColor(DIM); canvas.drawString(st.daemon.word, W / 2, 96);
    } else wrap("No daemon here yet. Send one from the game.", 4, 30, W - 8, 2, 16, 5, DIM);   // DRAFT
  } else if (show == "note") {
    canvas.setTextFont(2); canvas.setTextColor(LIGHT); canvas.setTextDatum(TL_DATUM);
    String t = title; while (t.length() > 1 && canvas.textWidth(t) > W - 8) t.remove(t.length() - 1);
    canvas.drawString(t, 4, 2);
    canvas.drawFastHLine(4, 20, W - 8, DIM);
    const int PER = 5;
    int lines = wrap(body, 4, 24, W - 8, 2, 18, PER, LIGHT, notePage * PER);
    notePages = max(1, (lines + PER - 1) / PER);
    if (notePage >= notePages) notePage = 0;
    if (notePages > 1) { canvas.setTextFont(1); canvas.setTextColor(DIM); canvas.setTextDatum(BR_DATUM);
                         canvas.drawString(String(notePage + 1) + "/" + notePages, W - 2, H - 1); }
  } else {                                            // HOME: the time, the daemon, the next step
    drawTime(4);
    drawBattery();
    if (st.carrying) drawArt(0, H - 64, 1, false);
    String next = st.step >= 0 ? st.stepText : String("");
    if (next.length()) wrap(next, 64, H - 62, W - 66, 1, 10, 6, DIM);
  }
  present();
}

// GLASS down the cable: how the picture lands on the prism, which differs between V1 and V2 and is checked by eye --
// GLASS TURN 0..3, GLASS MIRROR 0|1, GLASS ROW n (where the seen square starts in the panel's 294), GLASS? -- kept in
// flash; and GLASS TAP|TWICE|HOLD, the button pressed from the computer
String glassCable(const String &arg) {
  String a = arg; a.trim();
  if (a == "TAP") { glassTap(); return "GLASS tapped"; }
  if (a == "TWICE") { glassTwice(); return "GLASS twice"; }
  if (a == "HOLD") { glassHold(); return "GLASS held"; }
  Preferences p; p.begin("glass", false);
  if (a.startsWith("TURN ")) p.putInt("turn", a.substring(5).toInt() & 3);
  else if (a.startsWith("MIRROR ")) p.putBool("mirror", a.substring(7).toInt() != 0);
  else if (a.startsWith("ROW ")) p.putInt("row", constrain(a.substring(4).toInt(), 0, 294 - 126));
  else if (a.startsWith("BRIGHT ")) p.putInt("bright", constrain(a.substring(7).toInt(), 10, 255));
  String out = "GLASS turn " + String(p.getInt("turn", 0)) + " mirror " + String(p.getBool("mirror", false) ? 1 : 0) +
               " row " + String(p.getInt("row", 168)) + " bright " + String(p.getInt("bright", 200)) + " touch " + String(touchBase) +
               " show " + show + " rev " + String(rev);
  p.end();
  glassPanelSettings();
  dirty = true;
  return out;
}

#else
void glassFromState(JsonVariantConst) {}
void glassLoop(uint32_t) {}
void glassDraw() {}
bool glassDark() { return false; }
String glassCable(const String &) { return "GLASS not a T-Glass"; }
#endif
