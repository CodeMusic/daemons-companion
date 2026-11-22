// C-381: HOME -- the daemon carried, in its den, with how it is and the ONE next step, as the hub tells every board;
// and along the bottom the way to everything else. Left and right (Z C, or the arrows) choose; ENTER goes. Every word
// a player reads here is DRAFT.
#include <vector>

#include "app.h"
#include "canvas.h"
#include "caps/cap.h"
#include "game/rom.h"
#include "hal/hal.h"
#include "hub/hub.h"
#include "hub/mirror.h"
#include "kit/kit.h"
#include "pages/parts.h"
#include "paths.h"

#include <future>

namespace {
const uint16_t SOFT = 0xC639, DIM = 0x8432;   // rgb(c8,c8,d0) and rgb(80,84,90)

struct Home : Page {
  Choices choices;
  Game game;
  bool hasGame = false;
  // C-397: what the last SYNC brought, shown one at a time as the app's RECEIVED shows it (C-261)
  std::vector<mirror::Arrival> received;
  std::string receivedBy, carriedHere;
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
    items.push_back({ "TALK", PageId::Talk });   // C-461   // DRAFT
    items.push_back({ "SAY", PageId::Say });
    items.push_back({ hasGame ? "GAMES" : "MAKE THE GAME", PageId::Make });   // C-395
    // C-380: a SYNC (C-397: of the one save, whichever game is played)
    if (hub::paired() && mirror::mode() == mirror::Mode::Send && hasGame) items.push_back({ "SYNC", PageId::Home });
    if (!hub::paired()) items.push_back({ "LINK", PageId::Pair });   // C-380
    if (ZERO_DEVICE || caps::found().kind != caps::Kind::None) items.push_back({ "CAPS", PageId::Caps });   // C-444   // DRAFT
    if (kit::configured()) items.push_back({ "KIT", PageId::Kit });   // C-453   // DRAFT
    items.push_back({ "LEAVE", PageId::Home });
    choices.items.clear();
    for (auto &i : items) choices.items.push_back(i.word);
    choices.sel = 0;
    for (size_t i = 0; i < choices.items.size(); i++) if (choices.items[i] == was) choices.sel = (int)i;
  }
  void enter() override {
    hasGame = heldGame(game);
    build();
    offer = mirror::mode() == mirror::Mode::Send && mirror::offered();
    // C-397: back from a game that saved, the SYNC the app makes after each save (C-261) -- here, with the game paused,
    // so what it writes is safely the game's next start
    if (savedSinceSync && hasGame && hub::paired() && mirror::mode() == mirror::Mode::Send && !busy(syncing)) {
      savedSinceSync = false;
      startSync();
    }
  }
  void startSync() {
    keepSave();   // the game's save as it stands, the game paused here
    Bytes mine;
    readFile(savePath(), mine);
    told = "SYNCING...";   // DRAFT
    syncing = std::async(std::launch::async, [mine] { return mirror::syncNow(mine); });
  }
  static bool busy(const std::future<mirror::Synced> &f) { return f.valid() && f.wait_for(std::chrono::seconds(0)) != std::future_status::ready; }
  static bool busy(const std::future<mirror::Out> &f) { return f.valid() && f.wait_for(std::chrono::seconds(0)) != std::future_status::ready; }
  void key(const KeyEvent &e) override {
    if (!e.down || busy(syncing) || busy(keepingIt)) return;
    if (!received.empty()) {   // C-397: RECEIVED, one at a time; ENTER or ESC puts it away
      if (e.key == Key::Enter || e.key == Key::Esc) { received.erase(received.begin()); lastSeen.clear(); }
      return;
    }
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
      else if (w == "SYNC") { savedSinceSync = false; startSync(); }
      else go(it.to);
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
      if (!s.refused.empty()) told = s.refused.front();   // the hub's own words: who stays, and why
      for (auto &a : s.arrivals) received.push_back(a);
      if (!s.arrivals.empty()) { receivedBy = s.player; carriedHere = s.carried; }
      hub::refresh();
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
    if (!received.empty()) {   // C-397: RECEIVED, as the app's card (app/ui/received.tsx): who, what, where it is, from whom
      const mirror::Arrival &a = received.front();
      const uint16_t paper = rgb(0xfb, 0xfa, 0xf6), ink = rgb(0x1d, 0x20, 0x29), rule = rgb(0x2b, 0x2f, 0x3a);
      canvas.fillRoundRect(40, 18, hal::W - 80, 140, 6, rule);
      canvas.fillRoundRect(43, 21, hal::W - 86, 134, 5, day);
      canvas.fillRoundRect(46, 24, hal::W - 92, 128, 4, paper);
      canvas.setTextColor(ink);
      canvas.setTextSize(1);
      std::string who = upper(receivedBy.empty() ? "YOU" : receivedBy) + " RECEIVED";   // DRAFT
      canvas.setCursor((hal::W - 6 * (int)who.size()) / 2, 30);
      canvas.print(who.c_str());
      // the daemon itself when it is the one this device now carries, its picture come with the state
      const bool here = a.kind == "sent" && !carriedHere.empty() && a.nickname == carriedHere;
      std::shared_ptr<const Sprite> art = here && v.reached && v.carrying ? hub::art(v.artKey) : nullptr;
      std::string what = a.kind == "item" ? std::to_string(a.count ? a.count : 1) + " " + a.nickname : a.nickname;
      std::string where = a.kind == "sent" ? (here ? "IN THIS DEVICE NOW" : "WITH YOUR COMPANION NOW")   // DRAFT
                        : a.where == "party" ? "IN YOUR PARTY" : "IN YOUR PC";                          // DRAFT
      std::string from = "FROM " + upper(a.kind == "sent" ? (receivedBy.empty() ? "you" : receivedBy) : a.from.empty() ? "your companion" : a.from);   // DRAFT
      what = upper(what);
      if (art) {   // the picture on the left, the words beside it
        const int scale = art->h <= 40 ? 2 : 1, ax = 52 + (80 - art->w * scale) / 2, ay = 42 + (88 - art->h * scale) / 2;
        drawSprite(*art, ax, ay, scale);
        const int tx = 140, cols = (hal::W - 50 - tx) / 6;
        canvas.setTextSize(what.size() * 12 <= (size_t)(hal::W - 50 - tx) ? 2 : 1);
        canvas.setCursor(tx, 58);
        canvas.print(what.substr(0, canvas.getTextSizeX() > 1 ? cols / 2 : cols).c_str());
        canvas.setTextSize(1);
        canvas.setTextColor(rule);
        wrap(where, tx, 82, cols, 2, 10);
        wrap(from, tx, 104, cols, 2, 10);
      } else {
        canvas.setTextSize(2);
        what = what.substr(0, 17);
        canvas.setCursor((hal::W - 12 * (int)what.size()) / 2, 62);
        canvas.print(what.c_str());
        canvas.setTextSize(1);
        canvas.setTextColor(rule);
        canvas.setCursor((hal::W - 6 * (int)where.size()) / 2, 88);
        canvas.print(where.c_str());
        canvas.setCursor((hal::W - 6 * (int)from.size()) / 2, 100);
        canvas.print(from.c_str());
      }
      canvas.setTextColor(day);
      std::string more = received.size() > 1 ? hint("ENTER: NEXT") : hint("ENTER");   // DRAFT
      canvas.setCursor((hal::W - 6 * (int)more.size()) / 2, 140);
      canvas.print(more.c_str());
      return;
    }
    if (offer) {   // C-215, the app's question
      canvas.fillRoundRect(16, 30, hal::W - 32, 96, 4, rgb(0x10, 0x12, 0x18));
      canvas.drawRoundRect(16, 30, hal::W - 32, 96, 4, day);
      canvas.setTextColor(TFT_WHITE);
      wrap("This game isn't the one the companion follows, so it isn't mirrored. Keep it on the companion as a save of "
           "its own?", 24, 38, 46, 5, 11);   // DRAFT, the app's words
      canvas.setTextColor(day);
      canvas.setCursor(24, 110);
      canvas.print(hint("ENTER: KEEP IT THERE    ESC: NOT NOW"));   // DRAFT
    }
  }
};
}  // namespace

Page *homePage() { static Home p; return &p; }
