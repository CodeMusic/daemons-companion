// C-379: PLAY -- the game at 1:1, 240x160 in the middle of 320x170, the companion in the 40 px either side (DRAFT).
// Paced by the speaker: a frame is run whenever less than a twentieth of a second of sound is waiting, so the game
// keeps the GBA's own 59.73 frames a second and the sound never stutters; without sound, by the clock.
#include <chrono>
#include <cstdio>

#include "app.h"
#include "canvas.h"
#include "game/rom.h"
#include "hal/hal.h"
#include "hub/hub.h"
#include "paths.h"
#include "sound.h"

using Clock = std::chrono::steady_clock;

namespace {
const int GX = (hal::W - Emu::W) / 2, GY = (hal::H - Emu::H) / 2;   // 40, 5
const auto FRAME = std::chrono::nanoseconds(16742706);              // 280896 cycles at 16.78 MHz

struct Play : Page {
  bool soundOn = false;
  uint64_t shown = ~0ull;
  Clock::time_point next, savedAt;
  std::string why;

  void enter() override {
    soundOn = sound::on() && !headless;
    if (!emu.loaded()) {
      Bytes save;
      readFile(inData("daemons.sav"), save);
      if (!emu.load(romPath(), save, why)) { fprintf(stderr, "play: %s\n", why.c_str()); go(PageId::Home); return; }
    }
    next = Clock::now();
    shown = ~0ull;
  }
  void key(const KeyEvent &e) override {
    if (e.down && e.key == Key::Esc) { keepSave(); go(PageId::Home); }   // the game waits, paused, where it was
  }
  void runOne() {
    emu.frame(gameKeysHeld(held));
    Bytes s;
    if (emu.settledSave(s) && writeFileAtomic(inData("daemons.sav"), s)) savedAt = Clock::now();   // C-380: then to the hub
  }
  void tick() override {
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
  bool changed() override { return emu.frames() != shown; }

  void strips() {
    HubView v = hub::view();
    const uint16_t day = hex(v.colour, rgb(0x5b, 0x6b, 0x8c)), dim = rgb(0x80, 0x84, 0x90);
    canvas.fillRect(0, 0, GX, hal::H, rgb(0x10, 0x12, 0x18));
    canvas.fillRect(GX + Emu::W, 0, GX, hal::H, rgb(0x10, 0x12, 0x18));
    canvas.fillRect(0, 0, GX, 3, day);
    canvas.fillRect(GX + Emu::W, 0, GX, 3, day);
    canvas.setFont(&fonts::Font0);
    canvas.setTextSize(1);
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
    canvas.setCursor(2, 150);
    canvas.print("ESC");
    canvas.setCursor(2, 160);
    canvas.print("MENU");   // DRAFT
    // right: the hour, the cell, a mark while a save is new
    const int rx = GX + Emu::W + 2;
    canvas.setTextColor(TFT_WHITE);
    canvas.setCursor(rx + 4, 10);
    canvas.print(clockNow().c_str());
    hal::Power p = hal::power();
    if (p.percent >= 0) {
      canvas.setTextColor(p.percent <= 15 && !p.charging ? rgb(0xe0, 0x60, 0x50) : dim);
      canvas.setCursor(rx + 4, 22);
      canvas.printf("%d%%", p.percent);
    }
    if (Clock::now() - savedAt < std::chrono::seconds(3) && savedAt.time_since_epoch().count()) {
      canvas.setTextColor(day);
      canvas.setCursor(rx + 4, 150);
      canvas.print("SAVED");   // DRAFT
    }
  }
  void draw() override {
    shown = emu.frames();
    strips();
    // the game's picture into the canvas, 32-bit (red low) to RGB565 high byte first, as LovyanGFX keeps it
    uint16_t *px = canvasPixels();
    const uint32_t *v = emu.video();
    for (int y = 0; y < Emu::H; y++) {
      uint16_t *row = px + (GY + y) * hal::W + GX;
      const uint32_t *src = v + y * Emu::STRIDE;
      for (int x = 0; x < Emu::W; x++) {
        uint32_t c = src[x];
        uint16_t p = (uint16_t)((c & 0xF8) << 8 | (c & 0xFC00) >> 5 | (c & 0xF80000) >> 19);
        row[x] = (uint16_t)(p << 8 | p >> 8);
      }
    }
    canvas.fillRect(GX, 0, Emu::W, GY, TFT_BLACK);
    canvas.fillRect(GX, GY + Emu::H, Emu::W, hal::H - GY - Emu::H, TFT_BLACK);
  }
};
}  // namespace

Page *playPage() { static Play p; return &p; }
