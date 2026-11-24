// C-513: ACCOUNT on the Linux devices -- the profile this device plays as, on THE COMMONS (src/sites/commons.h). Not
// joined: the eight-letter code its guardian makes in the app, typed here, opens it on that profile. Joined: the
// profile's name and tag, its friend code, and what its guardian lets it do (friends, trade, meet, the lobby). L leaves
// (the token forgotten here; the guardian revokes the device in the app); R asks again; ESC goes back. Every word DRAFT.
#include <ArduinoJson.h>

#include <chrono>
#include <future>
#include <string>

#include "app.h"
#include "apps.h"
#include "canvas.h"
#include "hal/hal.h"
#include "pages/parts.h"
#include "sites/commons.h"

namespace {
const uint16_t SOFT = 0xC639, DIM = 0x8432, WARN = 0xFD20, GOOD = 0x6E8F;
const uint16_t BAND = 0x2B6A;   // the commons' own colour: deep teal

std::string str(JsonVariantConst v, const char *fallback = "") { return v.is<const char *>() ? v.as<const char *>() : fallback; }

struct Account : Page {
  std::future<Reply> asking;
  std::future<std::string> joining;
  std::string code, told, where;
  std::string name, tag, nickname, friendCode;
  std::vector<std::pair<std::string, bool>> controls;
  bool known = false;

  void ask() {
    known = false; controls.clear();
    if (!commons::joined()) return;
    asking = std::async(std::launch::async, [] { return commons::get("/accounts/profile/me"); });
  }
  void enter() override {
    told.clear(); code.clear();
    where = commons::address();
    ask();
  }
  void tick() override {
    if (asking.valid() && asking.wait_for(std::chrono::seconds(0)) == std::future_status::ready) {
      Reply r = asking.get();
      JsonDocument d;
      if (r.ok() && !deserializeJson(d, (const char *)r.body.data(), r.body.size())) {
        name = upper(str(d["name"])); tag = str(d["tag"]); nickname = str(d["nickname"]); friendCode = str(d["code"]);
        for (JsonPairConst kv : d["controls"].as<JsonObjectConst>()) controls.push_back({ upper(kv.key().c_str()), kv.value().as<bool>() });
        known = true;
      } else if (r.status == 401) { commons::leave(); told = "This device was let go of. Join again with a new code."; }   // DRAFT
      else told = "The commons did not answer: " + (r.error.empty() ? "it said " + std::to_string(r.status) : r.error);   // DRAFT
      drawn = false;
    }
    if (joining.valid() && joining.wait_for(std::chrono::seconds(0)) == std::future_status::ready) {
      std::string w = joining.get();
      told = w.empty() ? "Joined." : w;                                                                         // DRAFT
      code.clear();
      if (w.empty()) ask();
      drawn = false;
    }
  }
  void key(const KeyEvent &e) override {
    if (!e.down) return;
    drawn = false;
    if (e.key == Key::Esc || e.key == Key::PadB) { goHome(); return; }
    if (commons::joined()) {
      if (e.key == Key::R) ask();
      if (e.key == Key::L) { commons::leave(); told = "Left. The guardian can revoke this device in the app."; }   // DRAFT
      return;
    }
    if (e.key == Key::Backspace) { if (!code.empty()) code.pop_back(); return; }
    if (e.key == Key::Enter && code.size() == 8 && !joining.valid()) {
      std::string c = code;
      joining = std::async(std::launch::async, [c] { return commons::join(c); });
      told = "Joining...";                                                                                       // DRAFT
      return;
    }
    if (e.ch && isalpha((unsigned char)e.ch) && code.size() < 8) code += (char)toupper((unsigned char)e.ch);
  }
  bool drawn = false;
  bool changed() override { if (drawn) return false; drawn = true; return true; }
  void draw() override {
    canvas.fillScreen(rgb(0x12, 0x18, 0x1a));
    drawBand("ACCOUNT", BAND);                                                                                   // DRAFT
    canvas.setTextSize(1);
    int y = 22;
    canvas.setTextColor(DIM);
    canvas.setCursor(6, y);
    canvas.print(where.empty() ? "NO COMMONS KNOWN: PAIR WITH THE HUB FIRST" : ("THE COMMONS  " + where.substr(where.find("//") == std::string::npos ? 0 : where.find("//") + 2)).substr(0, 50).c_str());   // DRAFT
    y += 16;
    if (!commons::joined()) {
      canvas.setTextColor(SOFT);
      y += 10 * wrap("Play as a profile: in the app, GUARDIAN > the profile > OPEN ON A DEVICE makes an eight-letter code. "
                     "Type it here, then ENTER.", 6, y, 51, 4, 10) + 10;                                          // DRAFT
      canvas.setTextSize(2);
      canvas.setTextColor(TFT_WHITE);
      canvas.setCursor(60, y);
      for (int i = 0; i < 8; i++) canvas.print(i < (int)code.size() ? code[i] : '_'), canvas.print(' ');
      canvas.setTextSize(1);
    } else if (!known) {
      canvas.setTextColor(DIM);
      canvas.setCursor(6, y);
      canvas.print(asking.valid() ? "ASKING THE COMMONS..." : "");                                              // DRAFT
    } else {
      canvas.setTextSize(2);
      canvas.setTextColor(TFT_WHITE);
      canvas.setCursor(6, y);
      canvas.print((name + (tag.empty() ? "" : " #" + tag)).substr(0, 25).c_str());
      canvas.setTextSize(1);
      y += 22;
      canvas.setTextColor(SOFT);
      if (!nickname.empty()) { canvas.setCursor(6, y); canvas.printf("CALLED %s", upper(nickname).c_str()); y += 12; }   // DRAFT
      canvas.setCursor(6, y);
      canvas.printf("FRIEND CODE  %s", friendCode.empty() ? "-" : friendCode.c_str());                              // DRAFT
      y += 16;
      int x = 6;
      for (auto &c : controls) {
        canvas.setTextColor(c.second ? GOOD : DIM);
        canvas.setCursor(x, y);
        canvas.printf("%s %s", c.second ? "+" : "-", c.first.c_str());
        x += 6 * ((int)c.first.size() + 3);
        if (x > hal::W - 60) { x = 6; y += 11; }
      }
    }
    canvas.setTextColor(told.empty() ? DIM : WARN);
    canvas.setCursor(6, 160);
    std::string foot = !told.empty() ? upper(told) : commons::joined() ? hint("R: AGAIN   L: LEAVE   ESC: BACK") : hint("TYPE THE CODE   ENTER: JOIN   ESC: BACK");   // DRAFT
    canvas.print(foot.substr(0, 52).c_str());
  }
};
}  // namespace

Page *accountPage() { static Account p; return &p; }
