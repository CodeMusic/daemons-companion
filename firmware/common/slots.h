#pragma once
// C-155: THE CASINO's table in C++ -- server/src/slots.ts's, one copy for every board: the handhelds
// (firmware/esp32/src/casino.cpp) and the Tab5 (firmware/tab5/src/ui.cpp) both play by it (C-157: it was two copies), and
// server/test/slots_tab5.test.ts holds the numbers here to slots.ts, so every player's odds are the same.
// The result is decided at the pull, from WEIGHTS (in a thousand); each reel then slips on to its piece.
#include <Arduino.h>

namespace slots {
// the pieces: the daemon carried (three of it the jackpot), up to three of the party's others, the coin, the season's own
enum Piece : uint8_t { JACK = 0, F1 = 1, F2 = 2, F3 = 3, COIN = 4, SEASON = 5 };
static const char *const OUTCOMES[] = { "LOSE", "SEASON1", "JACK2", "SEASON3", "COIN3", "FRIEND3", "JACK3" };
static const int WEIGHTS[] = { 694, 180, 40, 40, 30, 12, 4 };          // of 1000
static const int PAYS[]    = { 0, 1, 2, 4, 6, 12, 50 };                // for each coin bet, the bet included
static const int BETS[]    = { 10, 20, 50, 100, 200, 500, 1000 };
static const int OUTCOME_N = 7, BET_N = 7;

inline int outcomeOf(int a, int b, int c) {
  if (a == b && b == c) return a == JACK ? 6 : a == COIN ? 4 : a == SEASON ? 3 : 5;
  if (a == JACK && b == JACK) return 2;
  if (a == SEASON) return 1;
  return 0;
}
inline int draw() {
  int r = (int)(esp_random() % 1000);
  for (int o = 0; o < OUTCOME_N; o++) { if (r < WEIGHTS[o]) return o; r -= WEIGHTS[o]; }
  return 0;
}
inline int any6() { return (int)(esp_random() % 6); }
// three pieces that make exactly this result
inline void piecesFor(int o, uint8_t out[3]) {
  switch (o) {
    case 6: out[0] = out[1] = out[2] = JACK; return;
    case 5: { uint8_t f = F1 + esp_random() % 3; out[0] = out[1] = out[2] = f; return; }
    case 4: out[0] = out[1] = out[2] = COIN; return;
    case 3: out[0] = out[1] = out[2] = SEASON; return;
    case 2: { int c = any6(); while (c == JACK) c = any6(); out[0] = out[1] = JACK; out[2] = c; return; }
    default:
      for (int tries = 0; tries < 500; tries++) {
        out[0] = o == 1 ? SEASON : any6(); out[1] = any6(); out[2] = any6();
        if (outcomeOf(out[0], out[1], out[2]) == o) return;
      }
      out[0] = COIN; out[1] = F1; out[2] = F2;                 // a loss, whatever the dice did
  }
}
// C-151: a win this big is called to the table, as the broadcast act of this code
inline const char *tableAct(int o) { return o == 6 ? "JACKPOT" : PAYS[o] >= 12 ? "BIGWIN" : nullptr; }

// ---- C-158 (the user, 2026-10-18): THE CASINO in context, and the cat and the string -- server/src/slots.ts's engine,
// the numbers held together by server/test/slots.test.ts. LUCK (the day's, from the companion: casino.context.luck)
// sets the return, 90 at -1 to 100 at +1; REACH, the player's own, learns each pull as a model's weight does -- a step
// against its error (a real win, 2x and up, against how often one should come), with a little noise -- and moves a
// pull's return by up to REACH_SPAN; a loss falls NEAR (the winning piece one place off the line), oftener the nearer.
static const float REACH_SPAN = 0.04f, LEARN = 0.25f, NOISE = 0.08f;
static const float BASE_RETURN = 0.944f, TARGET = 0.126f;   // the table's own return, and its real wins (2x and up)
static const int FINE = 10000;                              // a table for any return is kept in ten thousand
inline float clampf(float v, float lo, float hi) { return v < lo ? lo : v > hi ? hi : v; }
inline float returnAt(float luck) { return clampf(0.95f + 0.05f * clampf(luck, -1, 1), 0.9f, 1.0f); }
inline void weightsFor(float ret, int w[OUTCOME_N]) {
  float k = ret / BASE_RETURN; int wins = 0;
  for (int o = 1; o < OUTCOME_N; o++) { w[o] = (int)lroundf(WEIGHTS[o] * 10 * k); wins += w[o]; }
  w[0] = FINE - wins;
}
inline int drawFrom(const int w[OUTCOME_N]) {
  int total = 0; for (int o = 0; o < OUTCOME_N; o++) total += w[o];
  int r = (int)(esp_random() % (uint32_t)total);
  for (int o = 0; o < OUTCOME_N; o++) { if (r < w[o]) return o; r -= w[o]; }
  return 0;
}
struct Cat { float reach = 0; int dry = 0, streak = 0, pulls = 0; };
inline float pullReturn(float luck, const Cat &c) { return clampf(returnAt(luck) + REACH_SPAN * c.reach, 0.86f, 1.04f); }
inline void learn(Cat &c, int outcome) {
  float won = PAYS[outcome] >= 2 ? 1.0f : 0.0f, noise = (float)(esp_random() % 2001) / 1000.0f - 1.0f;
  c.reach = clampf(c.reach - LEARN * (won - TARGET) + NOISE * noise, -1, 1);
  c.dry = won > 0 ? 0 : c.dry + 1; c.streak = won > 0 ? c.streak + 1 : 0; c.pulls++;
}
inline float nearChance(const Cat &c) { return clampf(0.25f + 0.35f * (c.reach > 0 ? c.reach : 0), 0, 0.6f); }
// three pieces for a loss that ALMOST won -- two alike (a friend or the coin: two JACKs would pay) and the third not;
// `wanted`, the piece the third would have needed, is to show one place off the line
inline void nearPieces(uint8_t out[3], uint8_t &wanted) {
  uint8_t pick = 1 + esp_random() % 4, c;
  do c = esp_random() % 6; while (c == pick || outcomeOf(pick, pick, c) != 0);
  out[0] = out[1] = pick; out[2] = c; wanted = pick;
}
}
