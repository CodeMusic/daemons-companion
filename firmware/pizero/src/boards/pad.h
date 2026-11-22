#pragma once
// C-468: a pad's behaviour, shared by every board that has one (boards/pad.cpp)
#include "board.h"

namespace board {
namespace pad {
void gameKeys(Key m[GBA_KEYS][2]);                          // A B SELECT START, the d-pad, R L: as their names say
bool forPage(KeyEvent &e, const bool *held, bool inGame);  // A is ENTER, B is ESC...; SELECT+START leaves the game
const char *word(Key k);                                   // "A" for ENTER
}
}
