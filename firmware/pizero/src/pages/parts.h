#pragma once
// C-381: what more than one page draws -- the daemon in its den (C-113), a row of choices along the bottom, care pips,
// and something sent to the hub on a thread of its own so a page never waits on the network.
#include <chrono>
#include <future>
#include <string>
#include <vector>
#include "hub/hub.h"
#include "keys.h"

void drawSprite(const Sprite &s, int x, int y, int scale);                  // index 0 left clear

// C-593: a page with a picture and words. On a wide canvas the picture is on the left and the words beside it, as the
// Cardputer Zero has them (and a higher canvas makes the picture higher); on a tall one (the HackberryPi's square) the
// picture is across the top and the words below it.
struct Split {
  int px, py, pw, ph;   // the picture
  int tx, ty, cols;     // the words: their corner, and the Font0 letters that fit a line
};
Split split(int side);   // side: the picture's side on the first canvas (104; CARE's is 120)
void drawDen(const HubView &v, int x, int y, int w, int h);                  // the den's wall and floor, the daemon on it
void drawPartyMember(const PartyMember &m, const HubView &v, int x, int y, int w, int h);
void drawPips(int x, int y, int have, int due, uint16_t on, uint16_t off);  // ● for each given, ○ for each still due

// A row of choices; Z C (or the arrows) move along it, scrolled so the chosen one shows
struct Choices {
  std::vector<std::string> items;
  int sel = 0;
  bool key(Key k);                       // true when it moved
  void draw(int y, uint16_t accent);
  const std::string &chosen() const { return items[sel]; }
};

// Something sent: busy while it goes, then its answer once
struct Sending {
  std::future<Reply> f;
  bool busy() { return f.valid() && f.wait_for(std::chrono::seconds(0)) != std::future_status::ready; }
  void send(const std::string &path, const std::string &json) {
    f = std::async(std::launch::async, [path, json] { return hub::post(path, json); });
  }
  bool done(Reply &r) {   // true once, when an answer came
    if (!f.valid() || busy()) return false;
    r = f.get();
    return true;
  }
};
std::string replyWords(const Reply &r, const char *field);   // a field of the answer, or the error in words

// C-457: a hint as this board's keys are printed -- "ENTER: DONE    ESC: BACK" is "A: DONE    B: BACK" on a pad. The
// answer lasts until the fourth call after it.
const char *hint(const char *words);
