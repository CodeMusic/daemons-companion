#include <WiFi.h>
#include <map>
#include <vector>
#include <HTTPClient.h>
#include <NetworkClientSecure.h>
#include <Preferences.h>
#include <M5Unified.h>   // C-104: its battery, for the site
#include <mbedtls/base64.h>
#include <esp_heap_caps.h>
#include "net.h"
#include "store.h"
#include "relay_ca.h"
#include "sound.h"

NetStatus net;
std::atomic<uint32_t> keptChanged{0};
std::atomic<uint32_t> keptMask{0};
static void changed(uint32_t what) { keptMask |= what; keptChanged++; }
static uint32_t sumOf(const String &s, int skipFrom = -1, int skipTo = -1) {   // FNV-1a, a range left out
  uint32_t sum = 2166136261u;
  for (int i = 0; i < (int)s.length(); i++) if (i < skipFrom || i > skipTo) sum = (sum ^ (uint8_t)s[i]) * 16777619u;
  return sum;
}
static uint32_t bitFor(const char *name) {
  static const char *N[] = { "today", "goals", "party", "profile", "devices", "state", "index" };
  for (int i = 0; i < 7; i++) if (!strcmp(name, N[i])) return 1u << i;
  return 0;
}
String netNetworks[16]; int netNetworkCount = 0;

static String server, token, relay, ssids[5], passes[5];
static int known = 0;
// C-93: the networks every device shares -- what this Tab5 learned that the companion has not heard yet ('\n' between
// names), and the shared list's revision it last took
static String freshNets; static long netsRev = -1; static bool netsDue = false;
static uint32_t awayAt = 0;                       // the relay answered when home did not: keep to it a minute
static const uint32_t AWAY_MS = 60000;

// ---- what the screen asks for, done on the network task --------------------------------------------------------------
enum Job { NONE, JOIN, SCAN, PAIR, SYNC, GAME, SPEAK };
static volatile Job job = NONE;
static String jobA, jobB;
static SemaphoreHandle_t jobLock;
static void ask(Job j, const String &a = "", const String &b = "") {
  xSemaphoreTake(jobLock, portMAX_DELAY); jobA = a; jobB = b; job = j; xSemaphoreGive(jobLock);
}
void netJoin(const String &s, const String &p) { ask(JOIN, s, p); }
void netScan() { ask(SCAN); }
void netPair(const String &srv, const String &code) { ask(PAIR, srv, code); }
void netSyncNow() { ask(SYNC); }
void netGameSync() { ask(GAME); }
std::atomic<int> netVoice{V_QUIET};
static std::atomic<uint32_t> voiceGen{0};          // a stop moves it on: a voice made for an older one is dropped
void netHush() { voiceGen++; soundVoiceStop(); netVoice = V_QUIET; }
void netSpeak(int species) { netHush(); netVoice = V_MAKING; ask(SPEAK, String(species)); }
String serverAddress() { return server; }
String relayAddress() { return relay; }

const String &deviceId() {
  static String id;
  if (!id.length()) {
    uint64_t mac = ESP.getEfuseMac();
    char tail[7]; snprintf(tail, sizeof tail, "%02x%02x%02x", (uint8_t)(mac >> 24), (uint8_t)(mac >> 32), (uint8_t)(mac >> 40));
    id = String("m5-tab5-") + tail;
  }
  return id;
}

static void load() {
  Preferences p; p.begin("tab5", true);
  server = p.getString("server", ""); token = p.getString("token", ""); relay = p.getString("relay", "");
  known = min((int)p.getUChar("known", 0), 5);
  freshNets = p.getString("fresh", ""); netsRev = p.getLong("netsRev", -1);
  for (int i = 0; i < known; i++) { ssids[i] = p.getString(("s" + String(i)).c_str(), ""); passes[i] = p.getString(("p" + String(i)).c_str(), ""); }
  p.end();
}
static void save() {
  Preferences p; p.begin("tab5", false);
  p.putString("server", server); p.putString("token", token); p.putString("relay", relay);
  p.putUChar("known", known); p.putString("fresh", freshNets); p.putLong("netsRev", netsRev);
  for (int i = 0; i < known; i++) { p.putString(("s" + String(i)).c_str(), ssids[i]); p.putString(("p" + String(i)).c_str(), passes[i]); }
  p.end();
}

// ---- one request: home first, then the relay (C-56's envelope, the phone's key) ---------------------------------------
// The Tab5 names itself as a device with ?device= on the device's own routes -- the relay passes no other header.
static String withDevice(const String &path) {
  if (!path.startsWith("/api/device/")) return path;
  return path + (path.indexOf('?') < 0 ? "?" : "&") + "device=" + deviceId();
}

static String relayRequest(const char *method, const String &path, const String &body, int &code) {
  NetworkClientSecure tls;
  tls.setCACert(RELAY_CA);
  HTTPClient h;
  h.setTimeout(30000);
  code = -1;
  if (!h.begin(tls, relay)) return "";
  h.addHeader("authorization", "Bearer " + token);
  h.addHeader("content-type", "application/json");
  String env = String("{\"method\":\"") + method + "\",\"path\":\"" + path + "\"";
  if (!strcmp(method, "POST")) env += ",\"body\":" + (body.length() ? body : String("{}"));
  code = h.POST(env + "}");
  String out = code > 0 ? h.getString() : "";
  h.end();
  return out;
}

static String request(const char *method, const String &rawPath, const String &body, int &code) {
  code = -1;
  if (WiFi.status() != WL_CONNECTED) return "";
  String path = withDevice(rawPath), out;
  bool away = awayAt && millis() - awayAt < AWAY_MS;
  if (server.length() && !away) {
    HTTPClient h;
    h.setConnectTimeout(relay.length() ? 1500 : 4000);
    h.setTimeout(30000);
    h.begin(server + path);
    if (token.length()) h.addHeader("authorization", "Bearer " + token);
    h.addHeader("x-device", deviceId());
    if (!strcmp(method, "POST")) { h.addHeader("content-type", "application/json"); code = h.POST(body.length() ? body : "{}"); }
    else code = h.GET();
    out = code > 0 ? h.getString() : "";
    h.end();
    if (code > 0) { awayAt = 0; net.home = true; net.away = false; }
  }
  if (code < 0 && relay.startsWith("https://") && token.length()) {
    out = relayRequest(method, path, body, code);
    awayAt = code > 0 ? millis() : 0;
    net.home = false; net.away = code > 0;
  }
  if (code < 0) { net.home = net.away = false; }
  return out;
}

// ---- keeping everything --------------------------------------------------------------------------------------------
// The companion's clock, from the state it hands a device (C-71): the Tab5 has no other way to know the time here.
static int offsetMin = 0; static bool clockSet = false;
static void takeClock(const String &json) {
  JsonDocument d = newDoc();
  if (deserializeJson(d, json) || d["clock"].isNull()) return;
  time_t epoch = d["clock"]["epoch"] | 0;
  if (epoch < 1700000000) return;
  struct timeval tv = { epoch, 0 }; settimeofday(&tv, nullptr);
  offsetMin = d["clock"]["offset"] | 0; clockSet = true;
}
bool localTime(struct tm &out) {
  if (!clockSet) return false;
  time_t t = time(nullptr) + offsetMin * 60; gmtime_r(&t, &out);
  return true;
}

static bool fetchKeep(const char *path, const char *name) {
  int code; String got = request("GET", path, "", code);
  if (code != 200) return false;
  // C-96: the same answer as last time changes nothing -- no write to flash, and no page drawn again (which flickered
  // the screen and threw away its scroll every half minute)
  // The state's clock moves on every time; it is taken, and left out of the comparison.
  bool state = !strcmp(name, "state");
  if (state) takeClock(got);
  int c0 = state ? got.indexOf("\"clock\":{") : -1, c1 = c0 >= 0 ? got.indexOf('}', c0) : -1;
  static std::map<String, uint32_t> sums;
  uint32_t sum = sumOf(got, c0, c1);
  if (sums[name] == sum) return true;
  sums[name] = sum;
  keep(name, got);
  if (state) {
    JsonDocument d = newDoc();                       // C-93: another device learned or forgot a network
    if (!deserializeJson(d, got) && (d["netsRev"] | -1L) >= 0 && (d["netsRev"] | -1L) != netsRev) netsDue = true;
  }
  changed(bitFor(name));
  return true;
}

// Every INDEX picture in one request (as the phone does away), each kept as its own PNG.
static bool fetchArt() {
  int code; String got = request("GET", "/api/art?all=species", "", code);
  if (code != 200) return false;
  JsonDocument d = newDoc();
  if (deserializeJson(d, got)) return false;
  got = String();                                  // let the 700 KB go before the decoding
  JsonObject all = d["species"].as<JsonObject>();
  net.artTotal = all.size(); net.artDone = 0;
  uint8_t *png = (uint8_t *)heap_caps_malloc(64 * 1024, MALLOC_CAP_SPIRAM);
  for (JsonPair kv : all) {
    const char *b64 = kv.value().as<const char *>();
    size_t n = 0;
    if (b64 && !mbedtls_base64_decode(png, 64 * 1024, &n, (const unsigned char *)b64, strlen(b64)))
      keepArt(String("s") + kv.key().c_str(), png, n);
    net.artDone++;
  }
  heap_caps_free(png);
  changed(K_ART);
  return true;
}

static void fetchPartyArt() {
  JsonDocument party = newDoc();
  if (!kept("party", party)) return;
  static std::map<int, uint32_t> sums;           // C-98: the same pictures again change nothing
  bool any = false;
  std::vector<int> slots;
  for (JsonObject d : party["party"].as<JsonArray>()) slots.push_back(d["slot"] | -1);
  JsonDocument st = newDoc();                    // C-103: this Tab5's own daemon may be away in a PC box (slot 100 on)
  if (kept("state", st) && !st["daemon"].isNull()) slots.push_back(st["daemon"]["slot"] | -1);
  for (int slot : slots) {
    if (slot < 0) continue;
    int code; String got = request("GET", "/api/art?party=" + String(slot), "", code);
    if (code != 200) continue;
    JsonDocument a = newDoc();
    if (deserializeJson(a, got)) continue;
    const char *b64 = a["png"] | "";
    uint32_t sum = sumOf(String(b64));
    if (sums[slot] == sum && hasArt("p" + String(slot))) continue;
    static uint8_t png[32 * 1024]; size_t n = 0;
    if (!mbedtls_base64_decode(png, sizeof png, &n, (const unsigned char *)b64, strlen(b64))) { keepArt("p" + String(slot), png, n); sums[slot] = sum; any = true; }
  }
  if (any) changed(K_ART);
}

// C-93: tell the companion every network this Tab5 knows (it is paired, so with the passwords) and take back the list
// every device shares: new ones kept (joined when near), new passwords taken, the forgotten dropped.
static void keepOne(const String &s, const String &p) {
  int at = -1;
  for (int i = 0; i < known; i++) if (ssids[i] == s) at = i;
  if (at < 0) { if (known == 5) { for (int i = 1; i < 5; i++) { ssids[i - 1] = ssids[i]; passes[i - 1] = passes[i]; } known--; } at = known++; }
  ssids[at] = s; passes[at] = p;
}
static void shareNetworks() {
  netsDue = false;
  JsonDocument d = newDoc();
  JsonArray names = d["networks"].to<JsonArray>(), k = d["known"].to<JsonArray>();
  for (int i = 0; i < known; i++) {
    names.add(ssids[i]);
    JsonObject n = k.add<JsonObject>();
    n["ssid"] = ssids[i]; n["password"] = passes[i];
    n["fresh"] = ("\n" + freshNets + "\n").indexOf("\n" + ssids[i] + "\n") >= 0;
  }
  d["current"] = WiFi.status() == WL_CONNECTED ? WiFi.SSID() : "";
  String body; serializeJson(d, body);
  int code; String got = request("POST", "/api/device/networks", body, code);
  JsonDocument r = newDoc();
  if (code != 200 || deserializeJson(r, got) || !r["shared"].is<JsonArray>()) return;
  String before; for (int i = 0; i < known; i++) before += ssids[i] + "\n" + passes[i] + "\n";
  for (JsonVariant f : r["forget"].as<JsonArray>()) {
    String gone = f | "";
    for (int i = 0; i < known; i++) if (ssids[i] == gone) {
      for (int k2 = i + 1; k2 < known; k2++) { ssids[k2 - 1] = ssids[k2]; passes[k2 - 1] = passes[k2]; }
      known--; break;
    }
  }
  for (JsonVariant n : r["shared"].as<JsonArray>()) keepOne(n["ssid"] | "", n["password"] | "");
  freshNets = ""; netsRev = r["rev"] | -1L;
  save();
  String after; for (int i = 0; i < known; i++) after += ssids[i] + "\n" + passes[i] + "\n";
  if (after != before) changed(K_NETS);           // C-98: only when the list really moved
}

static void keepEverything(bool withArt) {
  net.syncing = true;
  bool ok = fetchKeep("/api/today", "today");
  if (ok) {
    fetchKeep("/api/goals", "goals");
    fetchKeep("/api/party", "party");
    fetchKeep("/api/profile", "profile");
    fetchKeep("/api/devices", "devices");
    fetchKeep("/api/device/state", "state");          // this Tab5's own daemon (C-80)
    shareNetworks();                                  // C-93: every device's networks
    { int c; request("POST", "/api/device/hello", String("{\"firmware\":\"m5-tab5 3 ") + COMPANION_BUILD + "\"}", c); }   // C-91: its build, for the site
    { int pct = M5.Power.getBatteryLevel();          // C-104: its charge on the site too -- it was shown only on its own bar
      if (pct >= 0) { int c; request("POST", "/api/device/battery", String("{\"percent\":") + pct + ",\"mv\":" + M5.Power.getBatteryVoltage() +
                                     ",\"charging\":" + (M5.Power.isCharging() == m5::Power_Class::is_charging ? "true" : "false") + "}", c); } }
    fetchKeep("/api/index", "index");
    if (withArt) fetchArt();
    fetchPartyArt();
    struct tm t; char when[24] = "this session";
    if (localTime(t)) strftime(when, sizeof when, "%Y-%m-%d %H:%M", &t);
    keptAtNow(when);
  }
  net.syncing = false;
}

// The writes made while nothing answered, first to last. One the companion refuses (a 4xx) is dropped, never blocks
// the rest (C-87); one that finds nothing to answer waits.
static bool flushOutbox() {
  String m, p, b; bool sent = false;
  while (outboxFirst(m, p, b)) {
    int code; request(m.c_str(), p, b, code);
    if (code < 0 || code >= 500) break;
    outboxDropFirst(); sent = true;
  }
  return sent;
}

void netSend(const char *method, const String &path, const String &body) {
  outboxAdd(method, path, body);
  netSyncNow();                                     // the network task sends it, then brings what changed
}

// ---- Wi-Fi --------------------------------------------------------------------------------------------------------
static void join(const String &s, const String &p) {
  int at = -1;
  for (int i = 0; i < known; i++) if (ssids[i] == s) at = i;
  if (at < 0) { if (known == 5) { for (int i = 1; i < 5; i++) { ssids[i - 1] = ssids[i]; passes[i - 1] = passes[i]; } known--; } at = known++; }
  ssids[at] = s; passes[at] = p;
  if (("\n" + freshNets + "\n").indexOf("\n" + s + "\n") < 0) freshNets += (freshNets.length() ? "\n" : "") + s;   // C-93
  netsDue = true; save();
  WiFi.disconnect(); WiFi.begin(s.c_str(), p.c_str());
  for (int i = 0; i < 60 && WiFi.status() != WL_CONNECTED; i++) delay(250);
  net.message = WiFi.status() == WL_CONNECTED ? "Joined " + s + "." : "Could not join " + s + ".";   // DRAFT
}

static void joinKnown() {
  if (!known) return;
  int n = WiFi.scanNetworks();
  int best = -1, rssi = -999;
  for (int i = 0; i < n; i++) for (int k = 0; k < known; k++)
    if (WiFi.SSID(i) == ssids[k] && WiFi.RSSI(i) > rssi) { best = k; rssi = WiFi.RSSI(i); }
  WiFi.scanDelete();
  if (best >= 0) { WiFi.begin(ssids[best].c_str(), passes[best].c_str()); for (int i = 0; i < 60 && WiFi.status() != WL_CONNECTED; i++) delay(250); }
}

static void pair(const String &srvIn, const String &code) {
  String srv = srvIn; srv.trim();
  if (!srv.startsWith("http")) srv = "http://" + srv;
  if (srv.indexOf(':', 6) < 0) srv += ":4730";
  HTTPClient h; h.setTimeout(8000);
  h.begin(srv + "/api/pair");
  h.addHeader("content-type", "application/json");
  int c = h.POST("{\"code\":\"" + code + "\",\"name\":\"Tab5 " + deviceId().substring(8) + "\"}");
  String got = c > 0 ? h.getString() : "";
  h.end();
  JsonDocument d;
  if (c == 200 && !deserializeJson(d, got) && d["token"].is<const char *>()) {
    server = srv; token = d["token"].as<const char *>(); relay = d["away"] | "";
    save();
    net.paired = true; net.message = "Paired. Downloading everything...";   // DRAFT
    keepEverything(true);
    net.message = "Paired.";
  } else net.message = c == 403 ? "That code is not right, or has run out." : "The companion did not answer at " + srv + ".";   // DRAFT
}

// C-99: an INDEX entry aloud. The companion makes the voice (POST /api/device/speak {species}) and keeps it as 16 kHz
// PCM for a device to fetch -- at home only: the relay answers in JSON and carries no voice.
static void speak(int species) {
  uint32_t gen = voiceGen;
  auto said = [&](const String &m) { if (gen == voiceGen) { net.message = m; netVoice = V_QUIET; changed(K_VOICE); } };
  if (!net.home && net.away) return said("The voice is made at home: the INDEX is read aloud there.");   // DRAFT
  int code; String got = request("POST", "/api/device/speak", "{\"species\":" + String(species) + "}", code);
  JsonDocument d = newDoc();
  if (code != 200 || deserializeJson(d, got)) return said(code < 0 ? "Nothing answered to make the voice." : "The voice did not come (" + String(code) + ").");   // DRAFT
  String audio = d["audio"] | "";
  if (!audio.length()) return said(String((const char *)(d["error"] | "The voice did not come.")));   // DRAFT
  if (gen != voiceGen || !net.home) return said(net.home ? "" : "The voice is made at home.");        // DRAFT
  HTTPClient h; h.setTimeout(30000);
  h.begin(server + withDevice(audio));
  if (token.length()) h.addHeader("authorization", "Bearer " + token);
  h.addHeader("x-device", deviceId());
  const char *keys[] = { "x-sample-rate" }; h.collectHeaders(keys, 1);
  int c = h.GET(); int len = h.getSize();
  if (c != 200 || len <= 0 || len > 8 * 1024 * 1024) { h.end(); return said("The voice did not come down."); }   // DRAFT
  int rate = h.header("x-sample-rate").toInt(); if (rate <= 0) rate = 16000;
  uint8_t *buf = (uint8_t *)heap_caps_malloc(len, MALLOC_CAP_SPIRAM);
  if (!buf) { h.end(); return said("No room for the voice."); }   // DRAFT
  NetworkClient *s = h.getStreamPtr(); int got2 = 0; uint32_t quiet = millis();
  while (got2 < len && millis() - quiet < 10000 && gen == voiceGen) {
    int n = s->available() ? s->read(buf + got2, min(len - got2, 8192)) : 0;
    if (n > 0) { got2 += n; quiet = millis(); } else delay(5);
  }
  h.end();
  if (gen != voiceGen || got2 < len) { heap_caps_free(buf); return said(gen != voiceGen ? "" : "The voice did not all come down."); }   // DRAFT
  soundVoice((int16_t *)buf, len / 2, rate);
  if (gen == voiceGen) { net.message = ""; netVoice = V_SPEAKING; changed(K_VOICE); }
}

// SYNC with the game (C-21): it writes the save, so it is never kept for later -- the companion answers now, or the
// Tab5 says so.
static void gameSync() {
  int code; String got = request("POST", "/api/sync", "{}", code);
  if (code != 200) { net.message = code < 0 ? "SYNC needs the companion: nothing answered." : "SYNC did not work (" + String(code) + ")."; changed(K_MESSAGE); return; }   // DRAFT
  JsonDocument d = newDoc(); deserializeJson(d, got);
  String said;
  for (JsonVariant n : d["received"].as<JsonArray>()) said += String((const char *)n) + " came across. ";
  for (JsonVariant n : d["returned"].as<JsonArray>()) said += String((const char *)n) + " went home. ";
  for (JsonVariant n : d["refused"].as<JsonArray>()) said += String((const char *)n) + " ";   // T-397
  if (!(d["sameGame"] | true)) said = "That save is another game's: nothing was written. ";
  net.message = said.length() ? said : "SYNC: nothing to answer.";   // DRAFT
  changed(K_MESSAGE);
  keepEverything(false);
}

static void netTask(void *) {
  WiFi.mode(WIFI_STA);
  joinKnown();
  uint32_t lastSync = 0, lastToday = 0;
  bool first = true;
  for (;;) {
    net.wifi = WiFi.status() == WL_CONNECTED;
    net.network = net.wifi ? WiFi.SSID() : "";
    xSemaphoreTake(jobLock, portMAX_DELAY);
    Job j = job; String a = jobA, b = jobB; job = NONE;
    xSemaphoreGive(jobLock);
    if (j == JOIN) join(a, b);
    else if (j == SCAN) {
      int n = WiFi.scanNetworks(); netNetworkCount = 0;
      for (int i = 0; i < n && netNetworkCount < 16; i++) if (WiFi.SSID(i).length()) netNetworks[netNetworkCount++] = WiFi.SSID(i);
      WiFi.scanDelete(); changed(K_NETS);
    }
    else if (j == PAIR) pair(a, b);
    else if (j == SYNC && net.paired) { flushOutbox(); keepEverything(!hasArt("s1")); }
    else if (j == GAME && net.paired) gameSync();
    else if (j == SPEAK) { if (net.paired && net.wifi) speak(a.toInt()); else { net.message = "The voice needs the companion."; netVoice = V_QUIET; changed(K_VOICE); } }   // DRAFT
    uint32_t now = millis();
    if (!net.wifi && known && now - lastSync > 30000) { lastSync = now; joinKnown(); }
    if (net.wifi && net.paired) {
      if (first || now - lastSync > 10 * 60000) {            // everything, now and then (the pictures the first time)
        first = false; lastSync = now; lastToday = now;
        flushOutbox(); keepEverything(!hasArt("s1"));      // the pictures only when none are kept
      } else if (now - lastToday > (net.away ? 120000 : 30000)) {   // the day and this Tab5's daemon, often
        lastToday = now;
        if (outboxCount()) flushOutbox();
        fetchKeep("/api/today", "today"); fetchKeep("/api/device/state", "state");
        if (netsDue) shareNetworks();                       // C-93
      }
    }
    delay(200);
  }
}

void netBegin() {
  jobLock = xSemaphoreCreateMutex();
  load();
  net.paired = token.length() > 0;
  xTaskCreatePinnedToCore(netTask, "net", 16384, nullptr, 1, nullptr, 0);
}
