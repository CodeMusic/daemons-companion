// C-453 (docs/ZEROKIT.md): KIT -- the LLM630 Compute Kit on the Zero's back. Whether it answers, its state (resting or
// awake), its own cell and heat from its agent, its hotspot, the models it holds, and the way TALK goes. ENTER wakes it
// or lets it rest (the charge rule asked first, C-459); H turns its hotspot on or off (C-460); V changes TALK's way
// (BEST, KIT, MIND); R asks again; F X scroll the models; ESC goes back. Every word DRAFT.
#include <chrono>

#include "app.h"
#include "canvas.h"
#include "hal/hal.h"
#include "kit/kit.h"
#include "pages/parts.h"

namespace {
const uint16_t SOFT = 0xC639, DIM = 0x8432, WARN = 0xFD20;

struct KitPage : Page {
  int top = 0;
  std::string told;
  kit::Wake question = kit::Wake::Go;
  bool asking = false;

  void enter() override { told.clear(); asking = false; kit::refresh(); }
  void key(const KeyEvent &e) override {
    if (!e.down) return;
    kit::View k = kit::view();
    if (asking) {
      if ((question == kit::Wake::Ask && e.key == Key::Enter) || (question == kit::Wake::Override && e.key == Key::O)) { kit::wake(); told = "Waking the Kit."; }
      else told = "The Kit was left resting.";
      asking = false;
      return;
    }
    if (e.key == Key::Esc) { go(PageId::Home); return; }
    if (e.key == Key::Enter) {
      if (k.state == kit::State::Awake || k.state == kit::State::Busy) { kit::sleep(); told = "The Kit rests."; return; }
      hal::Power z = hal::power();
      question = kit::mayWake(z.percent, z.charging, k.cell, k.charging, kit::limits());
      if (question == kit::Wake::Go) { kit::wake(); told = "Waking the Kit."; }
      else if (question == kit::Wake::Refuse) told = "Too low to wake the Kit. Charge first.";
      else asking = true;
      return;
    }
    if (e.key == Key::H) { kit::hotspot(k.hotspot != "on"); told = k.hotspot == "on" ? "Hotspot off." : "Hotspot on."; return; }
    if (e.key == Key::V) {
      kit::Via v = kit::via();
      kit::keepVia(v == kit::Via::Best ? kit::Via::Kit : v == kit::Via::Kit ? kit::Via::Mind : kit::Via::Best);
      return;
    }
    if (e.key == Key::R) { kit::refresh(); told = "Asked again."; return; }
    Dir d = dirOf(e.key);
    if (d == Dir::Down && top + 4 < (int)k.models.size()) top++;
    if (d == Dir::Up && top > 0) top--;
  }
  std::chrono::steady_clock::time_point lastDrawn;
  bool changed() override {   // what the Kit says, ten times a second at most (the SPI screen)
    auto t = std::chrono::steady_clock::now();
    if (t - lastDrawn < std::chrono::milliseconds(100)) return false;
    lastDrawn = t;
    return true;
  }
  void draw() override {
    kit::View k = kit::view();
    canvas.fillScreen(rgb(0x18, 0x1c, 0x24));
    drawBand("KIT", rgb(0x55, 0x4a, 0x6e));
    canvas.setFont(&fonts::Font0);
    canvas.setTextSize(1);
    canvas.setTextColor(DIM);
    canvas.setCursor(6, 20);
    canvas.print(k.address.empty() ? "NO KIT SET ON THIS ZERO" : ("THE LLM630 AT " + k.address).c_str());
    canvas.setTextSize(2);
    canvas.setTextColor(k.state == kit::State::Unreached || k.state == kit::State::Off ? WARN : TFT_WHITE);
    canvas.setCursor(6, 32);
    canvas.print(kit::stateName(k.state));
    canvas.setTextSize(1);
    canvas.setTextColor(SOFT);
    canvas.setCursor(6, 52);
    std::string line = "WAY " + upper(kit::viaName(kit::via()));
    if (k.agent) {
      line += k.cell >= 0 ? "  CELL " + std::to_string(k.cell) + (k.charging ? "%+" : "%") : "  NO CELL";
      if (k.temp > 0) line += "  " + std::to_string((int)k.temp) + "C";
      line += "  HOTSPOT " + upper(k.hotspot.empty() ? "?" : k.hotspot);
    }
    canvas.print(line.substr(0, 51).c_str());
    canvas.setCursor(6, 63);
    canvas.setTextColor(DIM);
    if (k.state == kit::State::Awake || k.state == kit::State::Busy)
      canvas.print(("THINKS " + upper(k.llm) + ", HEARS " + upper(k.stt)).substr(0, 51).c_str());
    else if (!k.version.empty()) canvas.print(("STACKFLOW " + k.version).c_str());
    canvas.setTextColor(SOFT);
    canvas.setCursor(6, 76);
    canvas.print(("MODELS ON IT: " + std::to_string(k.models.size())).c_str());
    for (int i = 0; i < 4 && top + i < (int)k.models.size(); i++) {
      const kit::Model &m = k.models[top + i];
      canvas.setTextColor(DIM);
      canvas.setCursor(6, 88 + i * 11);
      canvas.print((upper(m.type) + "  " + m.mode).substr(0, 51).c_str());
    }
    if (k.hotspot == "on" && !k.ssid.empty()) {   // to tell a guest
      canvas.setTextColor(SOFT);
      canvas.setCursor(6, 136);
      canvas.print(("JOIN " + k.ssid + "  KEY " + k.key).substr(0, 51).c_str());
    }
    canvas.setCursor(6, 150);
    if (asking) {
      canvas.setTextColor(WARN);
      canvas.print(question == kit::Wake::Ask ? "WAKE THE KIT? IT DRAINS THE CELL FASTER. ENTER" : "LOW CHARGE: THE KIT RESTS. O: OVERRIDE");
      return;
    }
    std::string foot = !told.empty() ? upper(told) : !k.why.empty() ? upper(k.why) : "";
    canvas.setTextColor(foot.empty() ? DIM : SOFT);
    canvas.print(foot.empty() ? hint("ENTER: WAKE/REST  H: HOTSPOT  V: WAY  ESC") : foot.substr(0, 51).c_str());
  }
};
}  // namespace

Page *kitPage() { static KitPage p; return &p; }
