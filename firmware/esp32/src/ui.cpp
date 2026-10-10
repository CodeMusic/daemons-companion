// The screens (C-67: from main.cpp). Drawn whole into the sprite, then pushed.
#include <WiFi.h>
#include "app.h"
#include "talk.h"
#include "radios.h"
#include "link.h"
#include "sound.h"
#include "leds.h"

// C-74: the footers name the dial and the top button; on a board with two buttons and no dial (the StickS3) they name
// its buttons instead -- the side one turns (a tap) and goes back (held), the front one presses.
static String hint(String s) {
  if (board.threeKeys()) {                    // C-75: the M5GO and Fire -- A and C turn, B presses, held A goes back
    s.replace("top button: back", "hold A: back"); s.replace("top button: stop", "A: stop");
    s.replace("top button: undo", "hold A: undo"); s.replace("top: delete", "hold A: delete");
    s.replace("hold the dial", "hold B"); s.replace("turn:", "A/C:"); s.replace("press:", "B:");
    return s;
  }
  if (board.keyboard) {                      // C-104: the T-Deck -- the ball rolls and clicks; Enter and Backspace too
    s.replace("top button: back", "backspace: back"); s.replace("top button: stop", "backspace: stop");
    s.replace("top button: undo", "backspace: undo"); s.replace("top: delete", "backspace: delete");
    s.replace("turn:", "roll:"); s.replace("press:", "click:"); s.replace("hold the dial", "hold the ball");
    return s;
  }
  if (!board.noDial()) return s;
  s.replace("top button: back", "hold side: back"); s.replace("top button: stop", "side: stop");
  s.replace("top button: undo", "hold side: undo"); s.replace("top: delete", "hold side: delete");
  s.replace("hold the dial", "hold front"); s.replace("turn:", "side:"); s.replace("press:", "front:");
  return s;
}

static const char *CARE_ITEMS[] = { "FEED", "WATER", "TRAIN", "ITS INDEX ENTRY" };
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
bool lightColour(const String &h) {           // as the app decides (App.tsx onColour)
  long v = strtol(h.c_str() + 1, nullptr, 16);
  auto lin = [](double c) { c /= 255.0; return c <= 0.03928 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * lin((v >> 16) & 255) + 0.7152 * lin((v >> 8) & 255) + 0.0722 * lin(v & 255) > 0.3;
}

void drawArt(int x, int y, int scale) {
  if (!artKeyHave.length() || artKeyHave != st.daemon.artKey) return;
  for (int j = 0; j < 64; j++)
    for (int i = 0; i < 64; i++) {
      uint8_t b = artPix[(j * 64 + i) >> 1], c = (i & 1) ? (b & 15) : (b >> 4);
      if (c) canvas.fillRect(x + i * scale, y + j * scale, scale, scale, artPal[c]);
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
  } else canvas.drawString(s, 10, H - 4);
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
void listRow(int i, int at, const String &text, uint16_t day, uint16_t ink, int width = W - 12) {
  int y = 52 + i * 19;
  if (i == at) canvas.fillRect(6, y - 2, width, 18, day);
  canvas.setTextFont(2); canvas.setTextDatum(TL_DATUM);
  canvas.setTextColor(i == at ? ink : PAPER);
  canvas.drawString(text, 12, y);
}

String (*runPanel)(uint16_t day, uint16_t ink) = nullptr;
static String panelHint;

void drawRoutines(uint16_t day) {
  uint16_t ink = lightColour(st.menu) ? INK : PAPER;
  const RoutineType &t = types[typeAt];
  canvas.setTextFont(2); canvas.setTextColor(day); canvas.setTextDatum(TL_DATUM);
  if (screen == PARTY) {                     // C-68: GAME ROUTINES -- the party, five rows at a time
    canvas.drawString("WHOSE ROUTINE?", 10, 32);                                  // DRAFT
    int rows = partyRows(), from = max(0, partyAt - 4);
    if (!st.partyN) wrap("The party is empty, or the save is not read yet.", 12, 58, W - 24, 2, 18, 3, QUIET);
    for (int i = from; i < rows && i < from + 5; i++) {
      if (i < st.partyN) {
        const Member &m = st.party[i];
        listRow(i - from, partyAt - from, m.name + "  Lv" + m.level + "  " + m.types, day, ink);
      } else listRow(i - from, partyAt - from, "RADIOS  (Bluetooth, Wi-Fi)", day, ink);   // DRAFT
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
    int from = max(0, typeAt - 4);               // the CC1101 has six types: five rows at a time
    for (int i = from; i < typeCount && i < from + 5; i++)
      listRow(i - from, typeAt - from, String(types[i].name) + "  (" + types[i].radio + ")", day, ink);
  } else if (screen == LIST) {
    canvas.drawString(String(t.name) + "  (" + t.radio + ")", 10, 32);
    if (t.count == 0) {
      wrap("No routines yet.", 12, 58, W - 24, 4, 27, 1, PAPER);
      wrap("They arrive as each radio is wired and tried on the board.", 12, 92, W - 24, 2, 18, 3, QUIET);
    } else {
      int from = max(0, routineAt - 4);          // five rows, clear of the footer; the list scrolls past them
      for (int i = from; i < t.count && i < from + 5; i++) listRow(i - from, routineAt - from, t.routines[i].name, day, ink);
    }
  } else if (screen == PICK_REMOTE) {
    canvas.drawString("WHICH REMOTE " + upper(daemonName()) + " USES", 10, 32);
    int n = flareCount(), a = flareActive();
    for (int i = 0; i < n; i++) listRow(i, remoteAt, (i == a ? "* " : "  ") + flareName(i), day, ink);
  } else if (screen == PICK_NET) {
    canvas.drawString("WHICH NETWORK SHOULD " + upper(daemonName()) + " LEARN?", 10, 32);
    int from = max(0, netAt - 4);                // five rows, clear of the footer
    for (int i = from; i < netCount && i < from + 5; i++)
      listRow(i - from, netAt - from, nets[i] + "  " + String(netRssi[i]) + " dBm", day, ink);
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
                    : "turn: choose    press: open    top button: back"));
}

// C-71: the watch's face -- the time, the day's theme, its virtue over its vice, its chakra and note, today's steps,
// and TALK, held to talk (C-66). The day's colour rings the face.
static void drawFace(uint16_t day, uint16_t ink) {
  canvas.fillRect(0, 0, W, 26, INK);                         // the face draws its own top
  int r = min(W, H) / 2;                                     // C-75: round on the watch, and inside the CoreS3's 320x240
  canvas.drawCircle(W / 2, H / 2, r - 2, day); canvas.drawCircle(W / 2, H / 2, r - 3, day);
  canvas.drawCircle(W / 2, H / 2, r - 4, day);
  canvas.setTextDatum(MC_DATUM);
  canvas.setTextFont(2); canvas.setTextColor(day);
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
    canvas.setTextFont(2); canvas.setTextColor(day); canvas.setTextDatum(TL_DATUM);
    canvas.drawString("CARE FOR " + st.daemon.nickname, 10, 32);
    for (int i = 0; i < 4; i++) listRow(i, careAt, CARE_ITEMS[i], day, ink, W - 90);   // clear of its sprite
    drawArt(W - 70, 34, 1);
    canvas.setTextFont(1); canvas.setTextColor(QUIET); canvas.setTextDatum(BL_DATUM);
    footer(hint("turn: choose    press: do it    top button: back"));
  } else if (screen == INDEX_ENTRY) {                         // C-36: its INDEX entry, in the edition's voice
    canvas.setTextFont(2); canvas.setTextColor(day); canvas.setTextDatum(TL_DATUM);
    canvas.drawString("INDEX  " + st.daemon.name, 10, 32);
    canvas.setTextColor(QUIET);
    canvas.drawString(upper(st.daemon.category) + "  " + st.daemon.types, 10, 50);
    drawArt(W - 68, 30, 1);
    // C-99: the whole entry -- the room under the sprite, scrolled by the dial (a swipe on a touch screen)
    int fit = (H - 16 - 72) / 16;
    entryLines = wrap(st.daemon.entry, 10, 72, W - 112, 2, 16, fit, PAPER, entryTop);   // clear of the sprite (SHOT, 2026-10-04)
    if (entryTop > max(0, entryLines - fit)) { entryTop = max(0, entryLines - fit); dirty = true; }
    String more = entryLines > fit ? String(entryTop + fit < entryLines ? "turn: more    " : "turn: back up    ") : String("");   // DRAFT
    canvas.setTextFont(1); canvas.setTextColor(QUIET); canvas.setTextDatum(BL_DATUM);
    footer(hint(more + (talkCan() ? "press: read aloud    " : "") + "top button: back"));   // C-65, DRAFT
  } else if (screen == TALK) {                               // C-66: what was heard, and the daemon's answer
    canvas.setTextFont(2); canvas.setTextColor(day); canvas.setTextDatum(TL_DATUM);
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
    canvas.setTextFont(2); canvas.setTextColor(day); canvas.setTextDatum(TL_DATUM);
    canvas.drawString("ROUTINES", 10, 34);
    wrap(partyFirst() || !st.carrying ? String("Your party's routines, as the game plays them. Press to open.")   // C-68, DRAFT
         : st.carrying ? "The radios " + daemonName() + " can use. Press to open."
                       : "Routines are a daemon's. Send one here from the game.", 10, 58, W - 20, board.round ? 2 : 4,
         board.round ? 18 : 27, board.round ? 5 : 3, PAPER);   // C-102: the Dial, smaller so it all fits
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
    canvas.setTextFont(4); canvas.setTextColor(day);
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
  } else if (page == TODAY) {
    canvas.setTextFont(2); canvas.setTextColor(day); canvas.setTextDatum(TL_DATUM);
    // C-49: the step, and -- subtly -- the milestone it belongs to
    canvas.drawString(st.milestone.length() ? upper(st.milestone) + "  " + String(st.msAt) + "/" + String(st.msOf) : "THE ONE THING", 10, 34);
    if (st.step >= 0) {
      int n = wrap(st.stepText, 10, 54, W - 20, 4, 27, 3, PAPER);
      wrap(st.goal, 10, 58 + min(n, 3) * 27, W - 20, 2, 16, 1, QUIET);
    } else {
      wrap(lastDone >= 0 ? "All done. Set a new goal in the app." : "Nothing to do yet. Set a goal in the app.", 10, 54, W - 20, 4, 27, 3, PAPER);
    }
    canvas.setTextFont(1); canvas.setTextColor(QUIET); canvas.setTextDatum(BL_DATUM);
    if (undoable()) { String u = hint("done: " + lastDoneText.substring(0, 30) + "   top button: undo"); if (board.round) footer("hold: undo"); else canvas.drawString(u, 10, H - 6); }
    else {                                       // C-73: wherever the virtue shows, its chakra shows too
      String day = st.virtue + (st.chakra.length() ? "  -  " + st.chakra : String(""));
      if (board.round) footer(st.step >= 0 ? "press: done" : day);   // C-102, DRAFT
      else canvas.drawString(st.step >= 0 ? "press: done    " + day : day, 10, H - 6);
    }
  } else {
    canvas.setTextFont(2); canvas.setTextColor(day); canvas.setTextDatum(TL_DATUM);
    if (st.carrying) {
      // C-42: the board's home -- the daemon, large, and alive: it bobs as it breathes, drifts a little either way,
      // and now and then hops. (Device-only animated sprites come later; a daemon sent here comes more to life.)
      uint32_t t = millis();
      int bob = (int)roundf(3 * sinf(t / 420.0f));
      int drift = (int)roundf(10 * sinf(t / 2900.0f));
      int hop = (t % 7000) < 260 ? -(int)(10 * sinf((t % 7000) / 260.0f * PI)) : 0;
      if (t < hopUntil) hop = -(int)(14 * fabsf(sinf((hopUntil - t) / 160.0f * PI)));   // C-13: glad of it
      if (board.round) {                                       // C-102: the Dial -- large in the middle of the circle
        drawArt(W / 2 - 64 + drift / 2, 24 + bob + hop, 2);
        canvas.setTextDatum(MC_DATUM); canvas.setTextFont(2); canvas.setTextColor(PAPER);
        canvas.drawString(st.daemon.nickname + "  L" + String(st.daemon.level), W / 2, 164);
        canvas.setTextFont(1); canvas.setTextColor(st.daemon.word.length() ? day : QUIET);
        canvas.drawString(st.daemon.word.length() ? st.daemon.word : "fed " + String(st.daemon.fed) + "/3  water " + String(st.daemon.watered) + "/3", W / 2, 180);
        canvas.setTextColor(QUIET); footer("press: care for it");   // DRAFT
      } else {
      drawArt(18 + drift, 32 + bob + hop, 2);                  // C-36: as the game draws it, twice its size
      int x = 168;
      canvas.setTextDatum(TL_DATUM);
      canvas.setTextFont(st.daemon.nickname.length() <= 8 ? 4 : 2); canvas.setTextColor(PAPER);
      canvas.drawString(st.daemon.nickname, x, 40);
      canvas.setTextFont(2); canvas.setTextColor(QUIET);
      // its species beside its level -- unless its nickname already is the species
      String lv = "L" + String(st.daemon.level) + (st.daemon.grownTo > st.daemon.level ? " > " + String(st.daemon.grownTo) : "");   // C-45
      canvas.drawString((st.daemon.nickname == st.daemon.name ? String("") : st.daemon.name + "  ") + lv, x, 72);
      // C-13: how it is, and its day -- never more than this, and never a nag
      if (st.daemon.word.length()) { canvas.setTextColor(day); canvas.drawString(st.daemon.word, x, 90); canvas.setTextColor(QUIET); }
      canvas.drawString("fed " + String(st.daemon.fed) + "/3  water " + String(st.daemon.watered) + "/3", x, 108);
      if (st.daemon.cue.length()) wrap(st.daemon.cue, x, 126, W - x - 6, 1, 11, 2, QUIET);
      else if (st.daemon.holding.length()) wrap("holding " + st.daemon.holding, x, 126, W - x - 6, 1, 11, 2, QUIET);
      canvas.setTextFont(1); canvas.setTextDatum(BL_DATUM); canvas.setTextColor(QUIET);
      canvas.drawString("press: care for it", x, H - 4);
      }
    } else {
      canvas.drawString("THE DAEMON YOU CARRY", 10, 34);
      wrap("None yet. In the game, choose SEND in a daemon's menu, then SYNC in the app.", 10, 58, W - 20, 2, 18, 4, PAPER);
    }
  }
  if (millis() < flashUntil) {               // a word that something happened
    canvas.setTextFont(4);                     // the box fits the word (seen with SHOT 2026-10-07: it overflowed)
    if (canvas.textWidth(flash) > W - 40) canvas.setTextFont(2);
    int bw = min(W - 16, max(140, (int)canvas.textWidth(flash) + 32));
    canvas.fillRoundRect(W / 2 - bw / 2, H / 2 - 22, bw, 44, 6, day);
    canvas.setTextColor(ink); canvas.setTextDatum(MC_DATUM);
    canvas.drawString(flash, W / 2, H / 2);
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
