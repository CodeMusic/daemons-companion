#pragma once
// C-378: what every page shares -- the page in front, the keys held, the game -- and a few drawing helpers. Every word
// a player reads here is DRAFT until the user has seen it on the device.
#include <string>
#include "game/emu.h"
#include "keys.h"

enum class PageId { Home, Play, Make };

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
void keepSave();                                // the game's save into daemons.sav, if it moved since it was kept

// drawing shared by the pages
void drawBand(const char *title, uint16_t colour);   // the top 14 px: a title, the hour and the cell
std::string clockNow();                               // "14:05"
std::string upper(std::string s);
int wrap(const std::string &text, int x, int y, int cols, int rowsMax, int lineH);   // Font0 lines; the rows used
