// C-381: the device state, read with the boards' own parser's names (firmware/esp32/src/state.cpp); C-380: pairing.
#include "hub/hub.h"

#include <ArduinoJson.h>
#include <sys/stat.h>

#include <atomic>
#include <map>
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

std::string deviceId() { return id; }

// ---- the pictures: fetched once per artKey, kept while the program runs ----------------------------------------------
static std::mutex artLock;
static std::map<std::string, std::shared_ptr<const Sprite>> pictures;

std::shared_ptr<const Sprite> art(const std::string &artKey) {
  std::lock_guard<std::mutex> g(artLock);
  auto it = pictures.find(artKey);
  return it == pictures.end() ? nullptr : it->second;
}
static void fetchArt(const std::string &artKey, const std::string &query) {
  if (artKey.empty() || art(artKey)) return;
  Reply r = httpGet(address() + "/api/device/art" + query, headers(), 6000);
  if (!r.ok()) return;
  JsonDocument d;
  if (deserializeJson(d, (const char *)r.body.data(), r.body.size())) return;
  auto s = std::make_shared<Sprite>();
  s->w = d["w"] | 0;
  s->h = d["h"] | 0;
  for (int i = 0; i < 16; i++) s->palette[i] = d["palette"][i] | 0;
  Bytes packed;
  if (s->w <= 0 || s->h <= 0 || s->w > 128 || s->h > 128 || !unbase64(d["pixels"] | "", packed)) return;
  s->px.resize((size_t)s->w * s->h);
  for (size_t i = 0; i < s->px.size(); i++) s->px[i] = i / 2 < packed.size() ? (i & 1 ? packed[i / 2] & 15 : packed[i / 2] >> 4) : 0;
  std::lock_guard<std::mutex> g(artLock);
  pictures[artKey] = s;
}

static std::string joined(JsonVariantConst list) {   // ["CONTENT","VECTOR"] -> "CONTENT / VECTOR" (or a string as it is)
  if (list.is<const char *>()) return list.as<const char *>();
  std::string s;
  for (JsonVariantConst t : list.as<JsonArrayConst>()) { if (!s.empty()) s += " / "; s += t | ""; }
  return s;
}

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
      JsonVariantConst day = doc["day"];
      v.day = day["name"] | ""; v.colour = day["colour"] | "#5b6b8c"; v.menu = day["menu"] | v.colour.c_str();
      v.virtue = day["virtue"] | ""; v.note = day["note"] | "";
      v.watch = doc["world"]["watch"] | "";
      JsonVariantConst step = doc["step"];
      if (!step.isNull()) {
        v.stepId = step["id"] | -1L; v.stepText = step["text"] | ""; v.goal = step["goal"] | "";
        v.milestone = step["milestone"]["title"] | ""; v.msAt = step["milestone"]["at"] | 0; v.msOf = step["milestone"]["of"] | 0;
      }
      JsonVariantConst dm = doc["daemon"];
      v.carrying = !dm.isNull();
      if (v.carrying) {
        v.name = dm["name"] | ""; v.nickname = dm["nickname"] | ""; v.types = joined(dm["types"]);
        v.category = dm["category"] | ""; v.entry = dm["entry"] | ""; v.artKey = dm["artKey"] | "";
        v.level = dm["level"] | 0; v.friendship = dm["friendship"] | 0; v.species = dm["species"] | 0; v.slot = dm["slot"] | -1;
        JsonVariantConst life = dm["life"];
        v.mood = life["mood"] | 0; v.word = life["word"] | ""; v.tired = life["tired"] | "awake"; v.cue = life["cue"] | "";
        v.fedToday = life["fed"]["today"] | 0; v.fedDue = life["fed"]["due"] | 0;
        v.wateredToday = life["watered"]["today"] | 0; v.wateredDue = life["watered"]["due"] | 0;
        v.trained = life["trained"] | false;
        JsonVariantConst den = dm["den"];
        v.denWall = den["wall"] | v.denWall.c_str(); v.denDeep = den["deep"] | v.denDeep.c_str();
        v.denFloor = den["floor"] | v.denFloor.c_str(); v.denGlow = den["glow"] | v.denGlow.c_str();
      }
      for (JsonVariantConst p : doc["party"].as<JsonArrayConst>()) {
        PartyMember m;
        m.name = p["name"] | ""; m.types = joined(p["types"]); m.artKey = p["artKey"] | "";
        m.level = p["level"] | 0; m.slot = p["slot"] | -1;
        for (JsonVariantConst rt : p["routines"].as<JsonArrayConst>()) {
          m.routines.push_back(rt["name"] | ""); m.routineTypes.push_back(rt["type"] | ""); m.routineColours.push_back(rt["colour"] | "");
        }
        v.party.push_back(m);
      }
      for (JsonVariantConst c : doc["casts"].as<JsonArrayConst>()) {
        Heard h;
        h.id = c["id"] | ""; h.kind = c["k"] | ""; h.name = c["n"] | ""; h.species = c["s"] | 0;
        h.text = c["t"].is<const char *>() ? c["t"] | "" : c["a"] | "";
        v.heard.push_back(h);
      }
    }
  }
  {
    std::lock_guard<std::mutex> g(lock);
    last = v;
  }
  // the pictures after the words, so the screen has something at once: the carried daemon's, then the party's by slot
  if (v.carrying) fetchArt(v.artKey, "");
  for (auto &m : v.party) fetchArt(m.artKey, "?slot=" + std::to_string(m.slot));
}

void refresh() { askNow = true; wake.notify_all(); }

Reply post(const std::string &path, const std::string &json, long timeoutMs) {
  Reply r = httpPost(address() + path, json, headers(), timeoutMs);
  refresh();
  return r;
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
