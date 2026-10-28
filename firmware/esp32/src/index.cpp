// C-199 (3) (the user, 2026-10-28, by multiple choice: "The whole INDEX offline"): THE INDEX on the watches, from BOOKS --
// every daemon the save has met, in order; one opened shows its picture, its name and kind, and its entry (a seen one, its
// picture and name only, as the game shows it), LISTEN reading the entry aloud (and kept on the card once heard, C-199
// (2)). Each list and entry and picture is kept on the Ultra's card as it is read, and KEEP ON THE CARD (BOOKS) keeps them
// all, so THE INDEX opens away from any network. Every word DRAFT.
#include "app.h"
#include "talk.h"
#include "card.h"
#include <mbedtls/base64.h>

void listRow(int i, int at, const String &text, uint16_t day, uint16_t ink, int width);   // ui.cpp

static JsonDocument ixList, ixEntry;
static bool ixFromCard = false;
static int ixAt = 0, ixTop = 0, ixSkip = 0, ixLines = 0;
static bool ixOpen = false;
static uint8_t ixPix[2048]; static uint16_t ixPal[16]; static bool ixHasArt = false;

// a picture as /api/device/art sends it: sixteen colours, four bits a pixel
static bool takeIxArt(const String &json) {
  JsonDocument d;
  if (deserializeJson(d, json) || (d["w"] | 0) != 64) return false;
  JsonArray p = d["palette"].as<JsonArray>();
  for (int i = 0; i < 16; i++) ixPal[i] = i < (int)p.size() ? (uint16_t)(p[i] | 0) : 0;
  const char *b64 = d["pixels"] | ""; size_t got = 0;
  return !mbedtls_base64_decode(ixPix, sizeof ixPix, &got, (const unsigned char *)b64, strlen(b64)) && got == sizeof ixPix;
}
static void drawIxArt(int x, int y, int sc) {
  for (int j = 0; j < 64; j++) for (int i = 0; i < 64; i++) {
    uint8_t b = ixPix[(j * 64 + i) >> 1], c = (i & 1) ? (b & 15) : (b >> 4);
    if (c) canvas.fillRect(x + i * sc, y + j * sc, sc, sc, ixPal[c]);
  }
}
// from the companion (kept on the card as it comes), or from the card where the companion cannot be reached
static String fetchKept(const String &path, const String &file) {
  bool ok = false;
  String got = ixFromCard ? "" : http("GET", path, "", &ok);
  if (ok) { cardWrite(file, got); return got; }
  return cardRead(file);
}
static String ixRowName(int i) {
  JsonVariant e = ixList["entries"][i];
  char n[8]; snprintf(n, sizeof n, "#%03d ", (int)(e["n"] | 0));
  return String(n) + String((const char *)(e["name"] | "")) + ((e["b"] | false) ? "" : "  (seen)");   // DRAFT
}
static String ixText() {
  String t = String((const char *)(ixEntry["category"] | ""));
  JsonArray ty = ixEntry["types"].as<JsonArray>();
  if (ty.size()) { t += t.length() ? "  -  " : ""; for (size_t i = 0; i < ty.size(); i++) t += (i ? "/" : "") + String((const char *)(ty[i] | "")); }
  String e = ixEntry["entry"] | "", m = ixEntry["margin"] | "";
  if (e.length()) t += "\n\n" + e;
  if (m.length()) t += "\n\nIN THE MARGIN: " + m;                                                              // DRAFT
  return t;
}
static String drawIndex(uint16_t day, uint16_t ink) {
  canvas.setTextDatum(TL_DATUM); canvas.setTextFont(2); canvas.setTextColor(readable(day));
  if (!ixOpen) {
    canvas.drawString(String("THE INDEX") + (ixFromCard ? "  (FROM THE CARD)" : "") + "  " + String((int)(ixList["bound"] | 0)) + "/" + String((int)(ixList["seen"] | 0)), 10, 30);   // DRAFT
    int n = ixList["entries"].size(), fit = listRowsFit();
    if (ixAt < ixTop) ixTop = ixAt; if (ixAt >= ixTop + fit) ixTop = ixAt - fit + 1;
    for (int i = ixTop; i < n && i < ixTop + fit; i++) listRow(i - ixTop, ixAt - ixTop, ixRowName(i), day, ink, W - 12);
    return "swipe: choose   tap: open   hold: back";                                                         // DRAFT
  }
  canvas.drawString(String((const char *)(ixEntry["name"] | "")), 10, 30);
  int y = 50;
  if (ixHasArt && ixSkip == 0) { drawIxArt(W / 2 - 64, y, 2); y += 132; }
  int fit = (H - y - 44) / 18;
  ixLines = wrap(ixText(), 10, y, W - 20, 2, 18, fit, PAPER, ixSkip);
  if (talkCan() && String((const char *)(ixEntry["entry"] | "")).length()) {
    canvas.drawRoundRect(W - 86, H - 38, 78, 30, 8, day);
    canvas.setTextDatum(MC_DATUM); canvas.setTextColor(day); canvas.drawString("LISTEN", W - 47, H - 23);       // DRAFT
    canvas.setTextDatum(TL_DATUM);
  }
  return " ";
}
static bool openEntry(int i) {
  int s = ixList["entries"][i]["s"] | 0;
  progress("");
  String e = fetchKept("/api/index/entry?species=" + String(s), "index/" + String(s) + ".json");
  ixEntry.clear();
  if (!e.length() || deserializeJson(ixEntry, e)) return false;
  ixHasArt = takeIxArt(fetchKept("/api/device/art?species=" + String(s), "index/" + String(s) + ".art.json"));
  ixSkip = 0;
  return true;
}

String runIndex() {
  ixOpen = false; ixAt = 0; ixTop = 0; ixFromCard = false;
  runPanel = drawIndex;
  bool ok; String got = http("GET", "/api/index/list", "", &ok);
  if (ok) cardWrite("index/list.json", got);
  else if ((got = cardRead("index/list.json")).length()) ixFromCard = true;
  ixList.clear();
  if (!got.length() || deserializeJson(ixList, got) || !ixList["entries"].size()) {
    runPanel = nullptr;
    return online() ? "No INDEX yet -- meet a daemon in the game first." : "NEEDS WI-FI, OR A CARD";             // DRAFT
  }
  progress("");
  while (true) {
    int step, ev; routineInput(step, ev);
    if (routineQuit()) ev = -1;
    if (ev == -1) { if (ixOpen) { ixOpen = false; progress(""); continue; } break; }
    if (!ixOpen) {
      int n = ixList["entries"].size();
      if (step) { ixAt = (ixAt + n + step) % n; progress(""); }
      if (ev == 1) { if (openEntry(ixAt)) ixOpen = true; else say("Not kept here"); progress(""); }               // DRAFT
    } else {
      if (step) { ixSkip = constrain(ixSkip + step * 6, 0, max(0, ixLines - 4)); progress(""); }
      if (ev == 1 && talkCan()) { String e = ixEntry["entry"] | ""; if (e.length()) { talkReadText(e); screen = RUN; progress(""); } }
    }
    delay(10);
  }
  runPanel = nullptr; ixList.clear(); ixEntry.clear();
  return "";
}

// C-176: a species' picture, for TOUCH's meeting (the companion's, or the card's)
bool indexArtFor(int species) { return takeIxArt(fetchKept("/api/device/art?species=" + String(species), "index/" + String(species) + ".art.json")); }
void indexDrawArt(int x, int y, int sc) { drawIxArt(x, y, sc); }

// C-199: every entry and picture onto the card (KEEP ON THE CARD, books.cpp) -- how many kept
int indexKeepAll() {
  bool ok; String got = http("GET", "/api/index/list", "", &ok);
  if (!ok || !cardWrite("index/list.json", got)) return 0;
  JsonDocument l; if (deserializeJson(l, got)) return 0;
  int kept = 0;
  for (JsonVariant e : l["entries"].as<JsonArray>()) {
    int s = e["s"] | 0;
    String a = http("GET", "/api/index/entry?species=" + String(s), "", &ok);
    if (ok) cardWrite("index/" + String(s) + ".json", a);
    String p = http("GET", "/api/device/art?species=" + String(s), "", &ok);
    if (ok && cardWrite("index/" + String(s) + ".art.json", p)) kept++;
    if (kept % 10 == 0) { say("INDEX " + String(kept)); progress(""); }                                      // DRAFT
    if (routineQuit()) break;
  }
  return kept;
}
