// C-380: LINK -- this device paired with the hub as a phone is: the hub's address, and the code it shows, typed on the
// keys. TAB (or the arrow keys) moves between the two; ENTER goes on; ESC goes back. Every word DRAFT.
#include <future>

#include "app.h"
#include "apps.h"
#include "canvas.h"
#include "hal/hal.h"
#include "hub/hub.h"
#include "pages/parts.h"

namespace {
struct Pair : Page {
  std::string field[2], answer;
  int at = 1;
  bool done = false;
  std::future<std::string> asking;

  void enter() override {
    field[0] = hub::address().empty() ? "http://daemons-hearth:4730" : hub::address();
    field[1].clear();
    at = 1;
    done = false;
    answer.clear();
  }
  bool busy() { return asking.valid() && asking.wait_for(std::chrono::seconds(0)) != std::future_status::ready; }
  void key(const KeyEvent &e) override {
    if (!e.down || busy()) return;
    if (e.key == Key::Esc) { goHome(); return; }
    if (done) { if (e.key == Key::Enter) goHome(); return; }
    if (e.key == Key::Tab || e.key == Key::Up || e.key == Key::Down) { at = 1 - at; return; }
    if (e.key == Key::Backspace) { if (!field[at].empty()) field[at].pop_back(); return; }
    if (e.key == Key::Enter) {
      if (at == 0) { at = 1; return; }
      std::string address = field[0], code = field[1], name = hub::deviceName();
      answer = "ASKING THE HUB...";   // DRAFT
      asking = std::async(std::launch::async, [address, code, name] { return hub::pair(address, code, name); });
      return;
    }
    char c = e.ch;
    // the symbols an address needs, where Sym is held: . : / -  (C-593: this asked for a key that types nothing, and a
    // letter always types itself, so Sym had never typed a mark; seen with a test keyboard on the HackberryPi)
    if (held[(size_t)Key::Sym]) {
      if (e.key == Key::H) c = '.';
      else if (e.key == Key::S) c = ':';
      else if (e.key == Key::T) c = '/';
      else if (e.key == Key::R) c = '-';
    }
    if (c && field[at].size() < 60) field[at] += (at == 1 ? (char)toupper((unsigned char)c) : c);
  }
  bool changed() override {
    if (!asking.valid() || busy()) return false;
    std::string why = asking.get();
    done = why.empty();
    answer = done ? hint("LINKED. ENTER GOES BACK.") : why;   // DRAFT
    return true;
  }
  void draw() override {
    canvas.fillScreen(rgb(0x18, 0x1c, 0x24));
    drawBand("LINK TO THE HUB", rgb(0x5b, 0x6b, 0x8c));   // DRAFT
    canvas.setFont(&fonts::Font0);
    canvas.setTextSize(1);
    const uint16_t soft = rgb(0xc8, 0xc8, 0xd0), dim = rgb(0x80, 0x84, 0x90), sel = rgb(0x5b, 0x6b, 0x8c);
    canvas.setTextColor(dim);
    wrap("Show a code on the hub (SETTINGS, on the computer it runs on) and type it here. This device then keeps its "
         "save in step with the hub's.", 6, 20, 51, 3, 10);   // DRAFT
    const char *label[2] = { "HUB", "CODE" };   // DRAFT
    for (int i = 0; i < 2; i++) {
      int y = 62 + i * 28;
      canvas.setTextColor(dim);
      canvas.setCursor(6, y);
      canvas.print(label[i]);
      canvas.drawRect(40, y - 4, hal::W - 46, 16, i == at ? sel : rgb(0x40, 0x44, 0x50));
      canvas.setTextColor(i == at ? TFT_WHITE : soft);
      canvas.setCursor(44, y);
      std::string shown = field[i].size() > 44 ? "~" + field[i].substr(field[i].size() - 43) : field[i];
      canvas.print((shown + (i == at && !done ? "_" : "")).c_str());
    }
    canvas.setTextColor(done ? sel : rgb(0xe0, 0x90, 0x80));
    if (!answer.empty()) wrap(upper(answer), 6, 122, 51, 2, 10);
    canvas.setTextColor(dim);
    canvas.setCursor(6, 156);
    canvas.print("TAB: THE OTHER  SYM+H S T R: . : / -");   // DRAFT
  }
};
}  // namespace

Page *pairPage() { static Pair p; return &p; }
