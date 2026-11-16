// C-379: MAKE THE GAME -- the .gba files a player would have put on the device, one chosen, DAEMONS made from it on a
// thread of its own (the fetch takes a while), each step said as it happens.
#include <atomic>
#include <mutex>
#include <thread>
#include <vector>

#include "app.h"
#include "canvas.h"
#include "game/rom.h"
#include "hal/hal.h"

namespace {
struct Make : Page {
  std::vector<std::string> found;
  int sel = 0;
  enum State { Choosing, Working, Done, Failed } state = Choosing;
  std::mutex lock;
  std::string step, message;
  Game made;
  std::thread worker;
  std::atomic<bool> moved{false};

  void enter() override {
    if (state == Working) return;
    found = originalsFound();
    sel = 0;
    state = Choosing;
  }
  void key(const KeyEvent &e) override {
    if (!e.down) return;
    if (state == Working) return;
    if (e.key == Key::Esc) { go(PageId::Home); return; }
    if (state != Choosing) {
      if (e.key == Key::Enter) { state = Choosing; if (made.sha1.size()) { emu.unload(); go(PageId::Play); } }
      return;
    }
    Dir d = dirOf(e.key);
    if (!found.empty() && d == Dir::Up) sel = (sel + (int)found.size() - 1) % (int)found.size();
    else if (!found.empty() && d == Dir::Down) sel = (sel + 1) % (int)found.size();
    else if (e.key == Key::Tab) enter();   // look again (a USB stick just put in)
    else if (e.key == Key::Enter && !found.empty()) start(found[sel]);
  }
  void start(const std::string &path) {
    if (worker.joinable()) worker.join();
    state = Working;
    made = Game{};
    worker = std::thread([this, path] {
      try {
        Game g = makeGame(path, [this](const std::string &s) { std::lock_guard<std::mutex> l(lock); step = s; moved = true; });
        std::lock_guard<std::mutex> l(lock);
        made = g;
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
    canvas.fillScreen(rgb(0x18, 0x1c, 0x24));
    drawBand("MAKE THE GAME", rgb(0x5b, 0x6b, 0x8c));   // DRAFT
    canvas.setFont(&fonts::Font0);
    canvas.setTextSize(1);
    const uint16_t dim = rgb(0x80, 0x84, 0x90), soft = rgb(0xc8, 0xc8, 0xd0);
    if (state == Working) {
      canvas.setTextColor(TFT_WHITE);
      canvas.setCursor(6, 40);
      canvas.print(upper(step).c_str());
      canvas.setTextColor(dim);
      wrap("Your own ROM is checked, our patch is fetched from the release and checked, and DAEMONS is made here.", 6, 60, 51, 4, 10);   // DRAFT
      return;
    }
    if (state == Done) {
      canvas.setTextColor(TFT_WHITE);
      canvas.setCursor(6, 40);
      canvas.printf("%s %s IS READY", made.edition.c_str(), made.release.c_str());   // DRAFT
      canvas.setTextColor(soft);
      canvas.setCursor(6, 60);
      canvas.print("ENTER PLAYS IT");   // DRAFT
      return;
    }
    if (state == Failed) {
      canvas.setTextColor(rgb(0xe0, 0x90, 0x80));
      wrap(message, 6, 36, 51, 6, 10);
      canvas.setTextColor(soft);
      canvas.setCursor(6, 150);
      canvas.print("ENTER: BACK TO THE LIST");   // DRAFT
      return;
    }
    if (found.empty()) {
      canvas.setTextColor(soft);
      wrap("Put your own FireRed or LeafGreen (USA, the .gba you own) in DAEMONS in your home folder, or on a USB stick "
           "in the USB-A port. TAB looks again.", 6, 30, 51, 6, 10);   // DRAFT
      return;
    }
    canvas.setTextColor(soft);
    canvas.setCursor(6, 22);
    canvas.print("WHICH IS YOURS?");   // DRAFT
    const int rows = 10, first = sel < rows ? 0 : sel - rows + 1;
    for (int i = first; i < (int)found.size() && i < first + rows; i++) {
      int y = 36 + (i - first) * 12;
      std::string name = found[i].substr(found[i].rfind('/') + 1);
      if (name.size() > 50) name = name.substr(0, 49) + "~";
      if (i == sel) canvas.fillRect(2, y - 2, hal::W - 4, 12, rgb(0x5b, 0x6b, 0x8c));
      canvas.setTextColor(i == sel ? TFT_WHITE : soft);
      canvas.setCursor(6, y);
      canvas.print(name.c_str());
    }
  }
  ~Make() override { if (worker.joinable()) worker.join(); }
};
}  // namespace

Page *makePage() { static Make p; return &p; }
