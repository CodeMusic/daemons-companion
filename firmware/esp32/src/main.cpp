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
// Turn the encoder: TODAY <-> DAEMON. Press it: the step is done.
#include <Arduino.h>
#include <ArduinoJson.h>
#include <TFT_eSPI.h>

#if __has_include("secrets.h")
#include "secrets.h"
#include <HTTPClient.h>
#include <WiFi.h>
#define COMPANION_HAS_WIFI 1
#else
#define COMPANION_HAS_WIFI 0
#endif

// LilyGO's own pin map (examples/utilities.h): the peripherals' power, and the encoder.
static const int PIN_PWR_EN = 15, PIN_ENC_A = 4, PIN_ENC_B = 5, PIN_ENC_KEY = 0;
static const int W = 320, H = 170;                       // landscape
static const uint32_t POLL_MS = 30000, USB_FRESH_MS = 15000, HELLO_MS = 3000;

TFT_eSPI tft;
TFT_eSprite canvas(&tft);   // drawn whole, then pushed, so nothing flickers

struct Daemon { String name, nickname; int level = 0, friendship = 0; };
struct State {
  bool have = false;
  String date, edition, season, day, colour = "#5b6b8c", note, virtue;
  long step = -1; String stepText, goal;
  bool carrying = false; Daemon daemon;
} st;

enum Page { TODAY, DAEMON } page = TODAY;
uint32_t usbSeen = 0, lastPoll = 0, lastHello = 0, flashUntil = 0;
String flash, lineIn;
bool dirty = true;

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
  if (doc["step"].isNull()) { st.step = -1; st.stepText = ""; st.goal = ""; }
  else { st.step = doc["step"]["id"] | -1; st.stepText = doc["step"]["text"] | ""; st.goal = doc["step"]["goal"] | ""; }
  st.carrying = !doc["daemon"].isNull();
  if (st.carrying) {
    st.daemon.name = doc["daemon"]["name"] | ""; st.daemon.nickname = doc["daemon"]["nickname"] | "";
    st.daemon.level = doc["daemon"]["level"] | 0; st.daemon.friendship = doc["daemon"]["friendship"] | 0;
  }
  dirty = true;
  return true;
}

// ---- drawing --------------------------------------------------------------------------------------------------------
int wrap(const String &text, int x, int y, int w, int font, int lineH, int maxLines, uint16_t colour) {
  canvas.setTextFont(font); canvas.setTextColor(colour); canvas.setTextDatum(TL_DATUM);
  String line, word; int lines = 0;
  auto flush = [&]() { if (lines < maxLines) canvas.drawString(line, x, y + lines * lineH); lines++; line = ""; };
  for (unsigned i = 0; i <= text.length(); i++) {
    char c = i < text.length() ? text[i] : ' ';
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

const char *linkName() {
  if (millis() - usbSeen < USB_FRESH_MS && usbSeen) return "USB";
#if COMPANION_HAS_WIFI
  if (WiFi.status() == WL_CONNECTED) return "WIFI";
  return "WIFI...";
#else
  return "NO LINK";
#endif
}

void draw() {
  uint16_t day = hex565(st.colour), ink = lightColour(st.colour) ? INK : PAPER;
  canvas.fillSprite(INK);
  // the day's band
  canvas.fillRect(0, 0, W, 26, day);
  canvas.setTextFont(2); canvas.setTextColor(ink); canvas.setTextDatum(ML_DATUM);
  canvas.drawString(st.have ? upper(st.day) + "  " + st.note + "  " + upper(st.season) : "DAEMONS COMPANION", 8, 13);
  canvas.setTextDatum(MR_DATUM);
  canvas.drawString(linkName(), W - 8, 13);

  if (!st.have) {
    wrap("Looking for the companion.", 10, 40, W - 20, 4, 28, 2, PAPER);
    wrap(COMPANION_HAS_WIFI ? "Wi-Fi is set. Is the server running, with \"host\": \"0.0.0.0\"?"
                            : "Run usb_bridge.py on the computer, or add include/secrets.h for Wi-Fi.",
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
      canvas.setTextFont(4); canvas.setTextColor(PAPER); canvas.drawString(st.daemon.nickname, 10, 58);
      canvas.setTextFont(2); canvas.setTextColor(QUIET);
      canvas.drawString(st.daemon.name + "  L" + String(st.daemon.level), 10, 92);
      canvas.drawString("friendship " + String(st.daemon.friendship), 10, 112);
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
#if COMPANION_HAS_WIFI
bool httpState(const char *method, const String &path, const String &body) {
  if (WiFi.status() != WL_CONNECTED) return false;
  HTTPClient http;
  http.setTimeout(4000);
  http.begin(String(COMPANION_SERVER) + path);
  int code;
  if (!strcmp(method, "POST")) { http.addHeader("content-type", "application/json"); code = http.POST(body); }
  else code = http.GET();
  bool ok = code == 200 && takeState(http.getString());
  http.end();
  return ok;
}
#endif

bool usbLive() { return usbSeen && millis() - usbSeen < USB_FRESH_MS; }

void tick() {
  if (!st.have || st.step < 0) { say("Nothing yet"); return; }
  long id = st.step;
  if (usbLive()) { Serial.printf("TICK %ld\n", id); say("Done."); return; }
#if COMPANION_HAS_WIFI
  if (httpState("POST", "/api/device/ticks", "{\"steps\":[" + String(id) + "]}")) { say("Done."); return; }
#endif
  say("No link");
}

void readUsb() {
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\n') {
      lineIn.trim();
      if (lineIn.startsWith("STATE ") && takeState(lineIn.substring(6))) usbSeen = millis();
      else if (lineIn == "PING") { usbSeen = millis(); Serial.println("PONG"); }
      lineIn = "";
    } else if (lineIn.length() < 4096) lineIn += c;
  }
}

// ---- the encoder: a quadrature state table, read every pass of the loop -------------------------------------------
int8_t encLast = 0, encSum = 0;
void readEncoder() {
  static const int8_t table[16] = {0, -1, 1, 0, 1, 0, 0, -1, -1, 0, 0, 1, 0, 1, -1, 0};
  int8_t now = (digitalRead(PIN_ENC_A) << 1) | digitalRead(PIN_ENC_B);
  encSum += table[(encLast << 2) | now];
  encLast = now;
  if (encSum >= 4 || encSum <= -4) { page = page == TODAY ? DAEMON : TODAY; encSum = 0; dirty = true; }
}

bool keyWas = true; uint32_t keyAt = 0;
void readKey() {
  bool up = digitalRead(PIN_ENC_KEY);
  if (up != keyWas && millis() - keyAt > 30) { keyAt = millis(); keyWas = up; if (!up) tick(); }
}

void setup() {
  pinMode(PIN_PWR_EN, OUTPUT); digitalWrite(PIN_PWR_EN, HIGH);
  Serial.begin(115200);
  pinMode(PIN_ENC_A, INPUT_PULLUP); pinMode(PIN_ENC_B, INPUT_PULLUP); pinMode(PIN_ENC_KEY, INPUT_PULLUP);
  encLast = (digitalRead(PIN_ENC_A) << 1) | digitalRead(PIN_ENC_B);
  tft.init(); tft.setRotation(3); tft.fillScreen(INK);
  pinMode(TFT_BL, OUTPUT); digitalWrite(TFT_BL, HIGH);
  canvas.setColorDepth(16);
  canvas.createSprite(W, H);
#if COMPANION_HAS_WIFI
  WiFi.mode(WIFI_STA);
  WiFi.begin(COMPANION_WIFI_SSID, COMPANION_WIFI_PASSWORD);
#endif
  draw();
}

void loop() {
  readUsb();
  readEncoder();
  readKey();
  uint32_t now = millis();
  if (now - lastHello > HELLO_MS) { lastHello = now; Serial.println("HELLO daemons-companion t-embed-cc1101 1"); dirty = true; }
#if COMPANION_HAS_WIFI
  if (!usbLive() && (now - lastPoll > POLL_MS || (!st.have && now - lastPoll > 5000))) {
    lastPoll = now;
    httpState("GET", "/api/device/state", "");
  }
#endif
  if (flashUntil && now > flashUntil) { flashUntil = 0; dirty = true; }
  if (dirty) draw();
  delay(1);
}
