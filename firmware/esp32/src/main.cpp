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
#include <mbedtls/base64.h>

#include <HTTPClient.h>
#include <Preferences.h>
// C-33: the Wi-Fi is set at run time -- from the site, down the cable, or on the board (UPLINK / JOIN A NETWORK) -- and
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

struct Daemon { String name, nickname, holding, category, entry, types, artKey; int level = 0, friendship = 0; };
struct State {
  bool have = false;
  String date, edition, season, day, colour = "#5b6b8c", menu = "#5b6b8c", led = "#4060ff", note, virtue;
  long step = -1; String stepText, goal;
  bool carrying = false; Daemon daemon;
} st;

// ---- where you are -------------------------------------------------------------------------------------------------
// HOME turns between TODAY, DAEMON and ROUTINES with the encoder. ROUTINES opens a list of routine TYPES, a type opens
// its ROUTINES, a routine RUNs. The encoder's press goes in (or ticks the step, on TODAY); the top button goes back.
enum Page { TODAY, DAEMON, ROUTINES_PAGE };
// INDEX_ENTRY: the carried daemon's (C-36). PICK_NET and TYPE_PASS: joining a network on the board (C-33).
enum Screen { HOME, TYPES, LIST, RUN, INDEX_ENTRY, PICK_NET, TYPE_PASS };
Page page = TODAY;
Screen screen = HOME;
int typeAt = 0, routineAt = 0;
// C-33: joining a network on the board -- the networks in range, then the password on a letter wheel. WHEEL[0] is OK.
String nets[12]; int netRssi[12], netCount = 0, netAt = 0, wheelAt = 1; String typed; bool joinNext = false;
static const char WHEEL[] = "\x01abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 !@#$%^&*()-_=+.,?/:;'\"<>[]{}|\\~`";
static const int WHEEL_N = sizeof(WHEEL) - 1;
String runResult;
uint32_t usbSeen = 0, lastPoll = 0, lastHello = 0, flashUntil = 0;
String flash, lineIn;
bool dirty = true;
bool keyWas = true, sideWas = true; uint32_t keyAt = 0, sideAt = 0;
bool wake();                              // C-39, below
String wifiSsid, wifiPass, serverUrl;     // C-33, below

// ---- C-28: the device's ROUTINES -- the board's radios, named in the game's words ----------------------------------
// The user chose the names (2026-10-04): FLARE (IR), WHISPER (Bluetooth), TOUCHSTONE (NFC), LONGWAVE (Sub-GHz), and
// UPLINK (Wi-Fi). Each routine runs on the author's own gear only (CONTEXT.md); the radio ones are in radios.cpp. A type
// with nothing wired yet opens on an empty list, which is fine (LONGWAVE, until it is tried with the board in hand).
typedef String (*RoutineFn)();
struct Routine { const char *name; RoutineFn run; };
struct RoutineType { const char *name; const char *radio; const Routine *routines; int count; };

String runNetworksInRange();
static const Routine FLARE_ROUTINES[]      = { { "LEARN MY REMOTE", runLearnMyRemote }, { "SEND TO MY TV", runSendToMyTv },
                                               { "SONY TV POWER", runSonyTvPower } };
static const Routine WHISPER_ROUTINES[]    = { { "OPEN TO MY PHONE", runOpenToMyPhone } };
static const Routine TOUCHSTONE_ROUTINES[] = { { "READ MY TAG", runReadMyTag } };
String runJoinNetwork();
static const Routine UPLINK_ROUTINES[]     = { { "NETWORKS IN RANGE", runNetworksInRange }, { "JOIN A NETWORK", runJoinNetwork } };
static const RoutineType TYPES_LIST[] = {
  { "FLARE",      "IR",        FLARE_ROUTINES,      3 },
  { "WHISPER",    "Bluetooth", WHISPER_ROUTINES,    1 },
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
  st.menu = doc["day"]["menu"] | st.colour.c_str();     // C-37: the tamed rainbow week, else the game's trim
  st.led = doc["day"]["led"] | st.menu.c_str();
  ledsDay(strtol(st.led.c_str() + 1, nullptr, 16));
  if (doc["step"].isNull()) { st.step = -1; st.stepText = ""; st.goal = ""; }
  else { st.step = doc["step"]["id"] | -1; st.stepText = doc["step"]["text"] | ""; st.goal = doc["step"]["goal"] | ""; }
  st.carrying = !doc["daemon"].isNull();
  if (st.carrying) {
    st.daemon.name = doc["daemon"]["name"] | ""; st.daemon.nickname = doc["daemon"]["nickname"] | "";
    st.daemon.level = doc["daemon"]["level"] | 0; st.daemon.friendship = doc["daemon"]["friendship"] | 0;
    st.daemon.holding = doc["daemon"]["holding"] | "";   // what it held when it was sent (T-374)
    st.daemon.category = doc["daemon"]["category"] | ""; st.daemon.entry = doc["daemon"]["entry"] | "";
    st.daemon.entry.replace("\n", " ");     // the game's line breaks are for its own window; this screen wraps its own
    st.daemon.artKey = doc["daemon"]["artKey"] | "";
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
bool wifiSet() { return wifiSsid.length() > 0; }
bool online() { return wifiSet() && serverUrl.length() && WiFi.status() == WL_CONNECTED; }

void loadWifi() {
  Preferences p; p.begin("uplink", true);
  wifiSsid = p.getString("ssid", COMPANION_WIFI_SSID);
  wifiPass = p.getString("pass", COMPANION_WIFI_PASSWORD);
  serverUrl = p.getString("server", COMPANION_SERVER);
  p.end();
}

void joinWifi(const String &ssid, const String &pass, const String &server) {
  wifiSsid = ssid; wifiPass = pass;
  if (server.length()) serverUrl = server;
  Preferences p; p.begin("uplink", false);
  p.putString("ssid", wifiSsid); p.putString("pass", wifiPass); p.putString("server", serverUrl);
  p.end();
  WiFi.disconnect();
  WiFi.mode(WIFI_STA);
  WiFi.begin(wifiSsid.c_str(), wifiPass.c_str());
}

const char *linkName() {
  if (millis() - usbSeen < USB_FRESH_MS && usbSeen) return "USB";
  if (!wifiSet()) return "NO LINK";
  return WiFi.status() == WL_CONNECTED ? "WIFI" : "WIFI...";
}

// The ROUTINES screens: a list with the day's colour behind the chosen row (TYPES, LIST), or what a routine found
// (RUN). Turn to choose, press to open or run, the top button to go back.
void listRow(int i, int at, const String &text, uint16_t day, uint16_t ink) {
  int y = 52 + i * 19;
  if (i == at) canvas.fillRect(6, y - 2, W - 12, 18, day);
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
  } else if (screen == PICK_NET) {
    canvas.drawString("JOIN A NETWORK", 10, 32);
    int from = max(0, netAt - 5);
    for (int i = from; i < netCount && i < from + 6; i++)
      listRow(i - from, netAt - from, nets[i] + "  " + String(netRssi[i]) + " dBm", day, ink);
  } else if (screen == TYPE_PASS) {
    canvas.drawString("JOIN  " + nets[netAt], 10, 32);
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
                    : screen == TYPE_PASS ? "turn: letter    press: add it (OK: join)    top: delete"
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

  if (screen == INDEX_ENTRY) {                                // C-36: its INDEX entry, in the edition's voice
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
    wrap("The radios your daemon can use. Press to open.", 10, 58, W - 20, 4, 27, 3, PAPER);
    canvas.setTextFont(1); canvas.setTextColor(QUIET); canvas.setTextDatum(BL_DATUM);
    canvas.drawString("FLARE  WHISPER  TOUCHSTONE  LONGWAVE  UPLINK", 10, H - 6);
  } else if (!st.have) {
    wrap("Looking for the companion.", 10, 40, W - 20, 4, 28, 2, PAPER);
    wrap(wifiSet() ? "Wi-Fi is set. Is the server running, with \"host\": \"0.0.0.0\"?"
                   : "Run ./linkCompanion.sh on the computer, or join a network: ROUTINES, UPLINK.",
         10, 100, W - 20, 2, 18, 3, QUIET);
  } else if (page == TODAY) {
    canvas.setTextFont(2); canvas.setTextColor(day); canvas.setTextDatum(TL_DATUM);
    canvas.drawString("THE ONE THING", 10, 34);
    if (st.step >= 0) {
      int n = wrap(st.stepText, 10, 54, W - 20, 4, 27, 3, PAPER);
      wrap(st.goal, 10, 58 + min(n, 3) * 27, W - 20, 2, 16, 1, QUIET);
    } else {
      wrap("Nothing to do yet. Add a goal in the app.", 10, 54, W - 20, 4, 27, 3, PAPER);
    }
    canvas.setTextFont(1); canvas.setTextColor(QUIET); canvas.setTextDatum(BL_DATUM);
    canvas.drawString(st.virtue, 10, H - 6);
  } else {
    canvas.setTextFont(2); canvas.setTextColor(day); canvas.setTextDatum(TL_DATUM);
    canvas.drawString("THE DAEMON YOU CARRY", 10, 34);
    if (st.carrying) {
      drawArt(W - 134, 30, 2);                                  // C-36: as the game draws it, twice its size
      canvas.setTextFont(4); canvas.setTextColor(PAPER); canvas.drawString(st.daemon.nickname, 10, 58);
      canvas.setTextFont(2); canvas.setTextColor(QUIET);
      // its species beside its level -- unless its nickname already is the species
      canvas.drawString((st.daemon.nickname == st.daemon.name ? String("") : st.daemon.name + "  ") + "L" + String(st.daemon.level), 10, 92);
      canvas.drawString("friendship " + String(st.daemon.friendship), 10, 112);
      if (st.daemon.holding.length()) canvas.drawString("holding " + st.daemon.holding, 10, 132);
      canvas.setTextFont(1); canvas.setTextDatum(BL_DATUM);
      canvas.drawString("press: its INDEX entry", 10, H - 4);
    } else {
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

void tick() {
  if (!st.have || st.step < 0) { say("Nothing yet"); return; }
  long id = st.step;
  if (usbLive()) { Serial.printf("TICK %ld\n", id); say("Done."); return; }
  if (httpState("POST", "/api/device/ticks", "{\"steps\":[" + String(id) + "]}")) { say("Done."); return; }
  say("No link");
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
  if (usbLive()) Serial.println("RESULT " + out);
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
    for (int i = 0; i < TYPE_COUNT; i++)
      for (int k = 0; k < TYPES_LIST[i].count; k++)
        if (want == String(TYPES_LIST[i].name) + "/" + TYPES_LIST[i].routines[k].name) {
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
  if (type == "wifi") {                       // C-33: only ever arrives down the cable
    joinWifi(c["ssid"] | "", c["password"] | "", c["server"] | "");
    say("Wi-Fi set");
    return sendResult(id, true, "Saved on the board. Joining " + wifiSsid + "...");
  }
  sendResult(id, false, "This board does not know the command " + type + ".");
}

bool routinesPosted = false;
uint32_t commandsAt = 0;
void pollCommands(uint32_t now) {
  if (!routinesPosted) routinesPosted = !http("POST", "/api/device/routines", routinesJson()).isEmpty();
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

void readUsb() {
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\n') {
      lineIn.trim();
      if (lineIn.startsWith("STATE ")) {
        if (takeState(lineIn.substring(6))) usbSeen = millis();
        else Serial.printf("UNREAD %u\n", lineIn.length());   // the bridge says so, rather than the corner silently not changing
      }
      else if (lineIn.startsWith("ART ")) { if (!takeArt(lineIn.substring(4))) Serial.printf("UNREAD %u\n", lineIn.length()); }
      else if (lineIn == "SHOT") shot();
      else if (lineIn == "LIST") Serial.println("ROUTINES " + routinesJson());
      else if (lineIn.startsWith("CMD ")) {
        JsonDocument d;
        if (deserializeJson(d, lineIn.substring(4))) Serial.printf("UNREAD %u\n", lineIn.length());
        else handleCommand(d.as<JsonVariant>());
      }
      else if (lineIn.startsWith("GO ")) {          // with SHOT, to check a screen from the computer: GO TODAY|DAEMON|INDEX|ROUTINES
        String to = lineIn.substring(3);
        screen = to == "INDEX" && st.carrying ? INDEX_ENTRY : HOME;
        page = to == "DAEMON" || to == "INDEX" ? DAEMON : to == "ROUTINES" ? ROUTINES_PAGE : TODAY;
        wake();
        draw();
      }
      else if (lineIn == "PING") { usbSeen = millis(); Serial.println("PONG"); }
      lineIn = "";
    } else if (lineIn.length() < 6000) lineIn += c;   // an ART line is ~3 KB
  }
}

// ---- the encoder: a quadrature state table, read every pass of the loop -------------------------------------------
int8_t encLast = 0, encSum = 0;
void readEncoder() {
  static const int8_t table[16] = {0, -1, 1, 0, 1, 0, 0, -1, -1, 0, 0, 1, 0, 1, -1, 0};
  int8_t now = (digitalRead(PIN_ENC_A) << 1) | digitalRead(PIN_ENC_B);
  encSum += table[(encLast << 2) | now];
  encLast = now;
  if (encSum >= 4 || encSum <= -4) {
    int step = encSum > 0 ? 1 : -1;
    encSum = 0;
    if (wake()) return;                   // C-39: a turn that wakes the board does nothing else
    ledsSpin(step);                       // C-38: a light once round the ring, the way the dial turned
    if (screen == HOME) page = (Page)((page + 3 + step) % 3);
    else if (screen == TYPES) typeAt = (typeAt + TYPE_COUNT + step) % TYPE_COUNT;
    else if (screen == PICK_NET && netCount) netAt = (netAt + netCount + step) % netCount;
    else if (screen == TYPE_PASS) wheelAt = (wheelAt + WHEEL_N + step) % WHEEL_N;
    else if (screen == LIST && TYPES_LIST[typeAt].count > 0)
      routineAt = (routineAt + TYPES_LIST[typeAt].count + step) % TYPES_LIST[typeAt].count;
    dirty = true;
  }
}

// C-13: using the device is tending the daemon. Each routine run is told to the server -- over the cable through the
// bridge (an INTERACT line), or over Wi-Fi -- where the daemon's life will read it.
void report(const String &kind, const String &detail) {
  if (usbLive()) { Serial.printf("INTERACT %s %s\n", kind.c_str(), detail.c_str()); return; }
  JsonDocument d; d["kind"] = kind; d["detail"] = detail;
  String body; serializeJson(d, body);
  http("POST", "/api/device/interact", body);
}

void progress(const String &text) { runResult = text; draw(); }
bool giveUp() { return !digitalRead(PIN_SIDE_KEY); }

void runRoutine() {
  const RoutineType &t = TYPES_LIST[typeAt];
  runResult = "Running...";
  screen = RUN;
  draw();
  runResult = t.routines[routineAt].run();
  if (joinNext) { joinNext = false; screen = PICK_NET; netAt = 0; }       // C-33: JOIN A NETWORK goes on to choose one
  while (giveUp()) delay(10);                 // a give-up press is spent here, not read again as "back"
  sideWas = true;
  report("routine", String(t.name) + "/" + t.routines[routineAt].name);
  dirty = true;
}

// The encoder's press: in, or run. On TODAY it ticks the step off, as it always has.
void press() {
  ledsFlash();                                                  // C-38
  if (screen == HOME) {
    if (page == TODAY) tick();
    else if (page == DAEMON && st.carrying) screen = INDEX_ENTRY;     // C-36
    else if (page == ROUTINES_PAGE) { screen = TYPES; typeAt = 0; }
  } else if (screen == TYPES) { screen = LIST; routineAt = 0; }
  else if (screen == LIST) { if (TYPES_LIST[typeAt].count > 0) runRoutine(); }
  else if (screen == RUN) runRoutine();
  else if (screen == PICK_NET && netCount) { screen = TYPE_PASS; typed = ""; wheelAt = 1; }
  else if (screen == TYPE_PASS) {
    if (wheelAt) typed += WHEEL[wheelAt];
    else {                                     // OK: join
      joinWifi(nets[netAt], typed, "");
      runResult = "Joining " + nets[netAt] + "...\n\nThe corner says WIFI once it has." +
                  (serverUrl.length() ? "" : "\nLink it over the cable once, and it learns where the server is.");
      screen = RUN;
    }
  }
  dirty = true;
}

// The top button: back one step.
void back() {
  ledsDark();                                                   // C-38
  if (screen == INDEX_ENTRY) { screen = HOME; page = DAEMON; }
  else if (screen == TYPE_PASS) { if (typed.length()) typed.remove(typed.length() - 1); else screen = PICK_NET; }
  else if (screen == PICK_NET) screen = LIST;
  else if (screen == RUN) screen = LIST;
  else if (screen == LIST) screen = TYPES;
  else if (screen == TYPES) { screen = HOME; page = ROUTINES_PAGE; }
  dirty = true;
}

// ---- C-39: sleep. Hold the top button and press the front one: the screen, its light and the ring go dark. Turning
// the dial or pressing either button wakes it to the page it was on, and the wake does nothing else. The link keeps
// running underneath (readUsb, the Wi-Fi poll), so it wakes current.
bool asleep = false, chorded = false;

void sleepNow() {
  asleep = true;
  canvas.fillSprite(TFT_BLACK); canvas.pushSprite(0, 0);
  digitalWrite(TFT_BL, LOW);
  ledsSleep(true);
}

// True if this input was spent waking the board.
bool wake() {
  if (!asleep) return false;
  asleep = false;
  digitalWrite(TFT_BL, HIGH);
  ledsSleep(false);
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
String runNetworksInRange() {
  if (!wifiSet()) WiFi.mode(WIFI_STA);   // with no network set the radio is idle; it listens for the scan
  int n = WiFi.scanNetworks();
  if (n <= 0) return n == 0 ? "No networks in range." : "The scan did not finish. Press to try again.";
  String out = String(n) + (n == 1 ? " network in range:" : " networks in range:");
  for (int i = 0; i < n && i < 6; i++) {
    String name = WiFi.SSID(i);
    if (!name.length()) name = "(hidden)";
    out += "\n" + name + "  " + String(WiFi.RSSI(i)) + " dBm";
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
  loadWifi();
  if (wifiSet()) { WiFi.mode(WIFI_STA); WiFi.begin(wifiSsid.c_str(), wifiPass.c_str()); }
  ledsBegin();
  draw();
}

// C-36: the device asks for its daemon's art when the state names art it does not have -- through the bridge (ART?),
// or over Wi-Fi itself. At most every five seconds, so a missing server is not asked in a loop.
void askForArt() {
  if (!st.carrying || !st.daemon.artKey.length() || st.daemon.artKey == artKeyHave) return;
  if (artAskedAt && millis() - artAskedAt < 5000) return;
  artAskedAt = millis();
  if (usbLive()) { Serial.println("ART?"); return; }
  bool ok;
  String got = http("GET", "/api/device/art", "", &ok);
  if (ok) takeArt(got);
}

void loop() {
  readUsb();
  readEncoder();
  readKey();
  uint32_t now = millis();
  if (now - lastHello > HELLO_MS) { lastHello = now; Serial.println("HELLO daemons-companion t-embed-cc1101 1"); dirty = true; }
  if (!usbLive() && online()) {
    if (now - lastPoll > POLL_MS || (!st.have && now - lastPoll > 5000)) { lastPoll = now; httpState("GET", "/api/device/state", ""); }
    pollCommands(now);                        // C-32: what the site sent, over Wi-Fi
  }
  if (flashUntil && now > flashUntil) { flashUntil = 0; dirty = true; }
  askForArt();
  ledsLoop();
  if (dirty && !asleep) draw();
  delay(1);
}
