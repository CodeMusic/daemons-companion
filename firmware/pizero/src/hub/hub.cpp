// C-381: the device state, read with the boards' own parser's names (firmware/esp32/src/state.cpp).
#include "hub/hub.h"

#include <ArduinoJson.h>
#include <atomic>
#include <chrono>
#include <condition_variable>
#include <cstdlib>
#include <thread>

#include "hub/http.h"
#include "paths.h"

namespace hub {
static std::mutex lock;
static std::condition_variable wake;
static HubView last;
static std::string base, id;
static std::thread worker;
static std::atomic<bool> stopping{false};

std::string address() { return base; }

static std::string trimmed(std::string s) {
  while (!s.empty() && (s.back() == '\n' || s.back() == '\r' || s.back() == ' ' || s.back() == '/')) s.pop_back();
  return s;
}

static void ask() {
  HubView v;
  v.asked = true;
  Reply r = httpGet(base + "/api/device/state", { "x-device: " + id }, 6000);
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

void begin(const std::string &deviceId) {
  id = deviceId;
  std::string a;
  if (const char *e = getenv("DAEMONS_HUB")) a = e;
  else if (!readText(inConfig("hub"), a)) a = "";
  a = trimmed(a);
  if (a == "none") a = "";
  base = a;
  if (base.empty()) { last.error = "no hub set"; return; }   // DRAFT
  worker = std::thread([] {
    while (!stopping) {
      ask();
      std::unique_lock<std::mutex> g(lock);
      wake.wait_for(g, std::chrono::seconds(30), [] { return stopping.load(); });
    }
  });
}

HubView view() { std::lock_guard<std::mutex> g(lock); return last; }

void end() {
  stopping = true;
  wake.notify_all();
  if (worker.joinable()) worker.join();
}
}  // namespace hub
