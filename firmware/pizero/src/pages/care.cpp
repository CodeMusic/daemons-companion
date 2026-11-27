// C-381: CARE -- the daemon tended from the device, as every board tends it (POST /api/device/interact {kind}: feed,
// water, train, sleep or wake), and what it says back. Z C choose, ENTER gives, ESC goes back. Every word DRAFT.
#include "app.h"
#include "apps.h"
#include "canvas.h"
#include "hal/hal.h"
#include "hub/hub.h"
#include "pages/parts.h"

namespace {
const uint16_t SOFT = 0xC639, DIM = 0x8432;

struct Care : Page {
  Choices choices;
  Sending sending;
  std::string said;
  bool moved = false;

  void enter() override {
    said.clear();
    rebuild(hub::view());
  }
  void rebuild(const HubView &v) {
    std::string was = choices.items.empty() ? "FEED" : choices.chosen();
    choices.items = { "FEED", "WATER", "TRAIN", v.tired == "asleep" ? "WAKE" : "SLEEP", "BACK" };
    choices.sel = 0;
    for (size_t i = 0; i < choices.items.size(); i++) if (choices.items[i] == was) choices.sel = (int)i;
  }
  void key(const KeyEvent &e) override {
    if (!e.down) return;
    if (e.key == Key::Esc) { goHome(); return; }
    if (choices.key(e.key) || e.key != Key::Enter || sending.busy()) return;
    std::string kind = upper(choices.chosen());
    if (kind == "BACK") { goHome(); return; }
    if (!hub::view().carrying) { said = "There is no daemon here to tend."; return; }
    for (auto &c : kind) c = (char)tolower((unsigned char)c);
    said = "...";
    sending.send("/api/device/interact", "{\"kind\":\"" + kind + "\",\"detail\":\"\"}");
  }
  bool changed() override {
    Reply r;
    if (sending.done(r)) {
      said = replyWords(r, "said");
      if (said.empty()) said = r.ok() ? "Done." : "It did not reach the hub.";
      return true;
    }
    if (moved) { moved = false; return true; }
    return false;
  }
  void tick() override {
    static std::string seen;
    HubView v = hub::view();
    std::string now = v.word + std::to_string(v.fedToday) + std::to_string(v.wateredToday) + v.tired + (hub::art(v.artKey) ? "a" : "");
    if (now != seen) { seen = now; rebuild(v); moved = true; }
  }
  void draw() override {
    HubView v = hub::view();
    const uint16_t day = hex(v.menu, rgb(0x5b, 0x6b, 0x8c));
    canvas.fillScreen(rgb(0x18, 0x1c, 0x24));
    drawBand("CARE", day);
    // C-593: the den beside the words, or across the top of a tall canvas with the words below (the care's three
    // lines to the right of the name there)
    const Split s = split(120);
    const bool tall = lay::tall();
    drawDen(v, s.px, s.py, s.pw, s.ph);
    const int x = s.tx, y = s.ty;
    const int cx = tall ? hal::W / 2 + 30 : x, cy = tall ? y : y + 28;          // FED, WATER, TRAINED
    const int cueY = tall ? y + 42 : y + 68, saidY = tall ? y + 78 : y + 92;
    canvas.setFont(&fonts::Font0);
    canvas.setTextSize(1);
    if (v.carrying) {
      canvas.setTextColor(TFT_WHITE);
      canvas.setCursor(x, y);
      canvas.print(upper(v.nickname.empty() ? v.name : v.nickname).c_str());
      canvas.setTextColor(day);
      canvas.setCursor(x, y + 12);
      canvas.print(upper(v.tired == "asleep" ? "asleep" : v.tired == "drowsy" ? "drowsy" : v.word).c_str());
      canvas.setTextColor(DIM);
      canvas.setCursor(cx, cy);  canvas.print("FED");
      drawPips(cx + 42, cy, v.fedToday, v.fedDue, day, DIM);
      canvas.setCursor(cx, cy + 12);  canvas.print("WATER");
      drawPips(cx + 42, cy + 12, v.wateredToday, v.wateredDue, day, DIM);
      canvas.setCursor(cx, cy + 24);  canvas.print("TRAINED");
      canvas.setTextColor(v.trained ? day : DIM);
      canvas.setCursor(cx + 54, cy + 24);
      canvas.print(v.trained ? "TODAY" : "NOT YET");
      if (!v.cue.empty()) { canvas.setTextColor(SOFT); wrap(v.cue, x, cueY, s.cols, tall ? 3 : 2, 10); }
    } else {
      canvas.setTextColor(SOFT);
      wrap("No daemon is carried here. Send one from the game, then SYNC.", x, y + 2, s.cols, 4, 10);
    }
    if (!said.empty()) {
      canvas.setTextColor(TFT_WHITE);
      wrap(said, x, saidY, s.cols, (lay::foot(142) - saidY) / 10, 10);
    }
    choices.draw(lay::foot(146), day);
  }
};
}  // namespace

Page *carePage() { static Care p; return &p; }
