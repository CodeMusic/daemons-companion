// C-379, C-395: GAMES -- both editions, each as the newest release or as the TESTING build, made here from the
// player's own ROM; one chosen, and PLAY plays it on the one save (C-397). What is kept, the originals, the newest
// release (GitHub's list, read now, as the app reads it) and what the hub holds for testing are looked up on a thread of
// their own, and so is each making (the fetch takes a while), each step said as it happens.
// Up and down choose; ENTER plays the one chosen, or makes it first (or anew, when a newer one is out); TAB looks again
// (a USB stick just put in); ESC goes HOME. Every word here is DRAFT.
#include <algorithm>
#include <atomic>
#include <mutex>
#include <thread>
#include <vector>

#include "app.h"
#include "apps.h"
#include "canvas.h"
#include "game/rom.h"
#include "hal/hal.h"
#include "hub/hub.h"
#include "pages/parts.h"

namespace {
struct Row { const char *edition; bool testing; };
const Row ROWS[4] = { { "CONTENT", false }, { "CONTENT", true }, { "CONTEXT", false }, { "CONTEXT", true } };
const int ROW_Y[4] = { 24, 36, 54, 66 };
enum class Act { None, Play, Make };

std::string gameOf(const std::string &edition) { return edition == "CONTEXT" ? "LEAFGREEN" : "FIRERED"; }

struct Games : Page {
  enum State { Looking, Choosing, Working, Done, Failed } state = Choosing;
  std::mutex lock;
  std::vector<Game> held;
  std::vector<Original> origs;
  std::string latest, chosenKey, step, message;
  Testing testing;
  Game made;
  int sel = 0;
  bool placed = false;                  // the cursor put on the game chosen, once
  std::thread worker;
  std::atomic<bool> moved{false};

  void enter() override {
    if (state == Working || state == Looking) return;
    look();
  }
  void look() {
    if (worker.joinable()) worker.join();
    state = Looking;
    worker = std::thread([this] {
      auto h = heldGames();
      auto o = originals();
      std::string l = latestRelease(true);
      Testing t = testingOffered();
      Game c;
      std::string ck = heldGame(c) ? c.key() : "";
      std::lock_guard<std::mutex> g(lock);
      held = h; origs = o; latest = l; testing = t; chosenKey = ck;
      if (!placed) {
        for (int i = 0; i < 4; i++) if (Game{ ROWS[i].edition, "", "", "", ROWS[i].testing }.key() == ck) sel = i;
        placed = true;
      }
      state = Choosing;
      moved = true;
    });
  }

  const Game *heldOf(const Row &r) const {
    for (auto &g : held) if (g.edition == r.edition && g.testing == r.testing) return &g;
    return nullptr;
  }
  bool hasOriginal(const std::string &edition) const {
    return std::any_of(origs.begin(), origs.end(), [&](const Original &o) { return o.edition == edition; });
  }
  bool offered(const std::string &edition) const {
    return std::find(testing.editions.begin(), testing.editions.end(), edition) != testing.editions.end();
  }
  // what a row says, and what ENTER does with it
  std::string status(const Row &r, Act &a) const {
    const Game *g = heldOf(r);
    const bool orig = hasOriginal(r.edition);
    a = Act::None;
    if (!r.testing) {
      if (g && orig && !latest.empty() && g->release != latest) { a = Act::Make; return g->release + " > NEW " + latest; }
      if (g) { a = Act::Play; return g->release; }
      if (orig) { a = Act::Make; return latest.empty() ? "MAKE IT" : "MAKE " + latest; }
      return "NEEDS YOUR " + gameOf(r.edition);
    }
    if (g && orig && offered(r.edition) && !testing.version.empty() && g->release != testing.version) {
      a = Act::Make;
      return g->release + " > HUB " + testing.version;
    }
    if (g) { a = Act::Play; return g->release; }
    if (!offered(r.edition)) return hub::paired() ? "NOT ON THE HUB" : "LINK FIRST";
    if (!orig) return "NEEDS YOUR " + gameOf(r.edition);
    a = Act::Make;
    return "MAKE FROM THE HUB " + testing.version;
  }

  // the game PLAY plays from now on: the one running is kept and put away first, unless it is this one, unchanged
  void playThis(const std::string &key, bool fresh) {
    if (key != chosenKey || fresh) { keepSave(); emu.unload(); chooseGame(key); }
    go(PageId::Play);
  }

  void key(const KeyEvent &e) override {
    if (!e.down) return;
    std::unique_lock<std::mutex> l(lock);
    if (state == Working || state == Looking) return;
    if (e.key == Key::Esc) { if (state == Choosing) goHome(); else state = Choosing; return; }
    if (state == Done) { if (e.key == Key::Enter) { state = Choosing; playThis(made.key(), true); } return; }
    if (state == Failed) { if (e.key == Key::Enter) { state = Choosing; moved = true; } return; }
    Dir d = dirOf(e.key);
    if (d == Dir::Up) sel = (sel + 3) % 4;
    else if (d == Dir::Down) sel = (sel + 1) % 4;
    else if (e.key == Key::Tab) { l.unlock(); look(); }
    else if (e.key == Key::Enter) {
      Act a;
      status(ROWS[sel], a);
      if (a == Act::Play) playThis(Game{ ROWS[sel].edition, "", "", "", ROWS[sel].testing }.key(), false);
      else if (a == Act::Make) start(ROWS[sel]);
    }
  }
  void start(const Row r) {
    if (worker.joinable()) worker.join();
    state = Working;
    step = "...";
    made = Game{};
    worker = std::thread([this, r] {
      auto say = [this](const std::string &s) { std::lock_guard<std::mutex> l(lock); step = s; moved = true; };
      try {
        Game g = r.testing ? makeTesting(r.edition, say) : makeRelease(r.edition, say);
        auto h = heldGames();
        std::lock_guard<std::mutex> l(lock);
        made = g;
        held = h;
        state = Done;
      } catch (const std::exception &e) {
        std::lock_guard<std::mutex> l(lock);
        message = e.what();
        state = Failed;
      }
      moved = true;
    });
  }
  bool changed() override { return moved.exchange(false); }

  void draw() override {
    std::lock_guard<std::mutex> l(lock);
    const uint16_t accent = rgb(0x5b, 0x6b, 0x8c), dim = rgb(0x80, 0x84, 0x90), soft = rgb(0xc8, 0xc8, 0xd0);
    canvas.fillScreen(rgb(0x18, 0x1c, 0x24));
    denUnder(hub::view(), accent);   // C-593: on a tall canvas the daemon is under the words, as on PLAY
    drawBand("GAMES", accent);   // DRAFT
    canvas.setFont(&fonts::Font0);
    canvas.setTextSize(1);
    if (state == Looking) {
      canvas.setTextColor(soft);
      canvas.setCursor(6, 40);
      canvas.print("LOOKING...");   // DRAFT
      canvas.setTextColor(dim);
      wrap("Your own ROMs, the newest release, and what the hub holds for testing.", 6, 56, lay::cols(), 3, 10);   // DRAFT
      return;
    }
    if (state == Working) {
      canvas.setTextColor(TFT_WHITE);
      canvas.setCursor(6, 40);
      canvas.print(upper(step).c_str());
      canvas.setTextColor(dim);
      wrap("Your own ROM is checked, our patch is fetched and checked, and DAEMONS is made here. Your ROM is never sent "
           "anywhere.", 6, 60, lay::cols(), 4, 10);   // DRAFT
      return;
    }
    if (state == Done) {
      canvas.setTextColor(TFT_WHITE);
      canvas.setCursor(6, 40);
      canvas.printf("%s %s%s IS READY", made.edition.c_str(), made.release.c_str(), made.testing ? " TESTING" : "");   // DRAFT
      canvas.setTextColor(soft);
      canvas.setCursor(6, 60);
      canvas.print(hint("ENTER PLAYS IT   ESC: THE LIST"));   // DRAFT
      if (made.testing) {
        canvas.setTextColor(dim);
        wrap("It plays your one save, as every game here does, kept in step with the hub.", 6, 80, lay::cols(), 3, 10);   // DRAFT (C-397)
      }
      return;
    }
    if (state == Failed) {
      canvas.setTextColor(rgb(0xe0, 0x90, 0x80));
      wrap(message, 6, 36, lay::cols(), lay::rows(6, 10), 10);
      canvas.setTextColor(soft);
      canvas.setCursor(6, lay::foot(150));
      canvas.print(hint("ENTER: BACK TO THE LIST"));   // DRAFT
      return;
    }
    for (int i = 0; i < 4; i++) {
      const Row &r = ROWS[i];
      Act a;
      std::string s = status(r, a);
      const int y = ROW_Y[i];
      const bool on = i == sel, chosen = Game{ r.edition, "", "", "", r.testing }.key() == chosenKey && heldOf(r);
      if (on) canvas.fillRect(2, y - 2, hal::W - 4, 12, accent);
      canvas.setTextColor(on ? TFT_WHITE : r.testing ? dim : soft);
      canvas.setCursor(6, y);
      canvas.print(r.testing ? "  TESTING" : r.edition);   // DRAFT
      canvas.setTextColor(on ? TFT_WHITE : a == Act::None ? dim : soft);
      canvas.setCursor(80, y);
      canvas.print(s.substr(0, 30).c_str());
      if (chosen) {
        canvas.setTextColor(on ? TFT_WHITE : accent);
        canvas.setCursor(hal::W - 6 - 6 * 7, y);
        canvas.print("PLAYING");   // DRAFT
      }
    }
    // the player's own ROMs, as patches.json names them ("Pokemon FireRed (USA) Rev 1" -> FIRERED (USA) REV 1)
    canvas.setTextColor(dim);
    canvas.setCursor(6, 86);
    int below = 86;   // the testing line goes under however many lines this took (three, and it overlapped)
    if (origs.empty()) {
      below += 10 * wrap(hint("Put your own FireRed or LeafGreen (USA, the .gba you own) in DAEMONS in your home folder, or on a USB stick. "
           "TAB looks again."), 6, 86, lay::cols(), 4, 10);   // DRAFT
    } else {
      std::string line = "YOUR ROMS:";   // DRAFT
      for (auto &o : origs) {
        std::string n = o.name;
        if (n.rfind("Pokemon ", 0) == 0) n = n.substr(8);
        line += "  " + upper(n);
      }
      below += 10 * wrap(line, 6, 86, lay::cols(), lay::rows(2, 10), 10);
    }
    if (testing.editions.empty() && !testing.why.empty()) {
      canvas.setTextColor(dim);
      wrap("TESTING: " + testing.why, 6, std::max(110, below + 4), lay::cols(), 3, 10);   // DRAFT
    }
    canvas.setTextColor(soft);
    canvas.setCursor(6, lay::foot(156));
    canvas.print(hint("ENTER PLAYS OR MAKES  TAB LOOKS AGAIN  ESC HOME"));   // DRAFT
  }
  ~Games() override { if (worker.joinable()) worker.join(); }
};
}  // namespace

Page *makePage() { static Games p; return &p; }
