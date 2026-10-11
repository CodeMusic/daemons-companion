// The dial and the buttons, doing a step, and sleep (C-67: from main.cpp).
#include <Wire.h>
#include "app.h"
#include "talk.h"
#include "radios.h"
#include "leds.h"
#include "sound.h"

bool asleep = false;
uint32_t lastInput = 0;                   // C-42: any touch; left alone `sleepAfter` seconds, it sleeps
long lastDone = -1; String lastDoneText; uint32_t lastDoneAt = 0;   // C-49: the step just done, for its undo
bool keyWas = true, sideWas = true; uint32_t keyAt = 0, sideAt = 0;
bool undoable() { return lastDone >= 0 && millis() - lastDoneAt < UNDO_MS; }

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
int deckTakeKey() { int k = deckKey; deckKey = 0; return k; }
void readDeck() {
  if (board.tbUp < 0) return;
  static bool last[4], first = true; static int sum = 0;
  const int pins[4] = { board.tbUp, board.tbDown, board.tbLeft, board.tbRight }, dir[4] = { -1, 1, -1, 1 };
  if (first) { for (int i = 0; i < 4; i++) last[i] = digitalRead(pins[i]); first = false; }
  for (int i = 0; i < 4; i++) { bool v = digitalRead(pins[i]); if (v != last[i]) { last[i] = v; sum += dir[i]; } }
  if (sum >= 3 || sum <= -3) { tbPending += sum > 0 ? 1 : -1; sum = 0; }
  if (!board.keyboard) return;
  static uint32_t askedAt = 0;
  if (millis() - askedAt < 40) return;
  askedAt = millis();
  Wire.requestFrom((uint8_t)0x55, (uint8_t)1);
  int c = Wire.available() ? Wire.read() : 0;
  if (c <= 0 || c == 0xFF) return;
  if (wake()) return;                                           // a key wakes it, and does nothing else
  lastInput = millis();
  if (routineRunning) { deckKey = c; return; }
  if (screen == TYPE_PASS && c != 13 && c != 10 && c != 8) { if (c >= 32 && c < 127) { typed += (char)c; dirty = true; } return; }
  if (c == 13 || c == 10) { if (screen == TYPE_PASS) wheelAt = 0; press(); }   // Enter on a password: OK
  else if (c == 8) back();
}

// ---- C-49: doing a step is one press; undoing it, the top button, for a little while after --------------------------

void tick() {
  if (!st.have || st.step < 0) { say("Nothing yet"); return; }
  long id = st.step;
  lastDone = id; lastDoneText = st.stepText; lastDoneAt = millis();
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

void turn(int step) {
  if (asleep) return;                   // C-79: asleep, the dial does nothing -- it turns in a pocket
  wake();                               // (awake, this only marks the input)
  ledsSpin(step);                       // C-38: a light once round the ring, the way the dial turned
  soundTurn(step);                      // C-40: rising for right, falling for left
  if (screen == HOME) {                 // C-71: the watch has its face first
    static const Page EMBED[] = { TODAY, DAEMON, ROUTINES_PAGE, DAY_PAGE }, WATCH[] = { FACE_PAGE, TODAY, DAEMON, ROUTINES_PAGE, DAY_PAGE };
    bool face = board.touch || board.round;   // C-102: the Dial's round face first, as the watch's
    const Page *order = face ? WATCH : EMBED; int n = face ? 5 : 4, at = 0;
    for (int i = 0; i < n; i++) if (order[i] == page) at = i;
    page = order[(at + n + step) % n];
  }
  else if (screen == TYPES) typeAt = (typeAt + typeCount + step) % typeCount;
  else if (screen == PARTY && partyRows()) partyAt = (partyAt + partyRows() + step) % partyRows();     // C-68
  else if (screen == MOVES && st.party[partyAt].n) moveAt = (moveAt + st.party[partyAt].n + step) % st.party[partyAt].n;
  else if (screen == CARE) careAt = (careAt + 4 + step) % 4;
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
bool giveUp() {                        // the watch: a touch anywhere
  if (board.threeKeys()) return !digitalRead(board.keyLeft) || (board.touch && watchTouchDown());   // C-75: A, which goes back; C-105 or a touch
  return board.touch ? watchTouchDown() : board.hasSideKey() ? !digitalRead(board.sideKey) : !digitalRead(board.encKey);
}

// The encoder's press: in, or run. On TODAY it ticks the step off, as it always has.
void press() {
  lastInput = millis();
  ledsFlash();                                                  // C-38
  soundSelect();                                                // C-40
  if (screen == HOME) {
    if (page == TODAY) tick();
    else if (page == DAY_PAGE) { soundSelect(); delay(160); soundSelect(); }   // C-73: the day's note, twice
    else if (page == DAEMON && st.carrying) { screen = CARE; careAt = 0; }   // C-13
    else if (page == ROUTINES_PAGE) {
      if (partyFirst()) { screen = PARTY; partyAt = 0; }            // C-68: the party's routines, on a board with no radios
      else if (!st.carrying) { screen = PARTY; partyAt = 0; }       // C-51: the radios are the carried daemon's; the party's routines are not
      else { screen = TYPES; typeAt = 0; }
    }
  } else if (screen == TYPES) {
    if (isPartyType(typeAt)) { screen = PARTY; partyAt = 0; }     // C-68: the CC1101's way in
    else { screen = LIST; routineAt = 0; }
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
    if (careAt == 3) { screen = INDEX_ENTRY; entryTop = 0; }
    else {
      static const char *KIND[] = { "feed", "water", "train" }, *SAID[] = { "Eaten.", "Drunk.", "Trained." };
      report(KIND[careAt], "device");
      say(SAID[careAt]);
      soundCare(careAt);
      hopUntil = millis() + 480;
      screen = HOME; page = DAEMON;
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
  if (screen == TALK) { screen = HOME; }                         // C-66
  else if (screen == INDEX_ENTRY) { screen = CARE; careAt = 3; }
  else if (screen == CARE) { screen = HOME; page = DAEMON; }
  else if (screen == TYPE_PASS) { if (typed.length()) typed.remove(typed.length() - 1); else screen = PICK_NET; }
  else if (screen == PICK_NET || screen == PICK_REMOTE) screen = LIST;
  else if (screen == RUN) screen = LIST;
  else if (screen == LIST) screen = TYPES;
  else if (screen == MOVES) screen = PARTY;                                   // C-68
  else if (screen == PARTY) {
    if (partyFirst() || !st.carrying) { screen = HOME; page = ROUTINES_PAGE; }
    else { screen = TYPES; for (int i = 0; i < typeCount; i++) if (isPartyType(i)) typeAt = i; }
  }
  else if (screen == TYPES && partyFirst()) { screen = PARTY; partyAt = st.partyN; }   // back to the radios' row
  else if (screen == TYPES) { screen = HOME; page = ROUTINES_PAGE; }
  dirty = true;
}

// ---- C-39: sleep. Hold the top button and press the front one: the screen, its light and the ring go dark. ONLY THE
// TOP BUTTON wakes it (C-79, the user 2026-10-07: the dial and the front button woke it in a pocket), and the wake does
// nothing else. The link keeps running underneath (readUsb, the Wi-Fi poll), so it wakes current.
bool chorded = false;

void sleepNow() {
  asleep = true;
  canvas.fillSprite(TFT_BLACK); canvas.pushSprite(board.screenX, board.screenY);
  backlight(false);
  ledsSleep(true);
}

// True if this input was spent waking the board.
// Waking lands on home -- the daemon, by default (C-42) -- whatever menu it fell asleep in, to the title's jingle (C-41).
Page homePage() { return board.touch || board.round ? FACE_PAGE : cfg.home == "today" ? TODAY : DAEMON; }

bool wake() {
  lastInput = millis();
  if (!asleep) return false;
  asleep = false;
  screen = HOME;
  page = homePage();
  draw();
  backlight(true);
  ledsSleep(false);
  soundWake();
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

// C-75: three buttons and no dial (the M5GO and the Fire). A and C are the dial, left and right: a tap turns. B is its
// press: a tap presses, and held 0.45 s at home it talks. Held, A goes back (and undoes a step just ticked) and C, two
// seconds, sleeps -- and asleep, only a hold on B wakes it. Each acts on release, so a hold is never also a tap.
void readKeyCore() {
  static bool down[3] = { false, false, false }; static uint32_t at[3] = { 0, 0, 0 };
  const int pins[3] = { board.keyLeft, board.encKey, board.keyRight };
  uint32_t now = millis();
  for (int k = 0; k < 3; k++) {
    bool pressed = !digitalRead(pins[k]);
    if (pressed && !down[k] && now - at[k] > 30) { down[k] = true; at[k] = now; continue; }
    if (pressed && down[k] && k == 1 && !asleep && now - at[k] >= TALK_HOLD_MS && (screen == HOME || screen == TALK) &&
        talkCan() && !(page == TODAY && undoable())) {
      talkHold();                                                // listens until B is let go
      down[k] = false; at[k] = millis(); dirty = true;
      while (!digitalRead(pins[k])) delay(5);
      continue;
    }
    if (!pressed && down[k] && now - at[k] > 30) {
      down[k] = false;
      uint32_t held = now - at[k];
      at[k] = now;
      if (asleep) { if (k == 1 && held >= 500) wake(); continue; }
      wake();
      if (k == 0) { if (held >= 500) back(); else turn(-1); }
      else if (k == 2) { if (held >= 2000) sleepNow(); else turn(1); }
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

