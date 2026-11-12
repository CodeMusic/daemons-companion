// C-331 (2) (the user, 2026-11-11, by multiple choice: "every dream ... a DREAMS shelf to read and hear again"): DREAMS,
// on the watch's BOOKS shelf after THE INDEX. The dream journal comes from the companion (GET /api/dreams, the newest
// first, each titled -- C-200, C-308) and is kept on the card as dreams.json, so away from any network the shelf opens
// from there. A dream opens as a page: its title, the night it came from, the dream, and the two tellings it was made
// from where it has them; LISTEN reads it aloud in the carried daemon's own voice (talkReadText, {as: "daemon"}), and what was heard once is kept on the card and heard
// again anywhere (talk.cpp's voices/). Every word DRAFT.
#include "app.h"
#include "talk.h"
#include "card.h"
#include <vector>

void listRow(int i, int at, const String &text, uint16_t day, uint16_t ink, int width);   // ui.cpp
static JsonDocument dreams;
static int dAt = 0, dOpen = -1, dSkip = 0, dLines = 0;
static bool dFromCard = false;
static String dWhy, dText;

static int dPageLines() { return (H - 50 - 40) / 18; }
static String dreamTitle(int i) {
  JsonVariant d = dreams["dreams"][i];
  String t = d["title"] | "";
  if (t.length()) return t;
  String at = d["to"] | "";                                    // untitled: the morning it ended
  return at.length() >= 10 ? at.substring(0, 10) : String("A DREAM");   // DRAFT
}
static void dreamPage(int i) {
  JsonVariant d = dreams["dreams"][i];
  String to = d["to"] | "", nick = d["nickname"] | "";
  float hours = d["hours"] | 0.0f;
  dText = "";
  if (to.length() >= 10) dText += to.substring(0, 10) + "  ";
  if (hours > 0) dText += String(hours, 1) + " HOURS";                                                   // DRAFT
  if (nick.length()) dText += "\n" + nick;
  dText += "\n\n" + String((const char *)(d["text"] | ""));
  String left = d["left"] | "", right = d["right"] | "";
  if (left.length()) dText += "\n\nONE TELLING\n" + left;                                                 // DRAFT
  if (right.length()) dText += "\n\nTHE OTHER\n" + right;                                                 // DRAFT
  dSkip = 0;
}

static String drawDreams(uint16_t day, uint16_t ink) {
  canvas.setTextDatum(TL_DATUM); canvas.setTextFont(2); canvas.setTextColor(readable(day));
  if (dWhy.length()) { canvas.drawString("DREAMS", 10, 32); wrap(dWhy, 10, 56, W - 20, 2, 18, 6, PAPER); return "hold: back"; }   // DRAFT
  if (dOpen >= 0) {
    String t = dreamTitle(dOpen);
    canvas.drawString(t.length() > 24 ? t.substring(0, 23) + "." : t, 10, 30);
    dLines = wrap(dText, 10, 50, W - 20, 2, 18, dPageLines(), PAPER, dSkip);
    int pages = max(1, (dLines + dPageLines() - 1) / dPageLines()), at = dSkip / dPageLines() + 1;
    if (talkCan() || cardReady()) {
      canvas.drawRoundRect(W - 86, H - 38, 78, 30, 8, day);
      canvas.setTextDatum(MC_DATUM); canvas.setTextColor(day); canvas.drawString("LISTEN", W - 47, H - 23);   // DRAFT
      tapRect(W - 86, H - 38, 78, 30, 0);
    }
    canvas.setTextDatum(BL_DATUM); canvas.setTextFont(1); canvas.setTextColor(QUIET);
    canvas.drawString(String(at) + " / " + String(pages), 10, H - 14);
    canvas.setTextDatum(TL_DATUM);
    return " ";
  }
  int n = dreams["dreams"].size();
  if (gridLists()) {
    static std::vector<String> words;
    int tw = (W - 24) / 2;
    words.assign(n, String());
    for (int i = 0; i < n; i++) words[i] = tileWord(dreamTitle(i), tw);
    drawTiles(n, dAt, words.data(), dFromCard ? "DREAMS  (FROM THE CARD)" : "DREAMS", [](int, int cx, int cy) {   // DRAFT
      canvas.fillCircle(cx, cy, 11, QUIET);                    // a moon
      canvas.fillCircle(cx + 5, cy - 4, 10, TFT_BLACK);
    }, day, ink);
    return " ";
  }
  canvas.drawString(dFromCard ? "DREAMS  (FROM THE CARD)" : "DREAMS", 10, 30);                          // DRAFT
  static int top = 0;
  int fit = listRowsFit();
  if (dAt < top) top = dAt; if (dAt >= top + fit) top = dAt - fit + 1;
  for (int i = top; i < n && i < top + fit; i++) listRow(i - top, dAt - top, dreamTitle(i), day, ink, W - 12);
  return "swipe: choose   tap: open   hold: back";                                                    // DRAFT
}

// the journal onto the card, for away (BOOKS' KEEP ON THE CARD asks this too); false when the companion did not answer
bool dreamsKeep() {
  bool ok; String got = http("GET", "/api/dreams", "", &ok);
  if (ok) cardWrite("dreams.json", got);
  return ok;
}

String runDreams() {
  dAt = 0; dOpen = -1; dWhy = ""; dFromCard = false;
  runPanel = drawDreams;
  progress("");
  bool ok; String got = http("GET", "/api/dreams", "", &ok);
  if (ok) cardWrite("dreams.json", got);
  else if ((got = cardRead("dreams.json")).length()) { ok = true; dFromCard = true; }
  dreams.clear();
  if (!ok || deserializeJson(dreams, got)) dWhy = online() ? "The companion did not answer." : "NEEDS WI-FI";   // DRAFT
  else if (!dreams["dreams"].size()) dWhy = "No dream yet. Tuck your daemon in at night (CARE, SLEEP) -- in the morning it tells you what it dreamt.";   // DRAFT
  progress("");
  while (true) {
    int step, ev; routineInput(step, ev);
    if (routineQuit()) ev = -1;
    if (ev == -1) {
      if (dWhy.length() || dOpen < 0) break;
      dOpen = -1; progress(""); continue;
    }
    if (dWhy.length()) { delay(10); continue; }
    if (dOpen >= 0) {
      if (step) { dSkip = constrain(dSkip + step * dPageLines(), 0, max(0, dLines - dPageLines())); progress(""); }
      if (ev == 1 && gridLists()) { int x, y, off; if (watchTapPoint(x, y) && !tapAt(x, y, off, false)) ev = 0; }   // a tap on the words is not LISTEN
      if (ev == 1) {
        talkReadText(dreams["dreams"][dOpen]["text"] | "", true);   // in the daemon's own voice (eed243a), kept on the card once heard
        screen = RUN; progress("");
      }
    } else {
      int n = dreams["dreams"].size();
      if (step && n) { dAt = gridLists() ? tilesPage(dAt, n, step) : (dAt + n + step) % n; progress(""); }
      if (ev == 1 && n && gridLists() && !tilesTap(dAt, n)) ev = 0;
      if (ev == 1 && n) { dOpen = dAt; dreamPage(dOpen); progress(""); }
    }
    delay(10);
  }
  runPanel = nullptr; dreams.clear(); dText = "";
  return "";
}
