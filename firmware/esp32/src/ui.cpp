// The screens (C-67: from main.cpp). Drawn whole into the sprite, then pushed.
#include <WiFi.h>
#include "app.h"
#include "lora.h"
#include "talk.h"
#include "radios.h"
#include "link.h"
#include "sound.h"
#include "leds.h"
#include "expression.h"

// C-74: the footers name the dial and the top button; on a board with two buttons and no dial (the StickS3) they name
// its buttons instead -- the side one turns (a tap) and goes back (held), the front one presses.
static String hint(String s) {
  if (board.kind == BoardKind::TDisplayPro) {   // C-105: the touch screen first -- its three buttons do the same (DRAFT)
    s.replace("top button: back", "hold: back"); s.replace("top button: stop", "touch: stop");
    s.replace("top button: undo", "hold: undo"); s.replace("top: delete", "hold: delete");
    s.replace("hold the dial", "hold the lower right button"); s.replace("turn:", "swipe:"); s.replace("press:", "tap:");
    return s;
  }
  if (board.threeKeys()) {                    // C-75: the M5GO and Fire -- A and C turn, B presses, held A goes back
    s.replace("top button: back", "hold A: back"); s.replace("top button: stop", "A: stop");
    s.replace("top button: undo", "hold A: undo"); s.replace("top: delete", "hold A: delete");
    s.replace("hold the dial", "hold B"); s.replace("turn:", "A/C:"); s.replace("press:", "B:");
    return s;
  }
  if (board.kind == BoardKind::Cardputer || board.kind == BoardKind::CardputerAdv) {   // C-136: keys only, no ball (DRAFT)
    s.replace("top button: back", "del: back"); s.replace("top button: stop", "del: stop");
    s.replace("top button: undo", "del: undo"); s.replace("top: delete", "del: delete");
    s.replace("turn:", "; .:"); s.replace("press:", "enter:"); s.replace("hold the dial", "hold G0");
    return s;
  }
  if (board.keyboard) {                      // C-104: the T-Deck -- the ball rolls and clicks; Enter and Backspace too
    s.replace("top button: back", "backspace: back"); s.replace("top button: stop", "backspace: stop");
    s.replace("top button: undo", "backspace: undo"); s.replace("top: delete", "backspace: delete");
    s.replace("turn:", "roll:"); s.replace("press:", "click:"); s.replace("hold the dial", "hold the ball");
    return s;
  }
  // C-160 (the user, 2026-10-18: "the regular t-embed that top button is reset or power, so on that device we do not have a
  // back... hold front button to go back, tap front button to select"): the plain T-Embed and the SI4732 have the dial
  // alone -- held half a second it goes back (input.cpp, readKeyAlone), and their screens say so
  if (!board.hasSideKey() && board.encA >= 0 && !board.touch && !board.keyboard) {
    s.replace("top button: back", "hold: back"); s.replace("top button: stop", "hold: stop");
    s.replace("top button: undo", "hold: undo"); s.replace("top: delete", "hold: delete");
    return s;
  }
  if (!board.noDial()) return s;
  s.replace("top button: back", "hold side: back"); s.replace("top button: stop", "side: stop");
  s.replace("top button: undo", "hold side: undo"); s.replace("top: delete", "hold side: delete");
  s.replace("hold the dial", "hold front"); s.replace("turn:", "side:"); s.replace("press:", "front:");
  return s;
}

static const char *CARE_ITEMS[] = { "DRINK", "FEED", "TRAIN", "SLEEP", "ITS INDEX ENTRY" };   // C-114: SLEEP; C-117: DRINK first, as the buttons (input.cpp CARE_ORDER), DRAFT
// ("\x01" "abc...", two literals: "\x01abcdef" in one is a single hex escape that eats a-f -- seen with SHOT)
const char WHEEL[] = "\x01" "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 !@#$%^&*()-_=+.,?/:;'\"<>[]{}|\\~`";
const int WHEEL_N = sizeof(WHEEL) - 1;
Page page = TODAY;
Screen screen = HOME;
int careAt = 0, remoteAt = 0, typeAt = 0, routineAt = 0, partyAt = 0, moveAt = 0;
uint32_t hopUntil = 0;
bool pickRemoteNext = false, joinNext = false;
String nets[12]; int netRssi[12], netCount = 0, netAt = 0, wheelAt = 1; String typed;
String runResult;
String flash; uint32_t flashUntil = 0;

// ---- colours: the day's colour, and words that can be read on it ------------------------------------------------
uint16_t hex565(const String &h) {
  long v = strtol(h.c_str() + 1, nullptr, 16);
  return tft.color565((v >> 16) & 255, (v >> 8) & 255, v & 255);
}
// the user, 2026-10-18 ("the dark text on the black is hard to read, like it is hard to see bet"): the day's colour as
// TEXT on the dark ground, lifted toward white when it is dark itself -- a Sunday's deep red, a Friday's indigo
uint16_t readable(uint16_t c) {
  int r = ((c >> 11) & 31) * 255 / 31, g = ((c >> 5) & 63) * 255 / 63, b = (c & 31) * 255 / 31;
  float lum = (0.2126f * r + 0.7152f * g + 0.0722f * b) / 255.0f;
  if (lum >= 0.45f) return c;
  float t = min(0.75f, (0.45f - lum) / 0.45f + 0.3f);     // the darker, the more white mixed in
  return tft.color565(r + (255 - r) * t, g + (255 - g) * t, b + (255 - b) * t);
}
bool lightColour(const String &h) {           // as the app decides (App.tsx onColour)
  long v = strtol(h.c_str() + 1, nullptr, 16);
  auto lin = [](double c) { c /= 255.0; return c <= 0.03928 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * lin((v >> 16) & 255) + 0.7152 * lin((v >> 8) & 255) + 0.0722 * lin(v & 255) > 0.3;
}

// C-113: mirrored, it faces right (the game's face left). C-119: in its expression -- shaded, its eyes as it feels
void drawArt(int x, int y, int scale, bool mirrored = false) { drawSprite(x, y, scale, mirrored); }

// C-118 (the user, 2026-10-12: "for hurrying people there should be a more intuitive approach"): the M5GO and the Fire
// have their three buttons under the screen, so what each does is written right above it, large. By day DRINK, FEED,
// TRAIN; at bedtime (it is drowsy, not yet put to bed) the right one becomes SLEEP, lit; asleep, one bar: any button
// wakes it.
bool keysUnder() { return board.kind == BoardKind::M5Core && st.carrying; }
// what each of the three does at home, as it is now -- asleep, any of them wakes it. C-149: at home CARE, ROUTINES and
// INDEX; in CARE the three cares; in the INDEX entry READ, MORE and HOME
static const char *keyWord(int k) {
  bool bed = st.daemon.tired == "drowsy";
  if (screen == CARE_KEYS) return k == 0 ? "DRINK" : k == 1 ? "FEED" : bed ? "SLEEP" : "TRAIN";   // DRAFT
  if (screen == INDEX_ENTRY) return k == 0 ? (talkCan() ? "READ" : "-") : k == 1 ? "MORE" : "HOME";   // DRAFT
  if (st.daemon.tired == "asleep") return "WAKE";                               // DRAFT
  return k == 0 ? "CARE" : k == 1 ? "ROUTINES" : "INDEX";                       // DRAFT
}
// C-121: a button held is drawn pressed -- filled white, its word dark -- the moment it goes down, before it does anything
static void keyLabels(uint16_t day, uint16_t ink) {
  bool sleeping = st.daemon.tired == "asleep" && screen == HOME, bed = st.daemon.tired == "drowsy";
  canvas.setTextFont(2); canvas.setTextDatum(MC_DATUM);
  if (sleeping) {
    canvas.fillRoundRect(4, H - 24, W - 8, 22, 5, keysHeld ? PAPER : day);
    canvas.setTextColor(keysHeld ? INK : ink); canvas.drawString(keyWord(0), W / 2, H - 13);
    return;
  }
  int bw = W / 3;
  for (int k = 0; k < 3; k++) {
    bool held = keysHeld & (1 << k), lit = bed && (screen == CARE_KEYS ? k == 2 : screen == HOME && k == 0);   // bedtime: CARE, then SLEEP
    int bx = k * bw + 4;
    if (held || lit) canvas.fillRoundRect(bx, H - 24, bw - 8, 22, 5, held ? PAPER : day);
    else canvas.drawRoundRect(bx, H - 24, bw - 8, 22, 5, QUIET);
    canvas.setTextColor(held ? INK : lit ? ink : PAPER);   // the day's ink is white on a dark day: never on white
    canvas.drawString(keyWord(k), bx + (bw - 8) / 2, H - 13);
  }
}

// ---- drawing --------------------------------------------------------------------------------------------------------
int wrap(const String &text, int x, int y, int w, int font, int lineH, int maxLines, uint16_t colour, int skip) {
  canvas.setTextFont(font); canvas.setTextColor(colour); canvas.setTextDatum(TL_DATUM);
  String line, word; int lines = 0;
  auto flush = [&]() { if (lines >= skip && lines - skip < maxLines) canvas.drawString(line, x, y + (lines - skip) * lineH); lines++; line = ""; };
  for (unsigned i = 0; i <= text.length(); i++) {
    char c = i < text.length() ? text[i] : ' ';
    if (c == '\n') {                         // a line of its own: finish the word and the line
      if (word.length()) { line = line.length() ? line + " " + word : word; word = ""; }
      flush();
      continue;
    }
    if (c != ' ') { word += c; continue; }
    if (!word.length()) continue;
    String tryLine = line.length() ? line + " " + word : word;
    if (canvas.textWidth(tryLine) > w && line.length()) { flush(); line = word; } else line = tryLine;
    word = "";
  }
  if (line.length()) flush();
  return lines;
}

String upper(String s) { s.toUpperCase(); return s; }

// C-102: the footer. On the Dial's round screen it is centred, and its parts are dropped from the end until it fits
// the circle's width down there; a single button says hold, not "top button".
static void footer(String s) {
  canvas.setTextFont(1); canvas.setTextDatum(board.round ? BC_DATUM : BL_DATUM);
  if (board.round) {
    s.replace("top button: back", "hold: back"); s.replace("top button: stop", "hold: stop"); s.replace("hold the dial", "hold");
    s.replace("running...    ", "");                         // the circle is narrow down there: what to do, not that it runs
    while (canvas.textWidth(s) > 130 && s.lastIndexOf("    ") > 0) s = s.substring(0, s.lastIndexOf("    "));
    canvas.drawString(s, W / 2, H - 2);
  } else {
    // a narrow screen (the StickS3's 240): its gaps squeezed before it runs off the edge (the bench, 2026-10-17)
    while (canvas.textWidth(s) > W - 14 && s.indexOf("    ") >= 0) s.replace("    ", "  ");
    if (canvas.textWidth(s) > W - 14) { s.replace("hold side: ", "hold: "); s.replace("top button: ", "top: "); }
    canvas.drawString(s, 10, H - 4);
  }
  canvas.setTextDatum(TL_DATUM);
}

const char *linkName() {
  if (millis() - usbSeen < USB_FRESH_MS && usbSeen) return "USB";
  if (phoneSeen && linkPhoneHere()) return "PHONE";   // C-55, C-57
  if (!wifiSet()) return "NO LINK";
  if (WiFi.status() == WL_CONNECTED && viaRelay()) return "AWAY";   // C-82: on its own Wi-Fi, through the relay
  return WiFi.status() == WL_CONNECTED ? "WIFI" : "WIFI...";
}

// The ROUTINES screens: a list with the day's colour behind the chosen row (TYPES, LIST), or what a routine found
// (RUN). Turn to choose, press to open or run, the top button to go back.
// How many list rows a screen holds clear of its footer: five, or three on the StickS3's 135 (the bench, 2026-10-17:
// its fourth and fifth ran into the footer)
// C-161 (the user, 2026-10-18): on the watch a row is a finger's height, about four to the screen, and a tap on one
// opens it -- each row drawn is kept, how far it lies from the chosen one, for watch.cpp's touch to find
static int rowH() { return board.kind == BoardKind::TWatchS3 ? 42 : 19; }
static int tapN = 0; static int16_t tapTop[8], tapOff[8];
bool tapRowAt(int y, int &off) {
  for (int k = 0; k < tapN; k++) if (y >= tapTop[k] && y < tapTop[k] + rowH()) { off = tapOff[k]; return true; }
  return false;
}
int listRowsFit() { return max(2, min(5, (H - 52 - 16) / rowH())); }
void listRow(int i, int at, const String &text, uint16_t day, uint16_t ink, int width = W - 12) {
  int y = 52 + i * rowH();
  if (i == at) canvas.fillRect(6, y - 2, width, rowH() - 1, day);
  canvas.setTextFont(2); canvas.setTextDatum(TL_DATUM);
  canvas.setTextColor(i == at ? ink : PAPER);
  canvas.drawString(text, 12, y + (rowH() - 19) / 2);
  if (tapN < 8) { tapTop[tapN] = y - 2; tapOff[tapN] = i - at; tapN++; }
}

String (*runPanel)(uint16_t day, uint16_t ink) = nullptr;
static String panelHint;

void drawRoutines(uint16_t day) {
  uint16_t ink = lightColour(st.menu) ? INK : PAPER;
  const RoutineType &t = types[typeAt];
  canvas.setTextFont(2); canvas.setTextColor(readable(day)); canvas.setTextDatum(TL_DATUM);
  if (screen == PARTY) {                     // C-68: GAME ROUTINES -- the party, five rows at a time
    canvas.drawString("WHOSE ROUTINE?", 10, 32);                                  // DRAFT
    int rows = partyRows(), cur = partyRowOf(partyAt), fit = listRowsFit(), from = max(0, cur - (fit - 1));   // the RADIOS first on a party-first board
    if (!st.partyN) wrap("The party is empty, or the save is not read yet.", 12, partyFirst() ? 80 : 58, W - 24, 2, 18, 3, QUIET);
    for (int r = from; r < rows && r < from + fit; r++) {
      int i = partyAtRow(r);
      if (i < st.partyN) {
        const Member &m = st.party[i];
        listRow(r - from, cur - from, m.name + "  Lv" + m.level + "  " + m.types, day, ink);
      } else listRow(r - from, cur - from, "CASINO AND RADIOS", day, ink);   // C-149: the CASINO is behind it too; DRAFT
    }
  } else if (screen == MOVES) {
    const Member &m = st.party[partyAt];
    canvas.drawString(m.name + "'S ROUTINES", 10, 32);                            // DRAFT
    for (int i = 0; i < m.n; i++) {
      listRow(i, moveAt, m.routine[i], day, ink, W - 12);
      uint32_t c = m.colour[i];                                                   // its streak's colour, and its type
      canvas.fillRoundRect(W - 112, 52 + i * 19, 10, 14, 2, canvas.color565(c >> 16, (c >> 8) & 255, c & 255));
      canvas.setTextColor(i == moveAt ? ink : QUIET); canvas.drawString(m.type[i], W - 96, 52 + i * 19);
    }
  } else if (screen == TYPES) {
    canvas.drawString("ROUTINE TYPE", 10, 32);
    int fit = listRowsFit(), from = max(0, typeAt - (fit - 1));   // the CC1101 has six types: as many rows as fit
    for (int i = from; i < typeCount && i < from + fit; i++)
      listRow(i - from, typeAt - from, String(types[i].name) + "  (" + types[i].radio + ")", day, ink);
  } else if (screen == LIST) {
    canvas.drawString(String(t.name) + "  (" + t.radio + ")", 10, 32);
    if (t.count == 0) {
      wrap("No routines yet.", 12, 58, W - 24, 4, 27, 1, PAPER);
      wrap("They arrive as each radio is wired and tried on the board.", 12, 92, W - 24, 2, 18, 3, QUIET);
    } else {
      int fit = listRowsFit(), from = max(0, routineAt - (fit - 1));   // rows clear of the footer; the list scrolls past them
      for (int i = from; i < t.count && i < from + fit; i++) listRow(i - from, routineAt - from, t.routines[i].name, day, ink);
    }
  } else if (screen == PICK_REMOTE) {
    canvas.drawString("WHICH REMOTE " + upper(daemonName()) + " USES", 10, 32);
    int n = flareCount(), a = flareActive();
    int fit = listRowsFit(), from = max(0, remoteAt - (fit - 1));   // C-161: up to six remotes, as many rows as fit
    for (int i = from; i < n && i < from + fit; i++) listRow(i - from, remoteAt - from, (i == a ? "* " : "  ") + flareName(i), day, ink);
  } else if (screen == PICK_NET) {
    canvas.drawString("WHICH NETWORK SHOULD " + upper(daemonName()) + " LEARN?", 10, 32);
    int fit = listRowsFit(), from = max(0, netAt - (fit - 1));   // rows clear of the footer
    for (int i = from; i < netCount && i < from + fit; i++)
      listRow(i - from, netAt - from, nets[i] + "  " + String(netRssi[i]) + " dBm", day, ink);
  } else if (screen == COMPOSE) {             // C-123: a message to everyone nearby, typed on the keyboard
    canvas.drawString(W >= 300 ? "A WORD TO EVERY DAEMON" : "TO EVERY DAEMON", 10, 32);   // C-134: every way, DRAFT
    wrap(composing + "_", 10, 56, W - 20, 2, 18, 5, PAPER);
    canvas.setTextColor(QUIET); canvas.setTextDatum(TL_DATUM);
    canvas.drawString(String(80 - (int)composing.length()) + " letters left   from " + daemonName(), 10, H - 34);   // DRAFT
  } else if (screen == TYPE_PASS) {
    canvas.drawString("TEACH " + upper(daemonName()) + "  " + nets[netAt], 10, 32);
    canvas.setTextColor(QUIET); canvas.drawString("PASSWORD", 10, 52);
    String shown = typed.length() > 34 ? "..." + typed.substring(typed.length() - 31) : typed;
    canvas.setTextColor(PAPER); canvas.drawString(shown + "_", 10, 68);
    for (int k = -4; k <= 4; k++) {           // the wheel: the letter chosen in the middle, its neighbours either side
      int at = (wheelAt + k + WHEEL_N) % WHEEL_N;
      String ch = at == 0 ? "OK" : String(WHEEL[at]) == " " ? "SPC" : String(WHEEL[at]);
      int x = W / 2 + k * 32;
      if (k == 0) {
        canvas.fillRoundRect(x - 22, 98, 44, 36, 4, day);
        canvas.setTextFont(4); canvas.setTextColor(ink); canvas.setTextDatum(MC_DATUM); canvas.drawString(ch, x, 117);
      } else {
        canvas.setTextFont(2); canvas.setTextColor(QUIET); canvas.setTextDatum(MC_DATUM); canvas.drawString(ch, x, 117);
      }
    }
    canvas.setTextDatum(TL_DATUM);
  } else if (runPanel && routineRunning) {   // C-101: a routine that draws its own screen (the radio's)
    panelHint = runPanel(day, ink);
  } else {   // RUN
    canvas.drawString(String(t.name) + " / " + t.routines[routineAt].name, 10, 32);
    wrap(runResult, 12, 54, W - 24, 2, 17, 6, PAPER);
  }
  canvas.setTextFont(1); canvas.setTextColor(QUIET); canvas.setTextDatum(BL_DATUM);
  if (runPanel && routineRunning && screen == RUN && panelHint.length()) { footer(hint(panelHint)); return; }
  footer(hint(screen == RUN && routineRunning ? (board.touch ? "running...    touch: stop" : board.hasSideKey() ? "running...    top button: stop"
                                                                       : "running...    hold the dial: stop")   // DRAFT
                    : screen == RUN ? "press: run again    top button: back"
                    : screen == MOVES ? "turn: choose    press: use it    top button: back"   // DRAFT
                    : screen == TYPE_PASS ? "turn: letter  press: add (OK: join)  top: delete"
                    : screen == COMPOSE ? "enter: send    backspace: delete (empty: leave)"   // DRAFT
                    : "turn: choose    press: open    top button: back"));
}

// C-105: a screen wide enough for two columns -- the T-Display-S3 Pro's 480x222. The narrow pages are drawn for 320.
bool wide() { return W >= 400 && !board.round; }
bool faceHasDaemon(); static int faceDaemonY();   // C-162: below
void talkSpot(int &x, int &y) {
  if (wide()) { x = W - 46; y = H - 40; }
  else if (faceHasDaemon()) { x = W / 2; y = faceDaemonY(); }   // C-162: the daemon itself, held
  else { x = W / 2; y = H - 34; }
}

// C-105: the face, wide -- the time large on the left, under it the date and the battery; on the right, beyond a line
// in the day's colour, the day's theme, its virtue over its vice, its chakra and note, and the daemon carried, small.
static void drawFaceWide(uint16_t day, uint16_t ink) {
  const int split = 262;
  canvas.drawFastVLine(split, 40, H - 70, day);
  struct tm t; char hm[6] = "--:--"; bool timed = watchLocalTime(t);
  if (timed) snprintf(hm, sizeof hm, "%02d:%02d", t.tm_hour, t.tm_min);
  canvas.setTextDatum(TL_DATUM);
  canvas.setTextFont(7); canvas.setTextSize(1.5f); canvas.setTextColor(PAPER);
  canvas.drawString(hm, 18, 44);
  canvas.setTextSize(1);
  canvas.setTextFont(2); canvas.setTextColor(QUIET);
  if (timed) {
    static const char *DOW[] = { "SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY" };
    static const char *MON[] = { "JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC" };
    canvas.drawString(String(DOW[t.tm_wday]) + "  " + t.tm_mday + " " + MON[t.tm_mon], 20, 130);
  }
  canvas.setTextFont(1);
  String under;
  long steps = watchSteps();
  if (steps >= 0) under = String(steps) + " STEPS";                                          // DRAFT
  if (bat.present) under += (under.length() ? "    " : "") + String(bat.percent) + "%" + (bat.charging ? " +" : "");
  canvas.drawString(under, 20, 154);
  int x = split + 18, w = W - x - 10;
  canvas.setTextColor(readable(day));
  wrap(upper(st.theme.length() ? st.theme : st.day), x, 40, w, 4, 26, 2, day);
  wrap(upper(st.virtue), x, 96, w, 2, 16, 2, PAPER);
  canvas.setTextFont(2); canvas.setTextColor(QUIET); canvas.setTextDatum(TL_DATUM);
  canvas.drawString(upper(st.chakra) + (st.note.length() ? "  -  " + st.note : ""), x, 132);
  if (st.carrying) {                                           // the daemon you carry, small, in the corner
    drawArt(x, H - 70, 1);
    canvas.setTextFont(2); canvas.setTextColor(PAPER);
    canvas.drawString(st.daemon.nickname, x + 72, H - 56);
    if (st.daemon.word.length()) { canvas.setTextFont(1); canvas.setTextColor(readable(day)); canvas.drawString(st.daemon.word, x + 72, H - 36); }
  }
  if (talkCan()) {
    int cx, cy; talkSpot(cx, cy); bool talking = watchTalking();
    if (talking) canvas.fillCircle(cx, cy, 26, day); else canvas.drawCircle(cx, cy, 26, day);
    canvas.setTextDatum(MC_DATUM); canvas.setTextFont(2); canvas.setTextColor(talking ? ink : day);
    canvas.drawString(talking ? "..." : "TALK", cx, cy);       // DRAFT
  }
  canvas.setTextDatum(TL_DATUM);
}

// C-71: the watch's face -- the time, the day's theme, its virtue over its vice, its chakra and note, today's steps,
// and TALK, held to talk (C-66). The day's colour rings the face.
// C-162 (the user, 2026-10-18: "most will have the daemon in the middle -- maybe some are standard clocks and some
// digital"): the round face is the device's own setting -- DAEMON (the daemon in the middle, the time above it; the
// default), CLOCK (hands over the daemon) or VIRTUE (the day's words, as the watch first had). Held, the daemon talks.
bool faceHasDaemon() { return !wide() && cfg.face != "virtue" && st.carrying; }
int talkReach() { return faceHasDaemon() ? 56 : 30; }
static int faceDaemonY() { return cfg.face == "clock" ? 120 : 130; }   // the middle of the daemon, for TALK

// the daemon on a face, alive as at home (C-42, C-113, C-119): it breathes, now and then hops, and walks a little from
// side to side, facing the way it goes -- in its expression, its eyes and its mark; no den, a shadow under it
static void faceDaemon(int cx, int floorY, int sc, int room, int markTop) {   // markTop: its mark kept under the words
  uint32_t t = millis();
  bool still = expression.still;
  int bob = still ? 0 : (int)roundf(3 * expression.bob * sinf(t / 420.0f));
  int hop = still ? 0 : (t % 7000) < 260 ? -(int)(10 * sinf((t % 7000) / 260.0f * PI)) : 0;
  if (t < hopUntil) hop = -(int)(14 * fabsf(sinf((hopUntil - t) / 160.0f * PI)));   // C-13: glad of it
  float walk = still ? 0.5f : 0.5f + 0.5f * sinf(t / 5200.0f);   // C-163: 0 the left of its room, 1 the right
  bool right = !still && cosf(t / 5200.0f) > 0;                   // going right: the sprite mirrored
  int side = 64 * sc, ax = cx - side / 2 + (int)(room * (walk - 0.5f)) + (expression.shake ? ((t / 70) % 2 ? sc : -sc) : 0);
  int ay = floorY - side + 4 * sc + bob + hop;
  canvas.fillEllipse(ax + side / 2, floorY + 2, side / 4, max(2, sc * 2), 0x0841);   // its shadow, darker than the ground
  drawArt(ax, ay, sc, right);
  drawMark(ax, ay, sc, right, markTop);
}

// the daemon's ring while TALK listens
static void faceListening(uint16_t day) {
  if (!watchTalking()) return;
  int cy = faceDaemonY();
  for (int k = 0; k < 3; k++) canvas.drawCircle(W / 2, cy, 66 + k, day);
}

// a line of the day's words, as large as the circle leaves room for at that height, edged over the sky
static void faceLine(const String &text, int y, uint16_t colour) {
  int r = min(W, H) / 2 - 6, dy = abs(y - H / 2), room = 2 * (int)sqrtf(max(0, r * r - dy * dy));
  canvas.setTextFont(2);
  if (canvas.textWidth(text) > room) canvas.setTextFont(1);
  edgedString(text, W / 2, y, colour);
}

// the bottom line: the chakra and note -- or the battery, when it runs low off the cable
static String faceFoot() {
  if (bat.present && !bat.usb && bat.percent <= 20) return "BATTERY " + String(bat.percent) + "%";   // DRAFT
  return upper(st.chakra) + (st.note.length() ? "  -  " + st.note : "");
}

static void faceRing(uint16_t day) {
  int r = min(W, H) / 2;
  canvas.fillRect(0, 0, W, 26, INK);                         // the face draws its own top
  for (int k = 2; k <= 4; k++) canvas.drawCircle(W / 2, H / 2, r - k, day);
}

// C-163: the sky first, the daemon on its hill, the weather in front of it, the words over all of it
static void drawFaceDaemon(uint16_t day) {
  canvas.fillRect(0, 0, W, 26, INK);
  faceSky(186);
  faceRing(day);
  struct tm t; char hm[6] = "--:--";
  if (watchLocalTime(t)) snprintf(hm, sizeof hm, "%02d:%02d", t.tm_hour, t.tm_min);
  canvas.setTextDatum(MC_DATUM);
  if (st.carrying) { faceDaemon(W / 2, 188, 2, 56, 72); faceListening(day); }
  faceWeather();
  canvas.setTextFont(2); edgedString(upper(st.theme.length() ? st.theme : st.day), W / 2, 34, readable(day));
  if (st.carrying) { canvas.setTextFont(4); edgedString(hm, W / 2, 57, PAPER); }
  else {
    canvas.setTextFont(7); edgedString(hm, W / 2, 96, PAPER);
    canvas.setTextFont(1); edgedString("NO DAEMON HERE", W / 2, 146, QUIET);   // DRAFT
  }
  faceLine(upper(st.virtue), 207, PAPER);
  canvas.setTextFont(1);
  edgedString(faceFoot(), W / 2, 225, bat.present && !bat.usb && bat.percent <= 20 ? 0xF800 : faceSkyOn() ? 0xCE59 : QUIET);
  canvas.setTextDatum(TL_DATUM);
}

static void drawFaceClock(uint16_t day) {
  canvas.fillRect(0, 0, W, 26, INK);
  faceSky(186);
  faceRing(day);
  int cx = W / 2, cy = H / 2;
  uint16_t tick = faceSkyOn() ? readable(day) : day;
  for (int i = 0; i < 12; i++) {                             // the hours, longer at twelve, three, six and nine
    float a = i * PI / 6;
    int in = i % 3 ? 104 : 96;
    canvas.drawWideLine(cx + in * sinf(a), cy - in * cosf(a), cx + 112 * sinf(a), cy - 112 * cosf(a), i % 3 ? 1.0f : 2.0f, tick);   // r: half the width
  }
  if (st.carrying) { faceDaemon(cx, 176, 2, 48, 60); faceListening(day); }
  faceWeather();
  canvas.setTextDatum(MC_DATUM); canvas.setTextFont(1);
  edgedString(upper(st.theme.length() ? st.theme : st.day), cx, 50, readable(day));
  edgedString(upper(st.virtue), cx, 196, PAPER);
  struct tm t;
  if (watchLocalTime(t)) {                                   // the hands over the daemon, each edged in INK to stand off it
    float m = (t.tm_min + t.tm_sec / 60.0f) * PI / 30, h = ((t.tm_hour % 12) + t.tm_min / 60.0f) * PI / 6;
    canvas.drawWideLine(cx, cy, cx + 54 * sinf(h), cy - 54 * cosf(h), 4.0f, INK);
    canvas.drawWideLine(cx, cy, cx + 54 * sinf(h), cy - 54 * cosf(h), 2.5f, PAPER);
    canvas.drawWideLine(cx, cy, cx + 86 * sinf(m), cy - 86 * cosf(m), 3.0f, INK);
    canvas.drawWideLine(cx, cy, cx + 86 * sinf(m), cy - 86 * cosf(m), 1.5f, PAPER);
    canvas.fillCircle(cx, cy, 5, day); canvas.drawCircle(cx, cy, 5, INK);
  }
  canvas.setTextDatum(TL_DATUM);
}

static void drawFace(uint16_t day, uint16_t ink) {
  if (wide()) { drawFaceWide(day, ink); return; }
  if (cfg.face == "clock") { drawFaceClock(day); return; }   // C-162
  if (cfg.face != "virtue") { drawFaceDaemon(day); return; }
  canvas.fillRect(0, 0, W, 26, INK);                         // the face draws its own top
  int r = min(W, H) / 2;                                     // C-75: round on the watch, and inside the CoreS3's 320x240
  canvas.drawCircle(W / 2, H / 2, r - 2, day); canvas.drawCircle(W / 2, H / 2, r - 3, day);
  canvas.drawCircle(W / 2, H / 2, r - 4, day);
  canvas.setTextDatum(MC_DATUM);
  canvas.setTextFont(2); canvas.setTextColor(readable(day));
  canvas.drawString(upper(st.theme.length() ? st.theme : st.day), W / 2, 38);
  struct tm t; char hm[6] = "--:--";
  if (watchLocalTime(t)) snprintf(hm, sizeof hm, "%02d:%02d", t.tm_hour, t.tm_min);
  canvas.setTextFont(7); canvas.setTextColor(PAPER);
  canvas.drawString(hm, W / 2, 84);
  canvas.setTextFont(2); canvas.setTextColor(PAPER);
  canvas.drawString(upper(st.virtue), W / 2, 124);
  canvas.setTextColor(QUIET);
  canvas.drawString(upper(st.chakra) + (st.note.length() ? "  -  " + st.note : ""), W / 2, 144);
  long steps = watchSteps();
  canvas.setTextFont(1);
  if (steps >= 0) canvas.drawString(String(steps) + " STEPS", W / 2, 164);   // DRAFT
  if (bat.present) canvas.drawString(String(bat.percent) + "%" + (bat.charging ? " +" : ""), W / 2, 176);
  if (!talkCan()) { canvas.setTextDatum(TL_DATUM); return; }   // C-102: the Dial has no microphone, so no TALK
  bool talking = watchTalking();                             // TALK: a button in the day's colour, full while held
  int cx = W / 2, cy = H - 34;
  if (talking) canvas.fillCircle(cx, cy, 26, day); else canvas.drawCircle(cx, cy, 26, day);
  canvas.setTextFont(2); canvas.setTextColor(talking ? ink : day);
  canvas.drawString(talking ? "..." : "TALK", cx, cy);       // DRAFT
  canvas.setTextDatum(TL_DATUM);
}

void draw() {
  uint16_t day = hex565(st.menu), ink = lightColour(st.menu) ? INK : PAPER;   // C-37
  tapN = 0;                                                 // C-161: the rows this frame draws
  canvas.fillSprite(INK);
  // the day's band
  canvas.fillRect(0, 0, W, 26, day);
  canvas.setTextFont(2); canvas.setTextColor(ink); canvas.setTextDatum(board.round ? MC_DATUM : ML_DATUM);
  canvas.drawString(st.have ? upper(st.day) + "  " + st.note + (W >= 300 ? "  " + upper(st.season) : String(""))   // the watch: no room
                            : String(W >= 300 ? "DAEMONS COMPANION" : "DAEMONS"), board.round ? W / 2 : 8, 13);   // C-102: centred in the circle
  canvas.setTextDatum(MR_DATUM);
  if (!board.round) canvas.drawString(linkName(), W - 8, 13);
  if (bat.present && !board.round) {                                          // C-63: a small battery, filled to its charge
    int x = W - 8 - canvas.textWidth(linkName()) - 52, y = 7;
    uint16_t fill = bat.percent <= 15 && !bat.usb ? 0xF800 : ink;      // red when low and not plugged in
    canvas.drawRect(x, y, 20, 12, ink); canvas.fillRect(x + 20, y + 3, 2, 6, ink);
    canvas.fillRect(x + 2, y + 2, max(1, 16 * bat.percent / 100), 8, fill);
    if (bat.charging) { canvas.drawLine(x + 11, y + 1, x + 7, y + 6, day); canvas.drawLine(x + 7, y + 6, x + 12, y + 6, day);
                        canvas.drawLine(x + 12, y + 6, x + 8, y + 11, day); }       // a bolt, in the day's colour
    canvas.setTextDatum(ML_DATUM); canvas.setTextFont(1);
    canvas.drawString(String(bat.percent) + "%", x + 24, 13);
    canvas.setTextFont(2);
  }

  if (screen == CARE) {                                      // C-13
    canvas.setTextFont(2); canvas.setTextColor(readable(day)); canvas.setTextDatum(TL_DATUM);
    canvas.drawString("CARE FOR " + st.daemon.nickname, 10, 32);
    int fit = listRowsFit(), from = max(0, careAt - (fit - 1));   // C-161: as many as fit (four on the watch), scrolled
    for (int i = from; i < 5 && i < from + fit; i++) listRow(i - from, careAt - from, CARE_ITEMS[i], day, ink, W - 90);   // clear of its sprite
    drawArt(W - 70, 34, 1);
    canvas.setTextFont(1); canvas.setTextColor(QUIET); canvas.setTextDatum(BL_DATUM);
    footer(hint("turn: choose    press: do it    top button: back"));
  } else if (screen == CARE_GRID) {                           // C-163: the watch's CARE, four tiles
    drawCareGrid(day, ink);
  } else if (screen == CARE_KEYS) {                           // C-149: CARE from home -- a button each, then home
    canvas.setTextFont(2); canvas.setTextColor(readable(day)); canvas.setTextDatum(TL_DATUM);
    canvas.drawString("CARE FOR " + st.daemon.nickname, 10, 32);                   // DRAFT
    bool under = board.kind == BoardKind::M5Core;
    int sc = H >= 200 ? 2 : 1, side = 64 * sc;
    drawArt(W / 2 - side / 2, under ? 46 : 40, sc);
    canvas.setTextColor(QUIET); canvas.setTextDatum(TC_DATUM);
    canvas.drawString("fed " + String(st.daemon.fed) + "/3  water " + String(st.daemon.watered) + "/3", W / 2, under ? H - 46 : H - 34);
    canvas.setTextDatum(TL_DATUM);
    if (under) keyLabels(day, ink);
    else { canvas.setTextFont(1); canvas.setTextColor(QUIET); canvas.setTextDatum(BL_DATUM);
           footer(st.daemon.tired == "drowsy" ? "A drink  B feed  C sleep    hold A: back" : "A drink  B feed  C train    hold A: back"); }   // DRAFT
  } else if (screen == INDEX_ENTRY) {                         // C-36: its INDEX entry, in the edition's voice
    canvas.setTextFont(2); canvas.setTextColor(readable(day)); canvas.setTextDatum(TL_DATUM);
    canvas.drawString("INDEX  " + st.daemon.name, 10, 32);
    canvas.setTextColor(QUIET);
    canvas.drawString(upper(st.daemon.category) + "  " + st.daemon.types, 10, 50);
    drawArt(W - 68, 30, 1);
    // C-99: the whole entry -- the room under the sprite, scrolled by the dial (a swipe on a touch screen)
    // C-149: and OPUS's margin after it, in the day's colour, where the save holds OPUS; on the M5GO and the Fire, from
    // home, the three buttons' words under it
    bool under = quickScreen() && board.kind == BoardKind::M5Core;
    int fit = (H - (under ? 44 : 16) - 72) / 16;
    int lines = wrap(st.daemon.entry, 10, 72, W - 112, 2, 16, fit, PAPER, entryTop);   // clear of the sprite (SHOT, 2026-10-04)
    if (st.daemon.margin.length()) {
      int from = lines + 1, row = max(0, from - entryTop);
      lines = from + wrap("OPUS: " + st.daemon.margin, 10, 72 + row * 16, W - 112, 2, 16, max(0, fit - row), day, max(0, entryTop - from));   // DRAFT
    }
    entryLines = lines;
    if (entryTop > max(0, entryLines - fit)) { entryTop = max(0, entryLines - fit); dirty = true; }
    String more = entryLines > fit ? String(entryTop + fit < entryLines ? "turn: more    " : "turn: back up    ") : String("");   // DRAFT
    canvas.setTextFont(1); canvas.setTextColor(QUIET); canvas.setTextDatum(BL_DATUM);
    if (under) keyLabels(day, ink);
    else if (quickScreen()) footer(String(talkCan() ? "A: read aloud    " : "") + "B: more    C: home");   // C-149, DRAFT
    else footer(hint(more + (talkCan() ? "press: read aloud    " : "") + "top button: back"));   // C-65, DRAFT
  } else if (screen == TALK) {                               // C-66: what was heard, and the daemon's answer
    canvas.setTextFont(2); canvas.setTextColor(readable(day)); canvas.setTextDatum(TL_DATUM);
    canvas.drawString(upper(st.carrying ? st.daemon.nickname : String("your daemon")), 10, 32);
    int y = 52;
    if (talkHeard.length()) y += min(2, wrap("\"" + talkHeard + "\"", 10, y, W - 20, 2, 16, 2, QUIET)) * 16 + 4;
    if (talkAnswer.length()) wrap(talkAnswer, 10, y, W - 20, 2, 16, (H - 20 - y) / 16, PAPER);
    canvas.setTextFont(1); canvas.setTextColor(QUIET); canvas.setTextDatum(BL_DATUM);
    footer(talkStatus.length() ? talkStatus : hint("hold the dial: talk again    top button: back"));
  } else if (screen != HOME) {
    drawRoutines(day);
  } else if (page == FACE_PAGE) {
    drawFace(day, ink);
  } else if (page == ROUTINES_PAGE) {
    canvas.setTextFont(2); canvas.setTextColor(readable(day)); canvas.setTextDatum(TL_DATUM);
    canvas.drawString("ROUTINES", 10, 34);
    wrap(partyFirst() ? String("The CASINO and its radios first -- WHISPER, UPLINK -- then your party's routines. Press to open.")   // DRAFT
         : !st.carrying ? String(board.nfc ? "No daemon here. TOUCHSTONE can take one off a card; the party's routines are here too."
                                           : "No daemon here. Your party's routines, and the board's own. Press to open.")   // C-153, DRAFT
         : st.carrying ? "The radios " + daemonName() + " can use. Press to open."
                       : "Routines are a daemon's. Send one here from the game.", 10, 58, W - 20, board.round || H < 160 ? 2 : 4,
         board.round || H < 160 ? 18 : 27, board.round ? 5 : 3, PAPER);   // C-102: the Dial, smaller so it all fits; C-148 a
                                                                           // 135-high screen too (it ran into the names)
    canvas.setTextFont(1); canvas.setTextColor(QUIET); canvas.setTextDatum(BL_DATUM);
    String names;                                            // C-67: this board's own types
    for (int i = 0; i < typeCount; i++) names += String(i ? "  " : "") + types[i].name;
    if (!board.round) canvas.drawString(names, 10, H - 6);   // C-102: no room at the foot of a circle
  } else if (!st.have) {
    wrap("Looking for the companion.", 10, 40, W - 20, 4, 28, 2, PAPER);
    wrap(wifiSet() ? "Wi-Fi is set. Is the server running, with \"host\": \"0.0.0.0\"?"
                   : "Run ./linkCompanion.sh on the computer, or join a network: ROUTINES, UPLINK.",
         10, 100, W - 20, 2, 18, 3, QUIET);
  } else if (page == DAY_PAGE) {
    // C-73: the Xenith day -- its theme, its virtue over its shadow, its chakra and its note. Press: the day's note.
    canvas.setTextFont(2); canvas.setTextColor(QUIET); canvas.setTextDatum(TL_DATUM);
    canvas.drawString("TODAY IS", 10, 32);
    canvas.setTextFont(4); canvas.setTextColor(readable(day));
    canvas.drawString(upper(st.theme.length() ? st.theme : st.day), 10, 50);
    canvas.setTextFont(2); canvas.setTextColor(PAPER);
    canvas.drawString(upper(st.virtue), 10, 86);
    canvas.setTextColor(QUIET);
    canvas.drawString(upper(st.chakra) + "    THE NOTE OF " + st.note, 10, 108);
    canvas.setTextFont(1); canvas.setTextDatum(BL_DATUM);
    if (board.round) { canvas.setTextDatum(BC_DATUM); canvas.drawString(COMPANION_BUILD, W / 2, H - 14); footer(hint("press: the day's note")); }   // C-102
    else {
    canvas.drawString(hint("press: the day's note"), 10, H - 6);
    canvas.setTextDatum(BR_DATUM);                             // C-91: which build this is, quietly
    canvas.drawString(COMPANION_BUILD, W - 8, H - 6);
    }
    canvas.setTextDatum(BL_DATUM);
  } else if (page == SOUND_PAGE) {           // C-159 (the user, 2026-10-18): the board's sound, on or off on the board itself
    canvas.setTextFont(2); canvas.setTextColor(QUIET); canvas.setTextDatum(TL_DATUM);
    canvas.drawString("SOUND", 10, 32);                                            // DRAFT
    canvas.setTextFont(4); canvas.setTextColor(cfg.sound ? day : QUIET);
    canvas.drawString(cfg.sound ? "ON" : "OFF", 10, 52);                           // DRAFT
    canvas.setTextFont(2); canvas.setTextColor(PAPER);
    wrap(String(cfg.sound ? "Volume " + String(cfg.volume) + "%. " : String("Silent: no tunes, no ticks. ")) +
         (cfg.wakeEvery ? "The jingle plays on every wake." : "The jingle plays when it starts."), 10, 88, W - 20, 2, 18, 3, PAPER);   // DRAFT
    canvas.setTextFont(1); canvas.setTextDatum(BL_DATUM); canvas.setTextColor(QUIET);
    footer(hint(cfg.sound ? "press: turn it off" : "press: turn it on"));          // DRAFT
  } else if (page == OFF_PAGE) {             // the user, 2026-10-15: "there is no way to turn it off"
    canvas.setTextFont(4); canvas.setTextColor(readable(day)); canvas.setTextDatum(TL_DATUM);
    canvas.drawString("SWITCH OFF", 10, 40);                                       // DRAFT
    wrap(String("Press to switch it off. ") + startAgain(), 10, 76, W - 20, 2, 18, 4, PAPER);   // DRAFT
    if (board.threeKeys()) wrap("Or hold C for five seconds, anywhere.", 10, 76 + 3 * 18, W - 20, 2, 18, 2, QUIET);   // DRAFT
    canvas.setTextFont(1); canvas.setTextDatum(BL_DATUM); canvas.setTextColor(QUIET);
    canvas.drawString(hint("press: switch off"), 10, H - 6);
  } else if (page == TODAY) {
    canvas.setTextFont(2); canvas.setTextColor(readable(day)); canvas.setTextDatum(TL_DATUM);
    // C-49: the step, and -- subtly -- the milestone it belongs to
    canvas.drawString(st.milestone.length() ? upper(st.milestone) + "  " + String(st.msAt) + "/" + String(st.msOf) : "THE ONE THING", 10, 34);
    int tw = wide() ? W - 200 : W - 20, tl = wide() ? 4 : 3;   // C-105: wide, the step keeps the left and the right is the daemon's
    if (st.step >= 0) {
      int n = wrap(st.stepText, 10, 54, tw, 4, 27, tl, PAPER);
      wrap(st.goal, 10, 58 + min(n, tl) * 27, tw, 2, 16, 1, QUIET);
    } else {
      wrap(lastDone >= 0 ? "All done. Set a new goal in the app." : "Nothing to do yet. Set a goal in the app.", 10, 54, tw, 4, 27, tl, PAPER);
    }
    if (wide()) {
      int x = W - 176;
      canvas.drawFastVLine(x - 12, 40, H - 76, day);
      if (st.carrying) {
        drawArt(x + 16, 34, 2);
        canvas.setTextDatum(TC_DATUM); canvas.setTextFont(2); canvas.setTextColor(PAPER);
        canvas.drawString(st.daemon.nickname, x + 80, 166);
        if (st.daemon.word.length()) { canvas.setTextFont(1); canvas.setTextColor(readable(day)); canvas.drawString(st.daemon.word, x + 80, 184); }
      } else {
        canvas.setTextDatum(TL_DATUM); canvas.setTextFont(2); canvas.setTextColor(QUIET);
        canvas.drawString("TODAY IS", x, 40);
        wrap(upper(st.theme.length() ? st.theme : st.day), x, 58, 166, 4, 26, 2, day);
        wrap(upper(st.virtue), x, 114, 166, 2, 16, 2, PAPER);
      }
    }
    canvas.setTextFont(1); canvas.setTextColor(QUIET); canvas.setTextDatum(BL_DATUM);
    if (undoable()) { String u = hint("done: " + lastDoneText.substring(0, 30) + "   top button: undo"); if (board.round) footer("hold: undo"); else canvas.drawString(u, 10, H - 6); }
    else {                                       // C-73: wherever the virtue shows, its chakra shows too
      String day = st.virtue + (st.chakra.length() ? "  -  " + st.chakra : String(""));
      if (board.round) footer(st.step >= 0 ? hint("press: done") : day);   // C-102, DRAFT
      else canvas.drawString(st.step >= 0 ? hint("press: done") + "    " + day : day, 10, H - 6);   // C-105: in each board's own words
    }
  } else {
    canvas.setTextFont(2); canvas.setTextColor(readable(day)); canvas.setTextDatum(TL_DATUM);
    if (st.carrying) {
      // C-42: the board's home -- the daemon, large, and alive: it bobs as it breathes, and now and then hops.
      // C-113: and it lives in its den (den.cpp), walking it from side to side and facing the way it goes; asleep, it
      // stays where it is with a z. The den is the space left of the words (the whole circle on the Dial).
      // C-119: how it moves is its expression's pose -- still when it sleeps, a slower breath when low, a shake when cross
      uint32_t t = millis();
      bool still = expression.still;
      int bob = still ? 0 : (int)roundf(3 * expression.bob * sinf(t / 420.0f));
      float walk = still ? 0.5f : 0.5f + 0.5f * sinf(t / 5200.0f);        // 0 the left of the den, 1 the right
      bool right = !still && cosf(t / 5200.0f) > 0;                       // going right: the sprite mirrored
      int hop = still ? 0 : (t % 7000) < 260 ? -(int)(10 * sinf((t % 7000) / 260.0f * PI)) : 0;
      if (t < hopUntil) hop = -(int)(14 * fabsf(sinf((hopUntil - t) / 160.0f * PI)));   // C-13: glad of it
      // the den at x, y, w, h; the sprite (64 * sc) stands on its floor and walks the room the den leaves it
      auto inDen = [&](int x, int y, int w, int h, int sc, int floorY) {
        drawDen(x, y, w, h, floorY);
        int side = 64 * sc, room = max(0, w - side);
        int ax = x + (int)(room * walk) + (expression.shake ? ((t / 70) % 2 ? sc : -sc) : 0), ay = floorY - side + 4 * sc + bob + hop;
        canvas.setClipRect(x, y, w, h);
        canvas.fillEllipse(ax + side / 2, floorY + 2, side / 4, max(2, sc * 2), INK);   // its shadow
        drawArt(ax, ay, sc, right);
        drawMark(ax, ay, sc, right, y);                        // C-119: zz, a heart, a drop ... above its head, inside the den
        canvas.clearClipRect();
      };
      if (board.round) {                                       // C-102: the Dial -- large in the middle of the circle
        inDen(0, 26, W, H - 26, 2, 156);
        canvas.setTextDatum(MC_DATUM); canvas.setTextFont(2); canvas.setTextColor(PAPER);
        canvas.drawString(st.daemon.nickname + "  L" + String(st.daemon.level), W / 2, 164);
        canvas.setTextFont(1); canvas.setTextColor(st.daemon.word.length() ? day : QUIET);
        canvas.drawString(st.daemon.word.length() ? st.daemon.word : "fed " + String(st.daemon.fed) + "/3  water " + String(st.daemon.watered) + "/3", W / 2, 180);
        canvas.setTextColor(QUIET); footer("press: care for it");   // DRAFT
      } else {
      int x = H < 160 ? 104 : 168;                             // the StickS3: a narrower den, so its words have room
      if (wide()) {                                            // C-105: three times its size, kept off the top band
        inDen(6, 30, 226, H - 44, 3, H - 22);
        x = 240;
      } else if (H < 160)                                      // the M5StickS3: the den is short, the daemon as the game draws it
        inDen(4, 28, x - 10, H - 44, 1, H - 22);
      else if (keysUnder())                                    // C-118: the M5GO and Fire -- room left for the buttons' words
        inDen(6, 30, x - 12, H - 60, 2, H - 38);
      else
        inDen(6, 30, x - 12, H - 46, 2, H - 24);               // C-36: as the game draws it, twice its size
      canvas.setTextDatum(TL_DATUM);
      canvas.setTextFont(4); if (canvas.textWidth(st.daemon.nickname) > W - x - 4) canvas.setTextFont(2);   // large only if it fits
      canvas.setTextColor(PAPER);
      canvas.drawString(st.daemon.nickname, x, 40);
      canvas.setTextFont(2); canvas.setTextColor(QUIET);
      // its species beside its level -- unless its nickname already is the species
      String lv = "L" + String(st.daemon.level) + (st.daemon.grownTo > st.daemon.level ? " > " + String(st.daemon.grownTo) : "");   // C-45
      canvas.drawString((st.daemon.nickname == st.daemon.name ? String("") : st.daemon.name + "  ") + lv, x, 72);
      // C-13: how it is, and its day -- never more than this, and never a nag
      if (st.daemon.tired == "asleep") {                       // C-118: asleep, said large -- not the small word
        canvas.setTextFont(4); canvas.setTextColor(readable(day)); canvas.drawString("ASLEEP", x, 88); canvas.setTextFont(2); canvas.setTextColor(QUIET);   // DRAFT
      } else if (st.daemon.word.length()) { canvas.setTextColor(readable(day)); canvas.drawString(st.daemon.word, x, 90); canvas.setTextColor(QUIET); }
      canvas.drawString("fed " + String(st.daemon.fed) + "/3  water " + String(st.daemon.watered) + "/3", x, 108);
      int cf = wide() ? 2 : 1, ch = wide() ? 16 : 11, cn = wide() ? 4 : 2;   // C-105: wide, the cue in a readable size
      if (H < 160) {}                                          // the StickS3: no room under its day for a cue
      else if (st.daemon.cue.length()) wrap(st.daemon.cue, x, 128, W - x - 6, cf, ch, cn, QUIET);
      else if (st.daemon.holding.length()) wrap("holding " + st.daemon.holding, x, 128, W - x - 6, cf, ch, cn, QUIET);
      canvas.setTextFont(1); canvas.setTextDatum(BL_DATUM); canvas.setTextColor(QUIET);
      if (keysUnder() && !menuOpen) {                         // C-118: each button's word right above it
        canvas.drawString("A+C: menu", x, H - 28);              // DRAFT
        keyLabels(day, ink);
      } else if (board.threeKeys() && !menuOpen) {            // C-117: the T-Display-S3 Pro's buttons are on its side
        bool sleeping = st.daemon.tired == "asleep";
        canvas.drawString(sleeping ? "any button: wake" : "A care  B routines  C index", x, H - 14);   // C-149, DRAFT
        canvas.drawString("A+C: menu", x, H - 4);
        if (keysHeld) {                                       // C-121: the held button's word, lit, above its footer
          const char *w = keyWord(keysHeld & 1 ? 0 : keysHeld & 2 ? 1 : 2);
          canvas.setTextFont(2); canvas.setTextDatum(ML_DATUM);
          int bw = canvas.textWidth(w) + 16;
          canvas.fillRoundRect(x - 2, H - 48, bw, 22, 5, PAPER);
          canvas.setTextColor(INK); canvas.drawString(w, x + 6, H - 37);
        }
      } else canvas.drawString(hint(board.keyboard && board.loraChip != LoraChip::None ? "type: a message nearby" : "press: care for it"), x, H - 4);   // C-123, DRAFT
      }
    } else {
      canvas.drawString("A DAEMON TO HOST", 10, 34);
      wrap("None yet. In the game, choose SEND in a daemon's menu, then SYNC in the app.", 10, 58, W - 20, 2, 18, 4, PAPER);
    }
  }
  String mFrom, mText;                         // C-123: a message heard, until it is read
  if (loraMessage(mFrom, mText)) {
    int bx = 8, by = H / 2 - 44, bw = W - 16, bh = 92;
    canvas.fillRoundRect(bx, by, bw, bh, 6, day);
    canvas.setTextFont(2); canvas.setTextDatum(TL_DATUM); canvas.setTextColor(ink);
    canvas.drawString("FROM " + upper(mFrom) + ", NEARBY", bx + 8, by + 6);      // DRAFT
    wrap(mText, bx + 8, by + 26, bw - 16, 2, 16, 3, ink);
    canvas.setTextFont(1); canvas.setTextDatum(BR_DATUM); canvas.setTextColor(ink);
    canvas.drawString("any key: read", bx + bw - 8, by + bh - 4);                 // DRAFT
  }
  if (millis() < flashUntil) {               // a word that something happened
    canvas.setTextFont(4);                     // the box fits the word (seen with SHOT 2026-10-07: it overflowed)
    if (canvas.textWidth(flash) > W - 40) canvas.setTextFont(2);
    if (canvas.textWidth(flash) > W - 40) {    // C-154: a broadcast's longer words, on two or three lines
      int bw = W - 16, bh = 64;
      canvas.fillRoundRect(8, H / 2 - bh / 2, bw, bh, 6, day);
      wrap(flash, 18, H / 2 - bh / 2 + 8, bw - 20, 2, 16, 3, ink);
    } else {
      int bw = min(W - 16, max(140, (int)canvas.textWidth(flash) + 32));
      canvas.fillRoundRect(W / 2 - bw / 2, H / 2 - 22, bw, 44, 6, day);
      canvas.setTextColor(ink); canvas.setTextDatum(MC_DATUM);
      canvas.drawString(flash, W / 2, H / 2);
    }
    canvas.setTextDatum(TL_DATUM);
  }
  canvas.pushSprite(board.screenX, board.screenY);   // C-102: the Dial's square, inside its circle
  dirty = false;
}

void say(const String &word) { flash = word; flashUntil = millis() + 1500; dirty = true; }

// C-50: what the server says the tick finished -- a step, a milestone, the whole goal -- heard and seen
void celebrate(const String &what) {
  int kind = what == "goal" ? 2 : what == "milestone" ? 1 : what == "step" ? 0 : -1;
  if (kind < 0) return;
  say(kind == 2 ? "Done! All of it." : kind == 1 ? "Milestone!" : "Done.");
  draw();
  soundAccomplish(kind, st.daemon.species, dayIndex());
}

// While a routine runs the loop does not, so nothing reads the cable: a SHOT asked for then is answered here, so a
// routine's live screen can be checked too. Any other line waiting is let go (the bridge sends its state again).
bool routineRunning = false;
int cableKey = 0;

void progress(const String &text) {
  runResult = text; lastInput = millis();                   // a routine at work is the board in use: no sleeping after it
  draw();
  static String in;
  while (Serial.available()) {
    char c = Serial.read();
    if (c != '\n') { if (in.length() < 64) in += c; continue; }
    in.trim();
    if (in == "SHOT") shot();
    else if (in == "KEY PRESS") cableKey = 1;      // C-101: a routine that runs the dial itself, checked from the computer
    else if (in == "KEY PRESS2") cableKey = 2;
    else if (in == "KEY BACK") cableKey = -1;
    in = "";
  }
}
