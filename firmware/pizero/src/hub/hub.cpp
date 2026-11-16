// C-381: the device state, read with the boards' own parser's names (firmware/esp32/src/state.cpp); C-380: pairing.
#include "hub/hub.h"

#include <ArduinoJson.h>
#include <sys/stat.h>

#include <atomic>
#include <chrono>
#include <condition_variable>
#include <cstdlib>
#include <thread>

#include "hub/http.h"
#include "paths.h"

namespace hub {
static std::mutex lock;                 // base, key and last
static std::condition_variable wake;
static HubView last;
static std::string base, id, key;
static std::thread worker;
static std::atomic<bool> stopping{false}, askNow{false};

static std::string trimmed(std::string s) {
  while (!s.empty() && (s.back() == '\n' || s.back() == '\r' || s.back() == ' ' || s.back() == '/')) s.pop_back();
  return s;
}

std::string address() { std::lock_guard<std::mutex> g(lock); return base; }
bool paired() { std::lock_guard<std::mutex> g(lock); return !key.empty(); }
std::vector<std::string> headers() {
  std::lock_guard<std::mutex> g(lock);
  std::vector<std::string> h{ "x-device: " + id };
  if (!key.empty()) h.push_back("authorization: Bearer " + key);
  return h;
}
std::string deviceName() { return id == "cardputer-zero-window" ? "Cardputer Zero (a computer)" : "Cardputer Zero"; }   // DRAFT

static void ask() {
  HubView v;
  v.asked = true;
  Reply r = httpGet(address() + "/api/device/state", headers(), 6000);
  if (!r.ok()) {
    v.error = !r.error.empty() ? r.error : "the hub said " + std::to_string(r.status);   // DRAFT
  } else {
    JsonDocument doc;
    if (deserializeJson(doc, (const char *)r.body.data(), r.body.size())) v.error = "the hub's answer did not read";   // DRAFT
    else {
      v.reached = true;
      v.date = doc["date"] | ""; v.edition = doc["edition"] | ""; v.season = doc["season"] | "";
      v.day = doc["day"]["name"] | ""; v.colour = doc["day"]["colour"] | "#5b6b8c";
      v.watch = doc["world"]["watch"] | "";
      if (!doc["step"].isNull()) { v.stepText = doc["step"]["text"] | ""; v.goal = doc["step"]["goal"] | ""; }
      v.carrying = !doc["daemon"].isNull();
      if (v.carrying) {
        v.name = doc["daemon"]["name"] | ""; v.nickname = doc["daemon"]["nickname"] | "";
        v.types = doc["daemon"]["types"] | ""; v.level = doc["daemon"]["level"] | 0;
        v.friendship = doc["daemon"]["friendship"] | 0;
      }
    }
  }
  std::lock_guard<std::mutex> g(lock);
  last = v;
}

static void start() {
  if (worker.joinable() || address().empty()) return;
  worker = std::thread([] {
    while (!stopping) {
      ask();
      std::unique_lock<std::mutex> g(lock);
      wake.wait_for(g, std::chrono::seconds(30), [] { return stopping.load() || askNow.load(); });
      askNow = false;
    }
  });
}

void begin(const std::string &deviceId) {
  id = deviceId;
  std::string a, k;
  if (const char *e = getenv("DAEMONS_HUB")) a = e;
  else if (!readText(inConfig("hub"), a)) a = "";
  a = trimmed(a);
  if (a == "none") a = "";
  if (readText(inConfig("token"), k)) k = trimmed(k);
  {
    std::lock_guard<std::mutex> g(lock);
    base = a;
    key = k;
    if (a.empty()) last.error = "no hub set";   // DRAFT
  }
  start();
}

std::string pair(const std::string &address, const std::string &code, const std::string &name) {
  std::string a = trimmed(address), c;
  for (char ch : code) if (ch != ' ' && ch != '-') c += ch;
  if (a.empty()) return "which hub? its address, like http://daemons-hearth:4730";   // DRAFT
  if (a.rfind("http", 0) != 0) a = "http://" + a;
  if (c.empty()) return "the code the hub shows";   // DRAFT
  for (char ch : c) if (!isalnum((unsigned char)ch)) return "a code is letters and numbers";   // DRAFT
  Reply r = httpPost(a + "/api/pair", "{\"code\":\"" + c + "\",\"name\":\"" + name + "\"}", {}, 8000);
  JsonDocument d;
  bool read = !r.body.empty() && !deserializeJson(d, (const char *)r.body.data(), r.body.size());
  if (!r.ok()) {
    if (read && d["error"].is<const char *>()) return d["error"].as<const char *>();
    return !r.error.empty() ? r.error : "the hub said " + std::to_string(r.status);   // DRAFT
  }
  if (!read || !d["token"].is<const char *>()) return "the hub's answer did not read";   // DRAFT
  std::string k = d["token"].as<const char *>(), tokenPath = inConfig("token");
  if (!writeTextAtomic(tokenPath, k + "\n")) return "the key could not be kept on this device";   // DRAFT
  chmod(tokenPath.c_str(), 0600);
  writeTextAtomic(inConfig("hub"), a + "\n");
  {
    std::lock_guard<std::mutex> g(lock);
    base = a;
    key = k;
  }
  askNow = true;   // ask again at once, with the key
  wake.notify_all();
  start();
  return "";
}

HubView view() { std::lock_guard<std::mutex> g(lock); return last; }

void end() {
  stopping = true;
  wake.notify_all();
  if (worker.joinable()) worker.join();
}
}  // namespace hub
