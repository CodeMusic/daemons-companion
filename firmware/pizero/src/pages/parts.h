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
// C-593: the strip from y0 to the foot of a tall canvas, as PLAY has under the game -- its ground, a line in the day's
// colour, and the daemon carried in its den on the right. Answers the x the words on its left may reach.
int drawStrip(const HubView &v, int y0, uint16_t day);
// A page of words on a tall canvas, with a daemon carried (STEP, SAY, TALK, LINK, GAMES; the user, 2026-11-27): the
// words keep to the top, as high as the game is on PLAY, and the daemon is under them where PLAY has it -- so it
// stays where it was from page to page -- with its name, how it is, what it is doing and the day's care beside it.
// Called in draw() once the page is filled and before a line is placed: every line the page counts from its foot
// (lay::foot, lay::rows) is above the strip from then on. Without a daemon, or on a wide canvas, it draws nothing
// and the page has its whole height.
void denUnder(const HubView &v, uint16_t day);
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
