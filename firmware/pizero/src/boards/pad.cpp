// C-468: what every board with a pad and no keyboard shares (the GamePi20, the Game HAT): the game's keys on its
// buttons, its buttons as the pages' keys, and its hints in its buttons' names. A pad board's file calls these.
#include "boards/pad.h"

namespace board {
namespace pad {
void gameKeys(Key m[GBA_KEYS][2]) {
  const Key d[GBA_KEYS][2] = {
    { Key::PadA, Key::None },
    { Key::PadB, Key::None },
    { Key::PadSelect, Key::None },
    { Key::PadStart, Key::None },
    { Key::Right, Key::None },
    { Key::Left, Key::None },
    { Key::Up, Key::None },
    { Key::Down, Key::None },
    { Key::PadR, Key::None },
    { Key::PadL, Key::None },
  };
  for (int i = 0; i < GBA_KEYS; i++) { m[i][0] = d[i][0]; m[i][1] = d[i][1]; }
}

// On the pages, the pad reads as the keys they listen for: A is ENTER, B is ESC, SELECT is TAB, START is ENTER, Y is
// BACKSPACE (take it back), X is SPACE, L and R are the arrows along a row. In the game it is all the game's, except
// SELECT and START held together: the way back to HOME, as on most handhelds.
bool forPage(KeyEvent &e, const bool *held, bool inGame) {
  if (inGame) {
    if (e.key == Key::Esc) return true;   // a computer's ESC, standing in for the pair
    const bool chord = (e.key == Key::PadStart && held[(size_t)Key::PadSelect]) ||
                       (e.key == Key::PadSelect && held[(size_t)Key::PadStart]);
    if (!chord || !e.down) return false;
    e.key = Key::Esc;
    e.ch = 0;
    return true;
  }
  switch (e.key) {
    case Key::PadA: case Key::PadStart: e.key = Key::Enter; break;
    case Key::PadB: e.key = Key::Esc; break;
    case Key::PadSelect: e.key = Key::Tab; break;
    case Key::PadY: e.key = Key::Backspace; break;
    case Key::PadX: e.key = Key::Space; break;
    case Key::PadL: e.key = Key::Left; break;
    case Key::PadR: e.key = Key::Right; break;
    default: break;
  }
  e.ch = 0;
  return true;
}

const char *word(Key k) {
  switch (k) {
    case Key::Enter: return "A";
    case Key::Esc: return "B";
    case Key::Tab: return "SELECT";
    case Key::Backspace: return "Y";
    case Key::Space: return "X";
    default: return keyName(k);
  }
}
}  // namespace pad
}  // namespace board
