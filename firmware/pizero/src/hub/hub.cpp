// C-381: the device state, read with the boards' own parser's names (firmware/esp32/src/state.cpp); C-380: pairing.
#include "hub/hub.h"
#include "board.h"

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
std::string deviceName() {   // DRAFT; C-457: the board's own name
  return id == std::string(board::ID) + "-window" ? std::string(board::NAME) + " (a computer)" : std::string(board::NAME);
}

std::string deviceId() { return id; }

// ---- C-56: the way from away -- home first, then the relay (docs/REMOTE.md, app/platform/net.ts) ----------------------
// The relay is the user's n8n: one webhook that carries any request as an envelope {method, path, body} with this
// device's key, and answers with the hub's own status, or 502 when the hub is out of its reach. Only the key goes through
// it, so this device names itself in the path (?device=) as the phone does. Home is asked first with a short wait to
// connect (a home that answers then gets the whole wait, so a save at home is never cut short); the route that worked
// is kept a minute; one request at a time goes through the relay until it has answered (C-107); a 502 rests it 30 s,
// and then home is asked once more in full (C-109).
static std::string awayUrl;
static std::mutex relayOne;
static std::atomic<long long> routeAwayUntil{0}, relayOkUntil{0}, relayDownUntil{0};
static std::atomic<bool> lastAway{false};
static long long nowMs() {
  return std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::steady_clock::now().time_since_epoch()).count();
}
bool away() { return lastAway; }
std::string awayAddress() { std::lock_guard<std::mutex> g(lock); return awayUrl; }
static void keepAway(const std::string &url) {
  {
    std::lock_guard<std::mutex> g(lock);
    if (url == awayUrl) return;
    awayUrl = url;
  }
  if (url.empty()) remove(inConfig("away").c_str());
  else { writeTextAtomic(inConfig("away"), url + "\n"); chmod(inConfig("away").c_str(), 0600); }
}

static std::string named(const std::string &path) {
  return path + (path.find('?') == std::string::npos ? "?" : "&") + "device=" + id;
}
static Reply viaHome(const std::string &method, const std::string &path, const std::string *json, long timeoutMs, long connectMs) {
  const std::string url = address() + named(path);
  return method == "POST" ? httpPost(url, json ? *json : "{}", headers(), timeoutMs, connectMs) : httpGet(url, headers(), timeoutMs, connectMs);
}
static bool gatewayDown(const Reply &r) { return r.status == 502 || r.status == 503 || r.status == 504; }
static Reply viaRelay(const std::string &method, const std::string &path, const std::string *json, long timeoutMs) {
  Reply r;
  if (nowMs() < relayDownUntil) { r.error = "the hub did not answer the relay a moment ago"; return r; }   // DRAFT
  std::unique_lock<std::mutex> one(relayOne, std::defer_lock);
  if (nowMs() >= relayOkUntil) one.lock();   // until the relay has answered for the hub, one request at a time
  if (nowMs() < relayDownUntil) { r.error = "the hub did not answer the relay a moment ago"; return r; }   // DRAFT
  std::string k;
  { std::lock_guard<std::mutex> g(lock); k = key; }
  std::string envelope = "{\"method\":\"" + method + "\",\"path\":\"" + named(path) + "\"";
  if (method == "POST") envelope += ",\"body\":" + (json && !json->empty() ? *json : std::string("{}"));
  envelope += "}";
  r = httpPost(awayAddress(), envelope, { "authorization: Bearer " + k }, timeoutMs < 60000 ? 60000 : timeoutMs, 8000);
  if (!r.error.empty() || gatewayDown(r)) { relayDownUntil = nowMs() + 30000; relayOkUntil = 0; routeAwayUntil = 0; }
  else relayOkUntil = nowMs() + 60000;
  return r;
}

Reply call(const std::string &method, const std::string &path, const std::string *json, long timeoutMs) {
  if (awayAddress().empty() || !paired()) { Reply r = viaHome(method, path, json, timeoutMs, 0); lastAway = false; return r; }
  const bool awayFirst = nowMs() < routeAwayUntil;
  Reply r, failed;
  for (int i = 0; i < 2; i++) {
    const bool relay = (i == 0) == awayFirst;
    r = relay ? viaRelay(method, path, json, timeoutMs) : viaHome(method, path, json, timeoutMs, 2500);
    if (r.status > 0 && !(relay && gatewayDown(r))) {
      routeAwayUntil = relay ? nowMs() + 60000 : 0;
      lastAway = relay;
      return r;
    }
    failed = r;
  }
  // C-109: the relay could not reach the hub either -- home once more, in full
  r = viaHome(method, path, json, timeoutMs, 8000);
  if (r.status > 0) { routeAwayUntil = 0; lastAway = false; return r; }
  r.error = "neither home nor the way from away answered";   // DRAFT
  if (failed.error.empty() && failed.status) {   // the relay answered for itself: the hub is out of its reach
    JsonDocument d;
    if (!deserializeJson(d, (const char *)failed.body.data(), failed.body.size()) && d["error"].is<const char *>())
      r.error = std::string("the relay says ") + d["error"].as<const char *>();   // DRAFT
  }
  return r;
}
Reply get(const std::string &path, long timeoutMs) { return call("GET", path, nullptr, timeoutMs); }

// ---- the pictures: fetched once per artKey, kept while the program runs ----------------------------------------------
static std::mutex artLock;
static std::map<std::string, std::shared_ptr<const Sprite>> pictures;

std::shared_ptr<const Sprite> art(const std::string &artKey) {
  std::lock_guard<std::mutex> g(artLock);
  auto it = pictures.find(artKey);
  return it == pictures.end() ? nullptr : it->second;
}
// Each picture is also kept on the device by its artKey (<data>/art/), so a new start asks the hub -- and, away, the
// relay, which runs once per request -- only for a picture it has never had
static std::string artFile(const std::string &artKey) {
  std::string safe;
  for (char c : artKey) safe += isalnum((unsigned char)c) || c == '-' || c == '.' ? c : '_';
  return inData("art") + "/" + safe + ".json";
}
static void fetchArt(const std::string &artKey, const std::string &query) {
  if (artKey.empty() || art(artKey)) return;
  Reply r;
  if (readFile(artFile(artKey), r.body) && !r.body.empty()) r.status = 200;
  else {
    r = get("/api/device/art" + query, 6000);
    if (!r.ok()) return;
    mkdir(inData("art").c_str(), 0755);
    writeFileAtomic(artFile(artKey), r.body);
  }
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
  Reply r = get("/api/device/state", 6000);
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
  // C-56: where to go when home does not answer -- learned at home, once a run, and kept for when it is needed
  static bool learned = false;
  if (v.reached && !away() && paired() && !learned) {
    Reply a = get("/api/settings/away", 6000);
    JsonDocument d;
    if (a.ok() && !deserializeJson(d, (const char *)a.body.data(), a.body.size())) { keepAway(d["url"] | ""); learned = true; }
  }
  if (v.carrying) fetchArt(v.artKey, "");
  for (auto &m : v.party) fetchArt(m.artKey, "?slot=" + std::to_string(m.slot));
}

void refresh() { askNow = true; wake.notify_all(); }

Reply post(const std::string &path, const std::string &json, long timeoutMs) {
  Reply r = call("POST", path, &json, timeoutMs);
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
  std::string w;
  if (readText(inConfig("away"), w)) w = trimmed(w);
  {
    std::lock_guard<std::mutex> g(lock);
    base = a;
    key = k;
    awayUrl = w;
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
  keepAway(d["away"].is<const char *>() ? d["away"].as<const char *>() : "");   // C-56: the way back from anywhere
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
