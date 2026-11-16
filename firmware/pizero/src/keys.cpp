// C-378 / C-379: key names, what each types, and the game's map (DRAFT until the user holds the device).
#include "keys.h"

#include <cctype>
#include <cstdio>
#include "paths.h"

static const char *NAMES[] = {
  "NONE",
  "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z",
  "0", "1", "2", "3", "4", "5", "6", "7", "8", "9",
  "ENTER", "ESC", "TAB", "SPACE", "BACKSPACE", "SHIFT", "FN", "SYM", "CTRL", "ALT",
  "UP", "DOWN", "LEFT", "RIGHT",
};
static_assert(sizeof NAMES / sizeof NAMES[0] == (size_t)Key::Count, "a name for every key");

const char *keyName(Key k) { return (size_t)k < (size_t)Key::Count ? NAMES[(size_t)k] : "?"; }
Key keyByName(const std::string &name) {
  std::string n;
  for (char c : name) if (!isspace((unsigned char)c)) n += (char)toupper((unsigned char)c);
  if (n == "OK" || n == "RETURN") n = "ENTER";
  for (size_t i = 1; i < (size_t)Key::Count; i++) if (n == NAMES[i]) return (Key)i;
  return Key::None;
}
char keyChar(Key k, bool shift) {
  if (k >= Key::A && k <= Key::Z) return (char)((shift ? 'A' : 'a') + ((int)k - (int)Key::A));
  if (k >= Key::N0 && k <= Key::N9) return (char)('0' + ((int)k - (int)Key::N0));
  if (k == Key::Space) return ' ';
  return 0;
}
Dir dirOf(Key k) {
  switch (k) {
    case Key::Up: case Key::F: return Dir::Up;
    case Key::Down: case Key::X: return Dir::Down;
    case Key::Left: case Key::Z: return Dir::Left;
    case Key::Right: case Key::C: return Dir::Right;
    default: return Dir::None;
  }
}

static const char *GBA_NAMES[GBA_KEYS] = { "A", "B", "SELECT", "START", "RIGHT", "LEFT", "UP", "DOWN", "R", "L" };
const char *gbaKeyName(int k) { return k >= 0 && k < GBA_KEYS ? GBA_NAMES[k] : "?"; }

// Two keys may press each GBA key: the device's, and on a computer its arrows
static Key gameMap[GBA_KEYS][2];
static void defaults() {
  const Key d[GBA_KEYS][2] = {
    { Key::L, Key::None },        // A: under the right thumb, to the right of B as on a GBA
    { Key::K, Key::None },        // B
    { Key::Space, Key::None },    // SELECT
    { Key::Enter, Key::None },    // START
    { Key::C, Key::Right },       // the pad: the device's printed arrows
    { Key::Z, Key::Left },
    { Key::F, Key::Up },
    { Key::X, Key::Down },
    { Key::P, Key::None },        // R and L: the top row's two ends
    { Key::Q, Key::None },
  };
  for (int i = 0; i < GBA_KEYS; i++) { gameMap[i][0] = d[i][0]; gameMap[i][1] = d[i][1]; }
}
void gameKeysLoad() {
  defaults();
  std::string text;
  if (!readText(inConfig("keys.conf"), text)) return;
  // "A = L" or "UP = F, UP" -- one GBA key a line; '#' starts a note
  size_t at = 0;
  while (at < text.size()) {
    size_t nl = text.find('\n', at);
    std::string line = text.substr(at, nl == std::string::npos ? std::string::npos : nl - at);
    at = nl == std::string::npos ? text.size() : nl + 1;
    if (size_t h = line.find('#'); h != std::string::npos) line.resize(h);
    size_t eq = line.find('=');
    if (eq == std::string::npos) continue;
    std::string left, right = line.substr(eq + 1);
    for (char c : line.substr(0, eq)) if (!isspace((unsigned char)c)) left += (char)toupper((unsigned char)c);
    int g = -1;
    for (int i = 0; i < GBA_KEYS; i++) if (left == GBA_NAMES[i]) g = i;
    if (g < 0) { fprintf(stderr, "keys.conf: no GBA key called %s\n", left.c_str()); continue; }
    Key ks[2] = { Key::None, Key::None };
    int n = 0;
    size_t s = 0;
    while (s <= right.size() && n < 2) {
      size_t comma = right.find(',', s);
      std::string part = right.substr(s, comma == std::string::npos ? std::string::npos : comma - s);
      Key k = keyByName(part);
      if (k != Key::None) ks[n++] = k;
      else if (part.find_first_not_of(" \t\r") != std::string::npos) fprintf(stderr, "keys.conf: no key called %s\n", part.c_str());
      if (comma == std::string::npos) break;
      s = comma + 1;
    }
    if (n) { gameMap[g][0] = ks[0]; gameMap[g][1] = ks[1]; }
  }
}
uint32_t gameKeysHeld(const bool *held) {
  uint32_t bits = 0;
  for (int i = 0; i < GBA_KEYS; i++)
    for (Key k : gameMap[i]) if (k != Key::None && held[(size_t)k]) bits |= 1u << i;
  // a pad cannot be pressed both ways at once on a GBA: the game was never written for it
  if ((bits & (1u << GBA_LEFT)) && (bits & (1u << GBA_RIGHT))) bits &= ~((1u << GBA_LEFT) | (1u << GBA_RIGHT));
  if ((bits & (1u << GBA_UP)) && (bits & (1u << GBA_DOWN))) bits &= ~((1u << GBA_UP) | (1u << GBA_DOWN));
  return bits;
}
std::string gameKeysSay(int g) {
  if (g < 0 || g >= GBA_KEYS) return "";
  std::string s = keyName(gameMap[g][0]);
  if (gameMap[g][1] != Key::None) s += std::string(" / ") + keyName(gameMap[g][1]);
  return s;
}
