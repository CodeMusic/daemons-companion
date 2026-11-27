// BRAIN: pathway -- hear, think, say; its route choice (kit::via, mayWake) is the Zero's thalamus
// C-461 (docs/ZEROKIT.md 4): TALK -- words to the carried daemon and its answer. Typed on the keys (ENTER), or held TAB
// to speak and let go. It goes by the way chosen on the KIT page (kit::via): BEST asks the hub's mind when the hub
// answers (THE MIND picks the best model in the house, C-360) and the Kit on the Zero's back when it does not; KIT asks
// only the Kit, offline; MIND only the hub. Before the Kit is woken its charge rule is asked (C-459): above the line it
// asks once, below it only with OVERRIDE, near empty never. The Kit speaks the answer when it is awake. Every word DRAFT.
#include <future>

#include "app.h"
#include "apps.h"
#include "canvas.h"
#include "hal/hal.h"
#include "hub/hub.h"
#include "kit/kit.h"
#include "kit/stackflow.h"
#include "pages/parts.h"
#include "sound.h"

#include <ArduinoJson.h>

namespace {
const uint16_t SOFT = 0xC639, DIM = 0x8432, WARN = 0xFD20;

std::string selfOf(const HubView &v) {   // the daemon's self, short: the Kit's small thinker holds 256 tokens
  if (!v.carrying) return "You are a daemon, a small creature hosted on a Cardputer Zero. Answer in one or two short, kind sentences.";
  std::string s = "You are " + (v.nickname.empty() ? v.name : v.nickname) + ", a daemon";
  if (!v.types.empty()) s += " of the " + v.types + " kind";
  s += ", hosted on a Cardputer Zero your trainer carries.";
  if (!v.word.empty()) s += " You feel " + v.word + ".";
  return s + " Answer in one or two short, kind sentences, as yourself.";
}

struct Talk : Page {
  std::string word, told;
  std::future<Reply> asking;           // the hub's mind
  std::string askedWords;
  Bytes askedWav;
  bool viaHubNow = false;
  enum class Pending { None, Words, Wav } pending = Pending::None;   // waiting on the charge question
  kit::Wake question = kit::Wake::Go;
  bool holding = false;
  std::chrono::steady_clock::time_point lastDrawn;

  void enter() override { told.clear(); kit::refresh(); }

  bool hubBusy() { return asking.valid() && asking.wait_for(std::chrono::seconds(0)) != std::future_status::ready; }

  bool hubFirst() {
    kit::Via w = kit::via();
    if (w == kit::Via::Kit) return false;
    if (w == kit::Via::Mind) return true;
    HubView v = hub::view();
    return v.reached;
  }

  // the Kit, if its charge allows: true when it may go now
  bool kitMay(Pending p) {
    kit::View k = kit::view();
    if (k.state == kit::State::Awake || k.state == kit::State::Busy) return true;
    hal::Power z = hal::power();
    kit::Wake w = kit::mayWake(z.percent, z.charging, k.cell, k.charging, kit::limits());
    if (w == kit::Wake::Go) return true;
    pending = p;
    question = w;
    return false;
  }

  void toKit(Pending p) {
    HubView v = hub::view();
    if (p == Pending::Words) kit::say(askedWords, selfOf(v), true);
    else kit::hear(askedWav, selfOf(v), true);
    viaHubNow = false;
  }

  void sendWords(const std::string &w) {
    askedWords = w;
    askedWav.clear();
    route(Pending::Words);
  }
  void sendWav(const Bytes &wav) {
    askedWav = wav;
    askedWords.clear();
    route(Pending::Wav);
  }
  void route(Pending p) {
    told.clear();
    if (hubFirst()) {
      viaHubNow = true;
      std::string json = p == Pending::Words ? "{\"text\":\"" + stackflow::escape(askedWords) + "\",\"speak\":false}"
                                             : "{\"audioBase64\":\"" + base64(askedWav) + "\",\"audioMime\":\"audio/wav\",\"speak\":false}";
      asking = std::async(std::launch::async, [json] { return hub::post("/api/ai/talk", json, 90000); });
      pendingAfterHub = p;
      return;
    }
    if (!kit::configured()) { told = "No Kit is set on this Zero, and the hub is not answering."; return; }
    if (kitMay(p)) toKit(p);
  }
  Pending pendingAfterHub = Pending::None;

  void key(const KeyEvent &e) override {
    if (pending != Pending::None) {   // the charge question
      if (!e.down) return;
      if (question == kit::Wake::Ask && (e.key == Key::Enter || e.key == Key::A)) {
        if (e.key == Key::A) { kit::Limits l = kit::limits(); l.alwaysAsk = false; kit::keepLimits(l); }
        Pending p = pending; pending = Pending::None; toKit(p);
      } else if (question == kit::Wake::Override && e.key == Key::O) {
        Pending p = pending; pending = Pending::None; toKit(p);
      } else if (e.key == Key::Esc || e.key == Key::Enter) { pending = Pending::None; told = "The Kit was left resting."; }
      return;
    }
    if (e.key == Key::Tab) {   // hold to talk
      if (e.down && !holding) { holding = sound::recordStart(); if (!holding) told = "No microphone answered."; }
      else if (!e.down && holding) {
        holding = false;
        std::vector<int16_t> s = sound::recordStop();
        if (s.size() < 16000 / 2) told = "Too short to hear.";
        else sendWav(kit::wav16k(s));
      }
      return;
    }
    if (!e.down || hubBusy() || kit::view().talking) return;
    if (e.key == Key::Esc) { goHome(); return; }
    if (e.key == Key::Backspace) { if (!word.empty()) word.pop_back(); return; }
    if (e.key == Key::Enter) { if (!word.empty()) { sendWords(word); word.clear(); } return; }
    if (e.ch && word.size() < 120) word += e.ch;
  }

  bool changed() override {
    if (asking.valid() && !hubBusy()) {
      Reply r = asking.get();
      JsonDocument d;
      std::string answer, by = "the mind", heard = askedWords;
      if (r.ok() && !deserializeJson(d, (const char *)r.body.data(), r.body.size())) {
        answer = d["answer"] | "";
        by = d["provider"] | "the mind";
        if (d["heard"].is<const char *>()) heard = d["heard"].as<const char *>();
      }
      if (!answer.empty()) {
        kit::View k = kit::view();
        kit::answeredElsewhere(heard, answer, by, k.state == kit::State::Awake);   // voiced by the Kit when it is awake
      } else if (kit::via() == kit::Via::Best && kit::configured()) {
        told = "The hub did not answer; asking the Kit.";
        if (kitMay(pendingAfterHub)) toKit(pendingAfterHub);
      } else told = r.ok() ? "No answer came." : replyWords(r, "error");
      return true;
    }
    // the answer arrives a few words at a time: drawn again ten times a second at most (the SPI screen)
    auto t = std::chrono::steady_clock::now();
    if (t - lastDrawn < std::chrono::milliseconds(100)) return false;
    lastDrawn = t;
    return true;
  }

  void draw() override {
    HubView v = hub::view();
    kit::View k = kit::view();
    const uint16_t day = hex(v.menu, rgb(0x5b, 0x6b, 0x8c));
    canvas.fillScreen(rgb(0x18, 0x1c, 0x24));
    drawBand("TALK", day);
    canvas.setFont(&fonts::Font0);
    canvas.setTextSize(1);
    canvas.setTextColor(DIM);
    canvas.setCursor(6, 20);
    const char *way = hubBusy() || viaHubNow ? "VIA THE MIND" : kit::via() == kit::Via::Mind ? "VIA THE MIND ONLY" : "VIA THE KIT";
    std::string who = v.carrying ? upper(v.nickname.empty() ? v.name : v.nickname) : "THE DAEMON";
    canvas.print((who + "  " + way + "  KIT " + kit::stateName(k.state)).substr(0, lay::cols()).c_str());
    canvas.drawRect(4, 32, hal::W - 8, 18, holding ? WARN : day);
    canvas.setTextColor(TFT_WHITE);
    canvas.setCursor(8, 37);
    canvas.print(holding ? "LISTENING... LET GO OF TAB TO SEND" : (word + "_").substr((int)word.size() > lay::cols(8) - 2 ? word.size() - (lay::cols(8) - 2) : 0).c_str());
    int y = 56;
    if (!k.heard.empty()) {
      canvas.setTextColor(DIM);
      y += 11 * wrap("YOU: " + k.heard, 6, y, lay::cols(), 2, 11);
    }
    canvas.setTextColor(SOFT);
    if (hubBusy()) { canvas.setCursor(6, y); canvas.print("THE MIND IS THINKING..."); }
    else if (k.state == kit::State::Waking) { canvas.setCursor(6, y); canvas.print("WAKING THE KIT..."); }
    else if (!k.answer.empty()) wrap(upper(who) + ": " + k.answer, 6, y, lay::cols(), lay::rows(6, 11), 11);
    else if (k.talking) { canvas.setCursor(6, y); canvas.print("..."); }
    canvas.setCursor(6, lay::foot(150));
    if (pending != Pending::None) {
      canvas.setTextColor(WARN);
      canvas.print(question == kit::Wake::Ask ? "WAKE THE KIT? IT DRAINS THE CELL FASTER. ENTER/A" :
                   question == kit::Wake::Override ? "LOW CHARGE: THE KIT RESTS. O: OVERRIDE  ESC: NO" :
                                                     "TOO LOW TO WAKE THE KIT. CHARGE FIRST.");
      return;
    }
    std::string foot = !told.empty() ? upper(told) : !k.why.empty() ? upper(k.why) : !k.by.empty() && !k.answer.empty() ? "ANSWERED BY " + upper(k.by) : "";
    canvas.setTextColor(foot.empty() ? DIM : SOFT);
    canvas.print(foot.empty() ? hint("ENTER: SAY IT  HOLD TAB: SPEAK  ESC: BACK") : foot.substr(0, lay::cols()).c_str());
  }
};
}  // namespace

Page *talkPage() { static Talk p; return &p; }
