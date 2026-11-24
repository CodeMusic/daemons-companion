// C-444: CAPS -- which cap is on the EXT header and what it offers (docs/CAPS.md), and for the CC1101 + NFC its band
// and the antenna on it, with what is heard on that band now. Z C (or left and right) choose the band; F X (up and
// down) say which antenna is on; ENTER asks the chips again; ESC goes back. It never transmits. Every word DRAFT.
#include <chrono>

#include "board.h"
#include "app.h"
#include "apps.h"
#include "canvas.h"
#include "caps/cap.h"
#include "hal/hal.h"
#include "pages/parts.h"

namespace {
const uint16_t SOFT = 0xC639, DIM = 0x8432;

struct Caps : Page {
  std::chrono::steady_clock::time_point lastHeard;
  int heard = -127, loudest = -127;
  std::string told;

  void enter() override { caps::find(true); told.clear(); loudest = -127; }
  void key(const KeyEvent &e) override {
    if (!e.down) return;
    if (e.key == Key::Esc) { goHome(); return; }
    if (e.key == Key::Enter) { caps::find(true); told = "Asked the cap again."; loudest = -127; return; }   // DRAFT
    if (caps::found().kind != caps::Kind::Cc1101Nfc) return;
    Dir d = dirOf(e.key);
    if (d == Dir::Left || d == Dir::Right) {
      static const caps::Band order[] = { caps::Band::B315, caps::Band::B433, caps::Band::B915 };
      int at = 0;
      for (int i = 0; i < 3; i++) if (order[i] == caps::band()) at = i;
      at = (at + (d == Dir::Right ? 1 : 2)) % 3;
      told = caps::setBand(order[at]) ? "" : "The band did not take.";                                          // DRAFT
      loudest = -127;
    } else if (d == Dir::Up || d == Dir::Down) {
      static const caps::Antenna order[] = { caps::Antenna::None, caps::Antenna::A315, caps::Antenna::A433, caps::Antenna::A868915 };
      int at = 0;
      for (int i = 0; i < 4; i++) if (order[i] == caps::antenna()) at = i;
      at = (at + (d == Dir::Down ? 1 : 3)) % 4;
      caps::setAntenna(order[at]);
    }
  }
  bool changed() override {   // what is heard, a few times a second
    if (caps::found().kind != caps::Kind::Cc1101Nfc) return false;
    auto t = std::chrono::steady_clock::now();
    if (t - lastHeard < std::chrono::milliseconds(150)) return false;
    lastHeard = t;
    heard = caps::rssiDbm();
    if (heard > loudest) loudest = heard;
    return true;
  }
  void draw() override {
    const caps::Found &f = caps::found();
    canvas.fillScreen(rgb(0x18, 0x1c, 0x24));
    drawBand("CAPS", rgb(0x4a, 0x5d, 0x4e));                                                                     // DRAFT
    canvas.setFont(&fonts::Font0);
    canvas.setTextSize(1);
    canvas.setTextColor(DIM);
    canvas.setCursor(6, 20);
    canvas.print(board::CAP_HEADER ? "ON THE HEADER" : "BUILT IN");                                                                               // DRAFT
    canvas.setTextSize(2);
    canvas.setTextColor(TFT_WHITE);
    canvas.setCursor(6, 31);
    canvas.print(f.kind == caps::Kind::None ? (board::CAP_HEADER ? "NO CAP" : "NO RADIOS FOUND") : upper(f.name).substr(0, 25).c_str());                   // DRAFT
    canvas.setTextSize(1);
    canvas.setTextColor(SOFT);
    int y = 50;
    if (!f.detail.empty()) { canvas.setCursor(6, y); canvas.print(upper(f.detail).substr(0, 51).c_str()); y += 11; }
    if (f.kind == caps::Kind::None && board::CAP_HEADER) {
      y += 2 + 10 * wrap(hint("Switch the Zero off before fitting a cap: a CC1101 + NFC or a LoRa-1262. It is found when "
                         "the Zero starts, or with ENTER here."), 6, y + 2, 51, 3, 10);                            // DRAFT
    }
    for (auto &o : f.offers) {
      canvas.setCursor(6, y);
      canvas.setTextColor(o.state == "to come" ? DIM : TFT_WHITE);
      canvas.printf("%-20s (%s)", o.type.c_str(), o.raw.c_str());
      canvas.setCursor(hal::W - 6 - 6 * (int)o.state.size(), y);
      canvas.print(upper(o.state).c_str());
      y += 10;
    }
    if (f.kind == caps::Kind::Cc1101Nfc) {
      y += 3;
      caps::Band b = caps::band();
      canvas.setTextColor(DIM);
      canvas.setCursor(6, y);
      canvas.print("BAND");                                                                                       // DRAFT
      int x = 48;
      for (caps::Band c : { caps::Band::B315, caps::Band::B433, caps::Band::B915 }) {
        bool on = c == b;
        if (on) canvas.fillRect(x - 3, y - 2, 6 * 3 + 6, 11, rgb(0x4a, 0x5d, 0x4e));
        canvas.setTextColor(on ? TFT_WHITE : DIM);
        canvas.setCursor(x, y);
        canvas.print(caps::bandName(c));
        x += 36;
      }
      canvas.setTextColor(DIM);
      canvas.setCursor(170, y);
      canvas.printf("ANTENNA %s", caps::antennaName(caps::antenna()));                                           // DRAFT
      y += 13;
      // what is heard now: -120 dBm (nothing) to -40 (a remote held to it)
      int w = hal::W - 12, fill = (heard + 120) * w / 80;
      if (fill < 0) fill = 0;
      if (fill > w) fill = w;
      canvas.drawRect(6, y, w, 8, DIM);
      canvas.fillRect(7, y + 1, fill > 2 ? fill - 2 : 0, 6, heard > -80 ? rgb(0xe8, 0xb8, 0x4a) : rgb(0x6a, 0x9a, 0x7a));
      y += 11;
      canvas.setTextColor(SOFT);
      canvas.setCursor(6, y);
      canvas.printf("%.2f MHz  NOW %d dBm  LOUDEST %d", caps::bandMhz(b), heard, loudest);                       // DRAFT
      y += 10;
      canvas.setTextColor(DIM);
      canvas.setCursor(6, y);
      canvas.print(caps::mayTransmit(b) ? "LISTENING. MAY SEND HERE LATER (ROLL CALL)" : "LISTENING ONLY ON THIS BAND");   // DRAFT
    }
    canvas.setTextColor(DIM);
    canvas.setCursor(6, 160);
    std::string foot = !told.empty() ? upper(told) : !f.why.empty() ? upper(f.why)
                       : f.kind == caps::Kind::Cc1101Nfc ? hint("Z C: BAND   F X: ANTENNA   ENTER: ASK AGAIN   ESC") : hint("ENTER: ASK AGAIN    ESC: BACK");   // DRAFT
    canvas.print(foot.substr(0, 52).c_str());
  }
};
}  // namespace

Page *capsPage() { static Caps p; return &p; }
