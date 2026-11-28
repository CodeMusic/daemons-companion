// C-381: STEP -- the ONE next step of the goal, where it stands in its milestone, and ENTER to tick it off as the boards
// do (POST /api/device/ticks {steps: [id]}); for fifteen seconds after, BACKSPACE takes it back (POST /api/device/untick,
// C-49). ESC goes back. Every word DRAFT.
#include <chrono>

#include "app.h"
#include "apps.h"
#include "canvas.h"
#include "hal/hal.h"
#include "hub/hub.h"
#include "pages/parts.h"

using Clock = std::chrono::steady_clock;

namespace {
const uint16_t SOFT = 0xC639, DIM = 0x8432;

struct Step : Page {
  Sending sending;
  std::string answer;
  long ticked = -1;
  Clock::time_point tickedAt;
  bool undoing = false;

  void enter() override { answer.clear(); }
  bool canUndo() const { return ticked >= 0 && Clock::now() - tickedAt < std::chrono::seconds(15); }
  void key(const KeyEvent &e) override {
    if (!e.down || sending.busy()) return;
    if (e.key == Key::Esc) { goHome(); return; }
    HubView v = hub::view();
    if (e.key == Key::Enter && v.stepId >= 0) {
      ticked = v.stepId;
      tickedAt = Clock::now();
      undoing = false;
      answer = "...";
      sending.send("/api/device/ticks", "{\"steps\":[" + std::to_string(v.stepId) + "]}");
    } else if (e.key == Key::Backspace && canUndo()) {
      undoing = true;
      answer = "...";
      sending.send("/api/device/untick", "{\"step\":" + std::to_string(ticked) + "}");
      ticked = -1;
    }
  }
  bool changed() override {
    Reply r;
    if (!sending.done(r)) return false;
    if (!r.ok()) answer = replyWords(r, "error");
    else answer = undoing ? "Taken back." : hint("Done. BACKSPACE takes it back.");
    return true;
  }
  void draw() override {
    HubView v = hub::view();
    const uint16_t day = hex(v.menu, rgb(0x5b, 0x6b, 0x8c));
    canvas.fillScreen(rgb(0x18, 0x1c, 0x24));
    denUnder(v, day);   // C-593: on a tall canvas the daemon is under the words, as on PLAY
    drawBand("THE NEXT STEP", day);
    canvas.setFont(&fonts::Font0);
    if (v.stepId < 0) {
      canvas.setTextSize(1);
      canvas.setTextColor(SOFT);
      wrap(v.reached ? "Nothing waits: every step is done, or no goal is set. Set one in the companion."
                     : "The hub is not answering.", 6, 24, lay::cols(), 3, 10);
    } else {
      if (!v.goal.empty()) {
        canvas.setTextSize(1);
        canvas.setTextColor(DIM);
        canvas.setCursor(6, 20);
        canvas.print(upper(v.goal).substr(0, lay::cols()).c_str());
      }
      canvas.setTextSize(2);
      canvas.setTextColor(TFT_WHITE);
      int rows = wrap(v.stepText, 6, 36, (hal::W - 12) / 12, lay::rows(4, 18), 18);   // C-593: as wide and as long as this canvas
      canvas.setTextSize(1);
      if (!v.milestone.empty()) {
        int y = 40 + rows * 18;
        canvas.setTextColor(DIM);
        canvas.setCursor(6, y);
        canvas.printf("%s  %d OF %d", upper(v.milestone).substr(0, 36).c_str(), v.msAt, v.msOf);
        if (v.msOf > 0) {
          canvas.drawRect(6, y + 12, hal::W - 12, 6, DIM);
          canvas.fillRect(7, y + 13, (hal::W - 14) * (v.msAt > v.msOf ? v.msOf : v.msAt) / v.msOf, 4, day);
        }
      }
    }
    canvas.setTextColor(answer.empty() ? DIM : SOFT);
    canvas.setCursor(6, lay::foot(140));
    canvas.print(answer.empty() ? hint("ENTER: DONE    ESC: BACK") : upper(answer).substr(0, lay::cols()).c_str());
  }
};
}  // namespace

Page *stepPage() { static Step p; return &p; }
