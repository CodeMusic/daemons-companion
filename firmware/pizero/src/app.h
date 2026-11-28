#pragma once
// C-378: what every page shares -- the page in front, the keys held, the game -- and a few drawing helpers. Every word
// a player reads here is DRAFT until the user has seen it on the device.
#include <string>
#include "game/emu.h"
#include "hal/hal.h"
#include "keys.h"

enum class PageId { Home, Play, Make, Pair, Care, Step, Party, Say, Caps, Talk, Kit, Engine, Dashboard, Account, RollCall };

struct Page {
  virtual ~Page() = default;
  virtual void enter() {}
  virtual void key(const KeyEvent &) {}
  virtual void tick() {}                        // each pass of the loop: the game runs its frames here
  virtual void draw() = 0;                      // the whole canvas
  virtual bool changed() { return false; }      // drawn again now (otherwise after a key, or each second)
};

Page *pageFor(PageId id);
void go(PageId id);
PageId current();

extern Emu emu;
extern bool held[(size_t)Key::Count];
extern volatile bool quitting;
extern bool headless;
extern bool savedSinceSync;                     // C-397: the game saved since the last SYNC (HOME SYNCs then)
void keepSave();                                // the game's save into its own file (savePath), if it moved since kept

// C-593: where a page puts things, on whichever canvas this board has (hal::W, hal::H). Every page was first drawn for
// 320x170, and on that canvas each of these gives the number the page had: a bigger canvas gets more letters across,
// more rows, and its last lines at its own bottom edge.
namespace lay {
extern int under;                                                  // the height the daemon's strip takes from the foot of the page in front (denUnder; 0 on most)
inline int more() { return hal::H - 170 - under; }                 // the height this page has over the first canvas's
inline int cols(int x = 6) { return (hal::W - x - 6) / 6; }        // Font0 letters from x to the right margin: 51 from 6
inline int across() { return (hal::W - 8) / 6; }                   // a whole line, edge to edge: 52
inline int foot(int y) { return y + more(); }                      // a line counted from the bottom: the first canvas's y, here
inline int rows(int n, int lineH) { return n + more() / lineH; }   // a list or wrapped words: the first canvas's rows and those that fit now
inline bool tall() { return hal::H >= 300; }                       // room for a picture above its words (a square screen), not beside them
}

// drawing shared by the pages
void drawBand(const char *title, uint16_t colour);   // the top 14 px: a title, the hour and the cell
std::string clockNow();                               // "14:05"
std::string upper(std::string s);
int wrap(const std::string &text, int x, int y, int cols, int rowsMax, int lineH);   // Font0 lines; the rows used
