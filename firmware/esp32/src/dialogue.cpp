// C-329 (the user, 2026-11-11: two daemons in one space talk ... "the opening prompt typed on the phone or dictated on
// the watch" ... "Simpler on the watch"): IN DIALOGUE, from the daemon's tiles once two of the home's devices are
// TOGETHER (C-327). Chosen as tiles -- STANDARD or TWO VOICES, then how many turns each -- the opening said aloud
// (POST /api/device/hear) and read back, then the hub's talk (POST /api/household/converse, dialogue.ts) watched as it
// comes: each line a bubble, the starter's daemon on the left (red: logical; in TWO VOICES the asker), the other on the
// right (blue), the dots on the side being thought; a tap on a bubble hears it. Done, INTEGRATE asks the mind hub for the
// write-up and shows it, titled. Every word DRAFT.
#include "app.h"
#include "talk.h"
#include <vector>

bool talkDictate(uint32_t forMs, String &heard);            // talk.cpp: a recording heard, nothing answered

static JsonDocument dlg;                                     // the talk as the hub has it
static int dStage = 0, dPick = 0, dSkip = 0, dTotal = 0, dMode = 0, dTurns = 3;
static String dHeard, dWhy;
static const int TURN_CHOICES[] = { 1, 3, 5, 7 };
enum { D_MODE, D_TURNS, D_SAY, D_TALK, D_WRITTEN };

static const uint16_t RED = 0xC9A6, BLUE = 0x4B3D;           // the book's inks, as the app's bubbles

static int bubbleLines(const String &t, int w) { canvas.setTextFont(2); return wrap(t, 0, -1000, w, 2, 16, 0, PAPER); }

static String drawDialogue(uint16_t day, uint16_t ink) {
  canvas.setTextDatum(TL_DATUM); canvas.setTextFont(2); canvas.setTextColor(readable(day));
  if (dWhy.length()) { canvas.drawString("IN DIALOGUE", 10, 32); wrap(dWhy, 10, 56, W - 20, 2, 18, 6, PAPER); return "hold: back"; }   // DRAFT
  if (dStage == D_MODE || dStage == D_TURNS) {
    static String words[4];
    int n = dStage == D_MODE ? 2 : 4;
    if (dStage == D_MODE) { words[0] = "STANDARD"; words[1] = "TWO VOICES"; }                  // DRAFT
    else for (int i = 0; i < 4; i++) words[i] = String(TURN_CHOICES[i]) + (TURN_CHOICES[i] == 1 ? " TURN" : " TURNS");   // DRAFT
    drawTiles(n, dPick, words, dStage == D_MODE ? "IN DIALOGUE" : "TURNS EACH", [](int i, int cx, int cy) {   // DRAFT
      if (dStage == D_MODE) {                                // two bubbles: red and blue, or the asker faint
        canvas.fillRoundRect(cx - 20, cy - 12, 22, 14, 4, i == 0 ? RED : QUIET);
        canvas.fillRoundRect(cx - 2, cy + 2, 22, 14, 4, BLUE);
        return;
      }
      for (int k = 0; k < TURN_CHOICES[i] && k < 7; k++) canvas.fillCircle(cx - 18 + k * 6, cy, 2, PAPER);
    }, day, ink);
    return " ";
  }
  if (dStage == D_SAY) {
    canvas.drawString("HOW IT BEGINS", 10, 30);                                                      // DRAFT
    if (dHeard.length()) wrap("\"" + dHeard + "\"", 10, 54, W - 20, 2, 18, 8, PAPER);
    else wrap("Tap, then say how the talk should begin.", 10, 54, W - 20, 2, 18, 4, QUIET);         // DRAFT
    return dHeard.length() ? "tap: begin   swipe: say again   hold: back" : "tap: speak   hold: back";   // DRAFT
  }
  if (dStage == D_WRITTEN) {
    String t = dlg["written"]["title"] | "";
    canvas.drawString(t.length() > 24 ? t.substring(0, 23) + "." : t, 10, 30);
    int n = wrap(String((const char *)(dlg["written"]["text"] | "")), 10, 50, W - 20, 2, 18, (H - 90) / 18, PAPER, dSkip);
    dTotal = n;
    return "swipe: read on   hold: back";                                                            // DRAFT
  }
  // D_TALK: the bubbles, newest at the bottom
  const int bw = W - 56;
  int y = 28 - dSkip;
  JsonArray lines = dlg["lines"].as<JsonArray>();
  bool two = String((const char *)(dlg["mode"] | "")) == "twovoices";
  int i = 0;
  for (JsonVariant l : lines) {
    String said = l["said"] | "", who = l["who"] | "a";
    bool left = who == "a";
    int h = bubbleLines(said, bw - 12) * 16 + 10, x = left ? 6 : W - 6 - bw;
    if (y + h > 20 && y < H - 44) {
      uint16_t fill = left ? (two ? QUIET : RED) : BLUE;
      canvas.fillRoundRect(x, y, bw, h, 8, fill);
      wrap(said, x + 6, y + 5, bw - 12, 2, 16, 40, PAPER);
      tapRect(x, max(y, 20), bw, min(h, H - 44 - max(y, 20)), i);
    }
    y += h + 6; i++;
  }
  dTotal = y + dSkip - 28;
  String status = dlg["status"] | "";
  if (status == "thinking") {                                 // the dots, on the side being thought
    bool left = String((const char *)(dlg["next"] | "a")) == "a";
    int x = left ? 20 : W - 44, dy = min(y + 8, H - 40);
    for (int k = 0; k < 3; k++) canvas.fillCircle(x + k * 10, dy, 3, (millis() / 300) % 3 == k ? PAPER : QUIET);
    dirty = true;
  }
  if (status == "thinking") return "swipe: scroll   hold: leave";                                    // DRAFT
  if (dlg["integrating"] | false) return "Putting it together...";                                  // DRAFT
  if (!lines.size()) return String((const char *)(dlg["stopped"] | "It said nothing."));             // DRAFT
  canvas.drawRoundRect(W - 106, H - 40, 98, 30, 8, day);                                            // INTEGRATE: the write-up
  canvas.setTextDatum(MC_DATUM); canvas.setTextColor(day); canvas.drawString("INTEGRATE", W - 57, H - 25);   // DRAFT
  canvas.setTextDatum(TL_DATUM);
  tapRect(W - 106, H - 40, 98, 30, -2);
  return "tap a line: hear it";                                                                      // DRAFT
}

static bool fetchTalk() {
  bool ok; String body = "{\"id\":\"" + String((const char *)(dlg["id"] | "")) + "\"}";
  String got = http("POST", "/api/household/talk", body, &ok);
  JsonDocument d;
  if (!ok || deserializeJson(d, got)) return false;
  dlg = d;
  return true;
}

String runDialogue() {
  if (!st.together.on) return "TOGETHER FIRST";              // DRAFT: the box holds a word
  if (!online()) return "NEEDS WI-FI";                       // DRAFT
  dStage = D_MODE; dPick = 0; dSkip = 0; dHeard = ""; dWhy = ""; dlg.clear();
  runPanel = drawDialogue;
  progress("");
  uint32_t polledAt = 0;
  String said;
  while (true) {
    int step, ev; routineInput(step, ev);
    if (routineQuit()) ev = -1;
    if (ev == -1) {
      if (dStage == D_TURNS) { dStage = D_MODE; dPick = dMode; progress(""); continue; }
      if (dStage == D_SAY) { dStage = D_TURNS; dPick = 1; progress(""); continue; }
      if (dStage == D_WRITTEN) { dStage = D_TALK; dSkip = 0; progress(""); continue; }
      break;
    }
    if (dWhy.length()) { delay(10); continue; }
    if (dStage == D_MODE || dStage == D_TURNS) {
      int n = dStage == D_MODE ? 2 : 4;
      if (step) { dPick = tilesPage(dPick, n, step); progress(""); }
      if (ev == 1 && tilesTap(dPick, n)) {
        if (dStage == D_MODE) { dMode = dPick; dStage = D_TURNS; dPick = 1; }
        else { dTurns = TURN_CHOICES[dPick]; dStage = D_SAY; }
        progress("");
      }
    } else if (dStage == D_SAY) {
      if (step && dHeard.length()) { dHeard = ""; progress(""); }
      if (ev == 1 && !dHeard.length()) {
        String h;
        if (!talkDictate(8000, h)) { screen = RUN; runPanel = drawDialogue; dWhy = h.length() ? h : String("Nothing was heard."); progress(""); continue; }   // DRAFT
        screen = RUN; runPanel = drawDialogue; dHeard = h.substring(0, 300); progress("");
      } else if (ev == 1) {
        JsonDocument q; q["mode"] = dMode ? "twovoices" : "standard"; q["turns"] = dTurns; q["prompt"] = dHeard;
        String body; serializeJson(q, body);
        bool ok; String got = http("POST", "/api/household/converse", body, &ok);
        JsonDocument d;
        if (!ok || deserializeJson(d, got)) {
          JsonDocument e; String err = !deserializeJson(e, got) ? String((const char *)(e["error"] | "")) : String("");
          dWhy = err.length() ? err : String("The companion did not answer.");                       // DRAFT
        } else { dlg = d; dStage = D_TALK; dSkip = 0; polledAt = millis(); }
        progress("");
      }
    } else if (dStage == D_TALK) {
      String status = dlg["status"] | "";
      bool waiting = status == "thinking" || (dlg["integrating"] | false);
      if (waiting && millis() - polledAt > 1500) {
        polledAt = millis();
        size_t had = dlg["lines"].size();
        if (fetchTalk()) {
          if (dlg["lines"].size() > had) dSkip = max(0, dTotal + 60 - (H - 58));   // follow the newest
          if (!(dlg["integrating"] | false) && !dlg["written"].isNull() && dlg["written"]["title"].is<const char *>()) { dStage = D_WRITTEN; dSkip = 0; }
        }
        progress("");
      }
      if (step) { dSkip = constrain(dSkip + step * 48, 0, max(0, dTotal - (H - 58))); progress(""); }
      int x, y, off = -1;
      if (ev == 1 && !(watchTapPoint(x, y) && tapAt(x, y, off, false))) off = -1;
      if (ev == 1 && off >= 0) {                             // a bubble: heard in the INDEX voice (kept on the card)
        String line = dlg["lines"][off]["said"] | "";
        if (line.length()) { talkReadText(line); screen = RUN; runPanel = drawDialogue; progress(""); }
      }
      if (ev == 1 && off == -2 && status == "done" && dlg["lines"].size() && !(dlg["integrating"] | false)) {   // INTEGRATE
        bool ok; String body = "{\"id\":\"" + String((const char *)(dlg["id"] | "")) + "\"}";
        String got = http("POST", "/api/household/integrate", body, &ok);
        JsonDocument d;
        if (ok && !deserializeJson(d, got)) { dlg = d; dlg["integrating"] = true; polledAt = millis(); }
        progress("");
      }
    } else if (dStage == D_WRITTEN) {
      if (step) { dSkip = constrain(dSkip + step * ((H - 90) / 18), 0, max(0, dTotal - (H - 90) / 18)); progress(""); }
    }
    delay(10);
  }
  runPanel = nullptr; dlg.clear(); dHeard = "";
  return said;
}
