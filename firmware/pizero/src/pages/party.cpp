// C-381: PARTY -- the save's party, one at a time (Z C, or the arrows), each with its picture and its four routines in the
// colours their streaks take on its body (C-68, as the boards' GAME ROUTINES show them). ESC goes back. Every word DRAFT.
#include "app.h"
#include "apps.h"
#include "canvas.h"
#include "hal/hal.h"
#include "hub/hub.h"
#include "pages/parts.h"

namespace {
const uint16_t SOFT = 0xC639, DIM = 0x8432;

struct Party : Page {
  int at = 0;
  std::string seen;

  void key(const KeyEvent &e) override {
    if (!e.down) return;
    if (e.key == Key::Esc) { goHome(); return; }
    const int n = (int)hub::view().party.size();
    if (!n) return;
    Dir d = dirOf(e.key);
    if (d == Dir::Left || d == Dir::Up) at = (at + n - 1) % n;
    else if (d == Dir::Right || d == Dir::Down || e.key == Key::Tab) at = (at + 1) % n;
  }
  bool changed() override {   // a picture came in
    HubView v = hub::view();
    std::string now;
    for (auto &m : v.party) now += m.artKey + (hub::art(m.artKey) ? "a" : "");
    if (now == seen) return false;
    seen = now;
    return true;
  }
  void draw() override {
    HubView v = hub::view();
    const uint16_t day = hex(v.menu, rgb(0x5b, 0x6b, 0x8c));
    canvas.fillScreen(rgb(0x18, 0x1c, 0x24));
    drawBand("PARTY", day);
    canvas.setFont(&fonts::Font0);
    canvas.setTextSize(1);
    if (v.party.empty()) {
      canvas.setTextColor(SOFT);
      wrap(v.reached ? "The save holds no party yet." : "The hub is not answering.", 6, 24, 51, 2, 10);
      return;
    }
    if (at >= (int)v.party.size()) at = 0;
    const PartyMember &m = v.party[at];
    drawPartyMember(m, v, 4, 18, 104, 104);
    const int x = 116;
    canvas.setTextSize(2);
    canvas.setTextColor(TFT_WHITE);
    canvas.setCursor(x, 20);
    canvas.print(upper(m.name).substr(0, 16).c_str());
    canvas.setTextSize(1);
    canvas.setTextColor(SOFT);
    canvas.setCursor(x, 40);
    canvas.printf("LV %d  %s", m.level, upper(m.types).c_str());
    canvas.setTextColor(day);
    canvas.setCursor(x, 56);
    canvas.print("ROUTINES");
    for (size_t i = 0; i < m.routines.size() && i < 4; i++) {
      const int y = 70 + (int)i * 14;
      canvas.fillRect(x, y - 1, 4, 10, hex(m.routineColours[i], DIM));   // the streak's colour on its body
      canvas.setTextColor(TFT_WHITE);
      canvas.setCursor(x + 10, y);
      canvas.print(upper(m.routines[i]).substr(0, 18).c_str());
      canvas.setTextColor(DIM);
      canvas.setCursor(x + 10 + 19 * 6, y);
      canvas.print(upper(m.routineTypes[i]).substr(0, 10).c_str());
    }
    // where it sits in the party
    for (int i = 0; i < (int)v.party.size(); i++) {
      if (i == at) canvas.fillCircle(hal::W / 2 - (int)v.party.size() * 6 + i * 12 + 6, 132, 3, day);
      else canvas.drawCircle(hal::W / 2 - (int)v.party.size() * 6 + i * 12 + 6, 132, 3, DIM);
    }
    canvas.setTextColor(DIM);
    canvas.setCursor(6, 148);
    canvas.print(hint("Z C: THE OTHERS    ESC: BACK"));
  }
};
}  // namespace

Page *partyPage() { static Party p; return &p; }
