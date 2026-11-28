// C-379: PLAY -- the game at 1:1, 240x160 in the middle of 320x170, the companion in the 40 px either side (DRAFT).
// C-593: on a canvas of another size the game is as big as fits whole (hal::gameZoom): still in the middle with the
// companion either side where there is room there, else across the top with the companion's strip under it -- the
// HackberryPi's 720x720 shows it three times its size, 720x480, over a strip of 240 with the daemon and the keys.
// Paced by the speaker: a frame is run whenever less than a twentieth of a second of sound is waiting, so the game
// keeps the GBA's own 59.73 frames a second and the sound never stutters; without sound, by the clock.
// C-380: before the game starts, and each time it comes back from HOME, the hub's copy of the save is asked for first
// (the game is not running, so nothing can save over it); each save the game writes goes out to the hub after it.
#include <algorithm>
#include <chrono>
#include <cstdio>
#include <cstring>
#include <future>

#include "app.h"
#include "apps.h"
#include "canvas.h"
#include "game/rom.h"
#include "hal/hal.h"
#include "hub/hub.h"
#include "hub/mirror.h"
#include "paths.h"
#include "sound.h"
#include "pages/parts.h"
#include "board.h"

using Clock = std::chrono::steady_clock;

namespace {
// where the game's picture is on the canvas, and how big there (in canvas pixels)
struct Box { int x, y, w, h; bool under; };   // under: the companion's strip is below the game, not either side
Box box() {
  Box b;
  b.w = Emu::W * hal::gameZoom() / hal::zoom();
  b.h = Emu::H * hal::gameZoom() / hal::zoom();
  b.under = hal::W - b.w < 60 && hal::H - b.h >= 40;
  b.x = (hal::W - b.w) / 2;                       // 40 on the first canvas
  b.y = b.under ? 0 : (hal::H - b.h) / 2;         // 5
  return b;
}
const auto FRAME = std::chrono::nanoseconds(16742706);              // 280896 cycles at 16.78 MHz

static bool unsaved(const Bytes &b) { for (uint8_t x : b) if (x != 0xFF) return false; return true; }

struct Play : Page {
  bool soundOn = false, settling = false;
  uint64_t shown = ~0ull, outSeen = 0;
  uint64_t stripAt = ~0ull;             // C-593: the frame the companion's strip was last drawn at (it is drawn a few times a second)
  Clock::time_point next, savedAt;
  std::future<mirror::In> asking;
  std::string note;                     // what the mirror last did, said on the settling screen and in the log

  void enter() override {
    soundOn = sound::on() && !headless;
    Bytes mine;
    readFile(savePath(), mine);
    if (unsaved(mine)) mine.clear();
    settling = true;
    note.clear();
    asking = std::async(std::launch::async, [mine] { return mirror::pull(mine); });
    shown = ~0ull;
    stripAt = ~0ull;
    canvas.fillScreen(TFT_BLACK);
  }

  void settle() {
    mirror::In in = asking.get();
    settling = false;
    note = in.why;
    if (!note.empty()) fprintf(stderr, "mirror: %s\n", note.c_str());
    if (in.took) {
      writeFileAtomic(savePath(), in.save);
      if (emu.loaded()) emu.restore(in.save);   // the game starts again from it (CONTINUE)
    }
    if (!emu.loaded()) {
      Bytes save;
      std::string why;
      readFile(savePath(), save);
      if (!emu.load(romPath(), save, why)) { fprintf(stderr, "play: %s\n", why.c_str()); goHome(); return; }
    }
    // this device's save, newer than the one the hub holds (kept while it was away), goes out now -- as the app's open does
    if (!in.took && mirror::mode() == mirror::Mode::Send) {
      Bytes f;
      if (readFile(savePath(), f) && !unsaved(f) && sha1Hex(f) != mirror::agreed()) mirror::pushLater(f);
    }
    next = Clock::now();
  }

  void key(const KeyEvent &e) override {
    if (e.down && e.key == Key::Esc && !settling) { keepSave(); hal::game(nullptr, 0, 0, 0, 0, 0); goHome(); }   // the game waits, paused, where it was
  }
  void runOne() {
    emu.frame(gameKeysHeld(held));
    Bytes s;
    if (emu.settledSave(s) && writeFileAtomic(savePath(), s)) {
      savedAt = Clock::now();
      savedSinceSync = true;  // C-397: back on HOME, a SYNC, as the app's after each save (C-261)
      mirror::pushLater(s);   // C-380: to the hub (sent only in Send mode; pushLater says how it went)
    }
  }
  void tick() override {
    if (settling) {
      if (headless) asking.wait();
      if (asking.wait_for(std::chrono::seconds(0)) != std::future_status::ready) return;
      settle();
      return;
    }
    if (!emu.loaded()) return;
    if (headless) { runOne(); return; }
    int guard = 0;
    if (soundOn) {
      while (sound::queued() < (size_t)sound::RATE / 20 && guard++ < 4) runOne();
    } else {
      auto now = Clock::now();
      while (next <= now && guard++ < 4) { runOne(); next += FRAME; }
      if (now - next > std::chrono::milliseconds(200)) next = now;   // far behind (a slow screen): catch up, not race
    }
  }
  bool changed() override {
    uint64_t serial;
    mirror::lastOut(serial);
    if (serial != outSeen) { outSeen = serial; stripAt = ~0ull; return true; }
    return emu.frames() != shown;
  }

  // SAVED here, then SENT to the hub, or HERE when it stayed on the device; nullptr once six seconds have passed
  const char *saveMark(uint16_t &ink, uint16_t day, uint16_t dim) {
    if (!savedAt.time_since_epoch().count() || Clock::now() - savedAt >= std::chrono::seconds(6)) return nullptr;
    uint64_t serial;
    mirror::Out o = mirror::lastOut(serial);
    const char *mark = "SAVED";   // DRAFT
    ink = TFT_WHITE;
    if (mirror::pushing()) { mark = "SEND.."; ink = dim; }   // DRAFT
    else if (serial && o.sent) { mark = "SENT"; ink = day; }   // DRAFT
    else if (serial && o.kept) { mark = "KEPT"; ink = day; }   // DRAFT: C-215, on the hub as a save of its own
    else if (serial && mirror::mode() == mirror::Mode::Send) { mark = "HERE"; ink = dim; }   // DRAFT: kept on the device
    return mark;
  }
  void strips(const Box &g) {
    HubView v = hub::view();
    const uint16_t day = hex(v.colour, rgb(0x5b, 0x6b, 0x8c)), dim = rgb(0x80, 0x84, 0x90);
    canvas.setFont(&fonts::Font0);
    canvas.setTextSize(1);
    if (g.under) { under(g, v, day, dim); return; }
    const int GX = g.x;
    canvas.fillRect(0, 0, GX, hal::H, rgb(0x10, 0x12, 0x18));
    canvas.fillRect(GX + g.w, 0, hal::W - GX - g.w, hal::H, rgb(0x10, 0x12, 0x18));
    canvas.fillRect(0, 0, GX, 3, day);
    canvas.fillRect(GX + g.w, 0, hal::W - GX - g.w, 3, day);
    if (GX < 38) return;   // no room either side for a word
    // left: the daemon carried
    if (v.reached && v.carrying) {
      std::string n = upper(v.nickname.empty() ? v.name : v.nickname);
      canvas.setTextColor(TFT_WHITE);
      for (int line = 0; line < 3 && line * 6 < (int)n.size(); line++) {
        canvas.setCursor(2, 10 + line * 10);
        canvas.print(n.substr(line * 6, 6).c_str());
      }
      canvas.setTextColor(dim);
      canvas.setCursor(2, 44);
      canvas.printf("LV%d", v.level);
    }
    canvas.setTextColor(dim);
    if (!board::KEYBOARD) { canvas.setCursor(2, lay::foot(140)); canvas.print("SELECT"); }   // C-457: the pair that leaves
    canvas.setCursor(2, lay::foot(150));
    canvas.print(board::KEYBOARD ? "ESC" : "+START");
    canvas.setCursor(2, lay::foot(160));
    canvas.print("MENU");   // DRAFT
    // right: the hour, the cell, and the save
    const int rx = GX + g.w + 2;
    canvas.setTextColor(TFT_WHITE);
    canvas.setCursor(rx + 4, 10);
    canvas.print(clockNow().c_str());
    hal::Power p = hal::power();
    if (p.percent >= 0) {
      canvas.setTextColor(p.percent <= 15 && !p.charging ? rgb(0xe0, 0x60, 0x50) : dim);
      canvas.setCursor(rx + 4, 22);
      canvas.printf("%d%%", p.percent);
    }
    uint16_t ink;
    if (const char *mark = saveMark(ink, day, dim)) {
      canvas.setTextColor(ink);
      canvas.setCursor(rx + 4, lay::foot(150));
      canvas.print(mark);
    }
  }
  // C-593: the strip under the game -- the daemon carried in its den on the right; its name, the hour, the save and
  // the game's keys as this board has them on the left (a keyboard's keys are not a pad's: they are said). DRAFT
  void under(const Box &g, const HubView &v, uint16_t day, uint16_t dim) {
    const uint16_t soft = rgb(0xc8, 0xc8, 0xd0);
    const int y0 = g.y + g.h, h = hal::H - y0;
    const int right = drawStrip(v, y0, day);   // its ground, and the den (the pages of words have the same under them)
    int y = y0 + 9;
    if (v.reached && v.carrying) {
      canvas.setTextColor(TFT_WHITE);
      canvas.setCursor(6, y);
      canvas.print(upper(v.nickname.empty() ? v.name : v.nickname).substr(0, 16).c_str());
      canvas.setTextColor(dim);
      canvas.printf("  LV %d", v.level);
    }
    std::string hour = clockNow();
    hal::Power p = hal::power();
    if (p.percent >= 0) hour = std::to_string(p.percent) + (p.charging ? "%+ " : "% ") + hour;
    canvas.setTextColor(soft);
    canvas.setCursor(right - 6 * (int)hour.size(), y);
    canvas.print(hour.c_str());
    if (h < 60) return;
    // the keys: each GBA key's name, then the key that presses it (the first of its two)
    auto key = [](int gba) { std::string s = gameKeysSay(gba); return s.substr(0, s.find(" /")); };
    int x = 6;
    auto say = [&](const char *name, const std::string &keys) {
      canvas.setTextColor(dim);
      canvas.setCursor(x, y);
      canvas.print(name);
      canvas.setTextColor(soft);
      canvas.setCursor(x + 6 * ((int)strlen(name) + 1), y);
      canvas.print(keys.c_str());
      x += 6 * ((int)strlen(name) + 1 + (int)keys.size() + 3);
    };
    y += 18; x = 6;
    say("MOVE", key(GBA_UP) + " " + key(GBA_LEFT) + " " + key(GBA_DOWN) + " " + key(GBA_RIGHT));   // DRAFT
    say("A", key(GBA_A));
    say("B", key(GBA_B));
    y += 13; x = 6;
    say("START", key(GBA_START));
    say("SELECT", key(GBA_SELECT));
    y += 13; x = 6;
    say("L", key(GBA_L));
    say("R", key(GBA_R));
    say("MENU", board::KEYBOARD ? board::word(Key::Esc) : "SELECT+START");   // DRAFT
    uint16_t ink;
    if (const char *mark = saveMark(ink, day, dim)) {
      canvas.setTextColor(ink);
      canvas.setCursor(6, hal::H - 14);
      canvas.print(mark);
    }
  }
  void draw() override {
    const Box g = box();
    shown = emu.frames();
    // the companion's strip a few times a second, not sixty: the canvas keeps it between
    if (stripAt == ~0ull || shown - stripAt >= 20 || settling || !emu.loaded()) { strips(g); stripAt = shown; }
    if (settling || !emu.loaded()) {
      hal::game(nullptr, 0, 0, 0, 0, 0);
      canvas.fillRect(g.x, g.under ? g.y : 0, g.w, g.under ? g.h : hal::H, TFT_BLACK);
      canvas.setTextColor(rgb(0xc8, 0xc8, 0xd0));
      canvas.setCursor(g.x + 12, g.y + g.h / 2 - 9);   // 76 on the first canvas
      canvas.print(hub::paired() ? "IN STEP WITH THE HUB..." : "");   // DRAFT
      return;
    }
    if (hal::gameDirect()) {   // C-593: the screen shows it bigger than the canvas could: present() draws it there
      hal::game(emu.video(), Emu::STRIDE, Emu::W, Emu::H, g.x, g.y);
      return;
    }
    // the game's picture into the canvas, 32-bit (red low) to RGB565 high byte first, as LovyanGFX keeps it: pixel for
    // pixel on the first canvas, and the nearest pixel where the canvas shows it at another size (a picture, unseen)
    uint16_t *px = canvasPixels();
    const uint32_t *v = emu.video();
    for (int y = 0; y < g.h; y++) {
      uint16_t *row = px + (g.y + y) * hal::W + g.x;
      const uint32_t *src = v + (y * Emu::H / g.h) * Emu::STRIDE;
      for (int x = 0; x < g.w; x++) {
        uint32_t c = src[g.w == Emu::W ? x : x * Emu::W / g.w];
        uint16_t p = (uint16_t)((c & 0xF8) << 8 | (c & 0xFC00) >> 5 | (c & 0xF80000) >> 19);
        row[x] = (uint16_t)(p << 8 | p >> 8);
      }
    }
    if (!g.under) {
      canvas.fillRect(g.x, 0, g.w, g.y, TFT_BLACK);
      canvas.fillRect(g.x, g.y + g.h, g.w, hal::H - g.y - g.h, TFT_BLACK);
    }
  }
};
}  // namespace

Page *playPage() { static Play p; return &p; }
