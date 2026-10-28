// C-208 (the user, 2026-10-28: "you should be able to read both of these books from the watch ultra also ... hit a
// button allowing the watch or app to read you the selected chapter aloud"; by multiple choice: THE SUBTLE LAYER, the
// GUIDE and the NOTEBOOK): BOOKS, on the watches. The books the save holds come from the companion (GET /api/books,
// server/src/books.ts -- a book not yet found is not there), then a chapter at a time (GET /api/book): its words, a page
// a swipe, and LISTEN -- the chapter read aloud in the INDEX voice, a paragraph at a time (talkReadText; a tap or the
// crown stops it between paragraphs). Nothing is kept on the watch yet (the SD card is C-199). Every word DRAFT.
#include "app.h"
#include "talk.h"
#include "sound.h"

void listRow(int i, int at, const String &text, uint16_t day, uint16_t ink, int width);   // ui.cpp
int rowH();                                                                                // ui.cpp

enum { B_BOOKS, B_CHAPTERS, B_PAGE };
static int bMode = B_BOOKS, bAt = 0, bTop = 0, bBook = 0, bChapter = 0, bSkip = 0, bLines = 0;
static JsonDocument shelf;                                // the books and their chapters' titles
static JsonDocument chap;                                 // the chapter open: { title, paragraphs[] }
static String pageText;
static String bWhy;                                       // why there is nothing to show

// C-209: ASK THE GUIDE heads the shelf once the GUIDE is held -- a question by voice, answered from its pages
static bool guideHeld() { for (JsonVariant b : shelf["books"].as<JsonArray>()) if (String((const char *)(b["id"] | "")) == "guide") return true; return false; }
static int asks() { return guideHeld() && talkCan() ? 1 : 0; }
static int listN() {
  if (bMode == B_BOOKS) return asks() + shelf["books"].size();
  return shelf["books"][bBook]["chapters"].size();
}
static String listName(int i) {
  if (bMode == B_BOOKS) return i < asks() ? String("ASK THE GUIDE") : String((const char *)(shelf["books"][i - asks()]["title"] | ""));   // DRAFT
  return String((const char *)(shelf["books"][bBook]["chapters"][i] | ""));
}
static int pageLines() { return (H - 50 - 40) / 18; }

static String drawBooks(uint16_t day, uint16_t ink) {
  canvas.setTextDatum(TL_DATUM); canvas.setTextFont(2); canvas.setTextColor(readable(day));
  if (bWhy.length()) { canvas.drawString("BOOKS", 10, 32); wrap(bWhy, 10, 56, W - 20, 2, 18, 6, PAPER); return "hold: back"; }   // DRAFT
  if (bMode == B_PAGE) {
    String t = chap["title"] | "";
    canvas.drawString(t.length() > 24 ? t.substring(0, 23) + "." : t, 10, 30);
    bLines = wrap(pageText, 10, 50, W - 20, 2, 18, pageLines(), PAPER, bSkip);
    int pages = max(1, (bLines + pageLines() - 1) / pageLines()), at = bSkip / pageLines() + 1;
    canvas.drawRoundRect(W - 86, H - 38, 78, 30, 8, day);
    canvas.setTextDatum(MC_DATUM); canvas.setTextColor(day); canvas.drawString(talkCan() ? "LISTEN" : "", W - 47, H - 23);   // DRAFT
    canvas.setTextDatum(BL_DATUM); canvas.setTextFont(1); canvas.setTextColor(QUIET);
    canvas.drawString(String(at) + " / " + String(pages), 10, H - 14);
    canvas.setTextDatum(TL_DATUM);
    return " ";
  }
  canvas.drawString(bMode == B_BOOKS ? "BOOKS" : String((const char *)(shelf["books"][bBook]["title"] | "")), 10, 30);   // DRAFT
  if (bMode == B_BOOKS && asks() && bAt == 0) {           // what ASK THE GUIDE does, under the list
    canvas.setTextFont(1); canvas.setTextColor(QUIET);
    canvas.drawString("tap, then ask your question", 10, H - 50);                                                         // DRAFT
    canvas.setTextFont(2);
  }
  int n = listN(), fit = listRowsFit();
  if (bAt < bTop) bTop = bAt; if (bAt >= bTop + fit) bTop = bAt - fit + 1;
  for (int i = bTop; i < n && i < bTop + fit; i++) listRow(i - bTop, bAt - bTop, listName(i), day, ink, W - 12);
  return "swipe: choose   tap: open   hold: back";                                                // DRAFT
}

static bool fetchChapter() {
  bool ok; String id = shelf["books"][bBook]["id"] | "";
  progress("");
  String got = http("GET", "/api/book?book=" + id + "&n=" + String(bChapter), "", &ok);
  chap.clear();
  if (!ok || deserializeJson(chap, got)) return false;
  pageText = "";
  for (JsonVariant p : chap["paragraphs"].as<JsonArray>()) pageText += (pageText.length() ? "\n\n" : "") + String((const char *)(p | ""));
  bSkip = 0;
  return true;
}

// the chapter aloud, a paragraph at a time, from the one the page shows; a tap, a hold or the crown stops it
static void listen() {
  if (!talkCan()) return;
  int from = 0;                                           // the paragraph the page begins in
  for (int i = 0, line = 0; i < (int)chap["paragraphs"].size(); i++) {
    String p = chap["paragraphs"][i] | "";
    canvas.setTextFont(2);
    int n = wrap(p, 0, -1000, W - 20, 2, 18, 0, PAPER);   // counted, not drawn (maxLines 0)
    if (line + n > bSkip) { from = i; break; }
    line += n + 1;
  }
  for (int i = from; i < (int)chap["paragraphs"].size(); i++) {
    talkReadText(chap["paragraphs"][i] | "");
    screen = RUN; progress("");
    int step, ev; routineInput(step, ev);
    if (ev || step || giveUp()) break;
  }
  screen = RUN;
}

String runBooks() {
  bMode = B_BOOKS; bAt = 0; bTop = 0; bWhy = "";
  runPanel = drawBooks;
  progress("");
  bool ok; String got = http("GET", "/api/books", "", &ok);
  shelf.clear();
  if (!ok || deserializeJson(shelf, got)) bWhy = online() ? "The companion did not answer." : "NEEDS WI-FI";   // DRAFT
  else if (!shelf["books"].size()) bWhy = "No book yet. In the game, find THE SUBTLE LAYER, the GUIDE or the NOTEBOOK -- then they open here.";   // DRAFT
  progress("");
  while (true) {
    int step, ev; routineInput(step, ev);
    if (giveUp()) ev = -1;
    if (ev == -1) {
      if (bWhy.length() || bMode == B_BOOKS) break;
      if (bMode == B_PAGE) { bMode = B_CHAPTERS; bAt = bChapter; } else { bMode = B_BOOKS; bAt = bBook + asks(); }
      bTop = 0; progress(""); continue;
    }
    if (bWhy.length()) { delay(10); continue; }
    if (bMode == B_PAGE) {
      if (step) { bSkip = constrain(bSkip + step * pageLines(), 0, max(0, bLines - pageLines())); progress(""); }
      if (ev == 1) { listen(); progress(""); }
    } else {
      int n = listN();
      if (step && n) { bAt = (bAt + n + step) % n; progress(""); }
      if (ev == 1 && n) {
        if (bMode == B_BOOKS && bAt < asks()) {                // C-209: six seconds to ask, then the GUIDE's answer
          talkToGuide = true; talkHold(6000); talkToGuide = false;
          while (true) { int s2, e2; routineInput(s2, e2); if (s2 || e2 || giveUp()) break; delay(10); }   // read it, then on
          screen = RUN;
        }
        else if (bMode == B_BOOKS) { bBook = bAt - asks(); bMode = B_CHAPTERS; bAt = 0; bTop = 0; }
        else { bChapter = bAt; if (fetchChapter()) bMode = B_PAGE; else say("Not found"); }          // DRAFT
        progress("");
      }
    }
    delay(10);
  }
  runPanel = nullptr; shelf.clear(); chap.clear(); pageText = "";
  return "";
}
