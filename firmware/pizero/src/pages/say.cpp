// C-381: SAY -- CHORUS on real keys (C-134): a word typed and sent to every daemon nearby, as the carried daemon, the
// way a board sends its own (POST /api/device/broadcast, an "out" cast with a 12-hex id: this device's tag for the hour
// and a number); and what was heard in the last ten minutes. ENTER sends, BACKSPACE takes a letter back, ESC goes back.
// Every word DRAFT.
#include <ctime>

#include "app.h"
#include "apps.h"
#include "canvas.h"
#include "game/hash.h"
#include "hal/hal.h"
#include "hub/hub.h"
#include "pages/parts.h"

namespace {
const uint16_t SOFT = 0xC639, DIM = 0x8432;

std::string jsonText(const std::string &s) {
  std::string o;
  for (char c : s) { if (c == '"' || c == '\\') o += '\\'; if ((unsigned char)c >= 0x20 && (unsigned char)c < 0x7f) o += c; }
  return o;
}

struct Say : Page {
  std::string word, answer;
  Sending sending;
  unsigned n = 0;

  void enter() override { answer.clear(); }
  void key(const KeyEvent &e) override {
    if (!e.down || sending.busy()) return;
    if (e.key == Key::Esc) { goHome(); return; }
    if (e.key == Key::Backspace) { if (!word.empty()) word.pop_back(); return; }
    if (e.key == Key::Enter) { send(); return; }
    if (e.ch && word.size() < 80) word += e.ch;
  }
  void send() {
    HubView v = hub::view();
    if (word.empty()) return;
    if (!v.carrying) { answer = "A daemon carried here does the saying."; return; }
    // this device's tag for the hour, as a board's beacon changes by the hour, and a number after it
    char hour[16];
    time_t t = time(nullptr);
    strftime(hour, sizeof hour, "%Y%m%d%H", gmtime(&t));
    const std::string tag = sha1Hex((const uint8_t *)(hub::deviceId() + hour).data(), hub::deviceId().size() + strlen(hour)).substr(0, 8);
    char id[16];
    snprintf(id, sizeof id, "%s%04x", tag.c_str(), (unsigned)((t + n++) & 0xffff));
    const std::string name = upper(v.nickname.empty() ? v.name : v.nickname);
    answer = "...";
    sending.send("/api/device/broadcast", std::string("{\"id\":\"") + id + "\",\"kind\":\"say\",\"name\":\"" + jsonText(name) +
                 "\",\"species\":" + std::to_string(v.species) + ",\"text\":\"" + jsonText(word) + "\",\"dir\":\"out\",\"via\":\"net\"}");
  }
  bool changed() override {
    Reply r;
    if (!sending.done(r)) return false;
    if (r.ok()) { answer = "Said."; word.clear(); }
    else answer = replyWords(r, "error");
    return true;
  }
  void draw() override {
    HubView v = hub::view();
    const uint16_t day = hex(v.menu, rgb(0x5b, 0x6b, 0x8c));
    canvas.fillScreen(rgb(0x18, 0x1c, 0x24));
    drawBand("SAY", day);
    canvas.setFont(&fonts::Font0);
    canvas.setTextSize(1);
    canvas.setTextColor(DIM);
    canvas.setCursor(6, 20);
    canvas.print(v.carrying ? ("AS " + upper(v.nickname.empty() ? v.name : v.nickname) + ", TO EVERY DAEMON NEARBY").c_str()
                            : "NO DAEMON CARRIED HERE");
    canvas.drawRect(4, 32, hal::W - 8, 30, day);
    canvas.setTextColor(TFT_WHITE);
    wrap(word + "_", 8, 36, 51, 2, 11);
    canvas.setTextColor(day);
    canvas.setCursor(6, 70);
    canvas.print("HEARD");
    int y = 82;
    for (int i = (int)v.heard.size() - 1; i >= 0 && y < 136; i--, y += 10) {
      const Heard &h = v.heard[i];
      canvas.setTextColor(SOFT);
      canvas.setCursor(6, y);
      std::string line = upper(h.name) + (h.kind == "act" ? " " : ": ") + h.text;
      canvas.print(line.substr(0, 51).c_str());
    }
    if (v.heard.empty()) { canvas.setTextColor(DIM); canvas.setCursor(6, 82); canvas.print("NOTHING IN THE LAST TEN MINUTES"); }
    canvas.setTextColor(answer.empty() ? DIM : SOFT);
    canvas.setCursor(6, 150);
    canvas.print(answer.empty() ? hint("ENTER: SAY IT    ESC: BACK") : upper(answer).substr(0, 51).c_str());
  }
};
}  // namespace

Page *sayPage() { static Say p; return &p; }
