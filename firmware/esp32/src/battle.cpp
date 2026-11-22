// C-328, the boards' and watches' half (the user, 2026-11-11: "I could send a battle request to any other device that is
// active and online, it would show the request on the other device and if u accept it, it would simulate what u see in
// game, where u take turns selecting moves and dealing damage -- where finally one of them is announced the winner (and
// exp is awarded for this too)"). The hub fights it (server/src/game/battle.ts, battles.ts, battleroute.ts); this file is
// what a board shows of it:
//
// - A REQUEST over any screen: the device state names one waiting for this device (`battle`), and while awake the board
//   asks GET /api/battle every quarter minute too (a request from another player comes only that way). It wakes the
//   screen (never a tucked-in daemon's night) and asks ACCEPT or DECLINE -- a minute, then it lapses on the hub.
// - THE BATTLE: both daemons, their HP, the turn's lines as the game words them; a tap opens the four routines as C-325's
//   tiles (a list on the boards without a touch screen), one chosen is sent, and the hub plays the turn once both have
//   chosen (30 s, then it chooses the strongest). Held twice, it leaves -- a forfeit.
// - THE RESULT: the game's own line for the end and the experience given (written at the next SYNC).
// - BATTLE on the daemon's tiles asks a device online here (or another player) to battle.
// Every word DRAFT.
#include "app.h"
#include "sound.h"
#include "leds.h"
#include <vector>

void listRow(int i, int at, const String &text, uint16_t day, uint16_t ink, int width);   // ui.cpp

static JsonDocument bt;                                       // the fight, as the hub shows it to this seat
static String bId, askId, askFrom, waveId;                   // the fight shown; a request waiting; one already answered
static int bStage = 0, bPick = 0, bSkip = 0;
static bool bLeaving = false;
static String bWhy;
static uint32_t askedPoll = 0;
static std::vector<String> bSeats, bWords;
enum { B_ASK, B_WAIT, B_BOARD, B_ROUTINES, B_OVER, B_SEATS };

static int me() { return bt["me"] | 0; }
static JsonVariant side(int i) { return bt["sides"][i]["daemon"]; }
static String who(int i) {
  JsonVariant d = side(i);
  String n = d["nickname"] | ""; if (!n.length()) n = d["name"] | "";
  return n.length() ? upper(n) : upper(String((const char *)(bt["sides"][i]["label"] | "?")));
}

// a daemon's corner: its name and level, an HP bar coloured as the game's (green, yellow, red), the numbers
static void corner(int i, int y, uint16_t day) {
  JsonVariant d = side(i);
  canvas.setTextDatum(TL_DATUM); canvas.setTextFont(2); canvas.setTextColor(readable(day));
  canvas.drawString(who(i) + "  Lv" + String((int)(d["level"] | 0)), 10, y);
  int hp = d["hp"] | 0, max = d["maxHP"] | 1, w = W - 20;
  float f = constrain((float)hp / max, 0.0f, 1.0f);
  uint16_t c = f > 0.5f ? canvas.color565(72, 200, 96) : f > 0.2f ? canvas.color565(232, 200, 64) : canvas.color565(224, 72, 64);
  canvas.drawRoundRect(10, y + 20, w, 8, 3, QUIET);
  canvas.fillRoundRect(11, y + 21, (int)((w - 2) * f), 6, 2, c);
  String st_ = d["status"] | "none";
  canvas.setTextFont(1); canvas.setTextColor(QUIET);
  canvas.drawString(String(hp) + " / " + String(max) + (st_ != "none" ? "  " + upper(st_) : ""), 10, y + 31);
}
// the last turn's lines, as the game words them
static String lastLines() {
  JsonArray log = bt["log"].as<JsonArray>();
  if (!log.size()) return "";
  String t;
  for (JsonVariant l : log[log.size() - 1].as<JsonArray>()) { String s = l["text"] | ""; if (s.length()) t += (t.length() ? "\n" : "") + s; }
  return t;
}
static void pickRows(int n, const String *words, const char *title, void (*icon)(int, int, int), uint16_t day, uint16_t ink) {
  if (gridLists()) { drawTiles(n, bPick, words, title, icon, day, ink); return; }
  canvas.setTextDatum(TL_DATUM); canvas.setTextFont(2); canvas.setTextColor(readable(day));
  canvas.drawString(title, 10, 30);
  int fit = listRowsFit(), top = max(0, bPick - (fit - 1));
  for (int i = top; i < n && i < top + fit; i++) listRow(i - top, bPick - top, words[i], day, ink, W - 12);
}

static String drawBattle(uint16_t day, uint16_t ink) {
  canvas.setTextDatum(TL_DATUM); canvas.setTextFont(2); canvas.setTextColor(readable(day));
  if (bWhy.length()) { canvas.drawString("BATTLE", 10, 32); wrap(bWhy, 10, 56, W - 20, 2, 18, 6, PAPER); return "hold: back"; }   // DRAFT
  if (bStage == B_SEATS) {
    static String words[16];
    int n = min((int)bWords.size(), 16);
    for (int i = 0; i < n; i++) words[i] = bWords[i];
    pickRows(n, words, "BATTLE WHOM?", [](int, int cx, int cy) {                                         // DRAFT
      canvas.drawCircle(cx - 8, cy, 9, PAPER); canvas.drawCircle(cx + 8, cy, 9, QUIET);
    }, day, ink);
    return gridLists() ? " " : "turn: choose   press: ask   hold: back";                                // DRAFT
  }
  if (bStage == B_ASK) {
    static String words[2] = { "ACCEPT", "DECLINE" };                                                    // DRAFT
    String asking = bt["asking"] | "";
    if (!asking.length()) asking = askFrom + " would like to battle!";                                  // DRAFT (the game's words, when the hub has them)
    pickRows(2, words, "BATTLE", [](int i, int cx, int cy) {                                             // DRAFT
      if (i == 0) { canvas.drawLine(cx - 12, cy + 12, cx + 12, cy - 12, PAPER); canvas.drawLine(cx - 12, cy - 12, cx + 12, cy + 12, PAPER); }   // two crossed
      else canvas.drawCircle(cx, cy, 12, QUIET);
    }, day, ink);
    canvas.setTextDatum(TL_DATUM); canvas.setTextFont(1); canvas.setTextColor(PAPER);
    wrap(asking, 10, gridLists() ? H - 14 : H - 40, W - 20, 1, 10, 1, PAPER);
    return gridLists() ? " " : "turn: choose   press: answer";                                         // DRAFT
  }
  if (bStage == B_WAIT) {
    canvas.drawString("BATTLE", 10, 32);                                                                 // DRAFT
    wrap("Asking " + askFrom + "...", 10, 56, W - 20, 2, 18, 4, PAPER);                                // DRAFT
    return "hold: take it back";                                                                         // DRAFT
  }
  if (bStage == B_ROUTINES) {
    static String words[4];
    JsonArray moves = side(me())["moves"].as<JsonArray>();
    int n = min((int)moves.size(), 4);
    for (int i = 0; i < n; i++) {
      String nm = moves[i]["name"] | "?";
      words[i] = tileWord(nm, (W - 24) / 2);
    }
    int left = bt["secondsLeft"] | 0;
    String title = "ROUTINE  " + String(left) + "s";                                                     // DRAFT
    pickRows(n, words, title.c_str(), [](int i, int cx, int cy) {                                        // its MP, as dots of what is left
      JsonVariant m = side(me())["moves"][i];
      int pp = m["pp"] | 0, mx = max(1, (int)(m["maxPP"] | 1));
      canvas.setTextDatum(MC_DATUM); canvas.setTextFont(1); canvas.setTextColor(pp ? PAPER : QUIET);
      canvas.drawString(String(pp) + "/" + String(mx) + " MP", cx, cy - 4);                             // DRAFT
      String ty = m["type"] | "";
      canvas.setTextColor(QUIET); canvas.drawString(upper(ty), cx, cy + 8);
    }, day, ink);
    return gridLists() ? " " : "turn: choose   press: use   hold: back";                               // DRAFT
  }
  // the board: the foe above, this side below, the turn's lines between
  corner(1 - me(), 26, day);
  corner(me(), H - 82, day);
  String lines = bStage == B_OVER ? String((const char *)(bt["result"] | "")) : lastLines();
  if (bStage == B_OVER) {
    int exp = bt["exp"][me()] | 0;
    if (bt["draw"] | false) lines = "Neither one won.";                                                  // DRAFT
    if (exp > 0) lines += "\n" + who(me()) + " gained " + String(exp) + " EXP. Points!";                 // the game's words
  }
  if (!lines.length()) lines = bt["phase"] == "on" ? String("What will " + who(me()) + " do?") : String("");   // the game's words
  wrap(lines, 10, 74, W - 20, 2, 16, max(1, (H - 82 - 74) / 16), PAPER, bSkip);
  if (bStage == B_OVER) return "hold: done";                                                             // DRAFT
  if (bLeaving) return "hold again: leave (forfeit)";                                                   // DRAFT
  bool chosen = bt["chosen"][me()] | false;
  if (chosen) return "waiting for " + who(1 - me()) + "...";                                            // DRAFT
  return "tap: choose a routine   hold: leave";                                                         // DRAFT
}

static bool post(const char *path, const String &body) {
  bool ok; String got = http("POST", path, body, &ok);
  JsonDocument d;
  if (ok && !deserializeJson(d, got) && d["id"].is<const char *>()) { bt = d; bId = bt["id"] | ""; return true; }
  JsonDocument e; String err = !deserializeJson(e, got) ? String((const char *)(e["error"] | "")) : String("");
  bWhy = err.length() ? err : online() ? String("The companion did not answer.") : String("NEEDS WI-FI");   // DRAFT
  return false;
}
// the fight by its id, from GET /api/battle; false when it is gone
static bool fetchFight() {
  bool ok; String got = http("GET", "/api/battle", "", &ok);
  JsonDocument d;
  if (!ok || deserializeJson(d, got)) return true;             // not heard: keep what is shown
  for (JsonVariant f : d["fights"].as<JsonArray>()) if (bId == (const char *)(f["id"] | "")) { bt.set(f); return true; }
  return false;
}
static void stageFromPhase() {
  String ph = bt["phase"] | "";
  if (ph == "on" && (bStage == B_ASK || bStage == B_WAIT)) { bStage = B_BOARD; bPick = 0; bSkip = 0; soundSelect(); }
  else if (ph == "over" && bStage != B_OVER) { bStage = B_OVER; bSkip = 0; soundSelect(); delay(120); soundSelect(); }
  else if (ph == "declined" || ph == "lapsed" || ph == "withdrawn") {
    bWhy = ph == "declined" ? who(1) + " said no." : ph == "lapsed" ? String("No answer came.") : String("The request was taken back.");   // DRAFT
  }
}

// the fight from its request (asked: this device was asked) to its end
static String fight(const String &id, int stage) {
  bId = id; bStage = stage; bPick = 0; bSkip = 0; bLeaving = false; bWhy = "";
  runPanel = drawBattle;
  if (stage == B_ASK && !fetchFight()) bWhy = "The request has gone.";                                   // DRAFT
  progress("");
  uint32_t polledAt = millis(), leaveAt = 0;
  size_t turns = bt["log"].size();
  while (true) {
    int step, ev; routineInput(step, ev);
    if (routineQuit()) ev = -1;
    uint32_t now = millis();
    if (bWhy.length()) { if (ev == -1 || ev == 1) break; delay(10); continue; }
    if (ev == -1) {
      if (bStage == B_ROUTINES) { bStage = B_BOARD; progress(""); continue; }
      if (bStage == B_OVER) break;
      if (bStage == B_ASK) { post("/api/battle/answer", "{\"id\":\"" + bId + "\",\"accept\":false}"); waveId = bId; break; }
      if (bStage == B_WAIT) { post("/api/battle/leave", "{\"id\":\"" + bId + "\"}"); break; }
      if (bLeaving && now - leaveAt < 3000) { post("/api/battle/leave", "{\"id\":\"" + bId + "\"}"); bWhy = ""; stageFromPhase(); bLeaving = false; progress(""); continue; }
      bLeaving = true; leaveAt = now; progress(""); continue;
    }
    if (bLeaving && now - leaveAt >= 3000) { bLeaving = false; progress(""); }
    if (bStage == B_ASK) {
      if (step) { bPick = gridLists() ? tilesPage(bPick, 2, step) : (bPick + 2 + step) % 2; progress(""); }
      if (ev == 1 && tilesTap(bPick, 2)) {
        bool yes = bPick == 0;
        waveId = bId;
        if (post("/api/battle/answer", "{\"id\":\"" + bId + "\",\"accept\":" + (yes ? "true" : "false") + "}") && yes) stageFromPhase();
        else if (!yes) break;
        progress("");
      }
    } else if (bStage == B_ROUTINES) {
      int n = min((int)side(me())["moves"].size(), 4);
      if (step && n) { bPick = gridLists() ? tilesPage(bPick, n, step) : (bPick + n + step) % n; progress(""); }
      if (ev == 1 && n && tilesTap(bPick, n)) {
        if (post("/api/battle/choose", "{\"id\":\"" + bId + "\",\"slot\":" + String(bPick) + "}")) bStage = B_BOARD;
        polledAt = 0; progress("");
      }
    } else if (bStage == B_BOARD || bStage == B_OVER) {
      if (step) { bSkip = max(0, bSkip + step); progress(""); }
      bool chosen = bt["chosen"][me()] | false;
      if (ev == 1 && bStage == B_BOARD && !chosen && bt["phase"] == "on") { bStage = B_ROUTINES; bPick = 0; progress(""); }
      else if (ev == 1 && bStage == B_OVER) break;
    }
    // the hub plays the turns: asked every second and a half while it lasts
    if (bStage != B_OVER && !bWhy.length() && now - polledAt > 1500) {
      polledAt = now;
      if (!fetchFight()) { if (bStage == B_BOARD || bStage == B_ROUTINES) bWhy = "The battle has gone."; }   // DRAFT
      else {
        if (bt["log"].size() != turns) { turns = bt["log"].size(); bSkip = 0; if (bStage == B_ROUTINES) bStage = B_BOARD; ledsFlash(); }
        stageFromPhase();
      }
      progress("");
    }
    delay(10);
  }
  runPanel = nullptr;
  String said = bStage == B_OVER && (bt["winner"] | -1) == me() ? "WON" : "";                           // DRAFT
  bt.clear(); bId = "";
  return said;
}

// BATTLE, from the daemon's tiles: a device online here, or another player, asked
String runBattle() {
  if (!online()) return "NEEDS WI-FI";                                                                   // DRAFT
  if (!st.carrying) return "NO DAEMON";                                                                  // DRAFT
  bWhy = ""; bStage = B_SEATS; bPick = 0; bSeats.clear(); bWords.clear();
  runPanel = drawBattle;
  progress("");
  bool ok; String got = http("GET", "/api/battle", "", &ok);
  JsonDocument d;
  if (!ok || deserializeJson(d, got)) { runPanel = nullptr; return "NOT NOW"; }                          // DRAFT
  for (JsonVariant o : d["online"].as<JsonArray>()) {
    String seat = o["seat"] | "", label = o["label"] | "", nick = o["daemon"]["nickname"] | "";
    if (!seat.length()) continue;
    bSeats.push_back(seat);
    bWords.push_back(tileWord(nick.length() ? upper(nick) : upper(label), (W - 24) / 2));
  }
  if (bSeats.empty()) { runPanel = nullptr; return "NO ONE ONLINE"; }                                   // DRAFT
  progress("");
  while (true) {
    int step, ev; routineInput(step, ev);
    if (routineQuit() || ev == -1) break;
    int n = bSeats.size();
    if (step) { bPick = gridLists() ? tilesPage(bPick, n, step) : (bPick + n + step) % n; progress(""); }
    if (ev == 1 && tilesTap(bPick, n)) {
      askFrom = bWords[bPick];
      if (post("/api/battle/request", "{\"to\":\"" + bSeats[bPick] + "\"}")) return fight(bId, B_WAIT);
      String why = bWhy; bWhy = ""; runPanel = nullptr;
      return why.length() <= 18 ? upper(why) : String("NOT NOW");                                       // DRAFT; the box holds a word
    }
    delay(10);
  }
  runPanel = nullptr;
  return "";
}

// ---- a request, over any screen ----
static void noteAsk(const String &id, const String &from) {
  if (!id.length() || id == askId || id == waveId || id == bId) return;
  askId = id; askFrom = from.length() ? from : String("SOMEONE");                                        // DRAFT
}
void battleFromState(JsonVariantConst b) {                     // device state's `battle`: a request waiting for this device
  if (b.isNull()) return;
  if (String((const char *)(b["phase"] | "")) == "asked") noteAsk(b["id"] | "", b["from"] | "");
}
void battleLoop(uint32_t now) {
  if (routineRunning || nightQuiet() || !online()) return;
  if (!asleep && !askId.length() && !netBusy() && now - askedPoll > 15000) {   // awake: the other players' requests too
    askedPoll = now;
    bool ok; String got = http("GET", "/api/battle", "", &ok);
    JsonDocument d;
    if (ok && !deserializeJson(d, got))
      for (JsonVariant f : d["fights"].as<JsonArray>())
        if (f["phase"] == "asked" && (f["me"] | 0) == 1) { noteAsk(f["id"] | "", f["sides"][0]["label"] | ""); break; }
  }
  if (!askId.length()) return;
  String id = askId; askId = "";
  if (asleep) wake();
  lastInput = now;
  soundSelect(); delay(120); soundSelect(); ledsFlash();
  Screen was = screen;
  screen = RUN; routineRunning = true;
  String r = fight(id, B_ASK);
  routineRunning = false; screen = was;
  if (r.length()) say(r);
  dirty = true;
}
