// C-134: BROADCASTS -- see broadcast.h. A word, or an act (a wave, a bow, a tune: firmware/common/acts.h), from the
// daemon this board hosts to every daemon, and every daemon's answer to an act.
//
// THE ID is the sender's hourly tag (meet.cpp; the same four bytes as its Bluetooth beacon and its LoRa frames) and a
// number of its own, so one broadcast is one id on every way it travels, and a board or the companion that has seen an
// id drops it -- it only learns the new way it came.
//
// THE WAYS:
//   LoRa       lora.cpp's frame: kind 3 SAY to everyone, 5 ACT (the code), 6 REPLY (the answered id and the code);
//              passed on by the mesh as any frame, so it reaches past the first board.
//   Bluetooth  up to eight pieces, each a 128-bit service UUID turning in the scan response for twelve seconds
//              (meet.cpp) -- the one thing an iPhone may advertise, so the phone can join later:
//                  DA E1  K|N|P  FROM(4)  ID(2)  7 bytes of the message
//              K the kind (2 bits), N the pieces less one (3), P this piece (3). The message: SPECIES(2), the name's
//              length and the name (up to 10), then the word, or the code, or for an answer the answered FROM(4) ID(2)
//              and the code. A word by Bluetooth is therefore at most 43 letters.
//   Companion  told by the cable's bridge (CAST {json}) or over Wi-Fi (POST /api/device/broadcast); heard back in the
//              state's `casts`, the last ten minutes'.
//
// AN ANSWER: a daemon answers each act it receives once, a moment later (1.5-5 s, so a room of boards does not answer
// all at once), with the act's reply. An answer is never answered, a word is read, and our own are not answered.
#include "broadcast.h"
#include "app.h"
#include "lora.h"
#include "meet.h"
#include "leds.h"
#include "watch.h"
#include "../../common/acts.h"
#include <deque>

static const int RECENT_N = 10, SEEN_N = 64, BLE_TEXT = 43;
struct Cast { uint32_t from = 0; uint16_t id = 0; uint8_t kind = 0, via = 0; int species = 0; String name, body;
              uint32_t rFrom = 0; uint16_t rId = 0; uint32_t at = 0; bool mine = false; };
static Cast recent[RECENT_N]; static int recentN = 0;     // newest last
static std::deque<uint64_t> seen;                          // FROM<<16 | ID
static std::deque<String> reports;                         // for the companion
static uint16_t ourId = 0;
struct Due { uint64_t key; String act; uint32_t at; };
static std::deque<Due> answers;

// The sender's tag: the meeting tag when MEET OTHERS NEARBY is on (LoRa frames carry only that one); otherwise a tag
// of its own, as random and as hourly, so Bluetooth and the companion still carry a broadcast
static uint32_t castTag() {
  if (uint32_t t = meetTag()) return t;
  static uint32_t own = 0, at = 0;
  if (!own || millis() - at > 3600000) { do own = esp_random(); while (!own); at = millis(); }
  return own;
}
static uint64_t keyOf(uint32_t from, uint16_t id) { return ((uint64_t)from << 16) | id; }
static String hex8(uint32_t v) { char b[9]; snprintf(b, sizeof b, "%08lx", (unsigned long)v); return b; }
static String idHex(uint32_t from, uint16_t id) { char b[13]; snprintf(b, sizeof b, "%08lx%04x", (unsigned long)from, id); return b; }
static const Act *actOf(const String &code) { for (int i = 0; i < ACT_N; i++) if (code == ACTS[i].code) return &ACTS[i]; return nullptr; }

static Cast *find(uint64_t key) {
  for (int i = 0; i < recentN; i++) if (keyOf(recent[i].from, recent[i].id) == key) return &recent[i];
  return nullptr;
}
static bool seenBefore(uint64_t key) { for (auto k : seen) if (k == key) return true; return false; }
static void markSeen(uint64_t key) { seen.push_back(key); if ((int)seen.size() > SEEN_N) seen.pop_front(); }
static void keep(const Cast &c) {
  if (recentN == RECENT_N) { for (int i = 1; i < RECENT_N; i++) recent[i - 1] = recent[i]; recentN--; }
  recent[recentN++] = c;
}

// In words, as the companion says it (server/src/broadcast.ts castLine): "STARR bows", "ARCHIVER bows in return".
static String line(const Cast &c) {
  if (c.kind == CAST_SAY) return c.name + ": " + c.body;
  const Act *a = actOf(c.body);
  if (c.kind == CAST_REPLY) return c.name + " " + (a ? a->reply : c.body.c_str());
  return c.name + " " + (a ? a->seen : c.body.c_str());
}
String castLast() { return recentN ? line(recent[recentN - 1]) : ""; }
String castStatus() {
  String s = "CASTS " + String(recentN) + " tag " + hex8(castTag());
  for (int i = 0; i < recentN; i++) {
    const Cast &c = recent[i];
    s += String(" | ") + idHex(c.from, c.id) + (c.mine ? " ours " : " ") + line(c) + " [" + (c.via & VIA_LORA ? "L" : "") +
         (c.via & VIA_BLE ? "B" : "") + (c.via & VIA_NET ? "N" : "") + "]";
  }
  return s;
}

static const char *kindWord(uint8_t k) { return k == CAST_SAY ? "say" : k == CAST_ACT ? "act" : "reply"; }
static void report(const Cast &c, bool out, uint8_t via) {
  JsonDocument d;
  d["id"] = idHex(c.from, c.id); d["kind"] = kindWord(c.kind); d["name"] = c.name; d["species"] = c.species;
  if (c.kind == CAST_SAY) d["text"] = c.body; else d["act"] = c.body;
  if (c.kind == CAST_REPLY) d["replyTo"] = idHex(c.rFrom, c.rId);
  d["dir"] = out ? "out" : "in";
  d["via"] = via == VIA_LORA ? "lora" : via == VIA_BLE ? "ble" : "net";
  String s; serializeJson(d, s);
  if (reports.size() < 12) reports.push_back(s);
}
bool castTakeReport(String &json) { if (reports.empty()) return false; json = reports.front(); reports.pop_front(); return true; }

// ---- Bluetooth's pieces -----------------------------------------------------------------------------------------------
static void sendPieces(const Cast &c) {
  uint8_t msg[56]; int n = 0;
  msg[n++] = c.species >> 8; msg[n++] = c.species;
  String name = c.name.substring(0, 10);
  msg[n++] = name.length(); for (char ch : name) msg[n++] = ch;
  if (c.kind == CAST_REPLY) {
    msg[n++] = c.rFrom >> 24; msg[n++] = c.rFrom >> 16; msg[n++] = c.rFrom >> 8; msg[n++] = c.rFrom;
    msg[n++] = c.rId >> 8; msg[n++] = c.rId;
  }
  String body = c.body.substring(0, c.kind == CAST_SAY ? BLE_TEXT : 8);
  for (char ch : body) if (n < 56) msg[n++] = ch;
  int count = (n + 6) / 7;
  uint8_t pieces[8][16];
  for (int p = 0; p < count; p++) {
    uint8_t *b = pieces[p];
    b[0] = 0xDA; b[1] = 0xE1; b[2] = (c.kind << 6) | ((count - 1) << 3) | p;
    b[3] = c.from >> 24; b[4] = c.from >> 16; b[5] = c.from >> 8; b[6] = c.from; b[7] = c.id >> 8; b[8] = c.id;
    for (int i = 0; i < 7; i++) { int k = p * 7 + i; b[9 + i] = k < n ? msg[k] : 0; }
  }
  meetCastSend(pieces, count, 12000);
}

struct Gathering { uint64_t key; uint8_t kind, count, got; uint8_t msg[56]; uint32_t at; };
static Gathering gathering[6]; static int gatheringN = 0;
static void takePiece(const uint8_t *b) {
  if (b[0] != 0xDA || b[1] != 0xE1) return;
  uint8_t kind = b[2] >> 6, count = ((b[2] >> 3) & 7) + 1, part = b[2] & 7;
  if (!kind || part >= count) return;
  uint32_t from = ((uint32_t)b[3] << 24) | ((uint32_t)b[4] << 16) | ((uint32_t)b[5] << 8) | b[6];
  uint16_t id = (b[7] << 8) | b[8];
  uint64_t key = keyOf(from, id);
  if (seenBefore(key)) { if (Cast *c = find(key)) c->via |= VIA_BLE; return; }
  uint32_t now = millis();
  Gathering *g = nullptr;
  for (int i = 0; i < gatheringN; i++) if (gathering[i].key == key) g = &gathering[i];
  if (!g) {
    int slot = gatheringN < 6 ? gatheringN++ : 0;
    for (int i = 0; i < gatheringN; i++) if (gathering[i].at < gathering[slot].at) slot = i;   // the oldest gives way
    g = &gathering[slot]; *g = Gathering{}; g->key = key; g->kind = kind; g->count = count;
  }
  g->at = now;
  memcpy(g->msg + part * 7, b + 9, 7); g->got |= 1 << part;
  if (g->got != (1 << g->count) - 1) return;
  // whole: read it
  const uint8_t *m = g->msg; int n = 0, len = g->count * 7;
  int species = (m[0] << 8) | m[1]; n = 2;
  int nl = min((int)m[n++], 10); String name; for (int i = 0; i < nl && n < len; i++) name += (char)m[n++];
  uint32_t rFrom = 0; uint16_t rId = 0;
  if (kind == CAST_REPLY && n + 6 <= len) {
    rFrom = ((uint32_t)m[n] << 24) | ((uint32_t)m[n + 1] << 16) | ((uint32_t)m[n + 2] << 8) | m[n + 3]; rId = (m[n + 4] << 8) | m[n + 5]; n += 6;
  }
  String body; while (n < len && m[n]) { if (m[n] >= 32 && m[n] < 127) body += (char)m[n]; n++; }
  g->key = 0; g->at = 0;                                  // the slot is free again
  castIn(from, id, kind, species, name, body, rFrom, rId, VIA_BLE);
}

// ---- in and out -------------------------------------------------------------------------------------------------------
void castIn(uint32_t from, uint16_t id, uint8_t kind, int species, const String &name, const String &body,
            uint32_t rFrom, uint16_t rId, uint8_t via) {
  if (!from || kind < CAST_SAY || kind > CAST_REPLY || !body.length()) return;
  uint64_t key = keyOf(from, id);
  if (seenBefore(key)) {                                  // seen: only the new way it came
    Cast *c = find(key);
    if (c && !(c->via & via)) { c->via |= via; if (via != VIA_NET && !c->mine) report(*c, false, via); }
    return;
  }
  markSeen(key);
  Cast c; c.from = from; c.id = id; c.kind = kind; c.species = species; c.name = name.length() ? name : String("A DAEMON");
  c.body = body; c.rFrom = rFrom; c.rId = rId; c.via = via; c.at = millis();
  c.mine = from == castTag();
  keep(c);
  if (via != VIA_NET) report(c, false, via);              // the companion learns of it (it has it already when it came from there)
  if (c.mine) return;
  // shown: a flash and the words -- never a sound, and never on a sleeping board (it must never pester)
  if (!asleep) {
    ledsFlash();
    if (kind == CAST_SAY) loraPretendHeard(c.name, c.body);   // a keyboard board keeps the word until it is read (C-123)
    say(line(c));
  }
  dirty = true;
  // an act is answered, once, a moment later -- by the daemon this board hosts
  if (kind == CAST_ACT && st.carrying && answers.size() < 4) answers.push_back({ key, body, millis() + 1500 + esp_random() % 3500 });
}

bool castSend(uint8_t kind, const String &body, uint32_t rFrom, uint16_t rId) {
  uint32_t me = castTag();
  if (!st.carrying || !body.length()) return false;
  if (!ourId) ourId = esp_random();
  uint16_t id = ++ourId;
  Cast c; c.from = me; c.id = id; c.kind = kind; c.species = st.daemon.species; c.name = upper(st.daemon.nickname.length() ? st.daemon.nickname : st.daemon.name).substring(0, 10);
  c.body = body; c.rFrom = rFrom; c.rId = rId; c.at = millis(); c.mine = true; c.via = 0;
  markSeen(keyOf(me, id));
  keep(c);
  String air = kind == CAST_REPLY ? idHex(rFrom, rId) + " " + body : body;
  if (loraCast(kind == CAST_SAY ? 3 : kind == CAST_ACT ? 5 : 6, id, air)) recent[recentN - 1].via |= VIA_LORA;
  sendPieces(c); recent[recentN - 1].via |= VIA_BLE;
  report(c, true, VIA_NET); recent[recentN - 1].via |= VIA_NET;
  dirty = true;
  return true;
}

void castLoop(uint32_t now) {
  uint8_t b[16];
  for (int i = 0; i < 8 && meetCastTake(b); i++) takePiece(b);
  for (int i = 0; i < gatheringN; i++) if (gathering[i].key && now - gathering[i].at > 30000) gathering[i].key = 0;   // a piece never came
  if (!answers.empty() && (int32_t)(now - answers.front().at) >= 0) {
    Due d = answers.front(); answers.pop_front();
    castSend(CAST_REPLY, d.act, (uint32_t)(d.key >> 16), (uint16_t)d.key);
  }
}

void castFromState(JsonArrayConst casts) {
  for (JsonObjectConst c : casts) {
    String id = c["id"] | "";
    if (id.length() != 12) continue;
    String k = c["k"] | "";
    uint8_t kind = k == "say" ? CAST_SAY : k == "act" ? CAST_ACT : k == "reply" ? CAST_REPLY : 0;
    String r = c["r"] | "";
    castIn(strtoul(id.substring(0, 8).c_str(), nullptr, 16), strtoul(id.substring(8).c_str(), nullptr, 16), kind,
           c["s"] | 0, c["n"] | "", kind == CAST_SAY ? String(c["t"] | "") : String(c["a"] | ""),
           r.length() == 12 ? strtoul(r.substring(0, 8).c_str(), nullptr, 16) : 0,
           r.length() == 12 ? (uint16_t)strtoul(r.substring(8).c_str(), nullptr, 16) : 0, VIA_NET);
  }
}

// ---- the routines ------------------------------------------------------------------------------------------------------
// Every board's controls, read inside a routine (the loop -- and so the usual readers -- wait while it runs): a step
// (+1, -1) and a press (1) or back (-1). The dial or the trackball; the M5GO's and the Pro's A and C (held A: back); a
// two-button board's side (a tap turns, held goes back); the touch screen (a swipe turns, a tap presses, a hold goes
// back); and the press, held half a second, goes back.
void routineInput(int &step, int &ev) {
  readDeck();
  step = dialStep(); ev = 0;
  int g = watchGesture();
  if (g == 1 || g == -1) step = g; else if (g == 2) ev = 1; else if (g == -2) ev = -1;
  static bool l = false, r = false, s = false, f = false; static uint32_t lAt = 0, sAt = 0, fAt = 0;
  uint32_t now = millis();
  if (board.threeKeys()) {
    bool L = !digitalRead(board.keyLeft), R = !digitalRead(board.keyRight);
    if (L && !l) lAt = now;
    if (!L && l && now - lAt > 30) { if (now - lAt >= 500) ev = -1; else step = -1; }
    if (!R && r) step = 1;
    l = L; r = R;
  }
  if (board.hasSideKey()) {
    bool S = !digitalRead(board.sideKey);
    if (S && !s) sAt = now;
    if (!S && s && now - sAt > 30) { if (board.noDial() && now - sAt < 500) step = 1; else ev = -1; }
    s = S;
  }
  if (board.encKey >= 0) {
    bool F = !digitalRead(board.encKey);
    if (F && !f) fAt = now;
    if (!F && f && now - fAt > 30) ev = now - fAt >= 500 ? -1 : 1;
    f = F;
  }
}

enum { R_ACTS, R_TYPE };
static int rMode = R_ACTS, rAt = 0, rTop = 0; static String rTyped, rWhat;
static int rowsAll() { return ACT_N + (board.keyboard ? 1 : 0); }
static String rowName(int i) {
  if (board.keyboard) { if (i == 0) return "TYPE A WORD"; i--; }    // DRAFT
  return ACTS[i].label;
}
extern void listRow(int i, int at, const String &text, uint16_t day, uint16_t ink, int width);

static String drawToEveryone(uint16_t day, uint16_t ink) {
  canvas.setTextFont(2); canvas.setTextColor(day); canvas.setTextDatum(TL_DATUM);
  canvas.drawString(upper(daemonName()) + ", TO EVERY DAEMON", 10, 32);   // DRAFT
  if (rMode == R_TYPE) {
    wrap(rTyped + "_", 12, 58, W - 24, 2, 18, 4, PAPER);
    return "enter: send    backspace: delete";                                // DRAFT
  }
  int fit = max(1, (H - 70) / 19);
  if (rAt < rTop) rTop = rAt; if (rAt >= rTop + fit) rTop = rAt - fit + 1;
  for (int i = rTop; i < rowsAll() && i < rTop + fit; i++) listRow(i - rTop, rAt - rTop, rowName(i), day, ink, W - 12);
  if (rWhat.length()) { canvas.setTextFont(1); canvas.setTextColor(day); canvas.setTextDatum(BL_DATUM); canvas.drawString(rWhat, 10, H - 18); }
  return "turn: choose    press: send it    top button: back";             // DRAFT
}

String runToEveryone() {
  if (!st.carrying) return "Routines are a daemon's: send one to the board from the game first.";   // DRAFT
  rMode = R_ACTS; rAt = 0; rTop = 0; rTyped = ""; rWhat = castLast();
  runPanel = drawToEveryone; progress("");
  String result; int sent = 0; uint32_t shown = 0;
  while (true) {
    int step, ev; routineInput(step, ev);
    int ch = deckTakeKey();
    if (rMode == R_TYPE) {
      if (ch == 13 || ch == 10) { if (rTyped.length() && castSend(CAST_SAY, rTyped)) { sent++; result = daemonName() + " said it to every daemon: " + rTyped; } rMode = R_ACTS; rTyped = ""; }
      else if (ch == 8) { if (rTyped.length()) rTyped.remove(rTyped.length() - 1); else rMode = R_ACTS; }
      else if (ch >= 32 && ch < 127 && rTyped.length() < 80) rTyped += (char)ch;
      if (ev == -1) rMode = R_ACTS;
      if (ch || ev) progress("");
    } else {
      if (ch == 13 || ch == 10) ev = 1; else if (ch == 8) ev = -1;
      else if (ch == 0x11 || ch == 0x13 || ch == ';' || ch == ',') step = -1;   // C-136: the arrows, and ; , . / with no ball
      else if (ch == 0x12 || ch == 0x14 || ch == '.' || ch == '/') step = 1;
      if (step) { rAt = (rAt + rowsAll() + step) % rowsAll(); progress(""); }
      if (ev == -1) break;
      if (ev == 1) {
        int i = rAt;
        if (board.keyboard && i == 0) rMode = R_TYPE;
        else {
          const Act &a = ACTS[board.keyboard ? i - 1 : i];
          if (castSend(CAST_ACT, a.code)) { sent++; result = daemonName() + " " + a.seen + " -- every daemon nearby and linked will see it."; rWhat = upper(daemonName()) + " " + a.seen; }   // DRAFT
        }
        progress("");
      }
    }
    if (millis() - shown > 1000) { shown = millis(); String w = castLast(); if (w != rWhat && sent) { rWhat = w; progress(""); } }
    castLoop(millis()); meetCastLoop(millis()); ledsLoop();
    delay(5);
  }
  runPanel = nullptr; lastInput = millis();
  return result.length() ? result : daemonName() + " sent nothing.";   // DRAFT
}

static String drawWhatCame(uint16_t day, uint16_t ink) {
  canvas.setTextFont(2); canvas.setTextColor(day); canvas.setTextDatum(TL_DATUM);
  canvas.drawString("WHAT CAME", 10, 32);                                // DRAFT
  if (!recentN) { wrap("Nothing yet. A broadcast from any daemon -- over LoRa, Bluetooth or the companion -- shows here.", 12, 58, W - 24, 2, 18, 4, QUIET); return "top button: back"; }
  int fit = max(1, (H - 70) / 19);
  int first = max(0, recentN - fit - rTop);
  for (int i = recentN - 1, row = 0; i >= first && row < fit; i--, row++) {
    const Cast &c = recent[i];
    String via = String(c.via & VIA_LORA ? "L" : "") + (c.via & VIA_BLE ? "B" : "") + (c.via & VIA_NET ? "N" : "");
    String s = line(c) + "  " + via;
    canvas.setTextFont(2); canvas.setTextColor(c.mine ? QUIET : PAPER); canvas.setTextDatum(TL_DATUM);
    canvas.drawString(s, 12, 52 + row * 19);
  }
  return "L LoRa  B Bluetooth  N the companion    top button: back";    // DRAFT
}

String runWhatCame() {
  rTop = 0;
  runPanel = drawWhatCame; progress("");
  uint32_t shown = 0; int was = recentN;
  while (true) {
    int step, ev; routineInput(step, ev);
    int ch = deckTakeKey(); if (ch == 8) ev = -1;
    if (ev == -1 || ev == 1) break;
    if (millis() - shown > 1000 || recentN != was) { shown = millis(); was = recentN; progress(""); }
    castLoop(millis()); meetCastLoop(millis()); ledsLoop();
    delay(5);
  }
  runPanel = nullptr; lastInput = millis();
  return "";
}
