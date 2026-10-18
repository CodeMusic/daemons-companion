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
}
