// C-381: HOME -- the daemon carried, in its den, with how it is and the ONE next step, as the hub tells every board;
// and along the bottom the way to everything else. Left and right (Z C, or the arrows) choose; ENTER goes. Every word
// a player reads here is DRAFT.
#include <vector>

#include "app.h"
#include "canvas.h"
#include "game/rom.h"
#include "hal/hal.h"
#include "hub/hub.h"
#include "hub/mirror.h"
#include "pages/parts.h"
#include "paths.h"

#include <future>

namespace {
const uint16_t SOFT = 0xC639, DIM = 0x8432;   // rgb(c8,c8,d0) and rgb(80,84,90)

struct Home : Page {
  Choices choices;
  Game game;
  bool hasGame = false, followed = false;
  std::string lastSeen;
  // C-380: a SYNC asked here, the game paused; C-215: the hub refused this game's save -- keep it there as its own?
  std::future<mirror::Synced> syncing;
  std::future<mirror::Out> keepingIt;
  std::string told;                     // what the last of those did, in words
  bool offer = false;
  uint64_t outSeen = 0;

  struct Item { const char *word; PageId to; };
  std::vector<Item> items;

  void build() {
    std::string was = choices.items.empty() ? "" : choices.chosen();
    items.clear();
    if (hasGame) items.push_back({ "PLAY", PageId::Play });
    items.push_back({ "CARE", PageId::Care });
    items.push_back({ "STEP", PageId::Step });
    items.push_back({ "PARTY", PageId::Party });
    items.push_back({ "SAY", PageId::Say });
    items.push_back({ hasGame ? "GAMES" : "MAKE THE GAME", PageId::Make });   // C-395
    // C-380: a SYNC, for the release of the game the hub follows only (C-395: a testing build's save stays here)
    if (hub::paired() && mirror::mode() == mirror::Mode::Send && followed) items.push_back({ "SYNC", PageId::Home });
    if (!hub::paired()) items.push_back({ "LINK", PageId::Pair });   // C-380
    items.push_back({ "LEAVE", PageId::Home });
    choices.items.clear();
    for (auto &i : items) choices.items.push_back(i.word);
    choices.sel = 0;
    for (size_t i = 0; i < choices.items.size(); i++) if (choices.items[i] == was) choices.sel = (int)i;
  }
  void enter() override {
    hasGame = heldGame(game);
    const std::string ed = hub::view().edition;   // the edition the hub follows, as it last said (C-395)
    followed = hasGame && !game.testing && (ed.empty() || ed == game.edition);
    build();
    offer = mirror::mode() == mirror::Mode::Send && mirror::offered();
  }
  static bool busy(const std::future<mirror::Synced> &f) { return f.valid() && f.wait_for(std::chrono::seconds(0)) != std::future_status::ready; }
  static bool busy(const std::future<mirror::Out> &f) { return f.valid() && f.wait_for(std::chrono::seconds(0)) != std::future_status::ready; }
  void key(const KeyEvent &e) override {
    if (!e.down || busy(syncing) || busy(keepingIt)) return;
    if (offer) {   // C-215's question, until it is answered
      if (e.key == Key::Enter) {
        offer = false;
        mirror::keepHere(true);
        Bytes mine;
        readFile(savePath(), mine);
        told = "...";
        keepingIt = std::async(std::launch::async, [mine] { return mirror::keepThere(mine); });
      } else if (e.key == Key::Esc) { offer = false; mirror::notNow(); told = "Kept on this device only."; }   // DRAFT
      return;
    }
    if (choices.key(e.key)) return;
    if (e.key == Key::Enter) {
      const Item &it = items[choices.sel];
      std::string w = it.word;
      if (w == "LEAVE") quitting = true;
      else if (w == "SYNC") {
        keepSave();   // the game's save as it stands, the game paused here
        Bytes mine;
        readFile(savePath(), mine);
        told = "SYNCING...";   // DRAFT
        syncing = std::async(std::launch::async, [mine] { return mirror::syncNow(mine); });
      } else go(it.to);
    }
  }
  void tick() override {
    if (syncing.valid() && !busy(syncing)) {
      mirror::Synced s = syncing.get();
      if (s.took) {
        writeFileAtomic(savePath(), s.save);
        if (emu.loaded()) emu.restore(s.save);   // the game starts again from what the SYNC wrote (CONTINUE)
      }
      told = s.why;
      if (s.ok && s.arrived) told += " (" + std::to_string(s.arrived) + " arrived)";   // DRAFT
      lastSeen.clear();
    }
    if (keepingIt.valid() && !busy(keepingIt)) { mirror::Out o = keepingIt.get(); told = o.kept ? "Kept on the hub as a save of its own." : o.why; lastSeen.clear(); }   // DRAFT
    uint64_t serial;
    mirror::Out o = mirror::lastOut(serial);
    if (serial != outSeen) {
      outSeen = serial;
      if (mirror::mode() == mirror::Mode::Send && mirror::offered()) { offer = true; lastSeen.clear(); }
    }
  }
  bool changed() override {   // the hub's answer came in, or a picture
    HubView v = hub::view();
    std::string seen = v.reached ? v.date + v.stepText + v.name + std::to_string(v.level) + v.word + std::to_string(v.fedToday) +
                                   std::to_string(v.wateredToday) + v.tired + (hub::art(v.artKey) ? "a" : "")
                                 : v.error + (v.asked ? "1" : "0");
    if (seen == lastSeen) return false;
    lastSeen = seen;
    return true;
  }
  void draw() override {
    HubView v = hub::view();
    const uint16_t day = hex(v.menu, rgb(0x5b, 0x6b, 0x8c));
    canvas.fillScreen(rgb(0x18, 0x1c, 0x24));
    drawBand("DAEMONS", day);
    canvas.setFont(&fonts::Font0);
    canvas.setTextSize(1);
    if (!v.reached) {
      canvas.setTextColor(SOFT);
      canvas.setCursor(6, 22);
      canvas.print(hub::address().empty() ? "NOT LINKED TO A HUB" : !v.asked ? "ASKING THE HUB" : "THE HUB IS NOT ANSWERING");
      canvas.setTextColor(DIM);
      wrap(v.error, 6, 34, 51, 2, 10);
    } else {
      // left: the den, and the daemon in it
      drawDen(v, 4, 18, 104, 104);
      const int x = 116;
      if (v.carrying) {
        canvas.setTextSize(2);
        canvas.setTextColor(TFT_WHITE);
        canvas.setCursor(x, 20);
        canvas.print(upper(v.nickname.empty() ? v.name : v.nickname).substr(0, 16).c_str());
        canvas.setTextSize(1);
        canvas.setTextColor(SOFT);
        canvas.setCursor(x, 40);
        canvas.printf("LV %d  %s", v.level, upper(v.types).c_str());
        canvas.setTextColor(day);
        canvas.setCursor(x, 52);
        canvas.print(upper(v.tired == "asleep" ? "asleep" : v.word).c_str());
        canvas.setTextColor(DIM);
        canvas.setCursor(x, 66);
        canvas.print("FED");
        drawPips(x + 42, 66, v.fedToday, v.fedDue, day, DIM);
        canvas.setCursor(x, 78);
        canvas.print("WATER");
        drawPips(x + 42, 78, v.wateredToday, v.wateredDue, day, DIM);
      } else {
        canvas.setTextColor(SOFT);
        canvas.setCursor(x, 22);
        canvas.print("NO DAEMON CARRIED HERE");
        canvas.setTextColor(DIM);
        wrap("Send one from the game, then SYNC.", x, 36, 32, 2, 10);
      }
      if (!v.stepText.empty()) {
        canvas.setTextColor(day);
        canvas.setCursor(x, 94);
        canvas.print("NEXT");
        canvas.setTextColor(TFT_WHITE);
        wrap(v.stepText, x, 106, 32, 3, 10);
      }
      canvas.setTextColor(DIM);
      canvas.setCursor(6, 128);
      canvas.print(upper(v.day + "  " + v.season).c_str());
    }
    if (hasGame) {
      canvas.setTextColor(DIM);
      std::string g = game.edition + " " + game.release + (game.testing ? " TESTING" : "");
      canvas.setCursor(hal::W - 6 - 6 * (int)g.size(), 128);
      canvas.print(g.c_str());
    }
    choices.draw(146, day);
    if (!told.empty()) {
      canvas.fillRect(0, 126, hal::W, 12, rgb(0x18, 0x1c, 0x24));
      canvas.setTextColor(SOFT);
      canvas.setCursor(6, 128);
      canvas.print(upper(told).substr(0, 51).c_str());
    }
    if (offer) {   // C-215, the app's question
      canvas.fillRoundRect(16, 30, hal::W - 32, 96, 4, rgb(0x10, 0x12, 0x18));
      canvas.drawRoundRect(16, 30, hal::W - 32, 96, 4, day);
      canvas.setTextColor(TFT_WHITE);
      wrap("This game isn't the one the companion follows, so it isn't mirrored. Keep it on the companion as a save of "
           "its own?", 24, 38, 46, 5, 11);   // DRAFT, the app's words
      canvas.setTextColor(day);
      canvas.setCursor(24, 110);
      canvas.print("ENTER: KEEP IT THERE    ESC: NOT NOW");   // DRAFT
    }
  }
};
}  // namespace

Page *homePage() { static Home p; return &p; }
