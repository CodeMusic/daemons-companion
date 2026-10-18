// C-149 (the user, 2026-10-17): THE CASINO -- SLOTS, on every board. "we use daemon sprites on the 3 slot wheels or
// similar elements from the game -- and also elements from the season maybe would overlay on the sprites -- and when it
// is a holiday we do something holiday themed -- you can gain coins -- they represent the money u have in the game ...
// fun light effects and sounds to make the casino experience really fun".
//
// Three reels. Their pieces: the daemon carried here (three of it is the jackpot), up to three of the party's others
// (their pictures fetched as the reels are set: PARTYART? down the cable, or GET /api/device/art?slot= over Wi-Fi --
// drawn pieces stand in for any that cannot be), the COIN, and the SEASON's own piece: a snowflake, a blossom, the sun,
// a leaf -- or on a holiday the holiday's (a pumpkin, a present, a heart ...). The season falls across the reels, and on
// a holiday the daemons dress for it (server/data/holidays.json); a QUIET day is left as it is.
//
// The coins are the save's money (server/src/casino.ts): the balance is the state's, plus this board's results the
// server has not counted yet. Each result goes as INTERACT casino "<delta> <boot>.<seq> <device> <spins>" -- every ten
// spins, and once more on leaving -- and waits on the server until SYNC writes it into the game.
//
// The result is decided at the pull, from the table below (about 94% back over many spins, a house edge as the Game
// Corner had), and each reel slips on to its piece when it is stopped -- so a quick finger wins nothing a slow one
// would not, and stopping the reels yourself is still the fun of it.
//
// The controls: on the M5GO, the Fire and the T-Display-S3 Pro, A and C the bet and B the lever, then A, B and C stop
// the reel above each (held A leaves). A dial turns the bet and presses the lever, then stops the reels left to right;
// the top button (or the dial held) leaves. The StickS3: front the lever and the stops, side the bet, held side leaves.
// A touch screen: swipe the bet, tap, hold to leave. The cable: KEY PRESS, KEY RIGHT / LEFT, KEY A|B|C, KEY BACK.
#include <WiFi.h>
#include <mbedtls/base64.h>
#include "app.h"
#include "casino.h"
#include "leds.h"
#include "sound.h"
#include "broadcast.h"                            // C-151: the table -- its big wins and its words
#include "lora.h"
#include "meet.h"
#include "../../common/slots.h"                   // C-157: THE CASINO's table, one copy for every board (slots.ts's)


// ---- the pieces --------------------------------------------------------------------------------------------------
enum { P_JACK, P_F1, P_F2, P_F3, P_COIN, P_SEASON, P_N };   // slots::Piece's order
static const int STRIP = 12;                    // each piece twice round a reel, so a reel slips at most six
static uint8_t *pix[4] = {};                    // the daemons' pictures: 0 the one carried (artPix), 1..3 the party's
static uint16_t pal[4][16];
static bool have[4] = {};
static int topRow[4], midCol[4];                // where each picture's head is, for its hat
static int friendSlot[3] = { -1, -1, -1 };
static int friendSpecies[3] = { -1, -1, -1 };   // C-158: or by species -- daemons seen in the game, chosen by the companion

// the result, decided at the pull from the table every player keeps (firmware/common/slots.h, server/src/slots.ts): its
// chance in a thousand, and what it pays for each coin bet (the bet included) -- 94.4 back of every 100
enum { O_LOSE, O_SEASON1, O_JACK2, O_SEASON3, O_COIN3, O_FRIEND3, O_JACK3, O_N };
using slots::PAYS; using slots::BETS;
static const int BET_N = slots::BET_N;
static void piecesFor(int o, int out[3]) { uint8_t p[3]; slots::piecesFor(o, p); for (int k = 0; k < 3; k++) out[k] = p[k]; }

// ---- the reels -----------------------------------------------------------------------------------------------------
struct Reel { int strip[STRIP]; float pos = 0, speed = 0; int state = 0; float from = 0, to = 0; uint32_t at = 0, dur = 0; };
enum { STILL, SPINNING, STOPPING };
static Reel reels[3];
static int want[3];                             // the piece each reel stops on, this pull
static uint32_t pulledAt = 0;
static const float SPEED = 14;                  // pieces a second, flat out

static void shuffle(Reel &r) {
  for (int i = 0; i < STRIP; i++) r.strip[i] = i % P_N;
  for (int i = STRIP - 1; i > 0; i--) { int j = esp_random() % (i + 1); int t = r.strip[i]; r.strip[i] = r.strip[j]; r.strip[j] = t; }
  r.pos = esp_random() % STRIP; r.state = STILL; r.speed = 0;
}
static int pieceAt(const Reel &r, int i) { return r.strip[((i % STRIP) + STRIP) % STRIP]; }
static int nearWanted = -1;                     // C-158: the piece to show one place off the line on the third reel, or none
static void stopReel(int k) {
  Reel &r = reels[k];
  if (r.state != SPINNING) return;
  int at = (int)ceilf(r.pos + 0.7f);            // never back: on past the next piece to the wanted one
  // C-158: the third reel of a near miss stops with the piece it wanted beside the line, where one such place comes round
  int near = -1;
  if (k == 2 && nearWanted >= 0)
    for (int i = at; i < at + STRIP && near < 0; i++)
      if (pieceAt(r, i) == want[2] && (pieceAt(r, i + 1) == nearWanted || pieceAt(r, i - 1) == nearWanted)) near = i;
  if (near >= 0) at = near;
  else while (pieceAt(r, at) != want[k]) at++;
  r.state = STOPPING; r.from = r.pos; r.to = at; r.at = millis();
  r.dur = (uint32_t)constrain((at - r.pos) / SPEED * 1000 * 1.6f, 220.0f, 900.0f);
}
static bool spinning() { for (auto &r : reels) if (r.state != STILL) return true; return false; }
static int nextToStop() { for (int k = 0; k < 3; k++) if (reels[k].state == SPINNING) return k; return -1; }

// ---- the money ---------------------------------------------------------------------------------------------------
static uint32_t bootId = 0;                     // this start's own name for its reports
static int seq = 0;
struct Sent { int seq; long delta; };
static Sent unseen[24]; static int unseenN = 0; // reports the state has not counted yet
static long sessionDelta = 0, unreported = 0; static int spins = 0, unreportedSpins = 0;

static long balance() {
  String s = st.casino.seen; int dot = s.indexOf('.');
  bool mine = dot > 0 && strtoul(s.substring(0, dot).c_str(), nullptr, 16) == bootId;
  int seen = mine ? s.substring(dot + 1).toInt() : 0;
  int keep = 0; long b = st.casino.balance + unreported;
  for (int i = 0; i < unseenN; i++) if (!mine || unseen[i].seq > seen) { b += unseen[i].delta; unseen[keep++] = unseen[i]; }
  unseenN = keep;                               // what the state has counted is forgotten here
  return max(0L, b);
}
static void reportNow() {
  if (!unreported && !unreportedSpins) return;
  if (!bootId) bootId = (esp_random() & 0xffff) | 1;   // four hex digits: the outbox carries 47 letters
  seq++;
  if (unseenN == 24) { memmove(unseen, unseen + 1, sizeof unseen[0] * 23); unseenN = 23; }
  unseen[unseenN++] = { seq, unreported };
  char hexBoot[9]; snprintf(hexBoot, sizeof hexBoot, "%x", (unsigned)bootId);
  report("casino", String(unreported) + " " + hexBoot + "." + seq + " " + deviceId() + " " + unreportedSpins);
  unreported = 0; unreportedSpins = 0;
}

// ---- how it is dressed ---------------------------------------------------------------------------------------------
static bool dressed() { return st.holiday.name.length() && !st.holiday.quiet; }
// C-158: the companion sends how it is dressed (server/src/context.ts casinoDress), the one rule the phone and the Tab5
// read too; this board's own rule below is for a companion too old to send it -- the same rule, kept the same
static bool sent() { return st.casino.look.length(); }
static String lookNow() {                       // the holiday's look, else the weather's, else the season's own
  if (sent()) return st.casino.look;
  if (dressed() && st.holiday.look != "none") return st.holiday.look;
  // C-158: the real weather outside, when it is weather to notice; a clear night, its stars
  if (st.sky == "rain" || st.sky == "storm" || st.sky == "fog") return st.sky;
  if (st.sky == "snow") return "snow";
  if (st.sky == "clear" && st.watch == "NIGHT") return "stars";
  if (st.season == "winter") return "snow";
  if (st.season == "spring") return "petals";
  if (st.season == "summer") return "sun";
  return "leaves";
}
static uint32_t colourA() {
  if (sent()) return st.casino.colour[0];
  if (dressed() && st.holiday.colour[0]) return st.holiday.colour[0];
  return st.season == "winter" ? 0xA0D0FF : st.season == "spring" ? 0xFF90C0 : st.season == "summer" ? 0xFFD040 : 0xE07020;
}
static uint32_t colourB() {
  if (sent()) return st.casino.colour[1];
  if (dressed() && st.holiday.colour[1]) return st.holiday.colour[1];
  return st.season == "winter" ? 0xFFFFFF : st.season == "spring" ? 0x90E070 : st.season == "summer" ? 0xFF8020 : 0xFFC040;
}
static uint16_t c565(uint32_t rgb) { return canvas.color565((rgb >> 16) & 255, (rgb >> 8) & 255, rgb & 255); }

// the falling season (or holiday) over the reels: a few pieces drifting down, or twinkling where they are
struct Bit { float x, y, vx, vy, phase; uint32_t rgb; };
static Bit bits[18];
static int bitN = 0;
static bool twinkles(const String &l) { return l == "stars" || l == "sun" || l == "frost" || l == "moon"; }
static void bitReset(Bit &b, int x0, int x1, int y0, int y1, bool anywhere, const String &l) {
  b.x = x0 + esp_random() % max(1, x1 - x0); b.y = anywhere ? y0 + esp_random() % max(1, y1 - y0) : y0 - 6;
  b.vx = ((int)(esp_random() % 21) - 10) / 3.0f; b.vy = twinkles(l) ? 0 : 14 + esp_random() % 22;
  if (l == "hearts" || l == "fireworks") b.vy = -b.vy;   // hearts rise; sparks go up
  b.phase = (esp_random() % 628) / 100.0f;
  b.rgb = (esp_random() & 1) ? colourA() : colourB();
  if (l == "confetti" || l == "streamers") { static const uint32_t C[] = { 0xFF4060, 0xFFD040, 0x40C0FF, 0x60E060, 0xC060FF }; b.rgb = C[esp_random() % 5]; }
  if (l == "snow") b.rgb = 0xFFFFFF;
}

// ---- C-151: THE TABLE (the user, 2026-10-17: "who else is gambling with you") ----------------------------------------
// Who else is at the reels: the daemons near that say so -- over LoRa with their names (lora.cpp's TABLE frames, every
// half minute), over Bluetooth by their beacon's ca51 (meet.cpp: a species only, so counted, not named) -- and the
// user's own other boards anywhere, through the companion (the state's casino.table). Each is kept until it gets up or
// goes unheard for 75 seconds. A big win (12x, the jackpot) goes to every daemon as a broadcast act (JACKPOT, BIGWIN);
// a daemon at the reels cheers it -- its lights, a phrase -- and its answer is the cheer the winner sees. Names and big
// wins only, never an amount; no money moves between games. On the T-Deck a word typed at the reels goes to the table.
struct Seat { uint32_t tag; String name; uint8_t via; uint32_t at; int species; };
static Seat seats[8]; static int seatN = 0;
static bool sitting = false;
static String ticker, callout, cheers, typing;  // a word or a cheer for a while; another's big win; our cheerers; a word being typed
static uint32_t tickerUntil = 0, calloutUntil = 0, cheersAt = 0, cheerAt = 0;
static bool calloutJackpot = false;
bool casinoAtTable() { return sitting; }
void casinoHeard(uint32_t tag, int species, const String &name, bool here, uint8_t via) {
  if (!sitting || !tag) return;
  int i = 0;
  for (; i < seatN; i++) if (seats[i].tag == tag) break;
  if (!here) { if (i < seatN) seats[i] = seats[--seatN]; return; }
  if (i == seatN) { if (seatN == 8) return; seatN++; seats[i] = Seat{ tag, "", 0, 0, 0 }; }
  seats[i].via |= via; seats[i].at = millis(); if (species) seats[i].species = species;
  if (name.length()) seats[i].name = upper(name);
}
void casinoCast(const String &name, const String &body, int what) {
  if (!sitting) return;
  String who = upper(name);
  uint32_t now = millis();
  if (what == 0) { ticker = who + ": " + body; tickerUntil = now + 9000; }
  else if (what == 1) {                         // another's big win: called out, cheered with the lights and a phrase
    calloutJackpot = body == "JACKPOT";
    callout = who + (calloutJackpot ? " HIT THE JACKPOT!" : " WON BIG!");   // DRAFT
    calloutUntil = now + 3500; cheerAt = now;
    soundSlots(5, "");
  } else {                                      // a cheer for our own: who cheered, together for a while
    if (now - cheersAt > 15000) cheers = "";
    if (cheers.indexOf(who) < 0) cheers += (cheers.length() ? ", " : "") + who;
    cheersAt = now;
    ticker = cheers + (cheers.indexOf(',') > 0 ? " CHEER" : " CHEERS");   // DRAFT
    tickerUntil = now + 6000;
    soundCoin(2);
  }
  dirty = true;
}
static String tableText() {
  String names; int n = 0, more = 0;
  auto add = [&](const String &nm) {
    if (!nm.length()) { more++; return; }
    if (names.indexOf(nm) >= 0) return;            // ours, heard by radio and through the companion too
    if (n < 3) { names += (n ? ", " : "") + nm; n++; } else more++;
  };
  // one heard only by Bluetooth (a species, no name) is not counted again when a named one has its species -- our own
  // board, named by the companion, is the same board its beacon says is near
  auto named = [&](int species) {
    for (int k = 0; k < seatN; k++) if (seats[k].name.length() && seats[k].species == species) return true;
    for (int k = 0; k < st.casino.tableN; k++) if (st.casino.tableSpecies[k] == species) return true;
    return false;
  };
  for (int i = 0; i < seatN; i++) if (seats[i].name.length() || !named(seats[i].species)) add(seats[i].name);
  for (int i = 0; i < st.casino.tableN; i++) add(st.casino.table[i]);
  if (!n && !more) return "";
  return "AT THE TABLE: " + (n ? names + (more ? " +" + String(more) : String("")) : String(more) + " NEARBY");   // DRAFT
}
static bool tableRow() { return !board.round && H >= 160; }   // a line for the table under the band, where there is room

// ---- drawing -------------------------------------------------------------------------------------------------------
struct Frame { int top, bottom, mid, x0, reelW, gap, cellH, infoY; bool keys; };
static Frame layout() {
  Frame f;
  f.keys = board.kind == BoardKind::M5Core;     // the three buttons under the screen, each named above it
  f.top = board.round ? 58 : tableRow() ? 42 : 30;   // C-151: the table's line above the reels
  f.infoY = board.round ? 184 : f.keys ? H - 44 : H - 30;
  f.bottom = f.infoY - 4;
  f.mid = (f.top + f.bottom) / 2;
  f.gap = 6;
  int span = board.round ? 212 : W - 16;
  f.reelW = (span - 2 * f.gap) / 3;
  f.x0 = (W - (3 * f.reelW + 2 * f.gap)) / 2;
  f.cellH = 72;
  return f;
}

// a 64x64 picture of four bits a pixel, colour 0 clear -- upside down on April Fools' Day
static void drawPicture(int k, int x, int y) {
  const uint8_t *p = pix[k]; bool flip = st.holiday.flip;
  for (int j = 0; j < 64; j++) {
    int row = flip ? 63 - j : j;
    for (int i = 0; i < 64; ) {
      uint8_t b = p[(j * 64 + i) >> 1], c = (i & 1) ? (b & 15) : (b >> 4);
      if (!c) { i++; continue; }
      int run = 1;                              // a run of one colour, one line drawn
      while (i + run < 64) { uint8_t b2 = p[(j * 64 + i + run) >> 1], c2 = ((i + run) & 1) ? (b2 & 15) : (b2 >> 4); if (c2 != c) break; run++; }
      canvas.drawFastHLine(x + i, y + row, run, pal[k][c]);
      i += run;
    }
  }
}
static void measure(int k) {                    // the top of its head, and the middle of it there
  topRow[k] = 63; midCol[k] = 32;
  for (int j = 0; j < 64; j++) {
    int lo = 64, hi = -1;
    for (int i = 0; i < 64; i++) { uint8_t b = pix[k][(j * 64 + i) >> 1]; if ((i & 1) ? (b & 15) : (b >> 4)) { lo = min(lo, i); hi = i; } }
    if (hi >= 0) { topRow[k] = j; midCol[k] = (lo + hi) / 2; return; }
  }
}

// a line two or three pixels thick: drawWideLine is not held to the clip rectangle (a leaf's stem ran out of its reel
// into the money, seen on the Fire), drawLine is
static void thick(float x0, float y0, float x1, float y1, int w, uint16_t c) {
  for (int d = -(w / 2); d <= (w - 1) / 2; d++) {
    if (fabsf(x1 - x0) > fabsf(y1 - y0)) canvas.drawLine(x0, y0 + d, x1, y1 + d, c);
    else canvas.drawLine(x0 + d, y0, x1 + d, y1, c);
  }
}
static void star(int cx, int cy, int r, uint16_t c) {   // five points
  float px[10], py[10];
  for (int i = 0; i < 10; i++) { float a = -PI / 2 + i * PI / 5, rr = i % 2 ? r * 0.45f : r; px[i] = cx + rr * cosf(a); py[i] = cy + rr * sinf(a); }
  for (int i = 0; i < 10; i++) canvas.fillTriangle(cx, cy, px[i], py[i], px[(i + 1) % 10], py[(i + 1) % 10], c);
}
static void heart(int cx, int cy, int r, uint16_t c) {
  canvas.fillCircle(cx - r / 2, cy - r / 4, r / 2 + 1, c); canvas.fillCircle(cx + r / 2, cy - r / 4, r / 2 + 1, c);
  canvas.fillTriangle(cx - r - 1, cy, cx + r + 1, cy, cx, cy + r + 2, c);
}
// a piece drawn rather than pictured, about 48 across: the coin, the season's, a holiday's, or one standing in for a
// daemon the reels could not fetch
static void drawn(const String &kind, int cx, int cy) {
  uint16_t a = c565(colourA()), b = c565(colourB()), white = PAPER, gold = c565(0xFFC830), dark = c565(0x8A5A10);
  if (kind == "coin") {
    canvas.fillCircle(cx, cy, 21, dark); canvas.fillCircle(cx - 1, cy - 1, 20, gold); canvas.drawCircle(cx - 1, cy - 1, 15, dark);
    star(cx - 1, cy - 1, 10, c565(0xFFF0A0)); canvas.fillCircle(cx - 9, cy - 10, 3, c565(0xFFF8D0));
  } else if (kind == "snow" || kind == "frost") {
    uint16_t c = c565(0xDDEEFF);
    for (int i = 0; i < 6; i++) {
      float ang = i * PI / 3; int ex = cx + 20 * cosf(ang), ey = cy + 20 * sinf(ang), mx = cx + 12 * cosf(ang), my = cy + 12 * sinf(ang);
      thick(cx, cy, ex, ey, 2, c);
      canvas.drawLine(mx, my, mx + 6 * cosf(ang + 0.8f), my + 6 * sinf(ang + 0.8f), c);
      canvas.drawLine(mx, my, mx + 6 * cosf(ang - 0.8f), my + 6 * sinf(ang - 0.8f), c);
    }
    canvas.fillCircle(cx, cy, 3, white);
  } else if (kind == "petals") {
    for (int i = 0; i < 5; i++) { float ang = -PI / 2 + i * 2 * PI / 5; canvas.fillCircle(cx + 11 * cosf(ang), cy + 11 * sinf(ang), 9, a); }
    canvas.fillCircle(cx, cy, 6, c565(0xFFE060));
  } else if (kind == "sun") {
    for (int i = 0; i < 8; i++) { float ang = i * PI / 4; thick(cx + 15 * cosf(ang), cy + 15 * sinf(ang), cx + 22 * cosf(ang), cy + 22 * sinf(ang), 3, b); }
    canvas.fillCircle(cx, cy, 13, a);
  } else if (kind == "leaves") {
    canvas.fillTriangle(cx - 14, cy + 4, cx, cy - 20, cx + 14, cy + 4, a); canvas.fillTriangle(cx - 14, cy + 4, cx, cy + 16, cx + 14, cy + 4, a);
    canvas.fillTriangle(cx - 20, cy - 4, cx - 6, cy - 12, cx - 4, cy + 6, a); canvas.fillTriangle(cx + 20, cy - 4, cx + 6, cy - 12, cx + 4, cy + 6, a);
    thick(cx, cy + 22, cx, cy - 12, 2, dark);
  } else if (kind == "pumpkins") {
    uint16_t o = c565(0xFF7A1A), od = c565(0xC04A00);
    canvas.fillEllipse(cx - 9, cy + 3, 11, 16, od); canvas.fillEllipse(cx + 9, cy + 3, 11, 16, od); canvas.fillEllipse(cx, cy + 3, 13, 17, o);
    canvas.fillRect(cx - 2, cy - 18, 5, 7, c565(0x2E7D32));
    canvas.fillTriangle(cx - 9, cy - 1, cx - 3, cy - 1, cx - 6, cy - 7, INK); canvas.fillTriangle(cx + 3, cy - 1, cx + 9, cy - 1, cx + 6, cy - 7, INK);
    canvas.fillTriangle(cx - 9, cy + 7, cx + 9, cy + 7, cx, cy + 13, INK);
  } else if (kind == "presents") {
    canvas.fillRect(cx - 17, cy - 10, 34, 28, a); canvas.fillRect(cx - 19, cy - 15, 38, 8, a);
    canvas.fillRect(cx - 3, cy - 15, 6, 33, b); canvas.fillRect(cx - 19, cy - 13, 38, 4, b);
    canvas.fillEllipse(cx - 7, cy - 19, 7, 4, b); canvas.fillEllipse(cx + 7, cy - 19, 7, 4, b);
  } else if (kind == "hearts") {
    heart(cx, cy - 2, 18, a); heart(cx - 4, cy - 6, 6, c565(0xFFD0E0));
  } else if (kind == "clover") {
    uint16_t g = c565(0x20B040);
    heart(cx, cy - 12, 9, g); heart(cx - 11, cy, 9, g); heart(cx + 11, cy, 9, g);
    thick(cx, cy + 4, cx + 6, cy + 20, 2, g);
  } else if (kind == "eggs") {
    canvas.fillEllipse(cx, cy, 15, 20, a);
    for (int i = -14; i < 14; i += 7) canvas.fillTriangle(cx + i, cy + 2, cx + i + 7, cy + 2, cx + i + 3, cy - 4, b);
    canvas.fillRect(cx - 14, cy + 2, 28, 4, b);
  } else if (kind == "fireworks") {
    for (int i = 0; i < 12; i++) { float ang = i * PI / 6; thick(cx + 6 * cosf(ang), cy + 6 * sinf(ang), cx + 21 * cosf(ang), cy + 21 * sinf(ang), 2, i % 2 ? a : b); }
    canvas.fillCircle(cx, cy, 4, white);
  } else if (kind == "moon") {
    canvas.fillCircle(cx, cy, 19, c565(0xFFE070)); canvas.fillCircle(cx - 6, cy - 4, 4, c565(0xE8C050)); canvas.fillCircle(cx + 7, cy + 6, 3, c565(0xE8C050));
  } else if (kind == "berry") {                 // the pieces standing in for the party
    canvas.fillCircle(cx - 7, cy + 4, 12, c565(0xD02040)); canvas.fillCircle(cx + 8, cy + 6, 11, c565(0xB01030));
    canvas.fillTriangle(cx, cy - 8, cx + 14, cy - 20, cx + 4, cy - 6, c565(0x30A040));
  } else if (kind == "gem") {
    uint16_t c = c565(0x40D8E8);
    canvas.fillTriangle(cx - 18, cy - 4, cx + 18, cy - 4, cx, cy + 20, c); canvas.fillTriangle(cx - 18, cy - 4, cx + 18, cy - 4, cx, cy - 18, c565(0xA0F0FF));
  } else if (kind == "mark") {
    uint16_t day = hex565(st.menu);
    canvas.fillCircle(cx, cy, 19, day); canvas.drawCircle(cx, cy, 19, white); star(cx, cy, 11, white);
  } else if (kind == "rain" || kind == "storm" || kind == "fog") {   // C-158: the weather's own piece, a cloud
    uint16_t cloud = c565(kind == "fog" ? 0xB8BCC4 : 0xD8DCE4);
    canvas.fillCircle(cx - 9, cy - 2, 10, cloud); canvas.fillCircle(cx + 6, cy - 6, 12, cloud); canvas.fillRoundRect(cx - 19, cy - 2, 38, 12, 6, cloud);
    if (kind == "rain") for (int i = -12; i <= 12; i += 8) canvas.drawLine(cx + i, cy + 14, cx + i - 3, cy + 22, c565(0x60A8FF));
    if (kind == "storm") { uint16_t y = c565(0xFFE040); canvas.fillTriangle(cx + 2, cy + 8, cx - 6, cy + 20, cx + 1, cy + 18, y); canvas.fillTriangle(cx + 1, cy + 16, cx + 7, cy + 16, cx - 3, cy + 28, y); }
    if (kind == "fog") for (int i = 0; i < 3; i++) canvas.drawFastHLine(cx - 18 + i * 4, cy + 14 + i * 5, 30, cloud);
  } else star(cx, cy, 19, a);                   // stars, confetti, streamers: a star in the holiday's colour
}

// a hat on a daemon's head, for the holiday (k: which picture, x y: where the picture is)
static void hat(int k, int x, int y) {
  const String h = sent() ? st.casino.hat : dressed() && !st.holiday.flip ? st.holiday.hat : String("none");
  if (h == "none" || !h.length()) return;
  int cx = x + midCol[k], base = y + max(14, topRow[k]) + 3;
  uint16_t a = c565(colourA()), b = c565(colourB());
  if (h == "santa") {
    canvas.fillTriangle(cx - 11, base, cx + 11, base, cx + 6, base - 16, c565(0xE02828));
    canvas.fillRoundRect(cx - 12, base - 3, 24, 5, 2, PAPER); canvas.fillCircle(cx + 7, base - 16, 3, PAPER);
  } else if (h == "witch") {
    uint16_t w = c565(0x3A1A5A);
    canvas.fillTriangle(cx - 8, base, cx + 8, base, cx + 4, base - 20, w); canvas.fillRect(cx - 14, base - 2, 28, 3, w);
    canvas.fillRect(cx - 7, base - 5, 14, 3, c565(0xFF7A1A));
  } else if (h == "party") {
    canvas.fillTriangle(cx - 8, base, cx + 8, base, cx, base - 18, a);
    canvas.drawLine(cx - 5, base - 5, cx + 4, base - 9, b); canvas.drawLine(cx - 3, base - 10, cx + 2, base - 13, b);
    canvas.fillCircle(cx, base - 18, 3, b);
  } else if (h == "flower") {
    for (int i = 0; i < 5; i++) { float ang = i * 2 * PI / 5; canvas.fillCircle(cx + 9 + 4 * cosf(ang), base - 2 + 4 * sinf(ang), 3, a); }
    canvas.fillCircle(cx + 9, base - 2, 2, b);
  }
}

static void drawPiece(int piece, int cx, int cy) {
  if (piece == P_COIN) { drawn("coin", cx, cy); return; }
  if (piece == P_SEASON) { drawn(lookNow(), cx, cy); return; }
  int k = piece == P_JACK ? 0 : piece - P_F1 + 1;
  if (have[k]) { drawPicture(k, cx - 32, cy - 32); hat(k, cx - 32, cy - 32); return; }
  static const char *STAND_IN[] = { "mark", "berry", "gem", "mark" };   // the jackpot stands in as a MARK, if it must
  drawn(STAND_IN[k], cx, cy);
}

// the screen's state, between frames
enum { IDLE, ROLLING, SHOWING };
static int phase = IDLE, outcome = O_LOSE, betAt = 2;
static long bet = 50, won = 0, shownBalance = 0;
static uint32_t shownAt = 0;
static String note;                              // the word under the reels, for a moment

static void fitBet() {                           // never more than is there to bet
  long b = balance();
  while (betAt > 0 && BETS[betAt] > b) betAt--;
  bet = BETS[betAt];
}

static String drawSlots(uint16_t day, uint16_t ink) {
  Frame f = layout();
  uint32_t t = millis();
  // the band: CASINO and what it is dressed for, over the day's name (the link and the battery stay where they are)
  if (!board.round) {
    canvas.fillRect(0, 0, W - 120, 26, day);
    canvas.setTextFont(2); canvas.setTextColor(ink); canvas.setTextDatum(ML_DATUM);
    String title = "CASINO";                                                       // DRAFT
    String dress = st.holiday.name.length() ? upper(st.holiday.name) : upper(st.season);
    if (dress.indexOf(" (") > 0) dress = dress.substring(0, dress.indexOf(" ("));   // CHRISTMAS, not CHRISTMAS (EVE AND DAY)
    if (canvas.textWidth(title + "  " + dress) < W - 130) title += "  " + dress;
    canvas.drawString(title, 8, 13);
  }
  // the reels
  for (int k = 0; k < 3; k++) {
    int x = f.x0 + k * (f.reelW + f.gap);
    canvas.fillRoundRect(x, f.top, f.reelW, f.bottom - f.top, 6, c565(0x2A2C31));
    canvas.setClipRect(x + 2, f.top + 2, f.reelW - 4, f.bottom - f.top - 4);
    const Reel &r = reels[k];
    int base = (int)floorf(r.pos);
    for (int i = base - 2; i <= base + 2; i++) {
      int cy = f.mid + (int)roundf((r.pos - i) * f.cellH);
      if (cy < f.top - 40 || cy > f.bottom + 40) continue;
      drawPiece(pieceAt(r, i), x + f.reelW / 2, cy);
    }
    canvas.clearClipRect();
    // the winning pieces framed, blinking
    if (phase == SHOWING && outcome != O_LOSE && (t / 160) % 2 == 0) {
      int lit = outcome == O_JACK2 ? 2 : outcome == O_SEASON1 ? 1 : 3;
      if (k < lit) for (int w = 0; w < 3; w++) canvas.drawRoundRect(x + 2 + w, f.mid - 36 + w, f.reelW - 4 - 2 * w, 72 - 2 * w, 6, c565(0xFFC830));
    }
  }
  // the season falling over them (or the holiday's)
  String l = lookNow();
  canvas.setClipRect(f.x0, f.top, 3 * f.reelW + 2 * f.gap, f.bottom - f.top);
  for (int i = 0; i < bitN; i++) {
    Bit &b = bits[i]; uint16_t c = c565(b.rgb);
    int x = b.x + 4 * sinf(b.phase + t / 600.0f), y = b.y;
    if (l == "snow" || l == "frost") canvas.fillCircle(x, y, 1 + (i % 2), c);
    else if (l == "petals") canvas.fillEllipse(x, y, 3, 2, c);
    else if (l == "leaves") { canvas.fillTriangle(x - 3, y, x, y - 4, x + 3, y, c); canvas.fillTriangle(x - 3, y, x, y + 4, x + 3, y, c); }
    else if (l == "hearts") heart(x, y, 4, c);
    else if (l == "confetti" || l == "streamers") canvas.fillRect(x, y, 3 + (i % 3), 2, c);
    else if (l == "clover") heart(x, y, 3, c565(0x20B040));
    else if (l == "eggs") canvas.fillEllipse(x, y, 3, 4, c);
    else if (l == "pumpkins") { canvas.fillCircle(x, y, 3, c565(0xFF7A1A)); canvas.drawFastVLine(x, y - 5, 2, c565(0x2E7D32)); }
    else if (l == "presents") { canvas.fillRect(x - 2, y - 2, 5, 5, c); canvas.drawFastVLine(x, y - 2, 5, PAPER); }
    else if (l == "fireworks") canvas.fillCircle(x, y, 1, c);
    else if (l == "rain" || l == "storm") canvas.drawLine(x, y, x - 2, y + 6, c565(0x60A8FF));    // C-158: the weather over the reels
    else if (l == "fog") canvas.drawFastHLine(x - 10, y, 20, c565(0x8A8E96));
    else {                                        // twinkling where they are: stars, the sun's glints, the frost
      float s = 0.5f + 0.5f * sinf(b.phase + t / 260.0f);
      int r = 1 + (int)(3 * s);
      canvas.drawFastHLine(x - r, y, 2 * r + 1, c); canvas.drawFastVLine(x, y - r, 2 * r + 1, c);
    }
  }
  canvas.clearClipRect();
  // the line they pay on
  uint16_t gold = c565(0xFFC830);
  canvas.fillTriangle(f.x0 - 6, f.mid - 5, f.x0 - 6, f.mid + 5, f.x0 - 1, f.mid, gold);
  int right = f.x0 + 3 * f.reelW + 2 * f.gap;
  canvas.fillTriangle(right + 5, f.mid - 5, right + 5, f.mid + 5, right, f.mid, gold);
  // C-151: the table, between the band and the reels -- a word being typed, a word or a cheer, else who is sitting here
  if (tableRow()) {
    String row = typing.length() ? "SAY: " + typing + ((t / 400) % 2 ? "_" : " ")
               : t < tickerUntil ? ticker : tableText();
    if (!row.length() && board.keyboard) row = "type a word to the table";     // DRAFT
    if (!row.length() && st.casino.why.length()) row = "TODAY: " + st.casino.why;   // C-158: the day's luck, its biggest reason; DRAFT
    canvas.setTextFont(1); canvas.setTextDatum(TL_DATUM);
    canvas.setTextColor(typing.length() || t < tickerUntil ? PAPER : QUIET);
    while (row.length() > 4 && canvas.textWidth(row) > W - 16) row.remove(row.length() - 1);
    canvas.drawString(row, f.x0, 31);
  }
  // C-151: another's big win at the table, called out across the top of the reels (our own wins say theirs over it)
  if (t < calloutUntil && !(phase == SHOWING && won > 0 && t - shownAt < 2600)) {
    canvas.setTextFont(4); canvas.setTextDatum(MC_DATUM);
    if (canvas.textWidth(callout) > W - 40) canvas.setTextFont(2);
    int bw = min(W - 16, (int)canvas.textWidth(callout) + 26), by = f.top + 2;
    bool lit = calloutJackpot && (t / 120) % 2;
    canvas.fillRoundRect(W / 2 - bw / 2, by, bw, 36, 8, lit ? gold : day);
    canvas.drawRoundRect(W / 2 - bw / 2, by, bw, 36, 8, PAPER);
    canvas.setTextColor(lit ? INK : ink); canvas.drawString(callout, W / 2, by + 19);
  }
  // a win, said large -- across the top of the reels, so the pieces that won stay in sight
  if (phase == SHOWING && won > 0 && t - shownAt < 2600) {
    String w = outcome == O_JACK3 ? "JACKPOT!  " + String(won) : "WIN  " + String(won);   // DRAFT
    canvas.setTextFont(4); canvas.setTextDatum(MC_DATUM);
    int bw = min(W - 16, (int)canvas.textWidth(w) + 30), by = f.top + 2;
    canvas.fillRoundRect(W / 2 - bw / 2, by, bw, 36, 8, outcome == O_JACK3 && (t / 120) % 2 ? gold : day);
    canvas.drawRoundRect(W / 2 - bw / 2, by, bw, 36, 8, PAPER);
    canvas.setTextColor(outcome == O_JACK3 && (t / 120) % 2 ? INK : ink); canvas.drawString(w, W / 2, by + 19);
  }
  // the money, the bet, and a word
  canvas.setTextFont(2); canvas.setTextDatum(TL_DATUM); canvas.setTextColor(PAPER);
  canvas.drawString("MONEY " + String(shownBalance), f.x0, f.infoY);                // DRAFT
  canvas.setTextDatum(TC_DATUM); canvas.setTextColor(readable(day));
  canvas.drawString("BET " + String(bet), W / 2 + (board.round ? 0 : 10), f.infoY);  // DRAFT
  canvas.setTextDatum(TR_DATUM); canvas.setTextColor(QUIET);
  if (!board.round && note.length()) canvas.drawString(note, right, f.infoY);
  else if (f.keys && phase != ROLLING) { canvas.setTextFont(1); canvas.drawString("hold A: leave", right, f.infoY + 4); }   // DRAFT
  canvas.setTextDatum(TL_DATUM);
  if (!f.keys) {                                 // the footer says what does what, in this board's own words
    if (board.keyboard)                          // C-151: the T-Deck's (and the Cardputer's) keys are the machine
      return typing.length() ? "enter: say it    bksp: delete" : phase == ROLLING ? "1 2 3: stop each    space: the next"
                             : "space: spin  1 2 3: stop  + -: bet  bksp: leave";   // DRAFT
    if (board.touch && !board.threeKeys()) return phase == ROLLING ? "tap: stop" : "swipe: bet    tap: spin    hold: leave";   // DRAFT
    if (board.threeKeys()) return phase == ROLLING ? "A B C: stop" : "A C: bet    B: spin    hold A: leave";   // DRAFT
    return phase == ROLLING ? "press: stop" : String("turn: bet    press: spin    ") + (board.hasSideKey() ? "top button: back" : "hold the dial: back");
  }
  // the M5GO and the Fire: each button's word above it -- BET- SPIN BET+, and while the reels turn STOP under each
  int bw = W / 3;
  for (int k = 0; k < 3; k++) {
    bool roll = phase == ROLLING, live = !roll || reels[k].state == SPINNING;
    const char *word = roll ? "STOP" : k == 0 ? "BET -" : k == 1 ? "SPIN" : "BET +";   // DRAFT
    int bx = k * bw + 4;
    if (roll && live) canvas.fillRoundRect(bx, H - 24, bw - 8, 22, 5, day);
    else canvas.drawRoundRect(bx, H - 24, bw - 8, 22, 5, live ? QUIET : INK);
    canvas.setTextFont(2); canvas.setTextDatum(MC_DATUM); canvas.setTextColor(roll && live ? ink : live ? PAPER : QUIET);
    canvas.drawString(word, bx + (bw - 8) / 2, H - 13);
  }
  canvas.setTextDatum(TL_DATUM);
  return " ";                                    // its own words are drawn: no footer under them
}

// ---- the pictures, fetched as the reels are set ----------------------------------------------------------------------
// The M5GO has no PSRAM: its 4 KB line, a copy of it and the picture's text in a JSON document did not all fit (seen
// 2026-10-17: the reels drew stand-ins). So the document keeps only the small fields, and the picture is decoded where
// it lies in the line.
bool casinoTakeArt(const char *json) {
  JsonDocument filter, doc;
  filter["w"] = filter["h"] = filter["slot"] = filter["species"] = filter["palette"] = true;   // C-158: species too
  if (deserializeJson(doc, json, DeserializationOption::Filter(filter)) || (doc["w"] | 0) != 64 || (doc["h"] | 0) != 64) return false;
  int slot = doc["slot"] | -1, species = doc["species"] | -1, k = -1;
  for (int i = 0; i < 3; i++) if ((friendSlot[i] == slot && slot >= 0) || (friendSpecies[i] == species && species >= 0)) k = i + 1;
  if (k < 0 || !pix[k]) return false;            // not one the reels asked for (or they have been put away)
  JsonArray p = doc["palette"].as<JsonArray>();
  for (int i = 0; i < 16; i++) pal[k][i] = i < (int)p.size() ? (uint16_t)(p[i] | 0) : 0;
  const char *b64 = strstr(json, "\"pixels\":\""), *end = b64 ? strchr(b64 + 10, '"') : nullptr;
  size_t got = 0;
  if (!end || mbedtls_base64_decode(pix[k], 2048, &got, (const unsigned char *)b64 + 10, end - b64 - 10) || got != 2048) return false;
  measure(k); have[k] = true;
  return true;
}

// Each result is said down the cable too -- CASINO <result 0..6> <bet> <won> <money> -- so a check knows when to SHOT.
// the cable, read here while the reels turn (the loop is not running): SHOT, the keys, and the bridge's own lines --
// a STATE taken as ever (it keeps the bridge fresh), a party daemon's picture. Anything else waits for the loop.
static String cableIn, cableKeys;              // C-151: KEY TYPE's letters, ENTER and BKSP, read as the keyboard's
static int cableEvent = 0;                       // 1 press, 2 bet up, 3 bet down, -1 leave, 10 + k a key A|B|C
static int rigNext = -1;                         // C-151: KEY RIG <0..6> -- the next pull's result, for a check (never paid)
static void readCable() {
  while (Serial.available()) {
    char c = Serial.read();
    if (c != '\n') { if (cableIn.length() < 6000) cableIn += c; continue; }
    cableIn.trim();
    if (cableIn == "SHOT") { draw(); shot(); }
    else if (cableIn == "KEY PRESS") cableEvent = 1;
    else if (cableIn == "KEY RIGHT" || cableIn == "KEY PRESS2") cableEvent = 2;
    else if (cableIn == "KEY LEFT") cableEvent = 3;
    else if (cableIn == "KEY BACK") cableEvent = -1;
    else if (cableIn == "KEY A" || cableIn == "KEY B" || cableIn == "KEY C") cableEvent = 10 + (cableIn[4] - 'A');
    // C-151: for a check from the computer -- the T-Deck's keys (KEY TYPE <letters>, KEY ENTER, KEY BKSP, KEY SPACE), and
    // the next pull's result (KEY RIG <0..6>): shown and called to the table as any, but never paid
    else if (cableIn.startsWith("KEY TYPE ")) cableKeys += cableIn.substring(9);
    else if (cableIn == "KEY ENTER") cableKeys += '\r';
    else if (cableIn == "KEY BKSP") cableKeys += '\b';
    else if (cableIn == "KEY SPACE") cableKeys += ' ';
    else if (cableIn.startsWith("KEY RIG ")) rigNext = constrain((int)cableIn.substring(8).toInt(), 0, O_N - 1);
    // read where they lie, never copied (the M5GO, without PSRAM, had no room for a second 4 KB). A STATE proves the
    // bridge is there, so the board's reports keep going by the cable; it is read only where there is room to spare --
    // the reels keep their own count of the money meanwhile
    else if (cableIn.startsWith("STATE ")) { usbSeen = millis(); if (psramFound()) takeState(cableIn.c_str() + 6); }
    else if (cableIn.startsWith("PARTYART ")) casinoTakeArt(cableIn.c_str() + 9);
    cableIn = "";
  }
}

static void loading(const String &what) {
  runPanel = [](uint16_t day, uint16_t ink) -> String {
    canvas.setTextFont(4); canvas.setTextColor(readable(day)); canvas.setTextDatum(MC_DATUM);
    canvas.drawString("CASINO", W / 2, H / 2 - 18);                                // DRAFT
    canvas.setTextFont(2); canvas.setTextColor(QUIET);
    canvas.drawString(runResult, W / 2, H / 2 + 14);
    canvas.setTextDatum(TL_DATUM);
    return " ";
  };
  runResult = what; draw();
}

static void fetchFriends() {
  // C-158: the companion's choice of daemons seen in the game, where it gives one; else the party, as before
  bool bySpecies = st.casino.reelN > 0;
  for (int i = 0; i < 3; i++) {
    friendSpecies[i] = bySpecies && i < st.casino.reelN ? st.casino.reel[i] : -1;
    friendSlot[i] = !bySpecies && i < st.casino.friendN ? st.casino.friends[i] : -1;
    have[i + 1] = false;
    pix[i + 1] = friendSlot[i] >= 0 || friendSpecies[i] >= 0 ? (uint8_t *)malloc(2048) : nullptr;
  }
  // without PSRAM a request made while the speaker still holds its buffers runs out of memory (net.cpp): let it go first
  for (uint32_t t0 = millis(); !soundQuiet() && millis() - t0 < 1200; ) { soundIdle(); delay(20); }
  for (int i = 0; i < 3; i++) {
    if (!pix[i + 1]) continue;
    loading("Setting the reels... " + String(i + 1) + " of " + String(min(3, bySpecies ? st.casino.reelN : st.casino.friendN)));   // DRAFT
    String key = friendSpecies[i] >= 0 ? "s" + String(friendSpecies[i]) : String(friendSlot[i]);
    String query = friendSpecies[i] >= 0 ? "species=" + String(friendSpecies[i]) : "slot=" + String(friendSlot[i]);
    // the cable, if a bridge has been heard on it lately -- the M5GO's loop does not always have the room to take a STATE,
    // so "lately" is two minutes, not usbLive's fifteen seconds -- else Wi-Fi
    if (usbSeen && millis() - usbSeen < 120000) {
      Serial.printf("PARTYART? %s\n", key.c_str());
      for (uint32_t t0 = millis(); !have[i + 1] && millis() - t0 < 2500; ) { readCable(); delay(5); }
    }
    if (!have[i + 1] && online() && !bridgeLive()) {
      bool ok; String got = http("GET", "/api/device/art?" + query, "", &ok);
      if (ok) casinoTakeArt(got.c_str());
    }
    Serial.printf("CASINO ART %s %s heap %u largest %u\n", key.c_str(), have[i + 1] ? "taken" : "missing",
                  (unsigned)ESP.getFreeHeap(), (unsigned)ESP.getMaxAllocHeap());   // for a check from the computer
  }
}
static void putAway() { for (int i = 1; i < 4; i++) { free(pix[i]); pix[i] = nullptr; have[i] = false; } for (int &s : friendSlot) s = -1; for (int &s : friendSpecies) s = -1; }

// C-158: the cat and the string -- the player's own reach, learning through the session and the next (slots.h)
static slots::Cat cat;
static String tableHere() {                     // "here <device> <return in a thousand> <reach in hundredths> <dry> <streak>"
  return "here " + deviceId() + " " + String((int)lroundf(slots::pullReturn(st.casino.luck, cat) * 1000)) + " " +
         String((int)lroundf(cat.reach * 100)) + " " + String(min(cat.dry, 99999)) + " " + String(min(cat.streak, 9999));
}

// ---- the routine ---------------------------------------------------------------------------------------------------
String runSlots() {
  if (!st.casino.known)                         // the companion is older than the CASINO: not the save's fault
    return "The companion on your computer is older than the CASINO.\n\nUpdate it, and the CASINO opens with your game's money.";   // DRAFT
  if (!st.casino.have)
    return "The CASINO plays with the money your game holds.\n\nSet your game's save in the companion, and it opens.";   // DRAFT
  cableIn.reserve(4800);                        // one buffer for the cable's lines, made once: no heap torn into pieces
  pix[0] = artPix; memcpy(pal[0], artPal, sizeof pal[0]);
  have[0] = st.carrying && artKeyHave.length() && artKeyHave == st.daemon.artKey;
  if (have[0]) measure(0);
  fetchFriends();
  for (auto &r : reels) shuffle(r);
  phase = IDLE; won = 0; note = ""; spins = 0; sessionDelta = 0;
  fitBet();
  shownBalance = balance();
  if (shownBalance < BETS[0]) { putAway(); runPanel = nullptr; return "No money to play with.\n\nThe game's money is the CASINO's: earn some in the game, and SYNC."; }   // DRAFT
  String l = lookNow(); Frame f = layout();
  bitN = board.round ? 10 : 14;
  for (int i = 0; i < bitN; i++) bitReset(bits[i], f.x0, f.x0 + 3 * f.reelW, f.top, f.bottom, true, l);
  runPanel = drawSlots;
  soundSlots(0, l);
  // C-151: sitting down -- said to whoever is near, by every way this board has, and to the companion
  sitting = true; seatN = 0; ticker = callout = cheers = typing = ""; tickerUntil = calloutUntil = cheerAt = 0;
  meetSetTable(true);
  loraTable(true);
  report("table", tableHere());                 // C-158: with the odds it plays at, for the admin page
  uint32_t tableAt = millis(), polledAt = millis(); int tableTicks = 0;

  // the buttons as they are now, so a press already down when it opened does nothing
  const int keyPin[3] = { board.keyLeft, board.encKey, board.keyRight };
  // a press is "fresh" if it began with the reels at rest: only such a press bets, pulls on its release, or leaves held --
  // a press that stopped a reel and is held on past the result does nothing more
  bool keyWas[3] = { false, false, false }, keyFresh[3] = { false, false, false }, frontFresh = false;
  uint32_t keyAt[3] = { millis(), millis(), millis() };
  for (int k = 0; k < 3; k++) keyWas[k] = keyPin[k] >= 0 && !digitalRead(keyPin[k]);
  bool sideWas = board.hasSideKey() && !digitalRead(board.sideKey), frontWas = board.encKey >= 0 && !digitalRead(board.encKey);
  uint32_t sideAt = millis(), frontAt = millis(), last = millis(), helloAt = 0, idleSince = millis(), flashAt = 0;
  bool leave = false, rigged = false;
  int lastTick[3] = { 0, 0, 0 };

  auto pull = [&]() {
    if (spinning()) return;
    fitBet();
    if (balance() < bet || bet <= 0) { note = "NO MONEY LEFT"; return; }               // DRAFT
    rigged = rigNext >= 0;                      // C-151: a check from the computer -- this result, paid nothing
    // C-158: the day's luck and the string's reach decide this pull's table; a loss may fall near, and two JACKs show a
    // third one place off the line -- almost the jackpot
    int w[slots::OUTCOME_N]; slots::weightsFor(slots::pullReturn(st.casino.luck, cat), w);
    outcome = rigged ? rigNext : slots::drawFrom(w); rigNext = -1; piecesFor(outcome, want);
    nearWanted = -1;
    uint8_t third[STRIP]; for (int i = 0; i < STRIP; i++) third[i] = reels[2].strip[i];   // the third reel as it is
    if (outcome == O_LOSE && (float)(esp_random() % 1000) / 1000.0f < slots::nearChance(cat)) {
      uint8_t p[3], wanted;
      if (slots::nearPieces(third, p, wanted)) { for (int k = 0; k < 3; k++) want[k] = p[k]; nearWanted = wanted; }
    } else if (outcome == O_JACK2) {
      uint8_t c;
      if (slots::almostThird(third, c)) { want[2] = c; nearWanted = P_JACK; }
    }
    unreported -= bet; sessionDelta -= bet; spins++; unreportedSpins++;
    shownBalance = balance();
    for (int k = 0; k < 3; k++) { reels[k].state = SPINNING; reels[k].speed = 0; }
    pulledAt = millis(); phase = ROLLING; won = 0; note = "";
    soundSlots(0, lookNow());
  };
  auto betBy = [&](int d) {
    if (spinning()) return;
    betAt = constrain(betAt + d, 0, BET_N - 1);
    while (betAt > 0 && BETS[betAt] > balance()) betAt--;
    bet = BETS[betAt]; phase = phase == SHOWING ? IDLE : phase;
    soundTurn(d);
  };
  auto stopOrPull = [&](int k) {                // a press: stop this reel (or the next), else pull the lever
    if (phase == ROLLING) { int s = k >= 0 ? k : nextToStop(); if (s >= 0) stopReel(s); }
    else pull();
  };

  while (!leave) {
    uint32_t now = millis(); float dt = min(0.08f, (now - last) / 1000.0f); last = now;
    readCable(); readDeck();
    // the input, as this board has it
    int ev = cableEvent; cableEvent = 0;
    if (ev == 1) stopOrPull(-1); else if (ev == 2) betBy(1); else if (ev == 3) betBy(-1); else if (ev == -1) leave = true;
    else if (ev >= 10) { int k = ev - 10; if (phase == ROLLING) stopOrPull(k); else if (k == 0) betBy(-1); else if (k == 1) pull(); else betBy(1); }
    if (board.threeKeys()) {                    // A B C: the bet, the lever, the bet -- and while turning, each its reel
      for (int k = 0; k < 3; k++) {
        bool down = !digitalRead(keyPin[k]);
        if (down && !keyWas[k]) { keyAt[k] = now; keyFresh[k] = phase != ROLLING; if (!keyFresh[k]) stopOrPull(k); else if (k == 1) pull(); }
        if (down && k == 0 && keyFresh[0] && now - keyAt[0] > 600) { leave = true; while (!digitalRead(keyPin[0])) delay(5); }
        if (!down && keyWas[k] && keyFresh[k] && now - keyAt[k] > 30 && now - keyAt[k] < 600) { if (k == 0) betBy(-1); if (k == 2) betBy(1); }
        if (down != keyWas[k]) idleSince = now;
        keyWas[k] = down;
      }
    } else {
      int step = dialStep();                    // the dial, or the T-Deck's ball
      if (step) { betBy(step); idleSince = now; }
      if (board.touch) {                        // the watch and the CoreS3
        int g = watchGesture();
        if (g == 1 || g == -1) betBy(g); else if (g == 2) stopOrPull(-1); else if (g == -2) leave = true;
        if (g) idleSince = now;
      }
      if (board.encKey >= 0) {                  // the dial's press (the StickS3's front): the lever and the stops
        // where it is the only button (the plain T-Embed, the Dial, the T-Deck's ball) a tap pulls on its release and
        // held it leaves; beside a top button it pulls the moment it goes down
        bool down = !digitalRead(board.encKey), single = !board.hasSideKey();
        if (down && !frontWas) { frontAt = now; frontFresh = phase != ROLLING; if (!frontFresh) stopOrPull(-1); else if (!single) pull(); idleSince = now; }
        if (down && single && frontFresh && now - frontAt > 700) { leave = true; while (!digitalRead(board.encKey)) delay(5); }
        if (!down && frontWas && single && frontFresh && now - frontAt > 30 && now - frontAt <= 700) pull();
        frontWas = down;
      }
      if (board.hasSideKey()) {                 // the top button leaves; the StickS3's side: a tap the bet, held leave
        bool down = !digitalRead(board.sideKey);
        if (down && !sideWas) sideAt = now;
        if (!down && sideWas && now - sideAt > 30) {
          if (board.noDial() && now - sideAt < 500) betBy(betAt + 1 < BET_N && BETS[betAt + 1] <= balance() ? 1 : -BET_N);
          else leave = true;
          idleSince = now;
        }
        sideWas = down;
      }
      // the T-Deck's and the Cardputer's keys (C-151, the user: "keys as the machine"): space pulls (Enter too), 1 2 3
      // stop each reel, + and - the bet (the arrows too), Backspace leaves -- and a letter begins a word to the table,
      // Enter says it, Backspace takes a letter back (and on an empty word, plays on)
      int ch = deckTakeKey();
      if (!ch && cableKeys.length()) { ch = cableKeys[0]; cableKeys.remove(0, 1); }   // KEY TYPE from the computer
      if (ch) {
        idleSince = now;
        if (typing.length()) {
          if (ch == 13 || ch == 10) {
            String w = typing; w.trim(); typing = "";
            if (w.length() && castSend(CAST_SAY, w)) { ticker = upper(daemonName()) + ": " + w; tickerUntil = now + 9000; }
            else if (w.length()) { ticker = "No daemon here to say it"; tickerUntil = now + 3000; }   // DRAFT
          }
          else if (ch == 8) typing.remove(typing.length() - 1);
          else if (ch >= 32 && ch < 127 && typing.length() < 40) typing += (char)ch;
        }
        else if (ch == ' ' || ch == 13 || ch == 10) stopOrPull(-1);
        else if (ch >= '1' && ch <= '3') { if (phase == ROLLING) stopOrPull(ch - '1'); }
        else if (ch == '+' || ch == '=' || ch == 0x12 || ch == 0x14 || ch == '.' || ch == '/') betBy(1);
        else if (ch == '-' || ch == '_' || ch == 0x11 || ch == 0x13 || ch == ';' || ch == ',') betBy(-1);
        else if (ch == 8) leave = true;
        else if (board.keyboard && ch > 32 && ch < 127) typing = String((char)ch);
      }
    }
    if (leave) break;
    now = millis();                             // after the input: a pull or a stop above stamped its own time, later than the first
    // the reels: up to speed, on by themselves after a while, each slipping to its piece
    for (int k = 0; k < 3; k++) {
      Reel &r = reels[k];
      if (r.state == SPINNING) {
        r.speed = min(SPEED, r.speed + SPEED * dt * 5);
        r.pos += r.speed * dt;
        if (now - pulledAt > 1700u + 550u * k && (k == 0 || reels[k - 1].state != SPINNING)) stopReel(k);
      } else if (r.state == STOPPING) {
        float u = min(1.0f, (now - r.at) / (float)r.dur);
        const float c1 = 1.4f, c3 = c1 + 1;      // eased out, a little past and back -- a reel's catch
        float e = 1 + c3 * powf(u - 1, 3) + c1 * powf(u - 1, 2);
        r.pos = r.from + (r.to - r.from) * e;
        if (u >= 1) { r.pos = r.to; r.state = STILL; soundReelStop(k); flashAt = now; }
      }
      if ((int)floorf(r.pos) != lastTick[k] && r.state != STILL) { lastTick[k] = (int)floorf(r.pos); soundReelTick(); }
    }
    // all three stopped: what it came to
    if (phase == ROLLING && !spinning()) {
      phase = SHOWING; shownAt = now;
      won = bet * PAYS[outcome];
      if (!rigged) { unreported += won; sessionDelta += won; slots::learn(cat, outcome); }   // a rigged pull is never paid, nor learned from
      Serial.printf("CASINO %d %ld %ld %ld %d\n", outcome, bet, won, balance(), nearWanted >= 0 ? 1 : 0);   // for a check from the computer: its result, bet, win, money, and whether it fell near
      draw();                                    // seen before it is heard: without PSRAM the phrase plays here
      // C-158: the words the phone says too -- a near miss is SO CLOSE, two JACKs ALMOST THE JACKPOT
      if (outcome == O_LOSE) { note = nearWanted >= 0 ? "SO CLOSE" : "NO WIN"; soundSlots(1, lookNow()); }   // DRAFT
      else if (PAYS[outcome] == 1) { note = "BET BACK"; for (int i = 0; i < 4; i++) soundCoin(i); }   // DRAFT
      else soundSlots(outcome == O_JACK3 ? 4 : PAYS[outcome] >= 12 ? 3 : 2, lookNow());
      if (outcome == O_JACK2) { ticker = "ALMOST THE JACKPOT"; tickerUntil = now + 3500; }   // C-158: the phone's words; DRAFT
      if (unreportedSpins >= 10) reportNow();
      // C-151: a big win is called to the table -- every daemon hears it; those at the reels cheer, and say so
      if (slots::tableAct(outcome) && castSend(CAST_ACT, slots::tableAct(outcome))) cheers = "";
    }
    // the money counted up (or down) to what it is now
    long target = balance();
    if (shownBalance != target) {
      long d = target - shownBalance, stepBy = max(1L, labs(d) / 8);
      shownBalance += d > 0 ? min(d, stepBy) : max(d, -stepBy);
    }
    // the season over the reels
    for (int i = 0; i < bitN; i++) {
      Bit &b = bits[i];
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.y > f.bottom + 6 || b.y < f.top - 8 || b.x < f.x0 - 8 || b.x > f.x0 + 3 * f.reelW + 2 * f.gap + 8)
        bitReset(b, f.x0, f.x0 + 3 * f.reelW, b.vy < 0 ? f.bottom + 4 : f.top, f.bottom, false, l);
      if (b.vy < 0 && b.y < f.top - 6) b.y = f.bottom + 4;
    }
    // the lights
    uint32_t a = colourA(), b = colourB();
    int lights = phase == ROLLING ? CASINO_SPIN
               : phase == SHOWING && now - shownAt < 2600 ? (outcome == O_JACK3 ? CASINO_JACKPOT : outcome == O_LOSE ? CASINO_LOSE : CASINO_WIN)
               : CASINO_IDLE;
    if (now - flashAt < 90) ledsCasino(CASINO_WIN, 0xFFFFFF, 0xFFFFFF);   // a reel caught: the lights flash once
    else if (now - cheerAt < 2000 && cheerAt) ledsCasino(calloutJackpot ? CASINO_JACKPOT : CASINO_WIN, a, b);   // C-151: another's big win
    else ledsCasino(lights, a, b);
    // C-151: the table -- the radios kept listening and answering (the loop is not running), who is heard sitting
    // here, ourselves said every half minute over LoRa and each minute to the companion, and those gone quiet let go
    loraLoop(now, cfg.meet, st.carrying ? st.daemon.species : 0);
    meetLoop(now, cfg.meet, st.carrying ? st.daemon.species : 0);
    meetCastLoop(now); castLoop(now);
    { int sp; uint32_t tg; while (meetTakeTable(sp, tg)) casinoHeard(tg, sp, "", true, 2); }
    if (now - tableAt > 30000) { tableAt = now; loraTable(true); ++tableTicks; report("table", tableHere()); }   // C-158: each half minute
    for (int i = 0; i < seatN; ) if (now - seats[i].at > 75000) seats[i] = seats[--seatN]; else i++;
    // over Wi-Fi the state is asked for now and then, for our other boards at the table (the cable brings it itself);
    // not without PSRAM, where a state does not always fit beside the reels
    // (every 12 seconds while someone else sits here, so their words and big wins arrive; every 30 alone)
    uint32_t every = seatN || st.casino.tableN ? 12000 : 30000;
    if (psramFound() && !bridgeLive() && online() && now - polledAt > every) { polledAt = now; httpState("GET", "/api/device/state", ""); }
    // a broadcast sent or heard goes on to the companion now, as the loop's own meetReport would: the table's words and
    // big wins reach our other boards through it, whatever the radios manage (the cable's bridge, or Wi-Fi with room)
    if (bridgeLive() || (online() && psramFound())) {
      String cast;
      while (castTakeReport(cast)) { if (bridgeLive()) bridge("CAST " + cast); else if (http("POST", "/api/device/broadcast", cast).isEmpty()) break; }
    }
    if (phase == SHOWING && now - shownAt > 2600) phase = IDLE;
    // the bridge hears the board is here (the loop's own HELLO is not running)
    if (now - helloAt > HELLO_MS) { helloAt = now; Serial.println(String("HELLO daemons-companion ") + board.id + " 3 " + deviceId()); }
    soundIdle();
    lastInput = now;
    draw();
    // left alone at rest as long as the board would sleep: it gets up from the table
    if (!spinning() && cfg.sleepAfter > 0 && now - idleSince > (uint32_t)cfg.sleepAfter * 1000) break;
    delay(4);
  }
  if (phase == ROLLING && !rigged) { won = bet * PAYS[outcome]; unreported += won; sessionDelta += won; }   // left mid-pull: it still pays
  reportNow();
  // C-151: up from the table -- said the same ways
  loraTable(false); meetSetTable(false); report("table", "gone " + deviceId());
  sitting = false; seatN = 0; typing = "";
  putAway();
  cableIn = String();                           // its buffer given back
  runPanel = nullptr;
  ledsDance(-1, 0, 0);
  lastInput = millis();
  if (!spins) return daemonName() + " looked at the reels, and kept its money.";   // DRAFT
  String how = sessionDelta > 0 ? "won " + String(sessionDelta) : sessionDelta < 0 ? "lost " + String(-sessionDelta) : "came out even";
  return daemonName() + " " + how + " in " + String(spins) + (spins == 1 ? " spin" : " spins") + ".\n\nThe game's money changes at the next SYNC.";   // DRAFT
}

// C-163: the look and its colours, for the watch's faces (faces.cpp) -- the same rule as the reels
String seasonLook() { return lookNow(); }
uint32_t seasonColour(int k) { return k ? colourB() : colourA(); }
