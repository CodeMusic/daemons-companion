// C-381 (its first piece): HOME -- the daemon carried and the ONE next step, as the hub tells every board, and the way
// into the game. Left and right (Z C, or the arrows) choose; ENTER goes.
#include <vector>

#include "app.h"
#include "canvas.h"
#include "game/rom.h"
#include "hub/hub.h"

namespace {
struct Home : Page {
  int sel = 0;
  Game game;
  bool hasGame = false;
  std::string lastSeen;

  std::vector<std::pair<std::string, PageId>> items() {
    std::vector<std::pair<std::string, PageId>> v;
    if (hasGame) v.push_back({ "PLAY", PageId::Play });   // DRAFT
    v.push_back({ hasGame ? "NEW RELEASE" : "MAKE THE GAME", PageId::Make });   // DRAFT
    if (!hub::paired()) v.push_back({ "LINK", PageId::Pair });   // DRAFT: C-380
    v.push_back({ "LEAVE", PageId::Home });   // DRAFT
    return v;
  }
  void enter() override { hasGame = heldGame(game); if (sel >= (int)items().size()) sel = 0; }
  void key(const KeyEvent &e) override {
    if (!e.down) return;
    auto it = items();
    Dir d = dirOf(e.key);
    if (d == Dir::Left || d == Dir::Up) sel = (sel + (int)it.size() - 1) % (int)it.size();
    else if (d == Dir::Right || d == Dir::Down || e.key == Key::Tab) sel = (sel + 1) % (int)it.size();
    else if (e.key == Key::Enter) {
      if (it[sel].first == "LEAVE") quitting = true;
      else go(it[sel].second);
    }
  }
  bool changed() override {   // the hub's answer came in
    HubView v = hub::view();
    std::string seen = v.reached ? v.date + v.stepText + v.name + std::to_string(v.level) : v.error;
    if (seen == lastSeen) return false;
    lastSeen = seen;
    return true;
  }
  void draw() override {
    HubView v = hub::view();
    const uint16_t day = hex(v.colour, rgb(0x5b, 0x6b, 0x8c));
    canvas.fillScreen(rgb(0x18, 0x1c, 0x24));
    drawBand("DAEMONS", day);
    canvas.setFont(&fonts::Font0);
    canvas.setTextColor(TFT_WHITE);
    int y = 22;
    if (v.reached) {
      canvas.setTextColor(rgb(0xc8, 0xc8, 0xd0));
      canvas.setCursor(6, y);
      canvas.print(upper(v.day + (v.season.empty() ? "" : "  " + v.season)).c_str());
      y += 14;
      if (v.carrying) {
        canvas.setTextSize(2);
        canvas.setTextColor(TFT_WHITE);
        canvas.setCursor(6, y);
        canvas.print(upper(v.nickname.empty() ? v.name : v.nickname).c_str());
        canvas.setTextSize(1);
        canvas.setTextColor(rgb(0xc8, 0xc8, 0xd0));
        canvas.setCursor(6, y + 18);
        canvas.printf("LV %d  %s", v.level, upper(v.types).c_str());
        y += 32;
      } else {
        canvas.setCursor(6, y);
        canvas.print("NO DAEMON CARRIED HERE");   // DRAFT
        y += 14;
      }
      if (!v.stepText.empty()) {
        canvas.setTextColor(day);
        canvas.setCursor(6, y);
        canvas.print("NEXT");   // DRAFT
        canvas.setTextColor(TFT_WHITE);
        y += 10 * wrap(v.stepText, 6, y + 10, 51, 3, 10) + 12;
      }
    } else {
      canvas.setTextColor(rgb(0xc8, 0xc8, 0xd0));
      canvas.setCursor(6, y);
      canvas.print(hub::address().empty() ? "NOT LINKED TO A HUB" : !v.asked ? "ASKING THE HUB" : "THE HUB IS NOT ANSWERING");   // DRAFT
      canvas.setTextColor(rgb(0x80, 0x84, 0x90));
      wrap(v.error, 6, y + 12, 51, 2, 10);
    }
    if (hasGame) {
      canvas.setTextColor(rgb(0x80, 0x84, 0x90));
      canvas.setCursor(6, 132);
      canvas.printf("%s %s%s", game.edition.c_str(), game.release.c_str(), game.testing ? "  TESTING" : "");
    }
    // the choices, along the bottom
    auto it = items();
    int x = 6;
    for (int i = 0; i < (int)it.size(); i++) {
      int w = (int)it[i].first.size() * 6 + 12;
      if (i == sel) { canvas.fillRoundRect(x, 148, w, 16, 3, day); canvas.setTextColor(TFT_WHITE); }
      else { canvas.drawRoundRect(x, 148, w, 16, 3, rgb(0x50, 0x54, 0x60)); canvas.setTextColor(rgb(0xc8, 0xc8, 0xd0)); }
      canvas.setCursor(x + 6, 152);
      canvas.print(it[i].first.c_str());
      x += w + 6;
    }
  }
};
}  // namespace

Page *homePage() { static Home p; return &p; }
