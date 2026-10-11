// Wi-Fi, the server, the bridges (USB and phone), and the site's commands (C-67: from main.cpp).
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <Preferences.h>
#include <mbedtls/base64.h>
#include <esp_sleep.h>
#include <vector>
#include "app.h"
#include "talk.h"
#include "brain.h"
#include "radios.h"
#include "link.h"
#include "meet.h"
#include "lora.h"
#include "leds.h"
#include "sound.h"
#include "relay_ca.h"
// C-33, C-52: the Wi-Fi is set at run time -- from the site, down the cable, or on the board (UPLINK / TEACH A NETWORK) --
// and kept in the board's own flash. A secrets.h, if there is one, is only the default for a board that has none yet.
#if __has_include("secrets.h")
#include "secrets.h"
#endif
#ifndef COMPANION_WIFI_SSID
#define COMPANION_WIFI_SSID ""
#define COMPANION_WIFI_PASSWORD ""
#define COMPANION_SERVER ""
#endif

String serverUrl;
String knownSsid[MAX_NETS], knownPass[MAX_NETS]; int knownCount = 0;
uint32_t usbSeen = 0, phoneSeen = 0, lastPoll = 0, lastHello = 0;
static String lineIn;
void runRoutineByName(long id, const String &want);

// ---- C-33: the board's own Wi-Fi ----------------------------------------------------------------------------------------
// C-52: SEVERAL networks are kept -- what the board has learned, which the daemons share -- and it joins whichever known
// one is in range, the strongest, at start and whenever it loses the one it was on. C-93: and every device shares them:
// what this board learns or forgets is told to the server, and what another device learned comes back -- with the
// passwords only down the cable or over Wi-Fi with this board's own key, never over the phone's Bluetooth.
bool wifiSet() { return knownCount > 0; }
bool online() { return wifiSet() && (serverUrl.length() || relaySet()) && WiFi.status() == WL_CONNECTED; }
bool atHome() { return online() && serverUrl.length() && !viaRelay(); }   // C-82: home answered last (talk needs it)

// C-93: what this board learned or forgot that the server has not heard yet ('\n' between names), and the shared list's
// revision it last took -- kept in flash, so a board switched off before it was in touch still tells it
static String freshNets, forgotNets;
static long netsRevHave = -1;
bool netsDue = false;
static bool inList(const String &list, const String &s) { return ("\n" + list + "\n").indexOf("\n" + s + "\n") >= 0; }
static String addTo(const String &list, const String &s) { return inList(list, s) ? list : list.length() ? list + "\n" + s : s; }
static String dropFrom(const String &list, const String &s) {
  String out;
  int from = 0;
  while (from <= (int)list.length()) {
    int nl = list.indexOf('\n', from); if (nl < 0) nl = list.length();
    String one = list.substring(from, nl);
    if (one.length() && one != s) out = addTo(out, one);
    from = nl + 1;
  }
  return out;
}
static void saveSync() {
  Preferences p; p.begin("uplink", false);
  p.putString("fresh", freshNets); p.putString("forgot", forgotNets); p.putLong("rev", netsRevHave);
  p.end();
}

void saveNetworks() {
  Preferences p; p.begin("uplink", false);
  p.putUChar("count", knownCount);
  for (int i = 0; i < MAX_NETS; i++) {
    String k = String(i);
    if (i < knownCount) { p.putString(("s" + k).c_str(), knownSsid[i]); p.putString(("p" + k).c_str(), knownPass[i]); }
    else { p.remove(("s" + k).c_str()); p.remove(("p" + k).c_str()); }
  }
  p.putString("server", serverUrl);
  p.end();
}

// Keep a network (or its new password) without joining it: the strongest known one in range is joined by uplinkLoop.
static void keepNetwork(const String &ssid, const String &pass) {
  int at = -1;
  for (int i = 0; i < knownCount; i++) if (knownSsid[i] == ssid) at = i;
  if (at < 0) {
    if (knownCount == MAX_NETS) { for (int i = 1; i < MAX_NETS; i++) { knownSsid[i - 1] = knownSsid[i]; knownPass[i - 1] = knownPass[i]; } knownCount--; }
    at = knownCount++;
  }
  knownSsid[at] = ssid; knownPass[at] = pass;
}

void loadWifi() {
  Preferences p; p.begin("uplink", true);
  knownCount = min((int)p.getUChar("count", 0), MAX_NETS);
  for (int i = 0; i < knownCount; i++) { knownSsid[i] = p.getString(("s" + String(i)).c_str(), ""); knownPass[i] = p.getString(("p" + String(i)).c_str(), ""); }
  String oldSsid = p.getString("ssid", COMPANION_WIFI_SSID), oldPass = p.getString("pass", COMPANION_WIFI_PASSWORD);
  serverUrl = p.getString("server", COMPANION_SERVER);
  freshNets = p.getString("fresh", ""); forgotNets = p.getString("forgot", ""); netsRevHave = p.getLong("rev", -1);   // C-93
  p.end();
  loadAway();                                // C-82
  if (!knownCount && oldSsid.length()) {     // the one network kept before there were several becomes the first
    knownSsid[0] = oldSsid; knownPass[0] = oldPass; knownCount = 1;
    saveNetworks();
    Preferences q; q.begin("uplink", false); q.remove("ssid"); q.remove("pass"); q.end();
  }
}

// Learn a network (or its new password) and join it now.
void learnNetwork(const String &ssid, const String &pass, const String &server) {
  keepNetwork(ssid, pass);
  if (server.length()) serverUrl = server;
  saveNetworks();
  freshNets = addTo(freshNets, ssid); forgotNets = dropFrom(forgotNets, ssid); saveSync();   // C-93: for every device
  WiFi.disconnect();
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid.c_str(), pass.c_str());
}

static void dropNetwork(int i) {
  for (int k = i + 1; k < knownCount; k++) { knownSsid[k - 1] = knownSsid[k]; knownPass[k - 1] = knownPass[k]; }
  knownCount--;
}
void forgetNetwork(int i) {
  if (i < 0 || i >= knownCount) return;
  String gone = knownSsid[i];
  dropNetwork(i);
  saveNetworks();
  forgotNets = addTo(forgotNets, gone); freshNets = dropFrom(freshNets, gone); saveSync();   // C-93: and on every device
}
int networkIndex(const String &ssid) { for (int i = 0; i < knownCount; i++) if (knownSsid[i] == ssid) return i; return -1; }

// C-93: the shared list, as the server hands it to a board that proved itself -- learned (not joined), new passwords
// taken, the forgotten dropped. The server has merged what this board told it, so nothing here is fresh any more.
bool takeShared(const String &json) {
  JsonDocument d;
  if (deserializeJson(d, json) || !d["shared"].is<JsonArray>()) return false;
  for (JsonVariant f : d["forget"].as<JsonArray>()) {
    int at = networkIndex(f | "");
    if (at >= 0) dropNetwork(at);
  }
  for (JsonVariant n : d["shared"].as<JsonArray>()) {
    String ssid = n["ssid"] | "", pass = n["password"] | "";
    int at = networkIndex(ssid);
    if (ssid.length() && (at < 0 || knownPass[at] != pass)) keepNetwork(ssid, pass);
  }
  saveNetworks();
  freshNets = ""; forgotNets = ""; netsRevHave = d["rev"] | -1L; saveSync();
  return true;
}
// The state names the shared list's revision: a board behind it reports, and takes the list back.
void netsRevSeen(long rev) { if (rev >= 0 && rev != netsRevHave) netsDue = true; }

// Join the strongest known network in range: a scan in the background, then WiFi.begin.
uint32_t wifiTriedAt = 0; bool wifiScanning = false;
void uplinkLoop(uint32_t now) {
  if (!wifiSet() || WiFi.status() == WL_CONNECTED) return;
  if (!wifiScanning) {
    if (wifiTriedAt && now - wifiTriedAt < 20000) return;   // give a join time before looking again
    WiFi.mode(WIFI_STA);
    WiFi.scanNetworks(true);
    wifiScanning = true; wifiTriedAt = now;
    return;
  }
  int n = WiFi.scanComplete();
  if (n == WIFI_SCAN_RUNNING) return;
  wifiScanning = false;
  int best = -1, bestRssi = -1000;
  for (int i = 0; i < max(n, 0); i++)
    for (int k = 0; k < knownCount; k++)
      if (WiFi.SSID(i) == knownSsid[k] && WiFi.RSSI(i) > bestRssi) { best = k; bestRssi = WiFi.RSSI(i); }
  WiFi.scanDelete();
  if (best >= 0) WiFi.begin(knownSsid[best].c_str(), knownPass[best].c_str());
  wifiTriedAt = now;
}

// Names for the site, always; with `secrets`, every network with its password and whether it was learned here since the
// server last heard, and what was forgotten here.
String networksJson(bool secrets) {
  JsonDocument d;
  JsonArray a = d["networks"].to<JsonArray>();
  for (int i = 0; i < knownCount; i++) a.add(knownSsid[i]);
  d["current"] = WiFi.status() == WL_CONNECTED ? WiFi.SSID() : "";
  if (secrets) {
    JsonArray k = d["known"].to<JsonArray>();
    for (int i = 0; i < knownCount; i++) {
      JsonObject n = k.add<JsonObject>();
      n["ssid"] = knownSsid[i]; n["password"] = knownPass[i]; n["fresh"] = inList(freshNets, knownSsid[i]);
    }
    JsonArray f = d["forgot"].to<JsonArray>();
    int from = 0;
    while (from < (int)forgotNets.length()) {
      int nl = forgotNets.indexOf('\n', from); if (nl < 0) nl = forgotNets.length();
      if (nl > from) f.add(forgotNets.substring(from, nl));
      from = nl + 1;
    }
  }
  String out; serializeJson(d, out);
  return out;
}

// ---- C-82: away from home, on its own Wi-Fi (a phone's hotspot, a cafe) -------------------------------------------------
// The relay (the user's public n8n, docs/REMOTE.md) carries a board's requests as it carries the phone's: an envelope,
// {method, path, body}, with the board's OWN key as its Bearer -- the server knows the board by it, and lets it reach the
// device's own door and nothing else. The relay's address and the key come only down the cable, in the state the
// bridge carries (as a Wi-Fi password does, C-33), and are kept in flash. Over HTTPS, checked against RELAY_CA.
String relayUrl, relayKey;
static uint32_t awayAt = 0;                            // when home last failed to answer and the relay was asked instead
static const uint32_t AWAY_MS = 60000;                 // ... and for a minute after, the relay first (home is tried again)
bool relaySet() { return relayUrl.startsWith("https://") && relayKey.length() >= 16; }
bool viaRelay() { return awayAt && millis() - awayAt < AWAY_MS; }

void loadAway() { Preferences p; p.begin("away", true); relayUrl = p.getString("url", ""); relayKey = p.getString("key", ""); p.end(); }
void takeAway(const String &url, const String &key) {
  if (url == relayUrl && key == relayKey) return;
  relayUrl = url; relayKey = key;
  Preferences p; p.begin("away", false); p.putString("url", url); p.putString("key", key); p.end();
}

static String relayHttp(const char *method, const String &path, const String &body, int *code) {
  WiFiClientSecure tls;
  tls.setCACert(RELAY_CA);
  HTTPClient h;
  h.setTimeout(15000);                                 // n8n, then home, then back
  *code = -1;
  if (!h.begin(tls, relayUrl)) return "";
  h.addHeader("authorization", "Bearer " + relayKey);
  h.addHeader("content-type", "application/json");
  String env = String("{\"method\":\"") + method + "\",\"path\":\"" + path + "\"";
  if (!strcmp(method, "POST")) env += ",\"body\":" + (body.length() ? body : String("{}"));
  *code = h.POST(env + "}");
  String out = *code == 200 ? h.getString() : "";
  h.end();
  return out;
}

// ---- the server ------------------------------------------------------------------------------------------------------
// One request to the server over Wi-Fi -- home, or away through the relay (C-82); the answer's body, or "" with *ok false.
String http(const char *method, const String &path, const String &body, bool *ok) {
  if (ok) *ok = false;
  if (!online()) return "";
  int code = -1;
  String out;
  if (serverUrl.length() && !viaRelay()) {
    HTTPClient h;
    h.setConnectTimeout(relaySet() ? 1500 : 4000);     // away, home's address answers nothing: give up on it quickly
    h.setTimeout(4000);
    h.begin(serverUrl + path);
    h.addHeader("x-device", deviceId());               // C-80: which device is asking
    if (relayKey.length() >= 16) h.addHeader("authorization", "Bearer " + relayKey);   // C-93: its own key, at home too
    if (!strcmp(method, "POST")) { h.addHeader("content-type", "application/json"); code = h.POST(body); }
    else code = h.GET();
    out = code == 200 ? h.getString() : "";
    h.end();
  }
  if (code < 0 && relaySet()) {                        // home did not answer at all (a refusal is an answer): the relay
    out = relayHttp(method, path, body, &code);
    awayAt = code > 0 ? millis() : 0;                  // the relay answered (even "home is asleep"): away, for a while
  } else if (code > 0) awayAt = 0;
  if (ok) *ok = code == 200;
  return out;
}

bool httpState(const char *method, const String &path, const String &body) {
  bool ok;
  String got = http(method, path, body, &ok);
  return ok && takeState(got);
}

bool usbLive() { return usbSeen && millis() - usbSeen < USB_FRESH_MS; }
// C-55: the phone, over Bluetooth, is a bridge as the cable is -- the same lines, both ways. The cable wins when both
// are here, so nothing is ever said twice.
// C-57: no freshness for the phone. A cable can sit plugged in with no bridge behind it, so USB must be heard from;
// a paired phone that is connected and listening IS the app (iOS wakes it for each line, even in a pocket), and it
// goes quiet in the background because iOS pauses its timers, not because it has gone.
bool phoneLive() { return phoneSeen && linkPhoneHere(); }
bool bridgeLive() { return usbLive() || phoneLive(); }
void bridge(const String &line) { if (usbLive()) Serial.println(line); else linkSend(line); }

// ---- C-32: the site and the device, linked. The site's COMMANDS arrive down the cable (CMD lines, from the bridge) or
// over Wi-Fi (GET /api/device/commands); each is answered with a RESULT the same way. LIST asks what routines this
// board has, so the site's list is the board's own.
String routinesJson() {
  JsonDocument d;
  d["firmware"] = String(board.id) + " 3 " + COMPANION_BUILD;   // C-91: which build, for the site
  JsonArray list = d["types"].to<JsonArray>();
  for (int i = 0; i < typeCount; i++) {
    JsonObject t = list.add<JsonObject>();
    t["name"] = types[i].name; t["radio"] = types[i].radio;
    JsonArray r = t["routines"].to<JsonArray>();
    for (int k = 0; k < types[i].count; k++) r.add(types[i].routines[k].name);
  }
  String out; serializeJson(d, out);
  return out;
}

void sendResult(long id, bool ok, const String &text) {
  JsonDocument d; d["id"] = id; d["ok"] = ok; d["text"] = text;
  String out; serializeJson(d, out);
  if (bridgeLive()) bridge("RESULT " + out);
  else http("POST", "/api/device/results", out);
}

void runRoutine();
void report(const String &kind, const String &detail);
void handleCommand(JsonVariant c) {
  long id = c["id"] | -1;
  String type = c["type"] | "";
  wake();
  if (type == "run") {
    String want = c["routine"] | "";
    if (!st.carrying) return sendResult(id, false, "Routines are a daemon's: send one to the board from the game first.");
    for (int i = 0; i < typeCount; i++)
      for (int k = 0; k < types[i].count; k++)
        if (want == String(types[i].name) + "/" + types[i].routines[k].name) {
          if (types[i].routines[k].run == runTheaterMode)   // it holds the board's controls until the top button
            return sendResult(id, false, "THEATER MODE is run on the board itself: it makes the dial and the button the remote.");
          typeAt = i; routineAt = k;
          runRoutine();
          return sendResult(id, true, runResult);
        }
    return sendResult(id, false, "This board has no routine " + want + ".");
  }
  if (type == "ir") {                         // C-34: one IR code from the site's search
    String code = c["code"] | "0";
    String out = runFlareCode(c["protocol"] | "", strtoull(code.c_str(), nullptr, 0), c["bits"] | 0, c["repeat"] | 0,
                              c["keep"] | false);
    for (int i = 0; i < typeCount; i++) if (!strcmp(types[i].name, "FLARE")) typeAt = i;
    runResult = out; screen = RUN; dirty = true;
    report("routine", "FLARE/" + String((const char *)(c["label"] | "A CODE FROM THE SITE")));
    return sendResult(id, !out.startsWith("Could not"), out);
  }
  if (type == "network") {                    // C-52: the site forgets a network (C-93: by name, everywhere)
    int index = c["ssid"].is<const char *>() ? networkIndex(c["ssid"] | "") : (c["index"] | -1);
    String gone = index >= 0 && index < knownCount ? knownSsid[index] : "";
    forgetNetwork(index);
    reportNetworks();
    return sendResult(id, gone.length() > 0, gone.length() ? "Forgot " + gone + "." : "No such network.");
  }
  if (type == "remote") {                     // C-51: the site manages the remotes
    String op = c["op"] | "", out;
    int index = c["index"] | -1;
    if (op == "activate") { flareSetActive(index); out = daemonName() + " uses " + flareName(flareActive()) + " now."; }
    else if (op == "remove") out = flareRemove(index);
    else if (op == "rename") out = flareRename(index, c["name"] | "");          // C-59
    else if (op == "add") {
      String proto[3]; uint64_t value[3]; uint16_t bits[3], repeat[3];
      JsonArray b = c["buttons"].as<JsonArray>();
      if (b.size() != 3) return sendResult(id, false, "A remote is three buttons: power, volume up, volume down.");
      for (int i = 0; i < 3; i++) {
        proto[i] = b[i]["protocol"] | ""; String code = b[i]["code"] | "0";
        value[i] = strtoull(code.c_str(), nullptr, 0); bits[i] = b[i]["bits"] | 0; repeat[i] = b[i]["repeat"] | 0;
      }
      out = flareAdd(c["name"] | "A REMOTE", proto, value, bits, repeat);
    } else return sendResult(id, false, "No such remote operation.");
    reportRemotes();
    return sendResult(id, true, out);
  }
  if (type == "wifi") {                       // C-33: only ever arrives down the cable
    String ssid = c["ssid"] | "";
    learnNetwork(ssid, c["password"] | "", c["server"] | "");
    say("Learned it");
    reportNetworks();
    return sendResult(id, true, daemonName() + " learned " + ssid + ", and joins it whenever it is near.");
  }
  sendResult(id, false, "This board does not know the command " + type + ".");
}

// C-51, C-52: the board's remotes and networks, for the site -- down the cable, or over Wi-Fi
void reportRemotes() {
  if (bridgeLive()) bridge("REMOTES " + flareRemotesJson());
  else http("POST", "/api/device/remotes", flareRemotesJson());
}
// C-93: down the cable, with the passwords (the bridge, on the server's own machine, hands back the shared list as NETS);
// over the phone's Bluetooth, names only; over Wi-Fi, with them only when this board has its own key to prove itself.
void reportNetworks() {
  netsDue = false;
  if (usbLive()) { Serial.println("NETWORKS " + networksJson(true)); return; }
  if (phoneLive()) { linkSend("NETWORKS " + networksJson(false)); return; }
  bool ok;
  String got = http("POST", "/api/device/networks", networksJson(relayKey.length() >= 16), &ok);
  if (ok) takeShared(got);
}

String artTold = "not asked";               // C-97: how the last fetch of the daemon's picture went
bool routinesPosted = false;
uint32_t commandsAt = 0;
void pollCommands(uint32_t now) {
  if (!routinesPosted) {
    routinesPosted = !http("POST", "/api/device/routines", routinesJson()).isEmpty();
    if (routinesPosted) { reportRemotes(); reportNetworks(); }
  }
  if (now - commandsAt < (viaRelay() ? 20000u : 2000u)) return;   // C-82: each one through the relay is an n8n run
  commandsAt = now;
  bool ok;
  String got = http("GET", "/api/device/commands", "", &ok);
  if (!ok) return;
  JsonDocument d;
  if (deserializeJson(d, got)) return;
  for (JsonVariant c : d["commands"].as<JsonArray>()) handleCommand(c);
}

// SHOT: the screen as it is, down the cable -- so the layout can be checked without looking at the board
// (shot.py on the computer makes it a PNG). The sprite's own 16-bit pixels, as stored, base64 in lines.
void shot() {
  const uint8_t *px = (const uint8_t *)canvas.getBuffer();
  int bpp = canvas.getColorDepth() > 8 ? 2 : 1;           // C-97: the M5GO draws in 256 colours (RGB332), one byte each
  Serial.printf("SHOT %d %d %d\n", W, H, bpp * 8);
  static unsigned char line[1025];
  for (size_t at = 0; at < (size_t)W * H * bpp; at += 768) {
    size_t n = min((size_t)768, (size_t)W * H * bpp - at), got = 0;
    mbedtls_base64_encode(line, sizeof line, &got, px + at, n);
    Serial.write(line, got); Serial.write('\n');
  }
  Serial.println("SHOT END");
}

// One line from a bridge -- the cable's (usb_bridge.py) or the phone's (C-55, over Bluetooth) -- answered the way it came.
void handleLine(String line, bool fromPhone) {
  auto reply = [&](const String &out) { if (fromPhone) linkSend(out); else Serial.println(out); };
  uint32_t &seen = fromPhone ? phoneSeen : usbSeen;
  line.trim();
  if (line.startsWith("STATE ")) {
    if (takeState(line.substring(6))) seen = millis();
    else reply("UNREAD " + String(line.length()));   // the bridge says so, rather than the corner silently not changing
  }
  else if (line.startsWith("ART ")) { if (!takeArt(line.substring(4))) reply("UNREAD " + String(line.length())); }
  else if (line.startsWith("CELEBRATE ")) celebrate(line.substring(10));   // C-50, from the bridge
  else if (line == "SHOT" && !fromPhone) shot();
  else if (line == "LIST") { reply("ROUTINES " + routinesJson()); reply("REMOTES " + flareRemotesJson());
                             reply("NETWORKS " + networksJson(!fromPhone)); }
  else if (line.startsWith("NETS ") && !fromPhone) takeShared(line.substring(5));   // C-93: the shared list, by cable only
  else if (line.startsWith("MESH") && !fromPhone) {   // C-72: the LoRa radio, from the computer -- a bench test with two boards
    // MESH? (the radio, the band, who is near) | MESH BEACON | MESH CALL | MESH WAVE [tag] | MESH SAY <tag|*> word
    String rest = line.length() > 5 ? line.substring(5) : "";
    if (line == "MESH?") reply("MESH " + loraStatus());
    else if (rest == "BEACON" || rest == "CALL") reply(loraSend(rest == "CALL" ? 4 : 1, 0, "") ? "MESH sent" : "MESH not sent (no radio, or nothing carried)");
    else if (rest.startsWith("WAVE")) reply(loraSend(2, rest.length() > 5 ? strtoul(rest.substring(5).c_str(), nullptr, 16) : 0, "") ? "MESH sent" : "MESH not sent");
    else if (rest.startsWith("SAY ")) {
      String r = rest.substring(4); int sp = r.indexOf(' ');
      String to = sp < 0 ? r : r.substring(0, sp), word = sp < 0 ? "" : r.substring(sp + 1);
      reply(loraSend(3, to == "*" ? 0 : strtoul(to.c_str(), nullptr, 16), word) ? "MESH sent" : "MESH not sent");
    }
  }
  else if (line.startsWith("KEY ") && !fromPhone) {   // the controls, from the computer, for a check with SHOT
    String k = line.substring(4);
    if (k == "RIGHT") turn(1); else if (k == "LEFT") turn(-1);
    else if (k == "PRESS") { if (!wake()) press(); }
    else if (k == "BACK") { if (!wake()) back(); }
    if (!asleep) draw();
  }
  else if (line.startsWith("CMD ")) {
    JsonDocument d;
    if (deserializeJson(d, line.substring(4))) reply("UNREAD " + String(line.length()));
    else if (fromPhone && String(d["type"] | "") == "wifi") reply("UNREAD wifi");   // C-33: a password only down the cable
    else handleCommand(d.as<JsonVariant>());
  }
  else if (line.startsWith("GO ") && !fromPhone) {   // with SHOT, to check a screen from the computer: GO TODAY|DAEMON|INDEX|ROUTINES|DAY|PARTY
    String to = line.substring(3);
    wake();
    screen = to == "INDEX" && st.carrying ? INDEX_ENTRY : to == "PARTY" ? PARTY : HOME;   // C-68: GO PARTY
    entryTop = 0;
    page = to == "DAEMON" || to == "INDEX" ? DAEMON : to == "ROUTINES" ? ROUTINES_PAGE : to == "DAY" ? DAY_PAGE : TODAY;
    draw();
  }
  else if (line == "EARTEST" && !fromPhone) { String radioEarTest(); reply(radioEarTest()); }   // C-101
  else if (line.startsWith("RUN ") && !fromPhone) {   // C-101: RUN <type> <n> -- a routine started from the computer, for a check
    String rest = line.substring(4); int sp = rest.indexOf(' ');
    String name = sp < 0 ? rest : rest.substring(0, sp); int n = sp < 0 ? 0 : rest.substring(sp + 1).toInt();
    int at = -1; for (int i = 0; i < typeCount; i++) if (name == types[i].name) at = i;
    if (at < 0 || n < 0 || n >= types[at].count) reply("RUN no such routine");
    else { wake(); typeAt = at; routineAt = n; screen = LIST; runRoutine(); }
  }
  else if (line.startsWith("TALK ") && !fromPhone) {   // C-66: a check from the computer -- listen this many ms, then answer
    wake(); talkByCable = line.endsWith(" cable");
    talkHold(constrain(line.substring(5).toInt(), 500, 8000));
    talkByCable = false;
    reply("TALKDONE " + String(talkStatus.length() ? talkStatus : String("ok")) + " | peak " + talkPeak + " rms " + talkRms +
          " | heard: " + talkHeard + " | answer: " + talkAnswer.substring(0, 160));
    draw();
  }
  else if (line.startsWith("BATTEST ") && !fromPhone) { batteryFake(line.substring(8).toInt()); reply("BATTEST ok"); }
  else if (line.startsWith("BRAIN") && !fromPhone) {  // C-76: the offline brain's link -- BRAIN tcp host[:port] | uart | off
    if (line.length() > 6 && !brainSet(line.substring(6))) reply("BRAIN? tcp <host>[:port] | uart | off");
    else reply("BRAIN " + brainDescribe());
  }
  else if (line.startsWith("PANEL ") && !fromPhone && board.kind == BoardKind::M5CoreS3) {   // C-75: PANEL C | E, then it restarts
    Preferences p; p.begin("board", false); p.putString("panel", line.substring(6) == "E" ? "E" : "C"); p.end();
    reply("PANEL " + String(line.substring(6) == "E" ? "E" : "C") + " -- restarting"); cableFlush(); delay(100); ESP.restart();
  }
  else if (line.startsWith("RATETEST ") && !fromPhone) { soundDacRate(line.substring(9).toInt()); reply("RATETEST " + String(soundRateTest()) + " ms for 2000 at " + line.substring(9)); }
  else if (line == "RATETEST" && !fromPhone) reply("RATETEST " + String(soundRateTest()) + " ms for 2000");   // C-95
  else if (line == "MEM" && !fromPhone)                // C-97: what the board has to work with, and its picture
    reply("MEM heap " + String(ESP.getFreeHeap()) + " largest " + String(ESP.getMaxAllocHeap()) + " | art have " + artKeyHave +
          " want " + st.daemon.artKey + " | last " + artTold);
  else if (line == "WATCH" && !fromPhone) reply(watchStatus());   // C-98
  else if (line == "PING") { seen = millis(); reply("PONG"); }
}

void readUsb() {
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\n') { handleLine(lineIn, false); lineIn = ""; }
    else if (lineIn.length() < 6000) lineIn += c;   // an ART line is ~3 KB
  }
}

// C-15: what the meeting radio heard, and this board's own tag, told to the server -- through a bridge (MET, BEACON
// lines) or over Wi-Fi; kept a while when there is neither. A meeting is a small event: a flash and a word, never a
// sound and never on a sleeping board (it must never pester).
std::vector<String> metWaiting, saidWaiting;
String beaconTold;
void meetReport() {
  int species; String tag; bool mine;
  while (meetTakeHeard(species, tag, mine)) {
    if (metWaiting.size() < 8) metWaiting.push_back(String(species) + " " + tag);
    if (!mine && !asleep) { ledsFlash(); say("A daemon nearby"); }
  }
  int relayed; String dir, kind, text;                            // C-72: the same over LoRa, with how far it came
  while (loraTakeHeard(species, tag, relayed, mine)) {
    if (metWaiting.size() < 8) metWaiting.push_back(String(species) + " " + tag + " lora " + String(relayed));
    if (!mine && !asleep) { ledsFlash(); say("A daemon nearby"); }
  }
  while (loraTakeSaid(dir, kind, species, tag, relayed, text))
    if (saidWaiting.size() < 8) saidWaiting.push_back(dir + " " + kind + " " + String(species) + " " + tag + " " + String(relayed) + " " + text);
  bool link = bridgeLive() || online();
  if (!link) return;
  String listen;
  if (meetTakeListen(listen)) {
    if (bridgeLive()) bridge(listen);
    else {
      int a = listen.indexOf(' ', 7), b = listen.indexOf(' ', a + 1);
      http("POST", "/api/device/listen", "{\"started\":" + listen.substring(7, a) + ",\"devices\":" + listen.substring(a + 1, b) +
           ",\"beacons\":" + listen.substring(b + 1) + "}");
    }
  }
  String own = meetOwnPeer();
  if (own.length() && own != beaconTold) {
    if (bridgeLive()) bridge("BEACON " + own);
    else if (http("POST", "/api/device/beacon", "{\"peer\":\"" + own + "\"}").isEmpty()) return;
    beaconTold = own;
  }
  while (!metWaiting.empty()) {
    String m = metWaiting.front();
    if (bridgeLive()) bridge("MET " + m);
    else {
      int sp = m.indexOf(' '), sp2 = m.indexOf(' ', sp + 1);
      String peer = sp2 < 0 ? m.substring(sp + 1) : m.substring(sp + 1, sp2);
      String body = "{\"species\":\"" + m.substring(0, sp) + "\",\"peer\":\"" + peer + "\"" +
                    (sp2 < 0 ? "" : ",\"how\":\"lora\",\"hops\":" + m.substring(m.lastIndexOf(' ') + 1)) + "}";
      if (http("POST", "/api/device/met", body).isEmpty()) return;
    }
    metWaiting.erase(metWaiting.begin());
  }
  while (!saidWaiting.empty()) {                                  // C-72: a wave or a word, in or out
    String m = saidWaiting.front();
    if (bridgeLive()) bridge("SAID " + m);
    else {
      JsonDocument d; int a = 0;
      const char *keys[] = { "dir", "kind", "species", "peer", "hops" };
      for (int k = 0; k < 5; k++) { int b = m.indexOf(' ', a); d[keys[k]] = m.substring(a, b); a = b + 1; }
      d["hops"] = d["hops"].as<String>().toInt(); d["text"] = m.substring(a);
      String body; serializeJson(d, body);
      if (http("POST", "/api/device/message", body).isEmpty()) return;
    }
    saidWaiting.erase(saidWaiting.begin());
  }
}

void readPhone() {                                  // C-55
  String line;
  for (int i = 0; i < 4 && linkTake(line); i++) handleLine(line, true);
}

// C-13: using the device is tending the daemon. Each routine run is told to the server -- over the cable through the
// bridge (an INTERACT line), or over Wi-Fi -- where the daemon's life will read it.
void report(const String &kind, const String &detail) {
  if (bridgeLive()) { bridge("INTERACT " + kind + " " + detail); return; }
  JsonDocument d; d["kind"] = kind; d["detail"] = detail;
  String body; serializeJson(d, body);
  if (http("POST", "/api/device/interact", body).length()) httpState("GET", "/api/device/state", "");   // its new life
}

// C-36: the device asks for its daemon's art when the state names art it does not have -- through the bridge (ART?),
// or over Wi-Fi itself. At most every five seconds, so a missing server is not asked in a loop.
void askForArt() {
  if (!st.carrying || !st.daemon.artKey.length() || st.daemon.artKey == artKeyHave) return;
  if (artAskedAt && millis() - artAskedAt < 5000) return;
  artAskedAt = millis();
  if (bridgeLive()) { bridge("ART?"); return; }
  bool ok;
  String got = http("GET", "/api/device/art", "", &ok);
  artTold = !ok ? "fetch failed (" + String(got.length()) + " bytes)" : takeArt(got) ? "taken" : "unread (" + String(got.length()) + " bytes)";
}


// C-63: the battery, read every 20 s; the server hears about it when it changes enough to matter (over Wi-Fi -- the
// cable and the phone carry it later).
static uint32_t batAt = 0, batToldAt = 0;
static int batToldPct = -100; static bool batToldCharging = false;
static bool batWarned = false; static int batEmptyReads = 0;
static int batFakePct = -1; static uint32_t batFakeUntil = 0;     // BATTEST <pct>: a check from the computer, 30 s
void batteryFake(int pct) { batFakePct = pct; batFakeUntil = millis() + 30000; batAt = 0; }

// C-63, the user's rule: warn at 15%, sleep at 5%. The sleep is the chip's deep sleep, so the cell is not run flat: only
// the top button wakes it (the board starts again), and a board still empty shows the word and sleeps again.
static void batteryRules() {
  if (!bat.present || bat.percent < 0 || bat.usb) { batWarned = false; batEmptyReads = 0; return; }
  if (bat.percent > 17) batWarned = false;
  if (bat.percent <= 15 && !batWarned) { batWarned = true; say("BATTERY LOW"); }    // DRAFT
  batEmptyReads = bat.percent <= 5 ? batEmptyReads + 1 : 0;                       // twice, so one bad read cannot
  if (batEmptyReads < 2) return;
  if (batFakeUntil) { say("WOULD SLEEP NOW"); Serial.println("BATTEST would sleep now"); return; }   // a check never sleeps it
  say("CHARGE ME"); draw(); delay(2000);                                           // DRAFT
  ledsSleep(true); backlight(false);
  if (boardPowerOff()) return;                                                     // C-75: the CoreS3 switches itself off
  int wakePin = board.sideKey >= 0 ? board.sideKey : board.encKey;                 // the top button (C-79)
  esp_sleep_enable_ext0_wakeup((gpio_num_t)wakePin, 0);
  esp_deep_sleep_start();
}

void batteryLoop(uint32_t now) {
  if (batAt == 0 || now - batAt > 20000) {                   // C-63: the battery, and the server told when it matters
    batAt = now;
    Battery was = bat;
    batteryRead(bat);
    if (batFakeUntil && now > batFakeUntil) { batFakeUntil = 0; batWarned = false; batEmptyReads = 0; }
    if (batFakeUntil) { bat.present = true; bat.percent = batFakePct; bat.usb = false; bat.charging = false; }
    if (bat.percent != was.percent || bat.charging != was.charging || bat.usb != was.usb) dirty = true;
    batteryRules();
    bool tell = bat.present && (abs(bat.percent - batToldPct) >= 5 || bat.charging != batToldCharging || now - batToldAt > 600000);
    if (tell && bridgeLive()) {                                // C-104: down the cable or through the phone -- it never was
      batToldAt = now; batToldPct = bat.percent; batToldCharging = bat.charging;
      bridge("BATTERY " + String(bat.percent) + " " + String(bat.mv) + " " + (bat.charging ? 1 : 0) + " " + (bat.full ? 1 : 0) + " " + (bat.usb ? 1 : 0));
    } else if (tell && online()) {                             // over Wi-Fi
      batToldAt = now; batToldPct = bat.percent; batToldCharging = bat.charging;
      http("POST", "/api/device/battery", String("{\"percent\":") + bat.percent + ",\"mv\":" + bat.mv +
           ",\"charging\":" + (bat.charging ? "true" : "false") + ",\"full\":" + (bat.full ? "true" : "false") +
           ",\"usb\":" + (bat.usb ? "true" : "false") + "}");
    }
  }
}
