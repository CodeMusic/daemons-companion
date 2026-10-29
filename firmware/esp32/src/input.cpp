// The dial and the buttons, doing a step, and sleep (C-67: from main.cpp).
#include <Wire.h>
#include "app.h"
#include "talk.h"
#include "radios.h"
#include "leds.h"
#include "sound.h"
#include "broadcast.h"
#include "lora.h"
#include "broadcast.h"                    // C-154: what came while asleep, said on waking

bool asleep = false;
uint32_t lastInput = 0;                   // C-42: any touch; left alone `sleepAfter` seconds, it sleeps
long lastDone = -1; String lastDoneText; uint32_t lastDoneAt = 0;   // C-49: the step just done, for its undo
bool keyWas = true, sideWas = true; uint32_t keyAt = 0, sideAt = 0;
bool undoable() { return lastDone >= 0 && millis() - lastDoneAt < UNDO_MS; }

// C-117 (the user, 2026-10-12: "easier to learn"): on a board with three front buttons, home is the daemon and the
// buttons tend it -- A drink, B feed, C train, as the phone's widget has them -- and A and C pressed together open the
// menu (the pages and everything under them, as before), and close it again. The care kinds keep their own numbers --
// feed 0, water 1, train 2, sleep 3 -- which the server, the sounds (TUNE_CARE) and the CARE list all read.
// C-149 (the user, 2026-10-17): home's three buttons re-laid -- A opens CARE (there A drink, B feed, C train, or sleep
// at bedtime: one press, and home), B the ROUTINES (the CASINO first), C its INDEX entry (and OPUS's margin; there A
// reads it aloud, B shows more, C goes home). A and C together still open the whole menu.
bool menuOpen = false;
bool quickScreen() { return board.threeKeys() && !menuOpen && (screen == CARE_KEYS || screen == INDEX_ENTRY); }
static void goHome() { screen = HOME; page = homePage(); dirty = true; }
void goHomeNow() { goHome(); }                  // C-161: the watch's crown, pressed twice
String composing;                         // C-123
// C-123: the message typed, sent to everyone nearby over LoRa -- or said why not
static void sendComposed() {
  String t = composing; t.trim();
  screen = HOME; composing = ""; dirty = true;
  if (!t.length()) return;
  if (!st.carrying) { say("No daemon here to carry it"); return; }                 // DRAFT
  // C-134 (the user, 2026-10-18: "we should not just ping over lora -- but also over bluetooth -- or over the internet"):
  // a broadcast -- every way the board has, one id, shown once wherever it lands
  say(castSend(CAST_SAY, t) ? "Sent to every daemon" : "It did not go");             // DRAFT
}
uint8_t keysHeld = 0;                     // C-121: the three buttons down right now (bit 0 A, 1 B, 2 C), lit on the screen
// C-118: and wake, 4 -- only waking it, from any button while it sleeps
static const char *CARE_KIND[] = { "feed", "water", "train", "sleep", "wake" },
                  *CARE_SAID[] = { "Eaten.", "Drank.", "Trained.", "Asleep.", "Awake." };   // DRAFT
const int CARE_ORDER[4] = { 1, 0, 2, 3 };       // the CARE list's rows, top down: DRINK, FEED, TRAIN, SLEEP
void careDo(int kind) {
  if (!st.carrying) { say("No daemon here"); soundBack(); return; }           // DRAFT
  // C-118: seen and heard at once -- the server's answer (and the expression it brings) follows the report.
  // C-121 (the user, 2026-10-15: "presume the happy path show the screen feedback and then send to the server"): it is
  // presumed done -- the word, its day and the hop drawn before anything else, the tune from its own task, and the
  // server told from the outbox (net.cpp), so nothing here waits on a sound or the network
  say(CARE_SAID[kind]);
  st.daemon.tired = kind == 3 ? "asleep" : kind == 4 || st.daemon.tired == "asleep" ? "awake" : st.daemon.tired;
  if (kind == 0) st.daemon.fed = min(3, st.daemon.fed + 1);
  if (kind == 1) st.daemon.watered = min(3, st.daemon.watered + 1);
  activity(0, String(CARE_SAID[kind]) + (kind == 0 ? "  FED " + String(st.daemon.fed) + "/3" : kind == 1 ? "  WATER " + String(st.daemon.watered) + "/3" : ""), 0);   // C-183
  dirty = true;
  draw();
  if (kind == 4) soundWake(); else soundCare(kind);   // from its task -- or, without PSRAM, played here (sound.cpp)
  if (kind != 3) { hopUntil = millis() + 480; dirty = true; }   // after it, so where the tune is played here the hop still shows
  report(CARE_KIND[kind], "device");
  if (kind == 3) nightTuck(); else if (kind == 4) nightWake();   // C-200: tucked in, the night begins; woken, it ends
}

void inputBegin() {
  if (board.encA >= 0) {
    pinMode(board.encA, INPUT_PULLUP); pinMode(board.encB, INPUT_PULLUP);
    encLast = (digitalRead(board.encA) << 1) | digitalRead(board.encB);
  }
  if (board.encKey >= 0) pinMode(board.encKey, INPUT_PULLUP);   // C-75: the CoreS3 has no key -- only its touch
  if (board.hasSideKey()) pinMode(board.sideKey, INPUT_PULLUP);
  if (board.threeKeys()) {                 // C-75: pulled up on the M5GO's board (37-39 have no pull-ups of their own);
    int mode = board.kind == BoardKind::M5Core ? INPUT : INPUT_PULLUP;   // C-105: the T-Display-S3 Pro's, ours
    pinMode(board.keyLeft, mode); pinMode(board.keyRight, mode); pinMode(board.encKey, mode);
  }
  if (board.tbUp >= 0) for (int p : { board.tbUp, board.tbDown, board.tbLeft, board.tbRight }) pinMode(p, INPUT_PULLUP);   // C-104
}

// ---- C-104: the T-Deck's trackball and keyboard -------------------------------------------------------------------
// The trackball is four pins that toggle as the ball rolls (up, down, left, right); three toggles one way make a step
// of the dial (Meshtastic's threshold), drained by dialStep() -- so a routine tuning a radio reads the ball as it reads
// the dial. Its press is BOOT, read as the plain T-Embed's dial press (readKeyAlone: a tap presses, held it goes back).
// The keyboard is its own ESP32-C3 on I2C 0x55: one character a read, 0 when none. Enter presses and Backspace goes
// back everywhere; on a password screen the letters type; while a routine runs they go to it (deckTakeKey).
static int tbPending = 0, deckKey = 0;
void touchStep(int step) { tbPending += step; }   // C-161: the watch's swipe inside a routine (radio.cpp buttonEvent)
int cardputerKey();                       // C-136: cardputer.cpp
int deckTakeKey() { int k = deckKey; deckKey = 0; return k; }
void readDeck() {
  if (board.tbUp >= 0) {                                      // C-136: a keyboard without a ball (the Cardputers) reads on
    static bool last[4], first = true; static int sum = 0;
    const int pins[4] = { board.tbUp, board.tbDown, board.tbLeft, board.tbRight }, dir[4] = { -1, 1, -1, 1 };
    if (first) { for (int i = 0; i < 4; i++) last[i] = digitalRead(pins[i]); first = false; }
    for (int i = 0; i < 4; i++) { bool v = digitalRead(pins[i]); if (v != last[i]) { last[i] = v; sum += dir[i]; } }
    if (sum >= 3 || sum <= -3) { tbPending += sum > 0 ? 1 : -1; sum = 0; }
  }
  if (!board.keyboard) return;
  int c = 0;
  bool cardputer = board.kind == BoardKind::Cardputer || board.kind == BoardKind::CardputerAdv;
  if (cardputer) c = cardputerKey();                            // C-136: its matrix, or its TCA8418 (cardputer.cpp)
  else {
    static uint32_t askedAt = 0;
    if (millis() - askedAt < 40) return;
    askedAt = millis();
    Wire.requestFrom((uint8_t)0x55, (uint8_t)1);
    c = Wire.available() ? Wire.read() : 0;
  }
  if (c <= 0 || c == 0xFF) return;
  // C-136: the arrows (Fn with ; . , /) move as the T-Deck's ball rolls; on a Cardputer, which has no ball, ; , . / do
  // too wherever nothing is being typed
  bool typing = screen == TYPE_PASS || routineRunning;
  int arrow = c == 0x11 || c == 0x13 ? -1 : c == 0x12 || c == 0x14 ? 1 : 0;
  if (!arrow && cardputer && !typing) arrow = c == ';' || c == ',' ? -1 : c == '.' || c == '/' ? 1 : 0;
  if (arrow && !routineRunning) { if (!wake()) { lastInput = millis(); turn(arrow); } return; }
  keyboardIn(c);
}

// One key from the T-Deck's keyboard -- or from the cable (KEY TYPE, KEY ENTER, KEY BKSP: C-123's check with SHOT)
void keyboardIn(int c) {
  if (loraMessageRead()) { wake(); return; }                    // C-123: a message heard is read by the next key -- only that
  if (wake()) return;                                           // a key wakes it, and does nothing else
  lastInput = millis();
  if (routineRunning) { deckKey = c; return; }
  // C-123 (the user, 2026-10-15: "type messages with the keyboard and it would broadcast over lora to all nearby
  // devices"): at home, typing starts a message to everyone nearby; in it the letters go to it, Enter sends it,
  // Backspace takes a letter back -- and on an empty message, leaves it
  if (screen == COMPOSE) {
    if (c == 13 || c == 10) sendComposed();
    else if (c == 8) { if (composing.length()) composing.remove(composing.length() - 1); else screen = HOME; }
    else if (c >= 32 && c < 127 && composing.length() < 80) composing += (char)c;   // C-134: a broadcast's word
    dirty = true; return;
  }
  if (screen == HOME && c >= 32 && c < 127) { screen = COMPOSE; composing = String((char)c); dirty = true; return; }   // C-134: any keyboard
  if (screen == TYPE_PASS && c != 13 && c != 10 && c != 8) { if (c >= 32 && c < 127) { typed += (char)c; dirty = true; } return; }
  if (c == 13 || c == 10) { if (screen == TYPE_PASS) wheelAt = 0; press(); }   // Enter on a password: OK
  else if (c == 8) back();
}

// ---- C-49: doing a step is one press; undoing it, the top button, for a little while after --------------------------

void tick() {
  if (!st.have || st.step < 0) { say("Nothing yet"); return; }
  long id = st.step;
  lastDone = id; lastDoneText = st.stepText; lastDoneAt = millis();
  activity(2, "DONE: " + st.stepText, 1);                        // C-183: a step done is one EXP (C-47)
  if (bridgeLive()) { bridge("TICK " + String(id)); return; }       // the bridge answers CELEBRATE, then STATE
  bool ok;
  String got = http("POST", "/api/device/ticks", "{\"steps\":[" + String(id) + "]}", &ok);
  JsonDocument d;
  if (ok && !deserializeJson(d, got)) { takeState(got); celebrate(d["celebrate"] | ""); return; }
  lastDone = -1;
  say("No link");
}

void untick() {
  long id = lastDone;
  lastDone = -1;
  say("Undone.");
  draw();
  soundUndo(st.daemon.species, dayIndex());
  if (bridgeLive()) { bridge("UNTICK " + String(id)); return; }
  httpState("POST", "/api/device/untick", "{\"step\":" + String(id) + "}");
}

// ---- the encoder: a quadrature state table, read every pass of the loop -------------------------------------------
int8_t encLast = 0, encSum = 0;
// One step of the dial: +1 right, -1 left -- from the dial itself, or KEY RIGHT / KEY LEFT down the cable.
int entryTop = 0, entryLines = 0;

// C-172: the row or tile tapped -- that many from the chosen one -- chosen; a grid's pages turn by swipes, not by this
void pick(int off) {
  if (!off) return;
  if (gridLists() && screen == LAUNCH) launchAt = constrain(launchAt + off, 0, LAUNCH_N - 1);
  else if (gridLists() && screen == TYPES) typeAt = constrain(typeAt + off, 0, typeCount - 1);
  else if (gridLists() && screen == LIST) routineAt = constrain(routineAt + off, 0, max(0, types[typeAt].count - 1));
  else turn(off);
  dirty = true;
}
// a grid's next or last page of four, round
static int gridPage(int sel, int n, int step) { int pages = (n + 3) / 4, p = (sel / 4 + pages + (step > 0 ? 1 : -1)) % pages; return p * 4; }

void turn(int step) {
  if (asleep) return;                   // C-79: asleep, the dial does nothing -- it turns in a pocket
  wake();                               // (awake, this only marks the input)
  if (gridLists() && (screen == LAUNCH || screen == TYPES || (screen == LIST && types[typeAt].count > 0))) {   // C-172
    soundTurn(step);
    if (screen == LAUNCH) launchAt = gridPage(launchAt, LAUNCH_N, step);
    else if (screen == TYPES) typeAt = gridPage(typeAt, typeCount, step);
    else routineAt = gridPage(routineAt, types[typeAt].count, step);
    dirty = true;
    return;
  }
  ledsSpin(step);                       // C-38: a light once round the ring, the way the dial turned
  soundTurn(step);                      // C-40: rising for right, falling for left
  if (screen == HOME) {                 // C-71: the watch has its face first
    // SWITCH OFF last (the user, 2026-10-15)
    // C-159: SOUND before it, on or off on the board itself
    // C-161 (the user, 2026-10-18: "the first tabs should be the most used ones (goals, routines, etc... and finally
    // settings"): on the face boards TODAY, then ROUTINES, then the daemon, the day, and SETTINGS (SOUND_PAGE) last
    static const Page EMBED[] = { TODAY, DAEMON, ROUTINES_PAGE, DAY_PAGE, SOUND_PAGE, OFF_PAGE }, WATCH[] = { FACE_PAGE, TODAY, ROUTINES_PAGE, DAEMON, DAY_PAGE, TALK_PAGE, SOUND_PAGE, POWER_PAGE, OFF_PAGE };   // C-243: LOW POWER   // C-211: TALK on the watches
    bool face = board.touch || board.round;   // C-102: the Dial's round face first, as the watch's
    // C-163: the watch has no SWITCH OFF -- its crown held sleeps, held longer switches it off (its power chip)
    // counted from the lists, so a page added to one cannot strand the last (C-211 added TALK and SWITCH OFF fell off)
    const int nWatch = sizeof WATCH / sizeof WATCH[0], nEmbed = sizeof EMBED / sizeof EMBED[0];
    const Page *order = face ? WATCH : EMBED; int n = face ? (isWatch() ? nWatch - 1 : nWatch) : nEmbed, at = 0;   // the watch: no SWITCH OFF
    for (int i = 0; i < n; i++) if (order[i] == page) at = i;
    page = order[(at + n + step) % n];   // round either way (the user, 2026-10-18: "so u can swipe either direction")
  }
  else if (screen == TYPES) typeAt = (typeAt + typeCount + step) % typeCount;
  else if (screen == CARE_GRID) gridAt = (gridAt + 4 + step) % 4;                // C-163: a swipe, tile to tile
  else if (screen == PARTY && partyRows()) partyAt = partyAtRow((partyRowOf(partyAt) + partyRows() + step) % partyRows());   // C-68
  else if (screen == MOVES && st.party[partyAt].n) moveAt = (moveAt + st.party[partyAt].n + step) % st.party[partyAt].n;
  else if (screen == CARE) careAt = (careAt + 5 + step) % 5;        // C-114: FEED WATER TRAIN SLEEP, its INDEX entry
  else if (screen == INDEX_ENTRY) entryTop = max(0, entryTop + step);   // C-99: the entry scrolls (the draw keeps it in)
  else if (screen == PICK_REMOTE && flareCount()) remoteAt = (remoteAt + flareCount() + step) % flareCount();
  else if (screen == PICK_NET && netCount) netAt = (netAt + netCount + step) % netCount;
  else if (screen == TYPE_PASS) wheelAt = (wheelAt + WHEEL_N + step) % WHEEL_N;
  else if (screen == LIST && types[typeAt].count > 0)
    routineAt = (routineAt + types[typeAt].count + step) % types[typeAt].count;
  dirty = true;
}

// One detent of the dial, read and spent: +1, -1 or 0. A routine that runs the dial itself (a radio's tuning) reads it
// here, so its turns tune rather than turn pages.
int dialStep() {
  if (board.encA < 0) {                          // the watch: touch instead (its own screens); the T-Deck: its trackball
    if (!tbPending) return 0;
    int step = tbPending > 0 ? 1 : -1; tbPending -= step; return step;
  }
  static const int8_t table[16] = {0, -1, 1, 0, 1, 0, 0, -1, -1, 0, 0, 1, 0, 1, -1, 0};
  int8_t now = (digitalRead(board.encA) << 1) | digitalRead(board.encB);
  encSum += table[(encLast << 2) | now];
  encLast = now;
  if (encSum < 4 && encSum > -4) return 0;
  int step = encSum > 0 ? 1 : -1;
  encSum = 0;
  return step;
}

void readEncoder() { int step = dialStep(); if (step) turn(step); }

// The top button, pressed while a routine waits -- or, on a board without one, the dial held (C-67).
// the review, 2026-10-28: inside a routine that reads swipes and taps itself, a touch is not giving up -- the watches go
// back by a hold or the crown (routineInput's -1); the boards with buttons, by their own
bool routineQuit() { return board.touch ? false : giveUp(); }
bool giveUp() {                        // the watch: a touch anywhere
  if (board.threeKeys()) return !digitalRead(board.keyLeft) || (board.touch && watchTouchDown());   // C-75: A, which goes back; C-105 or a touch
  return board.touch ? watchTouchDown() : board.hasSideKey() ? !digitalRead(board.sideKey) : !digitalRead(board.encKey);
}

// The encoder's press: in, or run. On TODAY it ticks the step off, as it always has.
void press() {
  if (dreamShowing()) { dreamDismiss(); lastInput = millis(); return; }   // C-200: good morning
  if (readShowing()) { readDismiss(); lastInput = millis(); return; }     // C-203: the read, put away
  if (screen == COMPOSE) { sendComposed(); return; }            // C-123: the trackball's press sends it too
  lastInput = millis();
  ledsFlash();                                                  // C-38
  soundSelect();                                                // C-40
  if (screen == HOME) {
    if (page == TODAY) tick();
    else if (page == DAY_PAGE) { soundSelect(); delay(160); soundSelect(); }   // C-73: the day's note, twice
    else if (page == OFF_PAGE) switchOff("Off.");                                // the user, 2026-10-15; DRAFT
    else if (page == SOUND_PAGE) { soundSetHere(!cfg.sound); if (cfg.sound) soundSelect(); }   // C-159
    else if (page == POWER_PAGE) powerSetLow(!cfg.power.low);                                    // C-243
    else if (page == TALK_PAGE && st.talk.have) {               // C-211: the other one first, at once; the server is told
      st.talk.first = st.talk.first == "module" ? "n8n" : "module";
      report("talkfirst", st.talk.first);
      dirty = true;
    }
    else if (page == DAEMON && st.carrying) { screen = CARE; careAt = 0; }   // C-13
    else if (page == ROUTINES_PAGE) {
      if (partyFirst()) { screen = PARTY; partyAt = st.partyN; }    // C-68: the party's routines, on a board with no radios -- its RADIOS first
      // C-153 (the user, 2026-10-18): with no daemon here the types still open -- TOUCHSTONE's HOLD A CARD is how a board
      // takes one back off a card; a routine that needs a daemon says so when it runs (C-51 sent an empty board to PARTY)
      else { screen = TYPES; typeAt = 0; }
    }
  } else if (screen == TYPES) {
    if (isPartyType(typeAt)) { screen = PARTY; partyAt = 0; }     // C-68: the CC1101's way in
    else if (!strcmp(types[typeAt].name, "CASINO") || !strcmp(types[typeAt].name, "BOOKS")) { routineAt = 0; runRoutine(); }   // C-149: its one routine, at once (C-208 BOOKS too)
    else { screen = LIST; routineAt = 0; }
  }
  else if (screen == CARE_KEYS) { careDo(0); goHome(); }          // C-149: the cable's KEY PRESS is B, which feeds
  else if (screen == CARE_GRID) { careDo(careGridKind(gridAt)); goHome(); }   // C-163: the tile chosen, then home
  else if (screen == LAUNCH) {                                    // C-172: the page tapped -- ROUTINES straight to its types
    Page p = LAUNCH_PAGES[launchAt];
    screen = HOME; page = p;
    if (p == ROUTINES_PAGE) { if (partyFirst()) { screen = PARTY; partyAt = st.partyN; } else { screen = TYPES; typeAt = 0; } }
  }
  else if (screen == PARTY) {
    if (partyAt >= st.partyN) { if (partyFirst()) { screen = TYPES; typeAt = 0; } }   // the radios' row
    else if (!st.party[partyAt].n) say("No routines yet");                         // DRAFT
    else { screen = MOVES; moveAt = 0; }
  }
  else if (screen == MOVES) playGameRoutine();
  else if (screen == LIST) { if (types[typeAt].count > 0) runRoutine(); }
  else if (screen == RUN) runRoutine();
  else if (screen == INDEX_ENTRY && talkCan()) talkReadEntry();   // C-65: its entry, aloud
  else if (screen == PICK_REMOTE) {
    flareSetActive(remoteAt);
    runResult = daemonName() + " uses " + flareName(remoteAt) + " now.";
    screen = RUN;
    reportRemotes();
  }
  else if (screen == CARE) {
    if (careAt == 4) { screen = INDEX_ENTRY; entryTop = 0; }
    else {
      careDo(CARE_ORDER[careAt]);                                // C-114; C-117: DRINK first, as the buttons are
      screen = HOME; page = DAEMON;
      menuOpen = false;                                          // C-118: back to the buttons tending it, not turning pages
    }
  }
  else if (screen == PICK_NET && netCount) { screen = TYPE_PASS; typed = ""; wheelAt = 1; }
  else if (screen == TYPE_PASS) {
    if (wheelAt) typed += WHEEL[wheelAt];
    else {                                     // OK: join
      learnNetwork(nets[netAt], typed, "");
      runResult = daemonName() + " learned " + nets[netAt] + ", and joins it whenever it is near.\n\nThe corner says WIFI once it has." +
                  (serverUrl.length() ? "" : "\nLink it by the cable once, and it learns where the server is.");
      screen = RUN;
      reportNetworks();
    }
  }
  dirty = true;
}

// The top button: back one step.
void back() {
  lastInput = millis();
  ledsDark();                                                   // C-38
  soundBack();                                                  // C-40
  if (screen == HOME && page == TODAY && undoable()) { untick(); return; }   // C-49
  // C-172: on the watch a page goes back to the tiles it was opened from, and the tiles to the face
  if (gridLists() && screen == HOME && page != FACE_PAGE && launchIndex(page) >= 0) { openLaunch(launchIndex(page)); return; }
  if (screen == LAUNCH) { goHome(); dirty = true; return; }
  if (screen == HOME && menuOpen) { menuOpen = false; page = homePage(); dirty = true; return; }   // C-117: out of the menu
  if (screen == TALK) { screen = HOME; }                         // C-66
  if (screen == COMPOSE) { screen = HOME; composing = ""; dirty = true; return; }   // C-123: not sent
  else if (screen == INDEX_ENTRY) { if (quickScreen()) goHome(); else { screen = CARE; careAt = 4; } }   // C-149
  else if (screen == CARE_KEYS) goHome();                                    // C-149: nothing done
  else if (screen == CARE_GRID) goHome();                                    // C-163: nothing done
  else if (screen == CARE) { screen = HOME; page = DAEMON; }
  else if (screen == TYPE_PASS) { if (typed.length()) typed.remove(typed.length() - 1); else screen = PICK_NET; }
  else if (screen == PICK_NET || screen == PICK_REMOTE) screen = LIST;
  else if (screen == RUN) screen = !strcmp(types[typeAt].name, "CASINO") ? TYPES : LIST;   // C-149: the CASINO has no list
  else if (screen == LIST) screen = TYPES;
  else if (screen == MOVES) screen = PARTY;                                   // C-68
  else if (screen == PARTY) {
    if (partyFirst()) { screen = HOME; page = ROUTINES_PAGE; }                 // C-153: an empty board came from TYPES too
    else { screen = TYPES; for (int i = 0; i < typeCount; i++) if (isPartyType(i)) typeAt = i; }
  }
  else if (screen == TYPES && partyFirst()) { screen = PARTY; partyAt = st.partyN; }   // back to the radios' row
  else if (screen == TYPES && board.threeKeys() && !menuOpen) goHome();      // C-149: B opened them from home
  else if (screen == TYPES && gridLists()) openLaunch(1);                    // C-172: back to the tiles
  else if (screen == TYPES) { screen = HOME; page = ROUTINES_PAGE; }
  dirty = true;
}

// ---- C-39: sleep. Hold the top button and press the front one: the screen, its light and the ring go dark. ONLY THE
// TOP BUTTON wakes it (C-79, the user 2026-10-07: the dial and the front button woke it in a pocket), and the wake does
// nothing else. The link keeps running underneath (readUsb, the Wi-Fi poll), so it wakes current.
bool chorded = false;

// C-242: on the Ultra, with ALWAYS-ON FACE set, sleep keeps the face at home, dim, redrawn once a minute (main.cpp);
// the touch and the buttons still do nothing until a wake
static bool aodNow = false;
bool aodShowing() { return asleep && aodNow; }
void sleepNow() {
  asleep = true;
  aodNow = powerAod();
  if (aodNow) {
    screen = HOME; menuOpen = false; page = homePage();
    draw(); backlightDim();
  } else {
    canvas.fillSprite(TFT_BLACK); present();
    backlight(false);
  }
  ledsSleep(true);
}

// True if this input was spent waking the board.
// Waking lands on home -- the daemon, by default (C-42) -- whatever menu it fell asleep in, to the title's jingle (C-41).
Page homePage() {
  if (board.threeKeys()) return DAEMON;           // C-117: its buttons tend the daemon, so home is the daemon
  return board.touch || board.round ? FACE_PAGE : cfg.home == "today" ? TODAY : DAEMON;
}

bool wake() {
  lastInput = millis();
  loraMessageRead();                              // C-123: any touch reads a message heard (the T-Deck's keys: readDeck)
  if (!asleep) return false;
  asleep = false;
  screen = HOME;
  menuOpen = false;                               // C-117: it wakes at home, out of the menu
  page = homePage();
  castWoke();                                     // C-154: what came while it slept
  draw();
  backlight(true);
  ledsSleep(false);
  if (cfg.wakeEvery) soundWake();                  // C-159 (the user, 2026-10-18): the jingle at power-up, unless set for every wake
  dirty = true;
  return true;
}

// The front button acts on press. The top button acts on RELEASE -- going back -- unless the front was pressed while it
// was held (the sleep chord), so holding it to start the chord never goes back a page.
void readKeyAlone();
void readKeyStick();
void readKeyCore();
// C-66: the front button presses on RELEASE now, so that held it can mean talk -- held 0.45 s at home, the board
// listens until it is let go (talk.cpp). A press is still a press; the chord still sleeps at once.
static const uint32_t TALK_HOLD_MS = 450;
void readKey() {
  if (board.encKey < 0) return;                                  // C-75: the CoreS3 -- touch and its power key (watch.cpp)
  if (board.threeKeys()) { readKeyCore(); return; }              // C-75: the M5GO and Fire's A, B and C
  if (board.noDial()) { readKeyStick(); return; }                // C-74: the StickS3's two buttons
  if (!board.hasSideKey()) { readKeyAlone(); return; }
  static bool pending = false;
  bool up = digitalRead(board.encKey);
  if (up != keyWas && millis() - keyAt > 30) {
    keyAt = millis(); keyWas = up;
    if (!up && !asleep) {                                      // C-79: asleep, the front button does nothing
      wake();
      if (!sideWas) { chorded = true; sleepNow(); }            // top held: the chord
      else pending = true;
    } else if (up && pending) { pending = false; press(); }    // let go before it became a talk: a press
  }
  if (pending && !up && millis() - keyAt > TALK_HOLD_MS && (screen == HOME || screen == TALK) && talkCan()) {
    pending = false;
    talkHold();
    keyWas = true; keyAt = millis(); dirty = true;
  }
  bool sideUp = digitalRead(board.sideKey);
  if (sideUp != sideWas && millis() - sideAt > 30) {
    sideAt = millis(); sideWas = sideUp;
    if (!sideUp) { if (wake()) chorded = true; }               // pressed: a wake spends this whole press
    else if (chorded) chorded = false;                         // released after the chord (or a wake): nothing more
    else back();
  }
}

// C-74: two buttons and no dial (the StickS3). The face button (KEY1) is the dial's press: a tap presses, and held
// 0.45 s at home it talks. The side button (KEY2) is the dial: a tap turns to the next, held half a second goes back,
// held two seconds sleeps -- and asleep, only a hold on it wakes the board (C-79: nothing wakes it in a pocket). Each
// acts on release, so a hold is never also a press.
void readKeyStick() {
  static bool faceDown = false, sideDown = false; static uint32_t faceAt = 0, sideAt2 = 0;
  uint32_t now = millis();
  bool face = !digitalRead(board.encKey), side = !digitalRead(board.sideKey);
  if (face && !faceDown && now - faceAt > 30) { faceDown = true; faceAt = now; }
  else if (face && faceDown && !asleep && now - faceAt >= TALK_HOLD_MS && (screen == HOME || screen == TALK) && talkCan()
           && !(page == TODAY && undoable())) {
    talkHold();
    faceDown = false; faceAt = millis(); dirty = true;
    while (!digitalRead(board.encKey)) delay(5);
  }
  else if (!face && faceDown && now - faceAt > 30) {
    faceDown = false;
    if (!asleep) { wake(); press(); }
    faceAt = now;
  }
  if (side && !sideDown && now - sideAt2 > 30) { sideDown = true; sideAt2 = now; }
  else if (!side && sideDown && now - sideAt2 > 30) {
    sideDown = false;
    uint32_t held = now - sideAt2;
    sideAt2 = now;
    if (asleep) { if (held >= 500) wake(); return; }
    wake();
    if (held >= 2000) sleepNow();
    else if (held >= 500) back();
    else turn(1);
  }
}

// C-75: three buttons and no dial (the M5GO and the Fire). C-117: at home (the daemon, the menu closed) a tap tends it
// -- A drink, B feed, C train; A and C together open the menu, where A and C are the dial, left and right, and B its
// press, as before; A and C together again, or A held, close it. B held 0.45 s at home talks; A held goes back (and
// undoes a step just ticked); C held two seconds sleeps -- and asleep, only a hold on B wakes it. Each acts on release,
// so a hold is never also a tap, and the two of a chord never act alone.
// C-121: KEY DOWN A|B|C, KEY UP A|B|C and KEY CANCEL down the cable (net.cpp) -- a press from the computer, read here
// as a finger's is, so check_keys.py can hold a button through a SHOT. CANCEL forgets what is held without acting on it:
// a SHOT takes seconds, and a button held that long would go back, talk or sleep when let go.
static bool forced[3] = { false, false, false }, forget = false;
void keyForce(int k, bool held) { if (k >= 0 && k < 3) forced[k] = held; }
void keyForget() { forced[0] = forced[1] = forced[2] = false; forget = true; }

void readKeyCore() {
  static bool down[3] = { false, false, false }; static uint32_t at[3] = { 0, 0, 0 };
  static bool offWarned = false;                                 // C held past two seconds: said once
  static bool chord = false;                                     // C-117: A and C were down together
  const int pins[3] = { board.keyLeft, board.encKey, board.keyRight };
  auto up = [&](int k) { return digitalRead(pins[k]) && !forced[k]; };
  uint32_t now = millis();
  if (forget) { forget = chord = false; down[0] = down[1] = down[2] = false; keysHeld = 0; dirty = true; return; }
  if (down[0] && down[2]) chord = true;
  if (chord && up(0) && up(2)) {                                 // both let go: the menu, open or closed
    chord = false; down[0] = down[2] = false; at[0] = at[2] = now;
    keysHeld &= ~5;
    if (asleep) return;
    wake();
    if (menuOpen) { menuOpen = false; screen = HOME; page = homePage(); }
    else { menuOpen = true; screen = HOME; }
    soundSelect(); dirty = true;
    return;
  }
  for (int k = 0; k < 3; k++) {
    bool pressed = !up(k);
    if (chord && k != 1) continue;                               // the chord's own buttons wait for both to be let go
    if (pressed && !down[k] && now - at[k] > 30) {
      down[k] = true; at[k] = now;
      if (k == 2) offWarned = false;
      // C-121: the press is felt the moment it lands -- a tick, and its word lit -- whatever it turns out to do on release
      if (!asleep) { keysHeld |= 1 << k; soundTap(); dirty = true; draw(); }
      continue;
    }
    if (pressed && down[k] && k == 1 && !forced[k] && !asleep && now - at[k] >= TALK_HOLD_MS && (screen == HOME || screen == TALK) &&
        talkCan() && !(page == TODAY && undoable())) {
      keysHeld &= ~(1 << k);
      talkHold();                                                // listens until B is let go
      down[k] = false; at[k] = millis(); dirty = true;
      while (!digitalRead(pins[k])) delay(5);
      continue;
    }
    // C held (the user, 2026-10-15, "no way to turn it off"): two seconds, let go, the screen sleeps, as before; held on,
    // it says so, and at five the board switches off -- at once, not on letting go
    if (pressed && down[k] && k == 2 && !forced[k] && !asleep) {
      uint32_t held = now - at[k];
      if (held >= 5000) { down[k] = false; keysHeld = 0; switchOff("Off."); continue; }   // DRAFT
      if (held >= 2000 && !offWarned) { offWarned = true; say("Let go: sleep. Hold: off"); draw(); }   // DRAFT
    }
    if (!pressed && down[k] && now - at[k] > 30) {
      down[k] = false;
      if (keysHeld & (1 << k)) { keysHeld &= ~(1 << k); dirty = true; }
      uint32_t held = now - at[k];
      at[k] = now;
      if (asleep) { wake(); continue; }                          // the user, 2026-10-15: any button wakes it, and only that
      if (loraMessageRead()) { wake(); continue; }               // C-123: a message heard is read by this press -- only that
      wake();
      bool tend = !menuOpen && screen == HOME;                   // C-117: home, the menu closed -- the buttons tend it
      // C-118: asleep, any button wakes it; at bedtime (drowsy, not yet put to bed) CARE's C puts it to bed, not trains
      bool sleeping = st.daemon.tired == "asleep", bed = st.daemon.tired == "drowsy";
      if (tend && sleeping && held < 500) careDo(4);
      else if (k == 2 && held >= 2000) sleepNow();
      else if (k == 0 && held >= 500) back();
      else if (tend) {                                           // C-149: CARE, the ROUTINES, the INDEX
        if (k == 1) { screen = TYPES; typeAt = 0; dirty = true; }
        else if (!st.carrying) { say("No daemon here"); soundBack(); }               // DRAFT
        else if (k == 0) { screen = CARE_KEYS; dirty = true; }
        else { screen = INDEX_ENTRY; entryTop = 0; dirty = true; }
      }
      else if (quickScreen() && screen == CARE_KEYS) { careDo(k == 0 ? 1 : k == 1 ? 0 : bed ? 3 : 2); goHome(); }
      else if (quickScreen()) {                                  // its INDEX entry: A aloud, B more, C home
        if (k == 0) { if (talkCan()) talkReadEntry(); else say("No voice on this board"); }   // DRAFT
        else if (k == 1) { entryTop = entryTop + 3 >= entryLines ? 0 : entryTop + 3; dirty = true; }
        else goHome();
      }
      else if (k == 0) turn(-1);
      else if (k == 2) turn(1);
      else press();
    }
  }
}

// C-67: a board with one button (the plain T-Embed and the SI4732): the dial's press is everything. A tap presses; held
// half a second it goes back; held two seconds it sleeps (and only a hold wakes it, so a pocket cannot). Each acts on
// release, so a hold is never also a press.
void readKeyAlone() {
  static bool down = false; static uint32_t at = 0;
  bool pressed = !digitalRead(board.encKey);
  uint32_t now = millis();
  if (pressed && !down && now - keyAt > 30) { down = true; at = now; keyAt = now; }
  // C-66: at home, held 0.45 s it talks (it listens until let go) -- unless TODAY's step was just ticked, when the hold
  // still undoes it. Away from home a hold goes back, and two seconds sleeps, as before.
  else if (pressed && down && !asleep && now - at >= 450 && screen == HOME && talkCan() && !(page == TODAY && undoable())) {
    talkHold();
    down = false; keyAt = millis(); dirty = true;
    while (!digitalRead(board.encKey)) delay(5);
  }
  else if (!pressed && down && now - keyAt > 30) {
    down = false; keyAt = now;
    uint32_t held = now - at;
    if (asleep) { if (held >= 500) wake(); return; }
    wake();
    if (held >= 2000) sleepNow();
    else if (held >= 500) back();
    else press();
  }
}

