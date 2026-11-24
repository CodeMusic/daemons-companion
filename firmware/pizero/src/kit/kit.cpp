// BRAIN: host kit (cortex.language, cortex.auditory, cortex.motor) -- driven from the Zero
// C-453: the Kit, from the Zero's side (kit.h). One thread holds the one link; jobs are done one at a time in the order
// asked, and a page reads what came of them through view().
#include "kit/kit.h"

#include <ArduinoJson.h>

#include <atomic>
#include <chrono>
#include <condition_variable>
#include <cstdlib>
#include <cstring>
#include <deque>
#include <functional>
#include <mutex>
#include <thread>

#include "hub/http.h"
#include "kit/stackflow.h"
#include "paths.h"
#include "sound.h"

namespace kit {

// ---- the settings ------------------------------------------------------------------------------------------------------
static std::string firstLine(const std::string &path) {
  std::string t;
  if (!readText(path, t)) return "";
  size_t nl = t.find('\n');
  t = t.substr(0, nl);
  while (!t.empty() && (t.back() == ' ' || t.back() == '\r')) t.pop_back();
  return t;
}

static std::string addressNow() {
  std::string a = getenv("DAEMONS_KIT") ? getenv("DAEMONS_KIT") : firstLine(inConfig("kit"));
  if (a.empty()) a = "10.77.0.2:10001";   // C-458: the cable's network, the Kit's end
  if (a == "off" || a == "none") return "";
  if (a.find(':') == std::string::npos) a += ":10001";
  return a;
}
bool configured() { return !addressNow().empty(); }

Limits limits() {
  Limits l;
  std::string t;
  if (!readText(inConfig("kit.limits"), t)) return l;
  size_t at = 0;
  while (at < t.size()) {
    size_t nl = t.find('\n', at);
    std::string line = t.substr(at, nl == std::string::npos ? std::string::npos : nl - at);
    if (line.rfind("ask ", 0) == 0) l.ask = atoi(line.c_str() + 4);
    else if (line.rfind("refuse ", 0) == 0) l.refuse = atoi(line.c_str() + 7);
    else if (line == "always yes") l.alwaysAsk = false;
    if (nl == std::string::npos) break;
    at = nl + 1;
  }
  if (l.refuse < 0) l.refuse = 0;
  if (l.ask < l.refuse) l.ask = l.refuse;
  return l;
}
void keepLimits(const Limits &l) {
  writeTextAtomic(inConfig("kit.limits"), "ask " + std::to_string(l.ask) + "\nrefuse " + std::to_string(l.refuse) + "\n" +
                                          (l.alwaysAsk ? "" : "always yes\n"));
}

Via viaByName(const std::string &s, Via otherwise) {
  if (s == "best") return Via::Best;
  if (s == "kit") return Via::Kit;
  if (s == "mind") return Via::Mind;
  return otherwise;
}
Via via() { return viaByName(firstLine(inConfig("talk.via")), Via::Best); }
void keepVia(Via v) { writeTextAtomic(inConfig("talk.via"), std::string(viaName(v)) + "\n"); }
const char *viaName(Via v) { return v == Via::Kit ? "kit" : v == Via::Mind ? "mind" : "best"; }

const char *stateName(State s) {
  switch (s) {
    case State::Off: return "OFF";                 // DRAFT, each
    case State::Unreached: return "NOT ANSWERING";
    case State::Asleep: return "RESTING";
    case State::Waking: return "WAKING";
    case State::Awake: return "AWAKE";
    default: return "THINKING";
  }
}

Choice chosen() {
  Choice c;
  std::string t;
  if (!readText(inConfig("kit.models"), t)) return c;
  size_t at = 0;
  while (at < t.size()) {
    size_t nl = t.find('\n', at);
    std::string line = t.substr(at, nl == std::string::npos ? std::string::npos : nl - at);
    if (line.rfind("llm ", 0) == 0) c.llm = line.substr(4);
    else if (line.rfind("stt ", 0) == 0) c.stt = line.substr(4);
    else if (line.rfind("tts ", 0) == 0) c.tts = line.substr(4);
    if (nl == std::string::npos) break;
    at = nl + 1;
  }
  return c;
}

Bytes wav16k(const std::vector<int16_t> &mono) {
  const uint32_t data = (uint32_t)(mono.size() * 2), rate = 16000;
  Bytes w(44 + data);
  auto u32 = [&](size_t at, uint32_t v) { for (int i = 0; i < 4; i++) w[at + i] = (uint8_t)(v >> (8 * i)); };
  auto u16 = [&](size_t at, uint16_t v) { w[at] = (uint8_t)v; w[at + 1] = (uint8_t)(v >> 8); };
  memcpy(&w[0], "RIFF", 4); u32(4, 36 + data); memcpy(&w[8], "WAVEfmt ", 8); u32(16, 16); u16(20, 1); u16(22, 1);
  u32(24, rate); u32(28, rate * 2); u16(32, 2); u16(34, 16); memcpy(&w[36], "data", 4); u32(40, data);
  if (data) memcpy(&w[44], mono.data(), data);
  return w;
}

// ---- the thread ---------------------------------------------------------------------------------------------------------
static std::mutex lock;
static std::condition_variable wakeUp;
static std::deque<std::function<void()>> jobs;
static std::thread worker;
static std::atomic<bool> stopping{false};
static View v;
static std::unique_ptr<stackflow::Link> link;
static std::string linkAt, workLlm, workStt, workTts, selfSetUp;

View view() { std::lock_guard<std::mutex> g(lock); return v; }
static void set(const std::function<void(View &)> &f) { std::lock_guard<std::mutex> g(lock); f(v); }

static void queue(std::function<void()> job) {
  { std::lock_guard<std::mutex> g(lock); jobs.push_back(std::move(job)); }
  wakeUp.notify_one();
}

static bool connected() {
  const std::string at = addressNow();
  set([&](View &x) { x.address = at; });
  if (at.empty()) { set([](View &x) { x.state = State::Off; }); link.reset(); return false; }
  if (link && link->isOpen() && at == linkAt) return true;
  size_t colon = at.rfind(':');
  link.reset(new stackflow::Link(at.substr(0, colon), atoi(at.c_str() + colon + 1)));
  linkAt = at;
  workLlm.clear(); workStt.clear(); workTts.clear(); selfSetUp.clear();   // a new link: the units are set up again
  std::string why;
  if (!link->open(2500, why)) {
    set([&](View &x) { x.state = State::Unreached; x.why = why; x.agent = false; });
    link.reset();
    return false;
  }
  return true;
}

static std::string agentUrl() {   // kitd: the port after StackFlow's
  const std::string at = addressNow();
  size_t colon = at.rfind(':');
  return "http://" + at.substr(0, colon) + ":" + std::to_string(atoi(at.c_str() + colon + 1) + 1);
}

static void askAgent() {
  if (addressNow().empty()) return;
  Reply r = httpGet(agentUrl() + "/state", {}, 2500, 1500);
  JsonDocument d;
  if (!r.ok() || deserializeJson(d, (const char *)r.body.data(), r.body.size())) { set([](View &x) { x.agent = false; }); return; }
  set([&](View &x) {
    x.agent = true;
    x.cell = d["cell"] | -1;
    x.charging = d["charging"] | false;
    x.onUsb = d["usb"] | false;
    x.temp = d["temp"] | -1.0f;
    x.memFreeMb = d["memFreeMb"] | -1;
    x.hotspot = d["hotspot"] | "";
    x.ssid = d["ssid"] | "";
    x.key = d["key"] | "";
  });
}

static void askState(bool models) {
  if (!connected()) { askAgent(); return; }
  std::string why;
  std::string pong = link->call("sys", "ping", "None", "", 3000, why);
  if (pong.empty()) { set([&](View &x) { x.state = State::Unreached; x.why = why; }); link.reset(); askAgent(); return; }
  std::string ver = link->call("sys", "version", "None", "", 3000, why);
  JsonDocument d;
  if (!ver.empty() && !deserializeJson(d, ver)) set([&](View &x) { x.version = d["data"] | ""; });
  if (models) {
    std::string ls = link->call("sys", "lsmode", "None", "", 8000, why);
    JsonDocument m;
    if (!ls.empty() && !deserializeJson(m, ls)) {
      std::vector<Model> out;
      for (JsonVariant e : m["data"].as<JsonArray>()) out.push_back({ e["mode"] | "", e["type"] | "" });
      set([&](View &x) { x.models = out; });
    }
  }
  const bool up = !workLlm.empty();
  set([&](View &x) { if (x.state != State::Busy) x.state = up ? State::Awake : State::Asleep; x.why.clear(); });
  askAgent();
}

static std::string setupUnit(const char *unit, const std::string &data, std::string &why) {
  std::string r = link->call(unit, "setup", std::string(unit) + ".setup", data, 90000, why);   // a model into the NPU: seconds
  JsonDocument d;
  if (r.empty() || deserializeJson(d, r)) return "";
  return d["work_id"] | "";
}

static void exitUnit(std::string &work) {
  if (work.empty() || !link) return;
  std::string why;
  link->call(work, "exit", "None", "", 8000, why);
  work.clear();
}

// the three units up, the LLM with this daemon's self (set up again when the self changes)
static bool awaken(const std::string &self, bool speak, std::string &why) {
  if (!connected()) { why = view().why; return false; }
  const Choice c = chosen();
  set([&](View &x) { x.state = State::Waking; x.llm = c.llm; x.stt = c.stt; x.tts = c.tts; });
  if (!workLlm.empty() && selfSetUp != self) exitUnit(workLlm);
  if (workLlm.empty()) {
    JsonDocument d;
    d["model"] = c.llm; d["response_format"] = "llm.utf-8.stream"; d["input"] = "llm.utf-8"; d["enoutput"] = true;
    d["max_token_len"] = 127;
    d["prompt"] = self;
    std::string data;
    serializeJson(d, data);
    workLlm = setupUnit("llm", data, why);
    if (workLlm.empty()) { why = "the thinker would not wake: " + why; return false; }   // DRAFT
    selfSetUp = self;
  }
  if (workStt.empty()) {
    JsonDocument d;
    d["model"] = c.stt; d["response_format"] = "asr.utf-8"; d["input"] = "whisper.wav.stream.base64"; d["enoutput"] = true;
    d["language"] = "en";
    std::string data;
    serializeJson(d, data);
    workStt = setupUnit("whisper", data, why);   // without it, typed words still work
  }
  if (speak && workTts.empty()) {
    JsonDocument d;
    d["model"] = c.tts; d["response_format"] = "pcm.stream.base64"; d["input"] = "tts.utf-8"; d["enoutput"] = true;
    std::string data;
    serializeJson(d, data);
    workTts = setupUnit("melotts", data, why);
  }
  set([](View &x) { x.state = State::Awake; });
  return true;
}

static void collect(const std::string &work, const std::function<void(const JsonDocument &)> &each, int timeoutMs, std::string &why,
                    bool &finished) {
  finished = false;
  std::string obj;
  auto until = std::chrono::steady_clock::now() + std::chrono::milliseconds(timeoutMs);
  while (std::chrono::steady_clock::now() < until && link && link->next(
           (int)std::chrono::duration_cast<std::chrono::milliseconds>(until - std::chrono::steady_clock::now()).count(), obj, why)) {
    JsonDocument d;
    if (deserializeJson(d, obj) || std::string(d["work_id"] | "") != work) continue;
    if ((d["error"]["code"] | 0) != 0) { why = d["error"]["message"] | "the Kit refused"; return; }
    each(d);
    if (!d["data"].is<JsonObject>() || (d["data"]["finish"] | false)) { finished = true; return; }
  }
}

static std::string textOf(const JsonDocument &d) {
  if (d["data"].is<const char *>()) return d["data"].as<const char *>();
  return d["data"]["delta"] | "";
}

static void speakOut(const std::string &words) {
  if (workTts.empty() || words.empty()) return;
  std::string why;
  if (!link->send(link->newRequest(workTts, "inference", "tts.utf-8", "\"" + stackflow::escape(words) + "\""), why)) return;
  bool fin;
  collect(workTts, [](const JsonDocument &d) {
    Bytes pcm;
    if (unbase64(textOf(d), pcm) && pcm.size() >= 2) sound::pushMono16k((const int16_t *)pcm.data(), pcm.size() / 2);
  }, 60000, why, fin);
}

static void think(const std::string &words, bool speak) {
  std::string why;
  set([&](View &x) { x.state = State::Busy; x.answer.clear(); x.by = "kit"; });
  if (!link->send(link->newRequest(workLlm, "inference", "llm.utf-8", "\"" + stackflow::escape(words) + "\""), why)) {
    set([&](View &x) { x.why = why; x.talking = false; x.state = State::Unreached; });
    return;
  }
  bool fin;
  collect(workLlm, [](const JsonDocument &d) { const std::string t = textOf(d); set([&](View &x) { x.answer += t; }); }, 90000, why, fin);
  std::string answer = view().answer;
  while (!answer.empty() && (answer.back() == '\n' || answer.back() == ' ')) answer.pop_back();
  if (answer.empty()) { set([&](View &x) { x.why = why.empty() ? "no answer came" : why; x.talking = false; x.state = State::Awake; }); return; }   // DRAFT
  set([&](View &x) { x.answer = answer; });
  if (speak) speakOut(answer);
  set([](View &x) { x.talking = false; x.state = State::Awake; x.why.clear(); });
}

static std::string heardFrom(const Bytes &wav, std::string &why) {
  if (workStt.empty()) { why = "nothing on the Kit can hear"; return ""; }   // DRAFT
  static const size_t RAW = 3072;   // 4,096 base64 characters a piece, as M5's own plugin sends
  int index = 0;
  for (size_t at = 0; at < wav.size(); at += RAW, index++) {
    size_t n = std::min(RAW, wav.size() - at);
    Bytes piece(wav.begin() + at, wav.begin() + at + n);
    const std::string data = "{\"delta\":\"" + base64(piece) + "\",\"index\":" + std::to_string(index) + ",\"finish\":" +
                             (at + n >= wav.size() ? "true" : "false") + "}";
    if (!link->send(link->newRequest(workStt, "inference", "asr.wav.stream.base64", data), why)) return "";
  }
  std::string heard;
  bool fin;
  collect(workStt, [&](const JsonDocument &d) { heard += textOf(d); }, 60000, why, fin);
  while (!heard.empty() && (heard.front() == ' ')) heard.erase(heard.begin());
  return heard;
}

void begin() {
  if (worker.joinable()) return;
  stopping = false;
  worker = std::thread([] {
    askState(true);
    auto last = std::chrono::steady_clock::now();
    while (!stopping) {
      std::function<void()> job;
      {
        std::unique_lock<std::mutex> g(lock);
        wakeUp.wait_for(g, std::chrono::seconds(1), [] { return stopping || !jobs.empty(); });
        if (stopping) break;
        if (!jobs.empty()) { job = std::move(jobs.front()); jobs.pop_front(); }
      }
      if (job) { job(); last = std::chrono::steady_clock::now(); continue; }
      if (std::chrono::steady_clock::now() - last > std::chrono::seconds(20)) { askState(false); last = std::chrono::steady_clock::now(); }
    }
  });
}

void end() {
  stopping = true;
  wakeUp.notify_all();
  if (worker.joinable()) worker.join();
  link.reset();
}

void refresh() { queue([] { askState(true); }); }
void wake() {
  queue([] { std::string why; if (!awaken(selfSetUp.empty() ? "You are a daemon, a small creature hosted on this device." : selfSetUp, true, why))   // DRAFT
               set([&](View &x) { x.why = why; if (x.state == State::Waking) x.state = State::Asleep; }); });
}
void sleep() {
  queue([] {
    if (!connected()) return;
    exitUnit(workLlm); exitUnit(workStt); exitUnit(workTts); selfSetUp.clear();
    set([](View &x) { x.state = State::Asleep; });
  });
}
void hotspot(bool on) {
  queue([on] {
    if (addressNow().empty()) return;
    Reply r = httpPost(agentUrl() + "/hotspot", on ? "{\"on\":true}" : "{\"on\":false}", {}, 15000, 1500);
    if (!r.ok()) set([&](View &x) { x.why = "the Kit's agent did not answer"; });   // DRAFT
    askAgent();
  });
}

void say(const std::string &words, const std::string &self, bool speak) {
  set([&](View &x) { x.talking = true; x.heard = words; x.answer.clear(); x.why.clear(); });
  queue([words, self, speak] {
    std::string why;
    if (!awaken(self, speak, why)) { set([&](View &x) { x.why = why; x.talking = false; }); return; }
    think(words, speak);
  });
}

void hear(const Bytes &wav, const std::string &self, bool speak) {
  set([](View &x) { x.talking = true; x.heard.clear(); x.answer.clear(); x.why.clear(); });
  queue([wav, self, speak] {
    std::string why;
    if (!awaken(self, speak, why)) { set([&](View &x) { x.why = why; x.talking = false; }); return; }
    set([](View &x) { x.state = State::Busy; });
    std::string heard = heardFrom(wav, why);
    if (heard.empty()) { set([&](View &x) { x.why = why.empty() ? "nothing was heard" : why; x.talking = false; x.state = State::Awake; }); return; }   // DRAFT
    set([&](View &x) { x.heard = heard; });
    think(heard, speak);
  });
}

void answeredElsewhere(const std::string &heard, const std::string &answer, const std::string &by, bool speak) {
  set([&](View &x) { x.heard = heard; x.answer = answer; x.by = by; x.talking = speak; x.why.clear(); });
  if (!speak) return;
  queue([answer] {
    std::string why;
    if (connected() && !workTts.empty()) speakOut(answer);
    set([](View &x) { x.talking = false; });
  });
}

// ---- the command line ----------------------------------------------------------------------------------------------------
static void waitIdle(int seconds) {
  for (int i = 0; i < seconds * 10; i++) {
    { std::lock_guard<std::mutex> g(lock); if (jobs.empty() && !v.talking && v.state != State::Waking && v.state != State::Busy) return; }
    std::this_thread::sleep_for(std::chrono::milliseconds(100));
  }
}

int cliStatus() {
  if (!configured()) { printf("kit: off (~/.config/daemons/kit)\n"); return 1; }
  askState(true);
  View x = view();
  printf("kit at %s: %s%s%s\n", x.address.c_str(), stateName(x.state), x.why.empty() ? "" : " -- ", x.why.c_str());
  if (!x.version.empty()) printf("  StackFlow %s\n", x.version.c_str());
  if (x.agent) printf("  agent: cell %d%%%s, usb %s, %.1f C, %d MB free, hotspot %s\n", x.cell, x.charging ? " charging" : "",
                      x.onUsb ? "yes" : "no", x.temp, x.memFreeMb, x.hotspot.c_str());
  else printf("  agent: not answering (firmware/llm630/kitd.py)\n");
  for (auto &m : x.models) printf("  model %-8s %s\n", m.type.c_str(), m.mode.c_str());
  const Choice c = chosen();
  printf("  chosen: llm %s, stt %s, tts %s\n", c.llm.c_str(), c.stt.c_str(), c.tts.c_str());
  return x.state == State::Unreached || x.state == State::Off ? 1 : 0;
}

static int cliTurn(bool speak, const std::function<void()> &start) {
  begin();
  auto t0 = std::chrono::steady_clock::now();
  start();
  std::string shown;
  for (int i = 0; i < 1800; i++) {
    View x = view();
    if (x.answer.size() > shown.size()) { printf("%s", x.answer.substr(shown.size()).c_str()); fflush(stdout); shown = x.answer; }
    if (!x.talking && i > 2) break;
    std::this_thread::sleep_for(std::chrono::milliseconds(100));
  }
  waitIdle(60);
  View x = view();
  double s = std::chrono::duration<double>(std::chrono::steady_clock::now() - t0).count();
  printf("\n  heard: %s\n  by %s in %.1f s%s%s\n", x.heard.c_str(), x.by.c_str(), s, x.why.empty() ? "" : " -- ", x.why.c_str());
  if (speak) for (int i = 0; i < 100 && sound::queued(); i++) std::this_thread::sleep_for(std::chrono::milliseconds(100));
  end();
  return x.answer.empty() ? 1 : 0;
}

int cliSay(const std::string &words, bool speak) {
  return cliTurn(speak, [&] { say(words, "You are a daemon, a small creature hosted on a Cardputer Zero. Answer in one short sentence.", speak); });   // DRAFT
}

int cliHear(const std::string &wavPath, bool speak) {
  Bytes wav;
  if (!readFile(wavPath, wav) || wav.size() < 44) { fprintf(stderr, "no recording at %s\n", wavPath.c_str()); return 1; }
  return cliTurn(speak, [&] { hear(wav, "You are a daemon, a small creature hosted on a Cardputer Zero. Answer in one short sentence.", speak); });   // DRAFT
}

}  // namespace kit
