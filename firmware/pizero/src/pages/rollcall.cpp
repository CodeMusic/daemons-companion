// C-447: LONGWAVE ROLL CALL -- a radio test between the user's own devices (docs/CAPS.md, caps/longwave.h). Z C choose
// the mode (ONE, SOME, ALL, ALL AT ONCE); F X choose who ONE calls, from those heard before; ENTER calls; A answers
// others' calls (on or off); P steps the power (-30 to 0 dBm); ESC goes back to CAPS. Every word DRAFT.
#include <chrono>
#include <cstdio>

#include "app.h"
#include "canvas.h"
#include "caps/cap.h"
#include "caps/longwave.h"
#include "common/rollcall.h"
#include "hal/hal.h"
#include "pages/parts.h"

namespace {
const uint16_t SOFT = 0xC639, DIM = 0x8432;

struct RollCall : Page {
  int mode = rollcall::ALL;
  std::vector<longwave::Answer> known;   // devices heard before: who ONE and SOME may call
  int pick = 0;
  longwave::Result last;
  bool called = false;
  std::string told;
  std::vector<std::string> log;          // the calls this device answered
  int shownQuiet = -1;

  void enter() override { told.clear(); }
  void key(const KeyEvent &e) override {
    if (!e.down) return;
    if (e.key == Key::Esc) { go(PageId::Caps); return; }
    Dir d = dirOf(e.key);
    if (d == Dir::Left || d == Dir::Right) { mode = (mode + (d == Dir::Right ? 1 : 3)) % 4; told.clear(); return; }
    if ((d == Dir::Up || d == Dir::Down) && !known.empty()) { pick = (pick + (d == Dir::Down ? 1 : (int)known.size() - 1)) % (int)known.size(); return; }
    if (e.key == Key::P) {
      static const int steps[] = { -30, -20, -15, -10, 0 };
      int at = 0;
      for (int i = 0; i < 5; i++) if (steps[i] == longwave::power()) at = i;
      longwave::setPower(steps[(at + 1) % 5]);
      if (longwave::answering()) longwave::setAnswering(true);
      return;
    }
    if (e.key == Key::A) {
      bool on = !longwave::answering();
      if (!longwave::setAnswering(on) && on) told = "may not send on this band, so it cannot answer";   // DRAFT
      else told = on ? "answering calls heard on this band" : "not answering";                          // DRAFT
      return;
    }
    if (e.key == Key::Enter) {
      std::vector<uint16_t> to;
      if (mode == rollcall::ONE && !known.empty()) to.push_back(known[pick].id);
      if (mode == rollcall::SOME) for (size_t i = 0; i < known.size() && i < rollcall::MAX_TARGETS; i++) to.push_back(known[i].id);
      last = longwave::call((uint8_t)mode, to);
      called = true;
      told = last.sent ? "" : last.why;
      if (last.sent && (mode == rollcall::ALL || mode == rollcall::ONCE))   // learn who is about, for ONE and SOME
        for (auto &a : last.answers) {
          bool have = false;
          for (auto &k : known) have = have || k.id == a.id;
          if (!have) known.push_back(a);
        }
    }
  }
  void tick() override {
    std::string line = longwave::tick();
    if (!line.empty()) { log.push_back(line); if (log.size() > 3) log.erase(log.begin()); }
  }
  bool changed() override {
    int q = longwave::quietLeft();
    if (q != shownQuiet) { shownQuiet = q; return true; }
    return false;
  }
  void draw() override {
    canvas.fillScreen(rgb(0x18, 0x1c, 0x24));
    drawBand("ROLL CALL", rgb(0x4a, 0x5d, 0x4e));                                                                 // DRAFT
    canvas.setFont(&fonts::Font0);
    canvas.setTextSize(1);
    caps::Band b = caps::band();
    canvas.setTextColor(SOFT);
    canvas.setCursor(6, 19);
    canvas.printf("%.2f MHz  %d dBm  %s", caps::bandMhz(b), longwave::power(), longwave::keyName().substr(0, 26).c_str());
    canvas.setCursor(6, 29);
    canvas.setTextColor(DIM);
    canvas.printf("THIS IS %s (%04X)", longwave::myName().c_str(), longwave::me());                                // DRAFT
    canvas.setTextColor(longwave::answering() ? TFT_WHITE : DIM);
    std::string ans = longwave::answering() ? "ANSWERING (" + std::to_string(longwave::answeredCount()) + ")" : "NOT ANSWERING";   // DRAFT
    canvas.setCursor(hal::W - 6 - 6 * (int)ans.size(), 29);
    canvas.print(ans.c_str());

    // the mode
    int x = 6, y = 41;
    for (int m = 0; m < 4; m++) {
      const char *n = rollcall::modeName((uint8_t)m);
      int w = 6 * (int)strlen(n);
      if (m == mode) canvas.fillRect(x - 3, y - 2, w + 6, 11, rgb(0x4a, 0x5d, 0x4e));
      canvas.setTextColor(m == mode ? TFT_WHITE : DIM);
      canvas.setCursor(x, y);
      canvas.print(n);
      x += w + 14;
    }
    y += 12;
    canvas.setTextColor(SOFT);
    canvas.setCursor(6, y);
    if (mode == rollcall::ONE) {
      if (known.empty()) canvas.print("CALL ALL FIRST, TO FIND WHO IS ABOUT");                                    // DRAFT
      else canvas.printf("CALLS %s (%04X)  F X: ANOTHER", known[pick].name.c_str(), known[pick].id);              // DRAFT
    } else if (mode == rollcall::SOME) {
      if (known.empty()) canvas.print("CALL ALL FIRST, TO FIND WHO IS ABOUT");                                    // DRAFT
      else { std::string s = "CALLS"; for (size_t i = 0; i < known.size() && i < 4; i++) s += " " + known[i].name; canvas.print(s.substr(0, 52).c_str()); }   // DRAFT
    } else if (mode == rollcall::ALL) canvas.print("EVERY DEVICE THAT HEARS IT ANSWERS, EACH IN ITS SLOT");      // DRAFT
    else canvas.print("EVERY DEVICE ANSWERS IN ONE SLOT: HOW MANY SURVIVE");                                      // DRAFT

    // the last call's answers
    y += 13;
    canvas.setTextColor(DIM);
    canvas.setCursor(6, y);
    canvas.print("WHO        ID   SLOT  HERE  THERE  HEARD");                                                      // DRAFT
    y += 10;
    if (called && last.sent) {
      if (last.answers.empty()) {
        canvas.setTextColor(SOFT);
        canvas.setCursor(6, y);
        canvas.printf("NOBODY ANSWERED CALL %u (%d OF %d SENT)", last.call, last.packets, rollcall::CALL_PACKETS);   // DRAFT
        y += 10;
      }
      for (size_t i = 0; i < last.answers.size() && i < 4; i++) {
        auto &a = last.answers[i];
        canvas.setTextColor(TFT_WHITE);
        canvas.setCursor(6, y);
        canvas.printf("%-9s %04X  %3d  %4d  %4d   %d/%d", a.name.c_str(), a.id, a.slot, a.here, a.there, a.heard, a.of);
        y += 10;
      }
      canvas.setTextColor(DIM);
      canvas.setCursor(6, y);
      canvas.printf("NOISE %d  OTHER HOUSEHOLDS %d  BROKEN %d", last.noise, last.strangers, last.broken);         // DRAFT
      y += 10;
    }
    for (auto &l : log) {
      if (y > 140) break;
      canvas.setTextColor(SOFT);
      canvas.setCursor(6, y);
      canvas.print(l.substr(0, 52).c_str());
      y += 10;
    }

    canvas.setTextColor(DIM);
    canvas.setCursor(6, 160);
    std::string why = longwave::mayCall();
    std::string foot = !told.empty() ? upper(told) : !why.empty() ? upper(why) : hint("ENTER: CALL  A: ANSWER  P: POWER  ESC");   // DRAFT
    canvas.print(foot.substr(0, 52).c_str());
  }
};
}  // namespace

Page *rollCallPage() { static RollCall p; return &p; }
