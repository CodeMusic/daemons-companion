// C-26: the companion on the LilyGO T-Embed CC1101 -- the first firmware. It shows what GET /api/device/state says
// (the day's colour, note and virtue, the season, the ONE next step, and the daemon you carry) and ticks the step off
// when the encoder is pressed (POST /api/device/ticks).
//
// Two ways to the server, the same protocol:
//   Wi-Fi  -- with include/secrets.h (copied from secrets.example.h; never committed), it asks the server itself.
//   USB    -- usb_bridge.py on the computer relays it over this cable: the device prints HELLO and TICK lines, the
//             bridge answers with STATE lines. No network password needed; this is how it is first tried.
// If both are there, a bridge that has spoken in the last 15 seconds wins.
//
// Turn the encoder: TODAY, DAEMON, ROUTINES. Press it: the step is done (TODAY), or open ROUTINES. The top button: back.
#include <Arduino.h>
#include <ArduinoJson.h>
#include <TFT_eSPI.h>
#include <WiFi.h>           // always: UPLINK's scan works over USB too, without joining a network
#include "radios.h"
#include "leds.h"
#include "sound.h"
#include "link.h"
#include "meet.h"
#include <mbedtls/base64.h>

#include <HTTPClient.h>
#include <Preferences.h>
// C-33, C-52: the Wi-Fi is set at run time -- from the site, down the cable, or on the board (UPLINK / TEACH A NETWORK) -- and
// kept in the board's own flash. A secrets.h, if there is one, is only the default for a board that has none yet.
#if __has_include("secrets.h")
#include "secrets.h"
#endif
#ifndef COMPANION_WIFI_SSID
#define COMPANION_WIFI_SSID ""
#define COMPANION_WIFI_PASSWORD ""
#define COMPANION_SERVER ""
#endif

// LilyGO's own pin map (examples/utilities.h): the peripherals' power, the encoder, and the top button (BOARD_USER_KEY).
static const int PIN_PWR_EN = 15, PIN_ENC_A = 4, PIN_ENC_B = 5, PIN_ENC_KEY = 0, PIN_SIDE_KEY = 6;
static const int W = 320, H = 170;                       // landscape
static const uint32_t POLL_MS = 30000, USB_FRESH_MS = 15000, HELLO_MS = 3000;

TFT_eSPI tft;
TFT_eSprite canvas(&tft);   // drawn whole, then pushed, so nothing flickers

struct Daemon { String name, nickname, holding, category, entry, types, artKey; int level = 0, friendship = 0, species = 0;
                String word, cue; int fed = 0, watered = 0, due = 0;              // C-13: its life, as the server reads it
                int grownTo = 0; };                                               // C-45: the level it has grown to here
struct State {
  bool have = false;
  String date, edition, season, day, colour = "#5b6b8c", menu = "#5b6b8c", led = "#4060ff", note, virtue;
  long step = -1; String stepText, goal, milestone; int msAt = 0, msOf = 0;   // C-49: its milestone, if in one
  bool carrying = false; Daemon daemon;
} st;

// ---- where you are -------------------------------------------------------------------------------------------------
// HOME turns between TODAY, DAEMON and ROUTINES with the encoder. ROUTINES opens a list of routine TYPES, a type opens
// its ROUTINES, a routine RUNs. The encoder's press goes in (or ticks the step, on TODAY); the top button goes back.
enum Page { TODAY, DAEMON, ROUTINES_PAGE };
// INDEX_ENTRY: the carried daemon's (C-36). PICK_NET and TYPE_PASS: joining a network on the board (C-33).
// CARE: what you can do for the carried daemon (C-13) -- feed, water, train, or read its INDEX entry.
enum Screen { HOME, TYPES, LIST, RUN, INDEX_ENTRY, PICK_NET, TYPE_PASS, CARE, PICK_REMOTE };   // PICK_REMOTE: C-51
static const char *CARE_ITEMS[] = { "FEED", "WATER", "TRAIN", "ITS INDEX ENTRY" };
int careAt = 0; uint32_t hopUntil = 0;
int remoteAt = 0; bool pickRemoteNext = false;   // C-51: CHOOSE A REMOTE
Page page = TODAY;
Screen screen = HOME;
int typeAt = 0, routineAt = 0;
// C-33: joining a network on the board -- the networks in range, then the password on a letter wheel. WHEEL[0] is OK.
String nets[12]; int netRssi[12], netCount = 0, netAt = 0, wheelAt = 1; String typed; bool joinNext = false;
// ("\x01" "abc...", two literals: "\x01abcdef" in one is a single hex escape that eats a-f -- seen with SHOT)
static const char WHEEL[] = "\x01" "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 !@#$%^&*()-_=+.,?/:;'\"<>[]{}|\\~`";
static const int WHEEL_N = sizeof(WHEEL) - 1;
String runResult;
uint32_t usbSeen = 0, phoneSeen = 0, lastPoll = 0, lastHello = 0, flashUntil = 0;
String flash, lineIn;
bool dirty = true;
bool keyWas = true, sideWas = true; uint32_t keyAt = 0, sideAt = 0;
bool wake();                              // C-39, below
// ---- C-43: the board's settings, set on the site and carried in the state; kept in flash for when it is unlinked ----
struct Settings { String home = "daemon"; int sleepAfter = 120; bool sound = true; int volume = 40; int ring = 33;
                  bool meet = true; } cfg;                    // meet: C-15, meeting others nearby
uint32_t lastInput = 0;                   // C-42: any touch; left alone `sleepAfter` seconds, it sleeps
void turn(int step); void press(); void back(); void reportRemotes(); void reportNetworks();
bool asleep = false;                      // C-39, below
long lastDone = -1; String lastDoneText; uint32_t lastDoneAt = 0;   // C-49: the step just done, for its undo
static const uint32_t UNDO_MS = 15000;
bool undoable() { return lastDone >= 0 && millis() - lastDoneAt < UNDO_MS; }
String serverUrl;                         // C-33, below
static const int MAX_NETS = 8;            // C-52: the networks the board has learned
String knownSsid[MAX_NETS], knownPass[MAX_NETS]; int knownCount = 0;

// ---- C-28: the device's ROUTINES -- the board's radios, named in the game's words ----------------------------------
// The user chose the names (2026-10-04): FLARE (IR), WHISPER (Bluetooth), TOUCHSTONE (NFC), LONGWAVE (Sub-GHz), and
// UPLINK (Wi-Fi). Each routine runs on the author's own gear only (CONTEXT.md); the radio ones are in radios.cpp. A type
// with nothing wired yet opens on an empty list, which is fine (LONGWAVE, until it is tried with the board in hand).
typedef String (*RoutineFn)();
struct Routine { const char *name; RoutineFn run; };
struct RoutineType { const char *name; const char *radio; const Routine *routines; int count; };

String runNetworksInRange();
String runChooseRemote();
String runTheaterMode();
static const Routine FLARE_ROUTINES[]      = { { "TEACH A REMOTE", runTeachRemote }, { "POWER", runPower },
                                               { "VOLUME UP", runVolumeUp }, { "VOLUME DOWN", runVolumeDown },
                                               { "THEATER MODE", runTheaterMode }, { "CHOOSE A REMOTE", runChooseRemote } };
static const Routine WHISPER_ROUTINES[]    = { { "PAIR MY PHONE", runPairMyPhone }, { "OPEN TO MY PHONE", runOpenToMyPhone },
                                               { "FORGET MY PHONES", runForgetPhones } };
static const Routine TOUCHSTONE_ROUTINES[] = { { "READ MY TAG", runReadMyTag } };
String runJoinNetwork();
static const Routine UPLINK_ROUTINES[]     = { { "NETWORKS IN RANGE", runNetworksInRange }, { "TEACH A NETWORK", runJoinNetwork } };
static const RoutineType TYPES_LIST[] = {
  { "FLARE",      "IR",        FLARE_ROUTINES,      6 },
  { "WHISPER",    "Bluetooth", WHISPER_ROUTINES,    3 },
  { "TOUCHSTONE", "NFC",       TOUCHSTONE_ROUTINES, 1 },
  { "LONGWAVE",   "Sub-GHz",   nullptr,             0 },
  { "UPLINK",     "Wi-Fi",     UPLINK_ROUTINES,     2 },
};
static const int TYPE_COUNT = sizeof(TYPES_LIST) / sizeof(TYPES_LIST[0]);

// ---- colours: the day's colour, and words that can be read on it ------------------------------------------------
static const uint16_t INK = 0x18E4, PAPER = 0xFFDE, QUIET = 0x8C51;
uint16_t hex565(const String &h) {
  long v = strtol(h.c_str() + 1, nullptr, 16);
  return tft.color565((v >> 16) & 255, (v >> 8) & 255, v & 255);
}
bool lightColour(const String &h) {           // as the app decides (App.tsx onColour)
  long v = strtol(h.c_str() + 1, nullptr, 16);
  auto lin = [](double c) { c /= 255.0; return c <= 0.03928 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * lin((v >> 16) & 255) + 0.7152 * lin((v >> 8) & 255) + 0.0722 * lin(v & 255) > 0.3;
}

void applySettings() {
  soundSettings(cfg.sound, cfg.volume);
  ledsBrightness(cfg.ring);
}

void loadSettings() {
  Preferences p; p.begin("settings", true);
  cfg.home = p.getString("home", cfg.home); cfg.sleepAfter = p.getInt("sleep", cfg.sleepAfter);
  cfg.sound = p.getBool("sound", cfg.sound); cfg.volume = p.getInt("volume", cfg.volume); cfg.ring = p.getInt("ring", cfg.ring);
  cfg.meet = p.getBool("meet", cfg.meet);
  p.end();
  applySettings();
}

void takeSettings(JsonVariant s) {
  Settings got;
  got.home = s["home"] | cfg.home.c_str(); got.sleepAfter = s["sleepAfter"] | cfg.sleepAfter;
  got.sound = s["sound"] | cfg.sound; got.volume = s["volume"] | cfg.volume; got.ring = s["ring"] | cfg.ring;
  got.meet = s["meet"] | cfg.meet;
  if (got.home == cfg.home && got.sleepAfter == cfg.sleepAfter && got.sound == cfg.sound && got.volume == cfg.volume &&
      got.ring == cfg.ring && got.meet == cfg.meet) return;
  cfg = got;
  Preferences p; p.begin("settings", false);
  p.putString("home", cfg.home); p.putInt("sleep", cfg.sleepAfter); p.putBool("sound", cfg.sound);
  p.putInt("volume", cfg.volume); p.putInt("ring", cfg.ring); p.putBool("meet", cfg.meet);
  p.end();
  applySettings();
}

// ---- the state, from the server's JSON ------------------------------------------------------------------------------
bool takeState(const String &json) {
  JsonDocument whole;
  if (deserializeJson(whole, json)) return false;
  // GET /api/device/state is the state; POST /api/device/ticks answers {done, state}.
  JsonVariant doc = whole.as<JsonVariant>();
  if (!whole["state"].isNull()) doc = whole["state"].as<JsonVariant>();
  st.have = true;
  st.date = doc["date"] | ""; st.edition = doc["edition"] | ""; st.season = doc["season"] | "";
  st.day = doc["day"]["name"] | ""; st.colour = doc["day"]["colour"] | "#5b6b8c";
  st.note = doc["day"]["note"] | ""; st.virtue = doc["day"]["virtue"] | "";
  // C-33: where the server is on the Wi-Fi, when it says (it listens on the network) -- kept for when the cable is out
  const char *lan = doc["server"] | "";
  if (strlen(lan) && serverUrl != lan) {
    serverUrl = lan;
    Preferences p; p.begin("uplink", false); p.putString("server", serverUrl); p.end();
  }
  soundDay(st.note);                         // C-40: the interactions are in the day's key
  if (!doc["settings"].isNull()) takeSettings(doc["settings"]);
  meetSetOurs(doc["beacons"] | "");          // C-15: our other companions (the phone) are never a meeting
  st.menu = doc["day"]["menu"] | st.colour.c_str();     // C-37: the tamed rainbow week, else the game's trim
  st.led = doc["day"]["led"] | st.menu.c_str();
  ledsDay(strtol(st.led.c_str() + 1, nullptr, 16));
  if (doc["step"].isNull()) { st.step = -1; st.stepText = ""; st.goal = ""; }
  else {
    st.step = doc["step"]["id"] | -1; st.stepText = doc["step"]["text"] | ""; st.goal = doc["step"]["goal"] | "";
    st.milestone = doc["step"]["milestone"]["title"] | ""; st.msAt = doc["step"]["milestone"]["at"] | 0;
    st.msOf = doc["step"]["milestone"]["of"] | 0;
  }
  st.carrying = !doc["daemon"].isNull();
  if (st.carrying) {
    st.daemon.name = doc["daemon"]["name"] | ""; st.daemon.nickname = doc["daemon"]["nickname"] | "";
    st.daemon.level = doc["daemon"]["level"] | 0; st.daemon.friendship = doc["daemon"]["friendship"] | 0;
    st.daemon.holding = doc["daemon"]["holding"] | "";   // what it held when it was sent (T-374)
    st.daemon.category = doc["daemon"]["category"] | ""; st.daemon.entry = doc["daemon"]["entry"] | "";
    st.daemon.entry.replace("\n", " ");     // the game's line breaks are for its own window; this screen wraps its own
    st.daemon.artKey = doc["daemon"]["artKey"] | "";
    st.daemon.species = doc["daemon"]["species"] | 0;
    JsonVariant lf = doc["daemon"]["life"];
    st.daemon.word = lf["word"] | ""; st.daemon.cue = lf["cue"] | "";
    st.daemon.grownTo = doc["daemon"]["grown"]["level"] | 0;
    st.daemon.fed = lf["fed"]["today"] | 0; st.daemon.watered = lf["watered"]["today"] | 0; st.daemon.due = lf["fed"]["due"] | 0;
    st.daemon.types = "";
    for (JsonVariant t : doc["daemon"]["types"].as<JsonArray>())
      st.daemon.types += (st.daemon.types.length() ? " / " : "") + String((const char *)(t | ""));
  }
  dirty = true;
  return true;
}

// ---- C-36: the carried daemon's art, as the server sends it: sixteen RGB565 colours, 4-bit pixels, 64x64 ----------
uint16_t artPal[16];
uint8_t artPix[2048];
String artKeyHave;                 // whose art is in artPix; the device asks again when the state's artKey differs
uint32_t artAskedAt = 0;

bool takeArt(const String &json) {
  JsonDocument doc;
  if (deserializeJson(doc, json) || (doc["w"] | 0) != 64 || (doc["h"] | 0) != 64) return false;
  JsonArray pal = doc["palette"].as<JsonArray>();
  for (int i = 0; i < 16; i++) artPal[i] = i < (int)pal.size() ? (uint16_t)(pal[i] | 0) : 0;
  const char *b64 = doc["pixels"] | "";
  size_t got = 0;
  if (mbedtls_base64_decode(artPix, sizeof artPix, &got, (const unsigned char *)b64, strlen(b64)) || got != sizeof artPix)
    return false;
  artKeyHave = st.daemon.artKey;
  dirty = true;
  return true;
}

// Index 0 is transparent, as in the game.
void drawArt(int x, int y, int scale) {
  if (!artKeyHave.length() || artKeyHave != st.daemon.artKey) return;
  for (int j = 0; j < 64; j++)
    for (int i = 0; i < 64; i++) {
      uint8_t b = artPix[(j * 64 + i) >> 1], c = (i & 1) ? (b & 15) : (b >> 4);
      if (c) canvas.fillRect(x + i * scale, y + j * scale, scale, scale, artPal[c]);
    }
}

// ---- drawing --------------------------------------------------------------------------------------------------------
int wrap(const String &text, int x, int y, int w, int font, int lineH, int maxLines, uint16_t colour) {
  canvas.setTextFont(font); canvas.setTextColor(colour); canvas.setTextDatum(TL_DATUM);
  String line, word; int lines = 0;
  auto flush = [&]() { if (lines < maxLines) canvas.drawString(line, x, y + lines * lineH); lines++; line = ""; };
  for (unsigned i = 0; i <= text.length(); i++) {
    char c = i < text.length() ? text[i] : ' ';
    if (c == '\n') {                         // a line of its own: finish the word and the line
      if (word.length()) { line = line.length() ? line + " " + word : word; word = ""; }
      flush();
      continue;
    }
    if (c != ' ') { word += c; continue; }
    if (!word.length()) continue;
    String tryLine = line.length() ? line + " " + word : word;
    if (canvas.textWidth(tryLine) > w && line.length()) { flush(); line = word; } else line = tryLine;
    word = "";
  }
  if (line.length()) flush();
  return lines;
}

String upper(String s) { s.toUpperCase(); return s; }

// ---- C-33: the board's own Wi-Fi ----------------------------------------------------------------------------------------
// C-52: SEVERAL networks are kept -- what the board has learned, which the daemons share -- and it joins whichever known
// one is in range, the strongest, at start and whenever it loses the one it was on. Their passwords never leave it.
bool wifiSet() { return knownCount > 0; }
bool online() { return wifiSet() && serverUrl.length() && WiFi.status() == WL_CONNECTED; }

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

void loadWifi() {
  Preferences p; p.begin("uplink", true);
  knownCount = min((int)p.getUChar("count", 0), MAX_NETS);
  for (int i = 0; i < knownCount; i++) { knownSsid[i] = p.getString(("s" + String(i)).c_str(), ""); knownPass[i] = p.getString(("p" + String(i)).c_str(), ""); }
  String oldSsid = p.getString("ssid", COMPANION_WIFI_SSID), oldPass = p.getString("pass", COMPANION_WIFI_PASSWORD);
  serverUrl = p.getString("server", COMPANION_SERVER);
  p.end();
  if (!knownCount && oldSsid.length()) {     // the one network kept before there were several becomes the first
    knownSsid[0] = oldSsid; knownPass[0] = oldPass; knownCount = 1;
    saveNetworks();
    Preferences q; q.begin("uplink", false); q.remove("ssid"); q.remove("pass"); q.end();
  }
}

// Learn a network (or its new password) and join it now.
void learnNetwork(const String &ssid, const String &pass, const String &server) {
  int at = -1;
  for (int i = 0; i < knownCount; i++) if (knownSsid[i] == ssid) at = i;
  if (at < 0) {
    if (knownCount == MAX_NETS) { for (int i = 1; i < MAX_NETS; i++) { knownSsid[i - 1] = knownSsid[i]; knownPass[i - 1] = knownPass[i]; } knownCount--; }
    at = knownCount++;
  }
  knownSsid[at] = ssid; knownPass[at] = pass;
  if (server.length()) serverUrl = server;
  saveNetworks();
  WiFi.disconnect();
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid.c_str(), pass.c_str());
}

void forgetNetwork(int i) {
  if (i < 0 || i >= knownCount) return;
  for (int k = i + 1; k < knownCount; k++) { knownSsid[k - 1] = knownSsid[k]; knownPass[k - 1] = knownPass[k]; }
  knownCount--;
  saveNetworks();
}

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

String networksJson() {
  JsonDocument d;
  JsonArray a = d["networks"].to<JsonArray>();
  for (int i = 0; i < knownCount; i++) a.add(knownSsid[i]);                        // names only: never a password
  d["current"] = WiFi.status() == WL_CONNECTED ? WiFi.SSID() : "";
  String out; serializeJson(d, out);
  return out;
}

const char *linkName() {
  if (millis() - usbSeen < USB_FRESH_MS && usbSeen) return "USB";
  if (phoneSeen && linkPhoneHere()) return "PHONE";   // C-55, C-57
  if (!wifiSet()) return "NO LINK";
  return WiFi.status() == WL_CONNECTED ? "WIFI" : "WIFI...";
}

// The ROUTINES screens: a list with the day's colour behind the chosen row (TYPES, LIST), or what a routine found
// (RUN). Turn to choose, press to open or run, the top button to go back.
void listRow(int i, int at, const String &text, uint16_t day, uint16_t ink, int width = W - 12) {
  int y = 52 + i * 19;
  if (i == at) canvas.fillRect(6, y - 2, width, 18, day);
  canvas.setTextFont(2); canvas.setTextDatum(TL_DATUM);
  canvas.setTextColor(i == at ? ink : PAPER);
  canvas.drawString(text, 12, y);
}

void drawRoutines(uint16_t day) {
  uint16_t ink = lightColour(st.menu) ? INK : PAPER;
  const RoutineType &t = TYPES_LIST[typeAt];
  canvas.setTextFont(2); canvas.setTextColor(day); canvas.setTextDatum(TL_DATUM);
  if (screen == TYPES) {
    canvas.drawString("ROUTINE TYPE", 10, 32);
    for (int i = 0; i < TYPE_COUNT; i++)
      listRow(i, typeAt, String(TYPES_LIST[i].name) + "  (" + TYPES_LIST[i].radio + ")", day, ink);
  } else if (screen == LIST) {
    canvas.drawString(String(t.name) + "  (" + t.radio + ")", 10, 32);
    if (t.count == 0) {
      wrap("No routines yet.", 12, 58, W - 24, 4, 27, 1, PAPER);
      wrap("They arrive as each radio is wired and tried on the board.", 12, 92, W - 24, 2, 18, 3, QUIET);
    } else {
      for (int i = 0; i < t.count; i++) listRow(i, routineAt, t.routines[i].name, day, ink);
    }
  } else if (screen == PICK_REMOTE) {
    canvas.drawString("WHICH REMOTE " + upper(daemonName()) + " USES", 10, 32);
    int n = flareCount(), a = flareActive();
    for (int i = 0; i < n; i++) listRow(i, remoteAt, (i == a ? "* " : "  ") + flareName(i), day, ink);
  } else if (screen == PICK_NET) {
    canvas.drawString("WHICH NETWORK SHOULD " + upper(daemonName()) + " LEARN?", 10, 32);
    int from = max(0, netAt - 4);                // five rows, clear of the footer
    for (int i = from; i < netCount && i < from + 5; i++)
      listRow(i - from, netAt - from, nets[i] + "  " + String(netRssi[i]) + " dBm", day, ink);
  } else if (screen == TYPE_PASS) {
    canvas.drawString("TEACH " + upper(daemonName()) + "  " + nets[netAt], 10, 32);
    canvas.setTextColor(QUIET); canvas.drawString("PASSWORD", 10, 52);
    String shown = typed.length() > 34 ? "..." + typed.substring(typed.length() - 31) : typed;
    canvas.setTextColor(PAPER); canvas.drawString(shown + "_", 10, 68);
    for (int k = -4; k <= 4; k++) {           // the wheel: the letter chosen in the middle, its neighbours either side
      int at = (wheelAt + k + WHEEL_N) % WHEEL_N;
      String ch = at == 0 ? "OK" : String(WHEEL[at]) == " " ? "SPC" : String(WHEEL[at]);
      int x = W / 2 + k * 32;
      if (k == 0) {
        canvas.fillRoundRect(x - 22, 98, 44, 36, 4, day);
        canvas.setTextFont(4); canvas.setTextColor(ink); canvas.setTextDatum(MC_DATUM); canvas.drawString(ch, x, 117);
      } else {
        canvas.setTextFont(2); canvas.setTextColor(QUIET); canvas.setTextDatum(MC_DATUM); canvas.drawString(ch, x, 117);
      }
    }
    canvas.setTextDatum(TL_DATUM);
  } else {   // RUN
    canvas.drawString(String(t.name) + " / " + t.routines[routineAt].name, 10, 32);
    wrap(runResult, 12, 54, W - 24, 2, 17, 6, PAPER);
  }
  canvas.setTextFont(1); canvas.setTextColor(QUIET); canvas.setTextDatum(BL_DATUM);
  canvas.drawString(screen == RUN ? "press: run again    top button: back"
                    : screen == TYPE_PASS ? "turn: letter  press: add (OK: join)  top: delete"
                    : "turn: choose    press: open    top button: back", 10, H - 4);
}

void draw() {
  uint16_t day = hex565(st.menu), ink = lightColour(st.menu) ? INK : PAPER;   // C-37
  canvas.fillSprite(INK);
  // the day's band
  canvas.fillRect(0, 0, W, 26, day);
  canvas.setTextFont(2); canvas.setTextColor(ink); canvas.setTextDatum(ML_DATUM);
  canvas.drawString(st.have ? upper(st.day) + "  " + st.note + "  " + upper(st.season) : "DAEMONS COMPANION", 8, 13);
  canvas.setTextDatum(MR_DATUM);
  canvas.drawString(linkName(), W - 8, 13);

  if (screen == CARE) {                                      // C-13
    canvas.setTextFont(2); canvas.setTextColor(day); canvas.setTextDatum(TL_DATUM);
    canvas.drawString("CARE FOR " + st.daemon.nickname, 10, 32);
    for (int i = 0; i < 4; i++) listRow(i, careAt, CARE_ITEMS[i], day, ink, W - 90);   // clear of its sprite
    drawArt(W - 70, 34, 1);
    canvas.setTextFont(1); canvas.setTextColor(QUIET); canvas.setTextDatum(BL_DATUM);
    canvas.drawString("turn: choose    press: do it    top button: back", 10, H - 4);
  } else if (screen == INDEX_ENTRY) {                         // C-36: its INDEX entry, in the edition's voice
    canvas.setTextFont(2); canvas.setTextColor(day); canvas.setTextDatum(TL_DATUM);
    canvas.drawString("INDEX  " + st.daemon.name, 10, 32);
    canvas.setTextColor(QUIET);
    canvas.drawString(upper(st.daemon.category) + "  " + st.daemon.types, 10, 50);
    drawArt(W - 68, 30, 1);
    wrap(st.daemon.entry, 10, 72, W - 112, 2, 16, 5, PAPER);   // clear of the sprite (seen with SHOT, 2026-10-04)
    canvas.setTextFont(1); canvas.setTextColor(QUIET); canvas.setTextDatum(BL_DATUM);
    canvas.drawString("top button: back", 10, H - 4);
  } else if (screen != HOME) {
    drawRoutines(day);
  } else if (page == ROUTINES_PAGE) {
    canvas.setTextFont(2); canvas.setTextColor(day); canvas.setTextDatum(TL_DATUM);
    canvas.drawString("ROUTINES", 10, 34);
    wrap(st.carrying ? "The radios " + daemonName() + " can use. Press to open."
                     : "Routines are a daemon's. Send one here from the game.", 10, 58, W - 20, 4, 27, 3, PAPER);
    canvas.setTextFont(1); canvas.setTextColor(QUIET); canvas.setTextDatum(BL_DATUM);
    canvas.drawString("FLARE  WHISPER  TOUCHSTONE  LONGWAVE  UPLINK", 10, H - 6);
  } else if (!st.have) {
    wrap("Looking for the companion.", 10, 40, W - 20, 4, 28, 2, PAPER);
    wrap(wifiSet() ? "Wi-Fi is set. Is the server running, with \"host\": \"0.0.0.0\"?"
                   : "Run ./linkCompanion.sh on the computer, or join a network: ROUTINES, UPLINK.",
         10, 100, W - 20, 2, 18, 3, QUIET);
  } else if (page == TODAY) {
    canvas.setTextFont(2); canvas.setTextColor(day); canvas.setTextDatum(TL_DATUM);
    // C-49: the step, and -- subtly -- the milestone it belongs to
    canvas.drawString(st.milestone.length() ? upper(st.milestone) + "  " + String(st.msAt) + "/" + String(st.msOf) : "THE ONE THING", 10, 34);
    if (st.step >= 0) {
      int n = wrap(st.stepText, 10, 54, W - 20, 4, 27, 3, PAPER);
      wrap(st.goal, 10, 58 + min(n, 3) * 27, W - 20, 2, 16, 1, QUIET);
    } else {
      wrap(lastDone >= 0 ? "All done. Set a new goal in the app." : "Nothing to do yet. Set a goal in the app.", 10, 54, W - 20, 4, 27, 3, PAPER);
    }
    canvas.setTextFont(1); canvas.setTextColor(QUIET); canvas.setTextDatum(BL_DATUM);
    if (undoable()) canvas.drawString("done: " + lastDoneText.substring(0, 30) + "   top button: undo", 10, H - 6);
    else canvas.drawString(st.step >= 0 ? "press: done    " + st.virtue : st.virtue, 10, H - 6);
  } else {
    canvas.setTextFont(2); canvas.setTextColor(day); canvas.setTextDatum(TL_DATUM);
    if (st.carrying) {
      // C-42: the board's home -- the daemon, large, and alive: it bobs as it breathes, drifts a little either way,
      // and now and then hops. (Device-only animated sprites come later; a daemon sent here comes more to life.)
      uint32_t t = millis();
      int bob = (int)roundf(3 * sinf(t / 420.0f));
      int drift = (int)roundf(10 * sinf(t / 2900.0f));
      int hop = (t % 7000) < 260 ? -(int)(10 * sinf((t % 7000) / 260.0f * PI)) : 0;
      if (t < hopUntil) hop = -(int)(14 * fabsf(sinf((hopUntil - t) / 160.0f * PI)));   // C-13: glad of it
      drawArt(18 + drift, 32 + bob + hop, 2);                  // C-36: as the game draws it, twice its size
      int x = 168;
      canvas.setTextDatum(TL_DATUM);
      canvas.setTextFont(st.daemon.nickname.length() <= 8 ? 4 : 2); canvas.setTextColor(PAPER);
      canvas.drawString(st.daemon.nickname, x, 40);
      canvas.setTextFont(2); canvas.setTextColor(QUIET);
      // its species beside its level -- unless its nickname already is the species
      String lv = "L" + String(st.daemon.level) + (st.daemon.grownTo > st.daemon.level ? " > " + String(st.daemon.grownTo) : "");   // C-45
      canvas.drawString((st.daemon.nickname == st.daemon.name ? String("") : st.daemon.name + "  ") + lv, x, 72);
      // C-13: how it is, and its day -- never more than this, and never a nag
      if (st.daemon.word.length()) { canvas.setTextColor(day); canvas.drawString(st.daemon.word, x, 90); canvas.setTextColor(QUIET); }
      canvas.drawString("fed " + String(st.daemon.fed) + "/3  water " + String(st.daemon.watered) + "/3", x, 108);
      if (st.daemon.cue.length()) wrap(st.daemon.cue, x, 126, W - x - 6, 1, 11, 2, QUIET);
      else if (st.daemon.holding.length()) wrap("holding " + st.daemon.holding, x, 126, W - x - 6, 1, 11, 2, QUIET);
      canvas.setTextFont(1); canvas.setTextDatum(BL_DATUM); canvas.setTextColor(QUIET);
      canvas.drawString("press: care for it", x, H - 4);
    } else {
      canvas.drawString("THE DAEMON YOU CARRY", 10, 34);
      wrap("None yet. In the game, choose SEND in a daemon's menu, then SYNC in the app.", 10, 58, W - 20, 2, 18, 4, PAPER);
    }
  }
  if (millis() < flashUntil) {               // a word that something happened
    canvas.fillRoundRect(W / 2 - 70, H / 2 - 22, 140, 44, 6, day);
    canvas.setTextFont(4); canvas.setTextColor(ink); canvas.setTextDatum(MC_DATUM);
    canvas.drawString(flash, W / 2, H / 2);
  }
  canvas.pushSprite(0, 0);
  dirty = false;
}

void say(const String &word) { flash = word; flashUntil = millis() + 1500; dirty = true; }

// ---- the server ------------------------------------------------------------------------------------------------------
// One request to the server over Wi-Fi; the answer's body, or "" with *ok false.
String http(const char *method, const String &path, const String &body, bool *ok = nullptr) {
  if (ok) *ok = false;
  if (!online()) return "";
  HTTPClient h;
  h.setTimeout(4000);
  h.begin(serverUrl + path);
  int code;
  if (!strcmp(method, "POST")) { h.addHeader("content-type", "application/json"); code = h.POST(body); }
  else code = h.GET();
  String out = code == 200 ? h.getString() : "";
  h.end();
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

// ---- C-49: doing a step is one press; undoing it, the top button, for a little while after --------------------------

int dayIndex() {                                  // C-50: the day, Sunday 0, for its tunes
  static const char *D[] = { "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday" };
  for (int i = 0; i < 7; i++) if (st.day == D[i]) return i;
  return 0;
}

// C-50: what the server says the tick finished -- a step, a milestone, the whole goal -- heard and seen
void celebrate(const String &what) {
  int kind = what == "goal" ? 2 : what == "milestone" ? 1 : what == "step" ? 0 : -1;
  if (kind < 0) return;
  say(kind == 2 ? "Done! All of it." : kind == 1 ? "Milestone!" : "Done.");
  draw();
  soundAccomplish(kind, st.daemon.species, dayIndex());
}

void tick() {
  if (!st.have || st.step < 0) { say("Nothing yet"); return; }
  long id = st.step;
  lastDone = id; lastDoneText = st.stepText; lastDoneAt = millis();
  if (bridgeLive()) { bridge("TICK " + String(id)); return; }       // the bridge answers CELEBRATE, then STATE
  bool ok;
  String got = http("POST", "/api/device/ticks", "{\"steps\":[" + String(id) + "]}", &ok);
  JsonDocument d;
  if (ok && !deserializeJson(d, got)) { takeState(got); celebrate(d["celebrate"] | ""); return; }
  lastDone = -1;
  say("No link");
}

void untick() {
  long id = lastDone;
  lastDone = -1;
  say("Undone.");
  draw();
  soundUndo(st.daemon.species, dayIndex());
  if (bridgeLive()) { bridge("UNTICK " + String(id)); return; }
  httpState("POST", "/api/device/untick", "{\"step\":" + String(id) + "}");
}

// ---- C-32: the site and the device, linked. The site's COMMANDS arrive down the cable (CMD lines, from the bridge) or
// over Wi-Fi (GET /api/device/commands); each is answered with a RESULT the same way. LIST asks what routines this
// board has, so the site's list is the board's own.
String routinesJson() {
  JsonDocument d;
  d["firmware"] = "t-embed-cc1101 2";
  JsonArray types = d["types"].to<JsonArray>();
  for (int i = 0; i < TYPE_COUNT; i++) {
    JsonObject t = types.add<JsonObject>();
    t["name"] = TYPES_LIST[i].name; t["radio"] = TYPES_LIST[i].radio;
    JsonArray r = t["routines"].to<JsonArray>();
    for (int k = 0; k < TYPES_LIST[i].count; k++) r.add(TYPES_LIST[i].routines[k].name);
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
    for (int i = 0; i < TYPE_COUNT; i++)
      for (int k = 0; k < TYPES_LIST[i].count; k++)
        if (want == String(TYPES_LIST[i].name) + "/" + TYPES_LIST[i].routines[k].name) {
          if (TYPES_LIST[i].routines[k].run == runTheaterMode)   // it holds the board's controls until the top button
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
    for (int i = 0; i < TYPE_COUNT; i++) if (!strcmp(TYPES_LIST[i].name, "FLARE")) typeAt = i;
    runResult = out; screen = RUN; dirty = true;
    report("routine", "FLARE/" + String((const char *)(c["label"] | "A CODE FROM THE SITE")));
    return sendResult(id, !out.startsWith("Could not"), out);
  }
  if (type == "network") {                    // C-52: the site forgets a network
    int index = c["index"] | -1;
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
void reportNetworks() {
  if (bridgeLive()) bridge("NETWORKS " + networksJson());
  else http("POST", "/api/device/networks", networksJson());
}

bool routinesPosted = false;
uint32_t commandsAt = 0;
void pollCommands(uint32_t now) {
  if (!routinesPosted) {
    routinesPosted = !http("POST", "/api/device/routines", routinesJson()).isEmpty();
    if (routinesPosted) { reportRemotes(); reportNetworks(); }
  }
  if (now - commandsAt < 2000) return;
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
  const uint8_t *px = (const uint8_t *)canvas.getPointer();
  Serial.printf("SHOT %d %d\n", W, H);
  static unsigned char line[1025];
  for (size_t at = 0; at < (size_t)W * H * 2; at += 768) {
    size_t n = min((size_t)768, (size_t)W * H * 2 - at), got = 0;
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
                             reply("NETWORKS " + networksJson()); }
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
  else if (line.startsWith("GO ") && !fromPhone) {   // with SHOT, to check a screen from the computer: GO TODAY|DAEMON|INDEX|ROUTINES
    String to = line.substring(3);
    wake();
    screen = to == "INDEX" && st.carrying ? INDEX_ENTRY : HOME;
    page = to == "DAEMON" || to == "INDEX" ? DAEMON : to == "ROUTINES" ? ROUTINES_PAGE : TODAY;
    draw();
  }
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
std::vector<String> metWaiting;
String beaconTold;
void meetReport() {
  int species; String tag; bool mine;
  while (meetTakeHeard(species, tag, mine)) {
    if (metWaiting.size() < 8) metWaiting.push_back(String(species) + " " + tag);
    if (!mine && !asleep) { ledsFlash(); say("A daemon nearby"); }
  }
  bool link = bridgeLive() || online();
  if (!link) return;
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
      int sp = m.indexOf(' ');
      String body = "{\"species\":\"" + m.substring(0, sp) + "\",\"peer\":\"" + m.substring(sp + 1) + "\"}";
      if (http("POST", "/api/device/met", body).isEmpty()) return;
    }
    metWaiting.erase(metWaiting.begin());
  }
}

void readPhone() {                                  // C-55
  String line;
  for (int i = 0; i < 4 && linkTake(line); i++) handleLine(line, true);
}

// ---- the encoder: a quadrature state table, read every pass of the loop -------------------------------------------
int8_t encLast = 0, encSum = 0;
// One step of the dial: +1 right, -1 left -- from the dial itself, or KEY RIGHT / KEY LEFT down the cable.
void turn(int step) {
  if (wake()) return;                   // C-39: a turn that wakes the board does nothing else
  ledsSpin(step);                       // C-38: a light once round the ring, the way the dial turned
  soundTurn(step);                      // C-40: rising for right, falling for left
  if (screen == HOME) page = (Page)((page + 3 + step) % 3);
  else if (screen == TYPES) typeAt = (typeAt + TYPE_COUNT + step) % TYPE_COUNT;
  else if (screen == CARE) careAt = (careAt + 4 + step) % 4;
  else if (screen == PICK_REMOTE && flareCount()) remoteAt = (remoteAt + flareCount() + step) % flareCount();
  else if (screen == PICK_NET && netCount) netAt = (netAt + netCount + step) % netCount;
  else if (screen == TYPE_PASS) wheelAt = (wheelAt + WHEEL_N + step) % WHEEL_N;
  else if (screen == LIST && TYPES_LIST[typeAt].count > 0)
    routineAt = (routineAt + TYPES_LIST[typeAt].count + step) % TYPES_LIST[typeAt].count;
  dirty = true;
}

void readEncoder() {
  static const int8_t table[16] = {0, -1, 1, 0, 1, 0, 0, -1, -1, 0, 0, 1, 0, 1, -1, 0};
  int8_t now = (digitalRead(PIN_ENC_A) << 1) | digitalRead(PIN_ENC_B);
  encSum += table[(encLast << 2) | now];
  encLast = now;
  if (encSum >= 4 || encSum <= -4) {
    int step = encSum > 0 ? 1 : -1;
    encSum = 0;
    turn(step);
  }
}

// C-13: using the device is tending the daemon. Each routine run is told to the server -- over the cable through the
// bridge (an INTERACT line), or over Wi-Fi -- where the daemon's life will read it.
void report(const String &kind, const String &detail) {
  if (bridgeLive()) { bridge("INTERACT " + kind + " " + detail); return; }
  JsonDocument d; d["kind"] = kind; d["detail"] = detail;
  String body; serializeJson(d, body);
  if (http("POST", "/api/device/interact", body).length()) httpState("GET", "/api/device/state", "");   // its new life
}

void progress(const String &text) { runResult = text; draw(); }
// C-51: the routines are the daemon's -- they speak in its name
String daemonName() { return st.carrying && st.daemon.nickname.length() ? st.daemon.nickname : "Your daemon"; }
String runChooseRemote() {
  if (!flareCount()) return daemonName() + " knows no remote yet.\nChoose TEACH A REMOTE, or add one by brand on the site.";
  pickRemoteNext = true; remoteAt = flareActive();
  return "";
}
void reportRemotes();
bool giveUp() { return !digitalRead(PIN_SIDE_KEY); }

void runRoutine() {
  const RoutineType &t = TYPES_LIST[typeAt];
  runResult = "Running...";
  screen = RUN;
  draw();
  soundRoutine(t.name);                 // C-40: its tune, the ring dancing -- the daemon starting the routine
  runResult = t.routines[routineAt].run();
  if (joinNext) { joinNext = false; screen = PICK_NET; netAt = 0; }       // C-33: JOIN A NETWORK goes on to choose one
  if (pickRemoteNext) { pickRemoteNext = false; screen = PICK_REMOTE; }    // C-51: CHOOSE A REMOTE, a list
  if (!strcmp(t.name, "FLARE") && routineAt == 0) reportRemotes();         // a remote taught: the site hears of it
  while (giveUp()) delay(10);                 // a give-up press is spent here, not read again as "back"
  sideWas = true;
  report("routine", String(t.name) + "/" + t.routines[routineAt].name);
  dirty = true;
}

// The encoder's press: in, or run. On TODAY it ticks the step off, as it always has.
void press() {
  lastInput = millis();
  ledsFlash();                                                  // C-38
  soundSelect();                                                // C-40
  if (screen == HOME) {
    if (page == TODAY) tick();
    else if (page == DAEMON && st.carrying) { screen = CARE; careAt = 0; }   // C-13
    else if (page == ROUTINES_PAGE) {
      if (!st.carrying) say("Needs a daemon");                     // C-51: the routines are the daemon's
      else { screen = TYPES; typeAt = 0; }
    }
  } else if (screen == TYPES) { screen = LIST; routineAt = 0; }
  else if (screen == LIST) { if (TYPES_LIST[typeAt].count > 0) runRoutine(); }
  else if (screen == RUN) runRoutine();
  else if (screen == PICK_REMOTE) {
    flareSetActive(remoteAt);
    runResult = daemonName() + " uses " + flareName(remoteAt) + " now.";
    screen = RUN;
    reportRemotes();
  }
  else if (screen == CARE) {
    if (careAt == 3) screen = INDEX_ENTRY;
    else {
      static const char *KIND[] = { "feed", "water", "train" }, *SAID[] = { "Eaten.", "Drunk.", "Trained." };
      report(KIND[careAt], "device");
      say(SAID[careAt]);
      soundCare(careAt);
      hopUntil = millis() + 480;
      screen = HOME; page = DAEMON;
    }
  }
  else if (screen == PICK_NET && netCount) { screen = TYPE_PASS; typed = ""; wheelAt = 1; }
  else if (screen == TYPE_PASS) {
    if (wheelAt) typed += WHEEL[wheelAt];
    else {                                     // OK: join
      learnNetwork(nets[netAt], typed, "");
      runResult = daemonName() + " learned " + nets[netAt] + ", and joins it whenever it is near.\n\nThe corner says WIFI once it has." +
                  (serverUrl.length() ? "" : "\nLink it by the cable once, and it learns where the server is.");
      screen = RUN;
      reportNetworks();
    }
  }
  dirty = true;
}

// The top button: back one step.
void back() {
  lastInput = millis();
  ledsDark();                                                   // C-38
  soundBack();                                                  // C-40
  if (screen == HOME && page == TODAY && undoable()) { untick(); return; }   // C-49
  if (screen == INDEX_ENTRY) { screen = CARE; careAt = 3; }
  else if (screen == CARE) { screen = HOME; page = DAEMON; }
  else if (screen == TYPE_PASS) { if (typed.length()) typed.remove(typed.length() - 1); else screen = PICK_NET; }
  else if (screen == PICK_NET || screen == PICK_REMOTE) screen = LIST;
  else if (screen == RUN) screen = LIST;
  else if (screen == LIST) screen = TYPES;
  else if (screen == TYPES) { screen = HOME; page = ROUTINES_PAGE; }
  dirty = true;
}

// ---- C-39: sleep. Hold the top button and press the front one: the screen, its light and the ring go dark. Turning
// the dial or pressing either button wakes it to the page it was on, and the wake does nothing else. The link keeps
// running underneath (readUsb, the Wi-Fi poll), so it wakes current.
bool chorded = false;

void sleepNow() {
  asleep = true;
  canvas.fillSprite(TFT_BLACK); canvas.pushSprite(0, 0);
  digitalWrite(TFT_BL, LOW);
  ledsSleep(true);
}

// True if this input was spent waking the board.
// Waking lands on home -- the daemon, by default (C-42) -- whatever menu it fell asleep in, to the title's jingle (C-41).
bool wake() {
  lastInput = millis();
  if (!asleep) return false;
  asleep = false;
  screen = HOME;
  page = cfg.home == "today" ? TODAY : DAEMON;
  draw();
  digitalWrite(TFT_BL, HIGH);
  ledsSleep(false);
  soundWake();
  dirty = true;
  return true;
}

// The front button acts on press. The top button acts on RELEASE -- going back -- unless the front was pressed while it
// was held (the sleep chord), so holding it to start the chord never goes back a page.
void readKey() {
  bool up = digitalRead(PIN_ENC_KEY);
  if (up != keyWas && millis() - keyAt > 30) {
    keyAt = millis(); keyWas = up;
    if (!up) {
      if (wake()) {}
      else if (!sideWas) { chorded = true; sleepNow(); }       // top held: the chord
      else press();
    }
  }
  bool sideUp = digitalRead(PIN_SIDE_KEY);
  if (sideUp != sideWas && millis() - sideAt > 30) {
    sideAt = millis(); sideWas = sideUp;
    if (!sideUp) { if (wake()) chorded = true; }               // pressed: a wake spends this whole press
    else if (chorded) chorded = false;                         // released after the chord (or a wake): nothing more
    else back();
  }
}

// ---- UPLINK (Wi-Fi): the networks in range, by name and strength. Lists only; joins nothing. --------------------
// C-58: THEATER MODE -- the board becomes the remote (the user, 2026-10-05): the front button is POWER, the dial
// clockwise VOLUME UP and counter-clockwise VOLUME DOWN, one press of the remote for each click of the dial, until the
// top button. It holds the controls, so the site cannot start it.
String runTheaterMode() {
  if (!flareCount()) return daemonName() + " knows no remote yet.\nChoose TEACH A REMOTE, or add one by brand on the site.";
  String head = "THEATER MODE  (" + flareName(flareActive()) + ")\npress: POWER\nright: VOLUME UP    left: VOLUME DOWN\ntop button: done";
  progress(head);
  int8_t last = (digitalRead(PIN_ENC_A) << 1) | digitalRead(PIN_ENC_B), sum = 0;
  static const int8_t table[16] = {0, -1, 1, 0, 1, 0, 0, -1, -1, 0, 0, 1, 0, 1, -1, 0};
  bool keyWas = digitalRead(PIN_ENC_KEY);
  uint32_t keyAt = 0;
  while (!giveUp()) {
    int8_t now = (digitalRead(PIN_ENC_A) << 1) | digitalRead(PIN_ENC_B);
    sum += table[(last << 2) | now];
    last = now;
    String sent;
    if (sum >= 4 || sum <= -4) {
      int step = sum > 0 ? 1 : -1;
      sum = 0;
      ledsSpin(step);
      sent = step > 0 ? runVolumeUp() : runVolumeDown();
    }
    bool key = digitalRead(PIN_ENC_KEY);
    if (!key && keyWas && millis() - keyAt > 150) { keyAt = millis(); ledsFlash(); sent = runPower(); }
    keyWas = key;
    if (sent.length()) progress(head + "\n\n" + sent.substring(0, sent.indexOf('\n')));   // what went, in its first line
    ledsLoop();
    delay(1);
  }
  lastInput = millis();
  encLast = last; encSum = 0;               // the main loop's dial picks up from here, not from before
  return "THEATER MODE: done.";
}

String runNetworksInRange() {
  if (!wifiSet()) WiFi.mode(WIFI_STA);   // with no network set the radio is idle; it listens for the scan
  int n = WiFi.scanNetworks();
  if (n <= 0) return n == 0 ? "No networks in range." : "The scan did not finish. Press to try again.";
  String out = daemonName() + " hears " + String(n) + (n == 1 ? " network" : " networks") + "  (* it knows):";
  for (int i = 0; i < n && i < 6; i++) {
    String name = WiFi.SSID(i);
    bool known = false;
    for (int k = 0; k < knownCount; k++) if (knownSsid[k] == name) known = true;
    if (!name.length()) name = "(hidden)";
    bool on = WiFi.status() == WL_CONNECTED && WiFi.SSID() == WiFi.SSID(i);   // C-52: the one it has joined
    out += "\n" + String(on ? "> " : known ? "* " : "  ") + name + "  " + String(WiFi.RSSI(i)) + " dBm" + (on ? "  joined" : "");
  }
  WiFi.scanDelete();
  return out;
}

// ---- UPLINK (Wi-Fi): JOIN A NETWORK -- choose one in range, type its password on the wheel (C-33). --------------------
String runJoinNetwork() {
  if (!wifiSet()) WiFi.mode(WIFI_STA);
  int n = WiFi.scanNetworks();
  if (n <= 0) return n == 0 ? "No networks in range." : "The scan did not finish. Press to try again.";
  netCount = 0;
  for (int i = 0; i < n && netCount < 12; i++) {
    if (!WiFi.SSID(i).length()) continue;      // a hidden network cannot be chosen by name
    nets[netCount] = WiFi.SSID(i); netRssi[netCount++] = WiFi.RSSI(i);
  }
  WiFi.scanDelete();
  if (!netCount) return "Only hidden networks are in range.";
  joinNext = true;
  return "";
}

void setup() {
  pinMode(PIN_PWR_EN, OUTPUT); digitalWrite(PIN_PWR_EN, HIGH);
  // The bridge's STATE line is ~300 bytes and the USB receive buffer defaults to 256: while the screen is being drawn
  // the rest was dropped, the JSON arrived cut short, and the corner said NO LINK with the bridge plainly connected.
  Serial.setRxBufferSize(4096);
  Serial.begin(115200);
  pinMode(PIN_ENC_A, INPUT_PULLUP); pinMode(PIN_ENC_B, INPUT_PULLUP); pinMode(PIN_ENC_KEY, INPUT_PULLUP);
  pinMode(PIN_SIDE_KEY, INPUT_PULLUP);
  encLast = (digitalRead(PIN_ENC_A) << 1) | digitalRead(PIN_ENC_B);
  tft.init(); tft.setRotation(3); tft.fillScreen(INK);
  pinMode(TFT_BL, OUTPUT); digitalWrite(TFT_BL, HIGH);
  canvas.setColorDepth(16);
  canvas.createSprite(W, H);
  loadWifi();                                 // C-52: uplinkLoop joins the strongest known network in range
  ledsBegin();
  soundBegin();
  flareBegin();                               // C-51: an older single learned code becomes the first remote
  loadSettings();
  linkBegin();                                // C-55: Bluetooth, for the phone
  lastInput = millis();
  page = cfg.home == "today" ? TODAY : DAEMON;   // C-42: it starts at home
  draw();
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
  if (ok) takeArt(got);
}

void loop() {
  readUsb();
  readPhone();
  readEncoder();
  readKey();
  uint32_t now = millis();
  if (now - lastHello > HELLO_MS) { lastHello = now; Serial.println("HELLO daemons-companion t-embed-cc1101 1"); dirty = true; }
  if (!bridgeLive() && online()) {
    if (now - lastPoll > POLL_MS || (!st.have && now - lastPoll > 5000)) { lastPoll = now; httpState("GET", "/api/device/state", ""); }
    pollCommands(now);                        // C-32: what the site sent, over Wi-Fi
  }
  if (flashUntil && now > flashUntil) { flashUntil = 0; dirty = true; }
  askForArt();
  uplinkLoop(now);
  linkLoop(now);                            // C-55
  meetLoop(now, cfg.meet, st.carrying ? st.daemon.species : 0);   // C-15
  meetReport();
  static bool wifiWas = false;              // C-52: the site hears at once when the board joins or leaves a network
  if (wifiWas != (WiFi.status() == WL_CONNECTED)) { wifiWas = !wifiWas; reportNetworks(); dirty = true; }
  if (phoneSeen && !linkPhoneHere()) { phoneSeen = 0; dirty = true; }   // C-57: gone; the next one proves itself again
  ledsLoop();
  static bool wasUndoable = false;
  if (wasUndoable != undoable()) { wasUndoable = undoable(); dirty = true; }
  // C-42: any menu, left alone, goes to sleep; waking lands at home
  if (!asleep && cfg.sleepAfter > 0 && now - lastInput > (uint32_t)cfg.sleepAfter * 1000) sleepNow();
  // the daemon at home is alive: redraw it a few times a second
  static uint32_t lifeAt = 0;
  if (!asleep && screen == HOME && page == DAEMON && st.carrying && now - lifeAt > 90) { lifeAt = now; dirty = true; }
  if (dirty && !asleep) draw();
  delay(1);
}
