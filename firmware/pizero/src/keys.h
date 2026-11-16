#pragma once
// C-378: the Cardputer Zero's keys by name, from either side (SDL on a computer, evdev on the device), and C-379's map
// from them to the GBA's ten. The device has no arrow keys: F Z X C are its arrows (printed on them; M5Stack's own apps
// take them plain), and a computer's arrow keys stand in for them too.
#include <cstdint>
#include <string>

enum class Key : uint8_t {
  None,
  A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S, T, U, V, W, X, Y, Z,
  N0, N1, N2, N3, N4, N5, N6, N7, N8, N9,
  Enter, Esc, Tab, Space, Backspace, Shift, Fn, Sym, Ctrl, Alt,
  Up, Down, Left, Right,
  Count
};
struct KeyEvent { Key key = Key::None; bool down = false; char ch = 0; };   // ch: what it types (Shift applied), or 0

const char *keyName(Key k);
Key keyByName(const std::string &name);
char keyChar(Key k, bool shift);

// A direction for moving through a page: the arrows, or F X Z C as the device prints them (0 when neither)
enum class Dir { None, Up, Down, Left, Right };
Dir dirOf(Key k);

// The GBA's keys in mGBA's bit order
enum GbaKey { GBA_A, GBA_B, GBA_SELECT, GBA_START, GBA_RIGHT, GBA_LEFT, GBA_UP, GBA_DOWN, GBA_R, GBA_L, GBA_KEYS };
const char *gbaKeyName(int k);
void gameKeysLoad();                        // ~/.config/daemons/keys.conf ("A = L"), else the defaults (docs/CARDPUTERZERO.md)
uint32_t gameKeysHeld(const bool *held);    // held[] by Key; the GBA bits pressed
std::string gameKeysSay(int gbaKey);        // "L" or "F / UP", for the strips and the help
