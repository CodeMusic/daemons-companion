// T-426 (the user, 2026-10-18, on the boards with keys): PLAY the game's instrument -- the save's HARP (CONTENT) or FLUTE
// (CONTEXT), LOCKED until the save holds it. Two routines under MUSIC:
//
//   SONGBOOK      a song (the learned ones; a heard one is listed and not yet playable), then a key, then its notes to
//                 play: the scale's degrees as the number keys, each in its colour (the game's key colours, C..B), the
//                 next one boxed. Enter plays it through once, to hear how it goes.
//   PLAY FREELY   a key, then anything; the last notes are listened to as the game listens -- a song in its own key is
//                 named, the same shape in another key is ALMOST (octave and tempo do not count).
//
// On the watches (the user, 2026-10-28: "u can pluck colored strings for the harp or hold notes and blow into the
// microphone for the flute"), the song or the free play is a surface instead of keys, as the app's PLAY draws it: the
// HARP's eight strings in their notes' colours, plucked by a touch or drawn across; the FLUTE's eight holes, each sounding
// while it is held and breath reaches the microphone. Under them the octave, - and +; above, the song's notes (tapped:
// heard through once). The crown goes back.
//
// The keys: 1-7 the scale's seven degrees (the game's buttons, clockwise from Down, then B, A, SELECT); ~ or ` an octave
// down, - or = an octave up (the user's choice); Backspace back. The songs and colours are firmware/common/play.h (from
// server/data/play.json); what the save holds comes in the state (`play`, playFromState). Every word is DRAFT.
#include "app.h"
#include "leds.h"
#include "sound.h"
#include "../../common/play.h"
#include "talk.h"

static String instrument = "harp";
static bool unlocked = false, benchUnlock = false;
static uint32_t learned = 0, heard = 0;                   // a bit per PLAY_SONGS index

static int songIndex(const char *id) { for (int i = 0; i < PLAY_SONG_N; i++) if (!strcmp(PLAY_SONGS[i].id, id)) return i; return -1; }
void playFromState(JsonVariantConst p) {
  if (p.isNull()) return;
  instrument = p["i"] | "harp"; unlocked = p["u"] | false;
  learned = heard = 0;
  for (JsonVariantConst s : p["l"].as<JsonArrayConst>()) { int i = songIndex(s | ""); if (i >= 0) learned |= 1u << i; }
  for (JsonVariantConst s : p["h"].as<JsonArrayConst>()) { int i = songIndex(s | ""); if (i >= 0) heard |= 1u << i; }
}
// PLAY UNLOCK down the cable: open it on this board until it restarts (a bench check, whatever the save holds) --
// with the instrument held, O CHRISTMAS TREE is always known (save/play.ts), so the bench gets that too
void playBenchUnlock() { benchUnlock = true; }
static String forced = "default";                        // the site's INSTRUMENT (TESTING): that one, and PLAY open
void playForce(const String &name) { forced = name; }
static String inst() { return forced != "default" ? forced : instrument; }
static bool open_() { return unlocked || benchUnlock || forced != "default"; }
static bool isLearned(int i) { return (learned >> i & 1) || ((benchUnlock || forced != "default") && !strcmp(PLAY_SONGS[i].id, "FIR")); }
String playStatus() {
  String s = "PLAY " + inst() + (forced != "default" ? " forced" : "") + (unlocked ? " unlocked" : benchUnlock ? " unlocked on the bench" : " locked");
  for (int i = 0; i < PLAY_SONG_N; i++) if (isLearned(i) || (heard >> i & 1)) s += String(" ") + PLAY_SONGS[i].id + (isLearned(i) ? "" : "(heard)");
  return s;
}

// ---- the music ---------------------------------------------------------------------------------------------------------
static const int SCALE[7] = { 0, 2, 4, 5, 7, 9, 11 };    // the major scale's degrees, in semitones
static int tonic(int key) { return 60 + key; }            // C4..B4
static uint16_t colourOf(int midi) { uint32_t c = PLAY_COLOURS[((midi % 12) + 12) % 12]; return tft.color565(c >> 16, (c >> 8) & 255, c & 255); }
static void sound(int midi, int ms) { soundInstrumentNote(midi, ms); }   // C-164: the save's harp or flute (a square wave without a speaker for it)
// a song's note as a degree (0..6, -1 off the scale) and an octave, both against its own key
static void degreeOf(const PlaySong &s, int n, int &deg, int &oct) {
  int rel = s.notes[n] - tonic(s.key);
  oct = rel >= 0 ? rel / 12 : -((11 - rel) / 12);
  int pc = rel - oct * 12; deg = -1;
  for (int d = 0; d < 7; d++) if (SCALE[d] == pc) deg = d;
}
static String keyName(int k) { return String(PLAY_KEYS[k]) + " MAJOR"; }   // DRAFT

// ---- the screens -------------------------------------------------------------------------------------------------------
enum { P_SONGS, P_KEYS, P_GUIDE, P_FREE };
static int mode = P_SONGS, at = 0, top = 0, key = 0, octave = 0, song = -1, nextAt = 0;
static int rows[16], rowsN = 0;                            // the songbook's songs: learned first, then heard
static int played[PLAY_LISTEN], playedN = 0;               // PLAY FREELY: the last notes, as MIDI
static String heardLine; static uint32_t doneAt = 0;
extern void listRow(int i, int at, const String &text, uint16_t day, uint16_t ink, int width);
extern int listRowsFit(); extern int rowH();   // ui.cpp: the rows as this board draws them (the watch's are tall)

static void listSongs() {
  rowsN = 0;
  for (int i = 0; i < PLAY_SONG_N; i++) if (isLearned(i)) rows[rowsN++] = i;
  for (int i = 0; i < PLAY_SONG_N; i++) if (!isLearned(i) && (heard >> i & 1)) rows[rowsN++] = i;
}

static void drawRows(int n, uint16_t day, uint16_t ink, String (*name)(int), uint16_t (*swatch)(int)) {
  int fit = listRowsFit();
  if (at < top) top = at; if (at >= top + fit) top = at - fit + 1;
  for (int i = top; i < n && i < top + fit; i++) {
    listRow(i - top, at - top, name(i), day, ink, W - 12);
    if (swatch) canvas.fillRect(W - 30, 52 + (i - top) * rowH() + (rowH() - 19) / 2 + 2, 16, 12, swatch(i));
  }
}
static String songRow(int i) { int s = rows[i]; return String(PLAY_SONGS[s].title) + (isLearned(s) ? "" : "  (heard)"); }
static String keyRow(int i) { return keyName(i); }
static uint16_t keySwatch(int i) { return colourOf(tonic(i)); }

// one note drawn as the game shows it: its degree's number in its colour, a dot above for an octave up, below for down
static void drawNote(int x, int y, int deg, int oct, int midi, bool next) {
  uint16_t c = colourOf(midi);
  if (next) canvas.drawRect(x - 2, y - 2, 20, 24, PAPER);
  canvas.fillRoundRect(x, y, 16, 20, 3, c);
  canvas.setTextFont(2); canvas.setTextDatum(MC_DATUM); canvas.setTextColor(INK);
  canvas.drawString(deg >= 0 ? String(deg + 1) : String("?"), x + 8, y + 10);
  for (int o = 0; o < abs(oct); o++) canvas.fillCircle(x + 8, oct > 0 ? y - 4 - o * 4 : y + 24 + o * 4, 1, PAPER);
}

static void drawSurface(uint16_t day);                  // the watches' strings or holes (below)
static String drawPlay(uint16_t day, uint16_t ink) {
  canvas.setTextFont(2); canvas.setTextColor(day); canvas.setTextDatum(TL_DATUM);
  String inst = upper(::inst());
  if (mode == P_SONGS) {
    canvas.drawString("THE " + inst + "'S SONGBOOK", 10, 32);
    if (!rowsN) wrap("No song learned yet.", 12, 58, W - 24, 2, 18, 3, QUIET);
    else drawRows(rowsN, day, ink, songRow, nullptr);
    return "turn: choose    press: its key    top button: back";
  }
  if (mode == P_KEYS) {
    canvas.drawString(song >= 0 ? String(PLAY_SONGS[song].title) : "PLAY FREELY -- A KEY", 10, 32);
    drawRows(12, day, ink, keyRow, keySwatch);
    return "turn: a key    press: play    top button: back";
  }
  if (isWatch()) canvas.drawString(inst + "  " + String(PLAY_KEYS[key]), 10, 32);
  else canvas.drawString(inst + "  " + keyName(key) + "   OCTAVE " + (octave > 0 ? "+" : "") + String(octave), 10, 32);
  if (mode == P_GUIDE) {
    const PlaySong &s = PLAY_SONGS[song];
    int per = 20, perRow = max(1, (W - 20) / per), y0 = 64;
    int from = isWatch() ? max(0, min(nextAt - 2, (int)s.n - perRow)) : 0, upto = isWatch() ? min((int)s.n, from + perRow) : s.n;   // the watch: one row, moving on
    for (int n = from; n < upto; n++) {
      int deg, oct; degreeOf(s, n, deg, oct);
      int midi = tonic(key) + (deg >= 0 ? SCALE[deg] : 0) + 12 * oct;
      drawNote(10 + ((n - from) % perRow) * per, y0 + ((n - from) / perRow) * 36, deg, oct, midi, n == nextAt && !doneAt);
    }
    if (isWatch()) {
      if (doneAt) { canvas.setTextFont(2); canvas.setTextColor(day); canvas.setTextDatum(TL_DATUM); canvas.drawString("PLAYED IT", W - 90, 32); }   // DRAFT
      drawSurface(day); return " ";   // the octave bar where the footer was
    }
    if (doneAt) { canvas.setTextFont(2); canvas.setTextColor(day); canvas.setTextDatum(BL_DATUM); canvas.drawString("PLAYED IT", 10, H - 18); }
    canvas.setTextDatum(TL_DATUM);
    return W >= 300 ? "1-7: play   ~ -: octave   enter: hear it   del: back" : "1-7 play  ~ - octave  enter hear";
  }
  // PLAY FREELY: the last notes, and what the ear made of them
  int per = 20, show = min(playedN, max(1, (W - 20) / per));
  for (int i = 0; i < show; i++) {
    int midi = played[playedN - show + i], rel = midi - tonic(key), oct = rel >= 0 ? rel / 12 : -((11 - rel) / 12), pc = rel - oct * 12, deg = -1;
    for (int d = 0; d < 7; d++) if (SCALE[d] == pc) deg = d;
    drawNote(10 + i * per, 64, deg, oct, midi, false);
  }
  if (isWatch()) {
    if (heardLine.length()) { canvas.setTextFont(1); canvas.setTextColor(day); canvas.setTextDatum(TL_DATUM); canvas.drawString(heardLine.substring(0, 38), 10, 80); }
    drawSurface(day); return " ";   // the octave bar where the footer was
  }
  if (heardLine.length()) wrap(heardLine, 10, 100, W - 20, 2, 16, 2, day);
  return W >= 300 ? "1-7: play   ~ -: octave   del: back" : "1-7 play  ~ - octave  del back";
}

// the game's ear: the last notes against each song -- the same notes (octave and tempo aside) in its own key is the
// song; the same shape in another key is ALMOST. A song neither learned nor heard is not named.
static void listen() {
  heardLine = "";
  for (int i = 0; i < PLAY_SONG_N; i++) {
    const PlaySong &s = PLAY_SONGS[i];
    if (playedN < s.n) continue;
    bool same = true, shape = true;
    for (int n = 0; n < s.n; n++) {
      int a = played[playedN - s.n + n], b = s.notes[n];
      if (((a - b) % 12 + 12) % 12) same = false;
      if (n && (((a - played[playedN - s.n]) - (b - s.notes[0])) % 12 + 12) % 12) shape = false;
    }
    bool known = isLearned(i) || (heard >> i & 1);
    if (same) { heardLine = known ? String(PLAY_SONGS[i].title) + "!" : "Something the game knows..."; ledsFlash(); return; }   // DRAFT
    if (shape && known) heardLine = "ALMOST -- " + String(PLAY_SONGS[i].title) + ", in another key";                             // DRAFT
  }
}

static void hearSong() {
  const PlaySong &s = PLAY_SONGS[song];
  for (int n = 0; n < s.n; n++) {
    int deg, oct; degreeOf(s, n, deg, oct);
    int midi = tonic(key) + (deg >= 0 ? SCALE[deg] : 0) + 12 * oct;
    nextAt = n; progress("");
    int ms = s.frames[n] * 1000 / 60;
    sound(midi, min(ms, 600)); delay(max(0, ms - min(ms, 600)));
  }
  nextAt = 0; progress("");
}

// ---- the watches' surface ---------------------------------------------------------------------------------------------
static int lit = -1; static uint32_t litAt = 0;            // the string plucked or the hole sounding, and when
static int breath = 0, still = 0;                         // the microphone's level now, and the room's own (learned)
static bool earOpen = false;
static bool harp() { return inst() != "flute"; }
static int surfTop() { return 92; }
static int surfBottom() { return H - 36; }
// degree d of eight (the eighth the tonic an octave up) as MIDI, in the octave chosen
static int midiOfDeg(int d) { return tonic(key) + SCALE[d % 7] + 12 * (octave + d / 7); }
static int holeAt(int x, int y) {                          // the flute's holes: two columns of four
  int t = surfTop(), h = (surfBottom() - t) / 4;
  if (y < t || y >= t + 4 * h) return -1;
  return (x < W / 2 ? 0 : 4) + (y - t) / h;
}
static int stringAt(int x, int y) { return y < surfTop() || y >= surfBottom() ? -1 : constrain(x * 8 / W, 0, 7); }

static void drawSurface(uint16_t day) {
  int t = surfTop(), b = surfBottom();
  if (harp()) {
    for (int d = 0; d < 8; d++) {
      int x = (2 * d + 1) * W / 16; uint16_t c = colourOf(midiOfDeg(d));
      bool on = d == lit && millis() - litAt < 220;
      canvas.fillRect(x - (on ? 3 : 1), t, on ? 7 : 3, b - t, c);
      canvas.fillCircle(x, t, 3, c); canvas.fillCircle(x, b - 1, 3, c);
    }
  } else {
    int h = (b - t) / 4, r = min(W / 4 - 10, h / 2 - 4);
    for (int d = 0; d < 8; d++) {
      int cx = d < 4 ? W / 4 : 3 * W / 4, cy = t + (d % 4) * h + h / 2; uint16_t c = colourOf(midiOfDeg(d));
      bool on = d == lit;
      if (on && breath > 0) canvas.fillCircle(cx, cy, r, c); else canvas.fillCircle(cx, cy, r, INK);
      canvas.drawCircle(cx, cy, r, c); canvas.drawCircle(cx, cy, r - 1, c);
      canvas.setTextFont(2); canvas.setTextDatum(MC_DATUM); canvas.setTextColor(on && breath > 0 ? INK : c);
      canvas.drawString(String(d % 7 + 1), cx, cy);
    }
    // the breath, a bar at the right of the title: how hard it is blown, against what counts
    int bw = constrain(breath * 60 / max(1, still * 4), 0, 60);
    canvas.drawRect(W - 72, 34, 62, 8, QUIET); canvas.fillRect(W - 71, 35, bw, 6, breath > 0 ? day : QUIET);
  }
  // the octave: - and + at the foot, the octave between them
  canvas.setTextFont(4); canvas.setTextDatum(MC_DATUM); canvas.setTextColor(PAPER);
  canvas.drawString("-", W / 6, H - 18); canvas.drawString("+", 5 * W / 6, H - 18);
  canvas.setTextFont(2); canvas.setTextColor(QUIET);
  canvas.drawString("OCTAVE " + String(octave > 0 ? "+" : "") + String(octave), W / 2, H - 18);   // DRAFT
  canvas.setTextDatum(TL_DATUM);
}

// the room's quiet, learned as the flute opens: what the microphone hears unblown (breath is several times that)
static void earBegin() {
  earOpen = !harp() && talkEarOpen(); breath = 0; still = 300;
  if (!earOpen) return;
  long sum = 0; int n = 0; uint32_t t = millis();
  while (millis() - t < 400) { int v = talkEarLevel(); if (v >= 0) { sum += v; n++; } delay(10); }
  if (n) still = max(150L, sum / n);
}
static void earEnd() { if (earOpen) talkEarClose(); earOpen = false; }
static bool blowing() {
  if (!earOpen) return true;                               // no microphone: a held hole sounds by itself
  int v = talkEarLevel();
  if (v >= 0) breath = v > still * 4 ? v : 0;
  return breath > 0;
}

// a note played: the songbook's next one if it was right, PLAY FREELY's ear either way
static void noteIn(int d, String &result) {
  int deg = d % 7, oct = octave + d / 7, midi = midiOfDeg(d);
  if (mode == P_GUIDE && !doneAt) {
    int want, wantOct; degreeOf(PLAY_SONGS[song], nextAt, want, wantOct);
    if (deg == want && oct == wantOct) {                     // the right note in the right octave: on to the next
      if (++nextAt >= PLAY_SONGS[song].n) { doneAt = millis(); ledsFlash(); result = daemonName() + " played " + PLAY_SONGS[song].title + "."; }   // DRAFT
    }
  }
  if (mode == P_FREE) {
    if (playedN == PLAY_LISTEN) { for (int i = 1; i < PLAY_LISTEN; i++) played[i - 1] = played[i]; playedN--; }
    played[playedN++] = midi; listen();
  }
}

static String runPlay(bool songbook) {
  const bool touch = isWatch();                           // the watches: the surface, not the keys
  if (!board.keyboard && !touch) return "This needs a board with number keys.";                           // DRAFT
  if (!open_()) return "The " + upper(inst()) + " is not yours yet. In the game, find it -- then it plays here.";   // DRAFT
  listSongs();
  mode = songbook ? P_SONGS : P_KEYS; at = 0; top = 0; octave = 0; song = -1; nextAt = 0; playedN = 0; heardLine = ""; doneAt = 0;
  runPanel = drawPlay; progress("");
  String result = "";
  while (true) {
    int step, ev; routineInput(step, ev);
    int ch = deckTakeKey();
    bool listing = mode == P_SONGS || mode == P_KEYS;
    if (ch == 13 || ch == 10) ev = mode == P_GUIDE ? 0 : 1;
    if (ch == 8) ev = -1;
    if (listing && (ch == 0x11 || ch == 0x13 || ch == ';' || ch == ',')) step = -1;
    if (listing && (ch == 0x12 || ch == 0x14 || ch == '.' || ch == '/')) step = 1;
    if (step && listing) { int n = mode == P_SONGS ? rowsN : 12; if (n) at = (at + n + step) % n; progress(""); }
    if (ev == -1) {
      if (mode == P_GUIDE || mode == P_FREE) { mode = P_KEYS; at = key; earEnd(); }
      else if (mode == P_KEYS && songbook) { mode = P_SONGS; at = 0; for (int i = 0; i < rowsN; i++) if (rows[i] == song) at = i; }
      else break;
      top = 0; progress(""); continue;
    }
    if (ev == 1 && mode == P_SONGS && rowsN) {
      int s = rows[at];
      if (!isLearned(s)) { say("Heard, not learned yet"); continue; }                                    // DRAFT
      song = s; mode = P_KEYS; at = PLAY_SONGS[s].key; top = 0; progress(""); continue;
    }
    if (ev == 1 && mode == P_KEYS) { key = at; octave = 0; nextAt = 0; doneAt = 0; playedN = 0; heardLine = ""; mode = songbook ? P_GUIDE : P_FREE; lit = -1; if (touch) earBegin(); progress(""); continue; }
    if (mode == P_GUIDE && (ch == 13 || ch == 10)) { hearSong(); continue; }
    if (!listing && ch) {
      if (ch == '~' || ch == '`') { octave = max(-2, octave - 1); progress(""); }
      else if (ch == '-' || ch == '=' || ch == '_') { octave = min(2, octave + 1); progress(""); }
      else if (ch >= '1' && ch <= '7') { sound(midiOfDeg(ch - '1'), 260); noteIn(ch - '1', result); progress(""); }
    }
    // the watches: the surface -- a string plucked (or drawn across), a hole held and blown; - and + the octave
    if (touch && !listing) {
      int x, y; bool down = watchFinger(x, y);
      static bool was = false; static int last = -1; static uint32_t soundedAt = 0;
      if (down && !was && y >= H - 40) {                       // the octave
        if (x < W / 3) octave = max(-2, octave - 1); else if (x > 2 * W / 3) octave = min(2, octave + 1);
        progress("");
      } else if (down && !was && mode == P_GUIDE && y >= 52 && y < 90) { hearSong(); }
      else if (harp()) {
        int d = down ? stringAt(x, y) : -1;
        if (d >= 0 && d != last) { sound(midiOfDeg(d), 1600); haptic(24); lit = d; litAt = millis(); noteIn(d, result); progress(""); }
        last = d;
        if (lit >= 0 && millis() - litAt > 220) { lit = -1; progress(""); }
      } else {
        int d = down ? holeAt(x, y) : -1;
        bool blown = d >= 0 && blowing();
        if (blown && (d != last || millis() - soundedAt > 330)) {   // a held note: sounded again while breath lasts
          sound(midiOfDeg(d), 420);
          if (d != last) noteIn(d, result);
          soundedAt = millis(); last = d;
        }
        if (!blown) last = -1;
        int wasLit = lit; lit = d;
        static uint32_t drawnAt = 0;
        if (lit != wasLit || millis() - drawnAt > 120) { drawnAt = millis(); progress(""); }   // the breath bar too
      }
      was = down;
    }
    if (doneAt && millis() - doneAt > 2500) { doneAt = 0; nextAt = 0; progress(""); }   // and again
    static uint32_t shownAt = 0;                                // a SHOT or a key from the cable is read as it draws
    if (Serial.available() && millis() - shownAt > 200) { shownAt = millis(); progress(""); }
    ledsLoop();
    delay(5);
  }
  earEnd();
  runPanel = nullptr; lastInput = millis();
  return result;
}

String runSongbook() { return runPlay(true); }
String runPlayFreely() { return runPlay(false); }
