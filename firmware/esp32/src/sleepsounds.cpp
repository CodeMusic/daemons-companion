// C-334 (the user, 2026-11-11: "on the watch where we would want the battery to last as long as possible as you drift to
// sleep -- it should be smart enough to turn off other power hungry features to maximize the sleep sounds"): SLEEP
// SOUNDS on the Ultra. The hub makes a piece for the carried daemon as tonight finds them (server/src/sleeptracks.ts,
// on roverbyteseer's ACE-Step); the watch keeps it on its card as watch.wav (16 kHz mono PCM) and plays it from there,
// looped, for thirty minutes, the last ten fading to nothing -- the same as the app. While it plays the screen is dark
// and GPS, Wi-Fi, LoRa and Bluetooth are off (nightQuiet(), powerLora(), powerMeet() ask sleepSoundsPlaying()); a tap
// shows what is playing for six seconds, the top button (or a hold) stops it. No network: the newest piece kept plays.
// The watch's speaker only: the S3 has no Bluetooth Classic, so no Bluetooth headphones (A2DP) -- the app has those.
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include "app.h"
#include "card.h"
#include "sound.h"
#include "leds.h"
#include "lora.h"
#include "meet.h"

extern String relayKey;                                     // net.cpp
static bool playing = false;
bool sleepSoundsPlaying() { return playing; }

static const uint32_t SESSION_S = 1800, FADE_S = 600, KEEP = 3;   // the app's sleepSession.ts: 30 minutes, the last 10 fading
static const char *DIR = "sleep";

static String keptName(const String &id) { return String(DIR) + "/" + id + ".wav"; }

// the card keeps the newest few (names are the hub's ids; the order kept in sleep/order.txt, newest last)
static void remember(const String &id) {
  String order = cardRead(String(DIR) + "/order.txt"), out;
  std::vector<String> ids;
  for (int a = 0, b; a < (int)order.length(); a = b + 1) {
    b = order.indexOf('\n', a); if (b < 0) b = order.length();
    String one = order.substring(a, b); one.trim();
    if (one.length() && one != id) ids.push_back(one);
  }
  ids.push_back(id);
  while (ids.size() > KEEP) { cardRemove(keptName(ids.front())); ids.erase(ids.begin()); }
  for (auto &i : ids) out += i + "\n";
  cardWrite(String(DIR) + "/order.txt", out);
}
static String newestKept() {
  String order = cardRead(String(DIR) + "/order.txt");
  for (int b = order.length() - 1; b > 0; ) {
    int a = order.lastIndexOf('\n', b - 1);
    String one = order.substring(a + 1, b); one.trim();
    if (one.length() && cardHas(keptName(one))) return one;
    b = a; if (a < 0) break;
  }
  return "";
}

// the piece onto the card, whole or not at all (about 9 MB, half a minute or so on the house's Wi-Fi)
static bool fetch(const String &id) {
  if (cardHas(keptName(id))) return true;
  if (!online() || !serverUrl.length()) return false;
  HTTPClient h;
  h.setTimeout(30000);
  h.begin(serverUrl + "/api/sleep/track/" + id + "/watch.wav");
  h.addHeader("x-device", deviceId());
  if (relayKey.length() >= 16) h.addHeader("authorization", "Bearer " + relayKey);   // its own key, as the meeting's uploads send it
  if (h.GET() != 200) { h.end(); return false; }
  WiFiClient *in = h.getStreamPtr();
  int all = h.getSize(), left = all;
  if (!cardStreamBegin(keptName(id))) { h.end(); return false; }
  static uint8_t buf[2048];
  uint32_t quietSince = millis(), shownAt = 0;
  while (left != 0 && millis() - quietSince < 10000) {
    int got = in->readBytes(buf, min((int)sizeof buf, left > 0 ? left : (int)sizeof buf));
    if (got <= 0) continue;
    quietSince = millis();
    if (left > 0) left -= got;
    cardStreamWrite(buf, got);
    if (all > 0 && millis() - shownAt > 1000) { shownAt = millis(); progress("ONTO THE CARD... " + String(100 - 100LL * left / all) + "%"); }   // DRAFT
    if (giveUp()) { left = -2; break; }
  }
  cardStreamEnd(left == 0);
  h.end();
  if (left != 0) return false;
  remember(id);
  return true;
}

// a WAV's chunks walked to its samples (ffmpeg writes a LIST chunk before them)
static bool openAt(const String &name) {
  if (!cardStreamOpen(name)) return false;
  uint8_t hd[12];
  if (cardStreamRead(hd, 12) != 12 || memcmp(hd, "RIFF", 4) || memcmp(hd + 8, "WAVE", 4)) { cardStreamClose(); return false; }
  while (true) {
    uint8_t ch[8];
    if (cardStreamRead(ch, 8) != 8) { cardStreamClose(); return false; }
    uint32_t n = ch[4] | ch[5] << 8 | ch[6] << 16 | (uint32_t)ch[7] << 24;
    if (!memcmp(ch, "data", 4)) return true;
    static uint8_t skip[256];
    for (n += n & 1; n; ) { size_t k = cardStreamRead(skip, min((uint32_t)sizeof skip, n)); if (!k) { cardStreamClose(); return false; } n -= k; }
  }
}

static void dark(bool on) {
  if (on) { canvas.fillSprite(TFT_BLACK); present(); backlight(false); panelRest(true); }
  else { panelRest(false); backlightDim(); }
  ledsSleep(on);
  powerAsleep(on);                                          // 80 MHz: enough for 16 kHz from the card
}

// what was put off while it plays, switched off now rather than at the end (the routine holds the loop)
static void quietLoops(uint32_t now) {
  int sp = st.carrying ? st.daemon.species : 0;
  uplinkLoop(now); gpsLoop(now); loraLoop(now, cfg.meet, sp); meetLoop(now, powerMeet(), sp);
  nightLoop(now); batteryLoop(now); powerLoop(now);
}

String runSleepSounds() {
  if (board.kind != BoardKind::TWatchUltra || !cardReady()) return "SLEEP SOUNDS keep to the Ultra's card -- is one in?";   // DRAFT
  String id, said, name = daemonName();
  progress("ASKING THE HUB...");                                                                // DRAFT
  bool ok; String got = http("GET", "/api/sleep", "", &ok);
  JsonDocument d;
  if (ok && !deserializeJson(d, got)) {
    // tonight's piece if it is made; else ask for it, and play the newest made for this daemon meanwhile
    JsonVariant cur = d["current"];
    if (!cur.isNull() && String((const char *)(cur["state"] | "")) == "ready") { id = cur["id"] | ""; said = cur["said"] | ""; }
    else {
      if ((d["maker"] | false) && (cur.isNull() || String((const char *)(cur["state"] | "")) == "failed")) http("POST", "/api/sleep/make", "{}");
      for (JsonVariant t : d["tracks"].as<JsonArray>())
        if (String((const char *)(t["state"] | "")) == "ready") { id = t["id"] | ""; said = t["said"] | ""; break; }
      if (!id.length() && !newestKept().length())
        return String("Tonight's piece for ") + name + " is being made -- about five minutes. Try again then.";   // DRAFT
    }
  }
  if (id.length() && !fetch(id)) id = "";
  if (!id.length()) { id = newestKept(); said = ""; }
  if (!id.length()) return online() ? "The hub has no piece yet." : "NEEDS WI-FI the first time";   // DRAFT
  if (!openAt(keptName(id))) { cardRemove(keptName(id)); return "That piece on the card is spoiled -- try again."; }   // DRAFT

  String head = "SLEEP SOUNDS\n" + (said.length() ? said : "For " + name + ".") + "\n30 MIN, THE LAST 10 FADING";   // DRAFT
  progress(head);
  uint32_t showUntil = millis() + 8000, loopsAt = 0;
  bool shown = true, stopped = false;
  playing = true;
  static int16_t buf[512];
  uint64_t heard = 0;                                       // samples played: the clock the fade is read from
  while (heard < (uint64_t)SESSION_S * 16000) {
    size_t got = cardStreamRead((uint8_t *)buf, sizeof buf) / 2;
    if (!got) { cardStreamClose(); if (!openAt(keptName(id))) break; continue; }   // the end: round again (made to loop)
    float t = heard / 16000.0f, x = t < SESSION_S - FADE_S ? 0 : (t - (SESSION_S - FADE_S)) / FADE_S;
    soundPcmLevel(buf, got, (1 - x) * (1 - x));
    heard += got;
    uint32_t now = millis();
    if (shown && now > showUntil) { shown = false; dark(true); }
    if (now - loopsAt > 1000) { loopsAt = now; quietLoops(now); }
    int step, ev; routineInput(step, ev);
    if (ev == -1 || giveUp()) { stopped = true; break; }
    if ((ev == 1 || step) && !shown) {                    // a tap: what plays, and how long is left
      shown = true; dark(false); showUntil = now + 6000;
      int left = (SESSION_S * 16000 - heard) / 16000 / 60;
      progress(head + "\n" + String(left + 1) + " MIN LEFT -- the top button stops it");   // DRAFT
    }
  }
  cardStreamClose();
  playing = false;
  if (stopped) {
    if (!shown) dark(false);
    return "";
  }
  if (shown) dark(false);
  sleepNow();                                               // it played out: the watch stays dark (and quiet, if its daemon is tucked in)
  return "";
}
