// C-208 (the user, 2026-10-28: "you should be able to read both of these books from the watch ultra also ... hit a
// button allowing the watch or app to read you the selected chapter aloud"; by multiple choice: THE SUBTLE LAYER, the
// GUIDE and the NOTEBOOK): BOOKS, on the watches. The books the save holds come from the companion (GET /api/books,
// server/src/books.ts -- a book not yet found is not there), then a chapter at a time (GET /api/book): its words, a page
// a swipe, and LISTEN -- the chapter read aloud in the INDEX voice, a paragraph at a time (talkReadText; a tap or the
// crown stops it between paragraphs). C-199: on the Ultra each is kept on its SD card as it is read (or all at once,
// KEEP ON THE CARD), so away from any network BOOKS opens from the card -- only LISTEN needs the companion. Every word DRAFT.
#include "app.h"
#include "talk.h"
#include "sound.h"
#include "card.h"

void listRow(int i, int at, const String &text, uint16_t day, uint16_t ink, int width);   // ui.cpp
int rowH();                                                                                // ui.cpp

enum { B_BOOKS, B_CHAPTERS, B_PAGE };
static int bMode = B_BOOKS, bAt = 0, bTop = 0, bBook = 0, bChapter = 0, bSkip = 0, bLines = 0;
static JsonDocument shelf;                                // the books and their chapters' titles
static JsonDocument chap;                                 // the chapter open: { title, paragraphs[] }
static String pageText;
static String bWhy;                                       // why there is nothing to show
static bool fromCard = false;                             // C-199: the shelf came off the card (no network)
// C-199: KEEP ON THE CARD ends the shelf, where there is a card and the companion answered
static int keeps() { return !fromCard && cardReady() ? 1 : 0; }

// C-209: ASK THE GUIDE heads the shelf once the GUIDE is held -- a question by voice, answered from its pages. C-229, C-230:
// once THE SUBTLE LAYER is, its three: ASK (a line from its pages and a question back), TWO VOICES (only the asking voice)
// and TODAY'S QUESTION (asked, then answered by voice, and kept in its journal)
static bool held(const char *id) { for (JsonVariant b : shelf["books"].as<JsonArray>()) if (String((const char *)(b["id"] | "")) == id) return true; return false; }
enum AskKind { ASK_GUIDE, ASK_SUBTLE, ASK_VOICES, ASK_TODAY };
static const char *const ASK_NAMES[] = { "ASK THE GUIDE", "ASK THE SUBTLE LAYER", "TWO VOICES", "TODAY'S QUESTION" };   // DRAFT
static const char *const ASK_HINTS[] = { "tap, then ask your question", "tap, then ask: a line, and a question back",
                                         "tap, then say a thing", "tap: its question, then tap to answer" };              // DRAFT
static int askKinds(AskKind *k) {
  int n = 0;
  if (!talkCan() || fromCard) return 0;
  if (held("guide")) k[n++] = ASK_GUIDE;
  if (held("subtle")) { k[n++] = ASK_SUBTLE; k[n++] = ASK_VOICES; k[n++] = ASK_TODAY; }
  return n;
}
static int asks() { AskKind k[4]; return askKinds(k); }
static AskKind askAt(int i) { AskKind k[4]; askKinds(k); return k[i]; }
// C-199 (3): THE INDEX heads the shelf (index.cpp), after ASK THE GUIDE
String runIndex(); int indexKeepAll();
static int heads() { return asks() + 1; }
static int listN() {
  if (bMode == B_BOOKS) return heads() + shelf["books"].size() + keeps();
  return shelf["books"][bBook]["chapters"].size();
}
static String listName(int i) {
  if (bMode == B_BOOKS && i >= heads() + (int)shelf["books"].size()) return "KEEP ON THE CARD";                        // DRAFT
  if (bMode == B_BOOKS && i < asks()) return ASK_NAMES[askAt(i)];
  if (bMode == B_BOOKS && i < heads()) return "THE INDEX";                                                            // DRAFT
  if (bMode == B_BOOKS) return String((const char *)(shelf["books"][i - heads()]["title"] | ""));
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
  canvas.drawString(bMode == B_BOOKS ? (fromCard ? "BOOKS  (FROM THE CARD)" : "BOOKS") : String((const char *)(shelf["books"][bBook]["title"] | "")), 10, 30);   // DRAFT
  if (bMode == B_BOOKS && bAt < asks()) {                // what the ask does, under the list
    canvas.setTextFont(1); canvas.setTextColor(QUIET);
    canvas.drawString(ASK_HINTS[askAt(bAt)], 10, H - 50);
    canvas.setTextFont(2);
  }
  int n = listN(), fit = listRowsFit();
  if (bAt < bTop) bTop = bAt; if (bAt >= bTop + fit) bTop = bAt - fit + 1;
  for (int i = bTop; i < n && i < bTop + fit; i++) listRow(i - bTop, bAt - bTop, listName(i), day, ink, W - 12);
  return "swipe: choose   tap: open   hold: back";                                                // DRAFT
}

static String chapterFile(const String &id, int n) { return "book/" + id + "/" + String(n) + ".json"; }
static bool fetchChapter() {
  bool ok = false; String id = shelf["books"][bBook]["id"] | "";
  progress("");
  String got = fromCard ? "" : http("GET", "/api/book?book=" + id + "&n=" + String(bChapter), "", &ok);
  if (ok) cardWrite(chapterFile(id, bChapter), got);         // C-199: kept as it is read
  else got = cardRead(chapterFile(id, bChapter));            // away: the card's, if it was kept
  chap.clear();
  if (!got.length() || deserializeJson(chap, got)) return false;
  pageText = "";
  for (JsonVariant p : chap["paragraphs"].as<JsonArray>()) pageText += (pageText.length() ? "\n\n" : "") + String((const char *)(p | ""));
  bSkip = 0;
  return true;
}

// C-230: TODAY'S QUESTION -- the book's question for the day on the TALK screen; a tap, and eight seconds to answer it
// aloud, kept in its journal (the companion hears it); anything else leaves it unanswered
static void todaysQuestion() {
  bool ok = false; String got = http("GET", "/api/subtle/today", "", &ok);
  JsonDocument d;
  if (!ok || deserializeJson(d, got) || !(d["held"] | false)) { say("NOT FOUND"); return; }                             // DRAFT
  talkShow("TODAY'S QUESTION", String((const char *)(d["question"] | "")));                                             // DRAFT
  while (true) {
    int s, e; routineInput(s, e);
    if (routineQuit() || e == -1 || s) return;
    if (e == 1) { talkToSubtle = 3; talkHold(8000); talkToSubtle = 0; return; }
    delay(10);
  }
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

// C-199: every chapter of every book onto the card, the shelf with them -- read away from any network after
static void keepAll() {
  int all = 0, kept = 0;
  for (JsonVariant b : shelf["books"].as<JsonArray>()) all += b["chapters"].size();
  for (JsonVariant b : shelf["books"].as<JsonArray>()) {
    String id = b["id"] | "";
    for (int n = 0; n < (int)b["chapters"].size(); n++) {
      bool ok; String got = http("GET", "/api/book?book=" + id + "&n=" + String(n), "", &ok);
      if (ok && cardWrite(chapterFile(id, n), got)) kept++;
      if (kept % 5 == 0) { bWhy = ""; say("KEPT " + String(kept) + " OF " + String(all)); progress(""); }   // DRAFT
      if (routineQuit()) { say("STOPPED AT " + String(kept)); return; }                                       // DRAFT
    }
  }
  int ix = indexKeepAll();                                   // C-199 (3): and THE INDEX
  say(String(kept == all ? "ALL " + String(all) : "KEPT " + String(kept) + " OF " + String(all)) + " + " + String(ix) + " INDEX ON THE CARD");   // DRAFT
}

String runBooks() {
  bMode = B_BOOKS; bAt = 0; bTop = 0; bWhy = ""; fromCard = false;
  runPanel = drawBooks;
  progress("");
  bool ok; String got = http("GET", "/api/books", "", &ok);
  if (ok) cardWrite("books.json", got);                      // C-199: the shelf, for away
  else if ((got = cardRead("books.json")).length()) { ok = true; fromCard = true; }
  shelf.clear();
  if (!ok || deserializeJson(shelf, got)) bWhy = online() ? "The companion did not answer." : "NEEDS WI-FI";   // DRAFT
  else if (!shelf["books"].size()) bWhy = "No book yet. In the game, find THE SUBTLE LAYER, the GUIDE or the NOTEBOOK -- then they open here.";   // DRAFT
  progress("");
  while (true) {
    int step, ev; routineInput(step, ev);
    if (routineQuit()) ev = -1;
    if (ev == -1) {
      if (bWhy.length() || bMode == B_BOOKS) break;
      if (bMode == B_PAGE) { bMode = B_CHAPTERS; bAt = bChapter; } else { bMode = B_BOOKS; bAt = bBook + heads(); }
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
        if (bMode == B_BOOKS && bAt < asks()) {                // C-209: six seconds to ask, then the book's answer
          AskKind k = askAt(bAt);
          if (k == ASK_TODAY) todaysQuestion();
          else if (k == ASK_GUIDE) { talkToGuide = true; talkHold(6000); talkToGuide = false; }
          else { talkToSubtle = k == ASK_VOICES ? 2 : 1; talkHold(6000); talkToSubtle = 0; }   // C-229
          while (true) { int s2, e2; routineInput(s2, e2); if (s2 || e2 || routineQuit()) break; delay(10); }   // read it, then on
          screen = RUN;
        }
        else if (bMode == B_BOOKS && bAt < heads()) { String r = runIndex(); runPanel = drawBooks; if (r.length()) say(r); }   // C-199 (3)
        else if (bMode == B_BOOKS && bAt >= heads() + (int)shelf["books"].size()) keepAll();                 // C-199
        else if (bMode == B_BOOKS) { bBook = bAt - heads(); bMode = B_CHAPTERS; bAt = 0; bTop = 0; }
        else { bChapter = bAt; if (fetchChapter()) bMode = B_PAGE; else say("Not found"); }          // DRAFT
        progress("");
      }
    }
    delay(10);
  }
  runPanel = nullptr; shelf.clear(); chap.clear(); pageText = "";
  return "";
}
