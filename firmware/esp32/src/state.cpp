// What the server said, and the board's settings (C-67: from main.cpp).
#include <Preferences.h>
#include <mbedtls/base64.h>
#include "app.h"
#include "broadcast.h"
#include "expression.h"
#include "sound.h"
#include "leds.h"
#include "meet.h"

State st;
Settings cfg;
bool dirty = true;
Battery bat;                               // C-63: read in net.cpp's batteryLoop

void applySettings() {
  soundSettings(cfg.sound, cfg.volume);
  ledsBrightness(cfg.ring);
}

void loadSettings() {
  Preferences p; p.begin("settings", true);
  cfg.home = p.getString("home", cfg.home); cfg.sleepAfter = p.getInt("sleep", cfg.sleepAfter);
  cfg.sound = p.getBool("sound", cfg.sound); cfg.volume = p.getInt("volume", cfg.volume); cfg.ring = p.getInt("ring", cfg.ring);
  cfg.meet = p.getBool("meet", cfg.meet); cfg.band = p.getInt("band", cfg.band);
  cfg.wakeEvery = p.getBool("wake", cfg.wakeEvery);         // C-159
  cfg.face = p.getString("face", cfg.face);                 // C-162
  cfg.faceSky = p.getBool("sky", cfg.faceSky);              // C-163
  cfg.hours = p.getInt("hours", cfg.hours);                 // C-166
  p.end();
  applySettings();
}

static void saveSettings() {
  Preferences p; p.begin("settings", false);
  p.putString("home", cfg.home); p.putInt("sleep", cfg.sleepAfter); p.putBool("sound", cfg.sound);
  p.putInt("volume", cfg.volume); p.putInt("ring", cfg.ring); p.putBool("meet", cfg.meet); p.putInt("band", cfg.band);
  p.putBool("wake", cfg.wakeEvery);                         // C-159
  p.putString("face", cfg.face);                            // C-162
  p.putBool("sky", cfg.faceSky);                            // C-163
  p.putInt("hours", cfg.hours);                             // C-166
  p.end();
}
// C-159: SOUND changed on the board -- a state already on its way still says the old one, so for a little while the
// board's own word stands
static uint32_t soundHereAt = 0;
void soundSetHere(bool on) {
  cfg.sound = on; soundHereAt = millis();
  saveSettings(); applySettings();
  report("setting", String("sound ") + (on ? "on " : "off ") + deviceId());
}
void takeSettings(JsonVariant s) {
  Settings got;
  got.home = s["home"] | cfg.home.c_str(); got.sleepAfter = s["sleepAfter"] | cfg.sleepAfter;
  got.sound = s["sound"] | cfg.sound; got.volume = s["volume"] | cfg.volume; got.ring = s["ring"] | cfg.ring;
  got.meet = s["meet"] | cfg.meet; got.band = s["band"] | cfg.band;
  got.wakeEvery = String((const char *)(s["wakeSound"] | (cfg.wakeEvery ? "every" : "power"))) == "every";   // C-159
  got.face = s["face"] | cfg.face.c_str();                  // C-162
  got.faceSky = s["faceSky"] | cfg.faceSky;                 // C-163
  got.hours = (s["hours"] | cfg.hours) == 12 ? 12 : 24;     // C-166
  if (soundHereAt && millis() - soundHereAt < 30000) got.sound = cfg.sound;
  if (got.home == cfg.home && got.sleepAfter == cfg.sleepAfter && got.sound == cfg.sound && got.volume == cfg.volume &&
      got.ring == cfg.ring && got.meet == cfg.meet && got.band == cfg.band && got.wakeEvery == cfg.wakeEvery && got.face == cfg.face && got.faceSky == cfg.faceSky && got.hours == cfg.hours) return;
  cfg = got;
  saveSettings();
  applySettings();
}

// ---- the state, from the server's JSON ------------------------------------------------------------------------------
// "#rrggbb" to its number -- 0 for anything shorter, or without the #, rather than reading past an empty string's end
static long hexColour(const char *s, long otherwise = 0) { return s && s[0] == '#' && s[1] ? strtol(s + 1, nullptr, 16) : otherwise; }
bool takeState(const String &json) { return takeState(json.c_str()); }
// C-121: read where it lies -- a STATE line's own buffer, not a copy of it: on the M5GO (no PSRAM) the copy's 2.6 KB
// was sometimes the difference between a state taken and one refused
bool takeState(const char *json) {
  JsonDocument whole;
  if (deserializeJson(whole, json)) return false;
  // GET /api/device/state is the state; POST /api/device/ticks answers {done, state}.
  JsonVariant doc = whole.as<JsonVariant>();
  if (!whole["state"].isNull()) doc = whole["state"].as<JsonVariant>();
  st.have = true;
  st.date = doc["date"] | ""; st.edition = doc["edition"] | ""; st.season = doc["season"] | "";
  st.day = doc["day"]["name"] | ""; st.colour = doc["day"]["colour"] | "#5b6b8c";
  st.note = doc["day"]["note"] | ""; st.virtue = doc["day"]["virtue"] | "";
  st.companion = doc["companion"] | ""; st.cardNote = doc["cardNote"] | "";   // C-124
  st.chakra = doc["day"]["chakra"] | ""; st.theme = doc["day"]["theme"] | "";   // C-73
  // C-33: where the server is on the Wi-Fi, when it says (it listens on the network) -- kept for when the cable is out
  const char *lan = doc["server"] | "";
  if (strlen(lan) && serverUrl != lan) {
    serverUrl = lan;
    Preferences p; p.begin("uplink", false); p.putString("server", serverUrl); p.end();
  }
  // C-82: the relay's address and this board's own key -- only ever in the state the cable's bridge carries
  if (!doc["away"].isNull()) takeAway(doc["away"]["url"] | "", doc["away"]["key"] | "");
  if (!doc["clock"].isNull()) watchSetClock(doc["clock"]["epoch"] | 0, doc["clock"]["offset"] | 0);   // C-71
  if (doc["casts"].is<JsonArrayConst>()) castFromState(doc["casts"].as<JsonArrayConst>());   // C-134: broadcasts, once each
  playFromState(doc["play"]);                // T-426: the instrument, its lock and the songs learned
  soundDay(st.note);                         // C-40: the interactions are in the day's key
  soundEdition(st.edition);                  // C-164: and on the save's own instrument
  if (!doc["settings"].isNull()) takeSettings(doc["settings"]);
  meetSetOurs(doc["beacons"] | "");          // C-15: our other companions (the phone) are never a meeting
  netsRevSeen(doc["netsRev"] | -1L);         // C-93: another device learned or forgot a network
  st.menu = doc["day"]["menu"] | st.colour.c_str();     // C-37: the tamed rainbow week, else the game's trim
  st.led = doc["day"]["led"] | st.menu.c_str();
  ledsDay(hexColour(st.led.c_str()));
  if (doc["step"].isNull()) { st.step = -1; st.stepText = ""; st.goal = ""; }
  else {
    st.step = doc["step"]["id"] | -1; st.stepText = doc["step"]["text"] | ""; st.goal = doc["step"]["goal"] | "";
    st.milestone = doc["step"]["milestone"]["title"] | ""; st.msAt = doc["step"]["milestone"]["at"] | 0;
    st.msOf = doc["step"]["milestone"]["of"] | 0;
  }
  // C-149: the CASINO's coins, and the holiday (none: an ordinary day)
  JsonVariant cs = doc["casino"];
  st.casino.have = !cs.isNull();
  st.casino.known = strstr(json, "\"casino\":") != nullptr;   // an older companion says nothing of it
  st.casino.look = "";                                       // no dress: the board's own rule (casino.cpp lookNow)
  if (st.casino.have) {
    st.casino.money = cs["money"] | 0L; st.casino.pending = cs["pending"] | 0L; st.casino.balance = cs["balance"] | 0L;
    st.casino.seen = cs["seen"] | ""; st.casino.friendN = 0;
    for (JsonVariant f : cs["friends"].as<JsonArray>()) if (st.casino.friendN < 5) st.casino.friends[st.casino.friendN++] = f | 0;
    // C-158: the day's luck and its biggest reason; the reels' daemons, seen in the game
    st.casino.luck = cs["context"]["luck"] | 0.0f; st.casino.why = "";
    float most = 0;
    for (JsonVariant r : cs["context"]["reasons"].as<JsonArray>()) {
      float e = r["effect"] | 0.0f;
      if (fabsf(e) > most) { most = fabsf(e); st.casino.why = r["why"] | ""; }
    }
    st.casino.reelN = 0;
    for (JsonVariant r : cs["reel"].as<JsonArray>()) if (st.casino.reelN < 3) st.casino.reel[st.casino.reelN++] = r["species"] | 0;
    JsonVariant dr = cs["dress"];                        // C-158: how it is dressed, decided once by the companion
    if (!dr.isNull()) {
      st.casino.look = dr["look"] | ""; st.casino.hat = dr["hat"] | "none";
      for (int i = 0; i < 2; i++) { const char *c = dr["colours"][i] | "#000000"; st.casino.colour[i] = hexColour(c); }
    }
    st.casino.tableN = 0;                                // C-151: our other boards at the reels
    for (JsonVariant t : cs["table"].as<JsonArray>()) if (st.casino.tableN < 4) {
      st.casino.tableSpecies[st.casino.tableN] = t["species"] | 0; st.casino.table[st.casino.tableN++] = t["name"] | "";
    }
  }
  st.watch = doc["world"]["watch"] | ""; st.sky = doc["world"]["weather"]["kind"] | "";   // C-158: the real world
  JsonVariant hd = doc["holiday"];
  st.holiday = Holiday();
  if (!hd.isNull()) {
    st.holiday.name = hd["name"] | ""; st.holiday.look = hd["look"] | "none"; st.holiday.hat = hd["hat"] | "none";
    st.holiday.quiet = hd["quiet"] | false; st.holiday.flip = hd["flip"] | false;
    for (int i = 0; i < 2; i++) { const char *c = hd["colours"][i] | "#000000"; st.holiday.colour[i] = hexColour(c); }
  }
  st.partyN = 0;                             // C-68: the party and its routines
  for (JsonVariant p : doc["party"].as<JsonArray>()) {
    if (st.partyN >= 6) break;
    Member &m = st.party[st.partyN++];
    m.name = p["name"] | ""; m.level = p["level"] | 0; m.types = ""; m.n = 0;
    for (JsonVariant t : p["types"].as<JsonArray>()) m.types += (m.types.length() ? " / " : "") + String((const char *)(t | ""));
    for (JsonVariant r : p["routines"].as<JsonArray>()) {
      if (m.n >= 4) break;
      m.routine[m.n] = r["name"] | "?"; m.type[m.n] = r["type"] | "";
      const char *c = r["colour"] | "#ffffff"; m.colour[m.n++] = hexColour(c, 0xFFFFFF);
    }
  }
  if (partyAt >= partyRows()) partyAt = 0;   // the party changed under the screen
  if (screen == MOVES && (partyAt >= st.partyN || moveAt >= st.party[partyAt].n)) { screen = PARTY; moveAt = 0; }
  st.carrying = !doc["daemon"].isNull();
  if (st.carrying) {
    st.daemon.name = doc["daemon"]["name"] | ""; st.daemon.nickname = doc["daemon"]["nickname"] | "";
    st.daemon.level = doc["daemon"]["level"] | 0; st.daemon.friendship = doc["daemon"]["friendship"] | 0;
    st.daemon.holding = doc["daemon"]["holding"] | "";   // what it held when it was sent (T-374)
    st.daemon.category = doc["daemon"]["category"] | ""; st.daemon.entry = doc["daemon"]["entry"] | "";
    st.daemon.entry.replace("\n", " ");     // the game's line breaks are for its own window; this screen wraps its own
    st.daemon.artKey = doc["daemon"]["artKey"] | "";
    st.daemon.species = doc["daemon"]["species"] | 0;
    st.daemon.margin = doc["daemon"]["margin"] | "";      // C-149: OPUS's margin beside its entry
    st.daemon.margin.replace("\n", " ");
    JsonVariant lf = doc["daemon"]["life"];
    st.daemon.word = lf["word"] | ""; st.daemon.cue = lf["cue"] | "";
    st.daemon.grownTo = doc["daemon"]["grown"]["level"] | 0;
    st.daemon.fed = lf["fed"]["today"] | 0; st.daemon.watered = lf["watered"]["today"] | 0; st.daemon.due = lf["fed"]["due"] | 0;
    st.daemon.tired = lf["tired"] | "awake";
    takeExpression(doc["daemon"]["expression"]);         // C-119: how it looks now, decided on the server
    JsonVariant dn = doc["daemon"]["den"];                // C-113: its den (server/src/dens.ts); CONTENT's if none
    st.daemon.den = Den();
    if (!dn.isNull()) {
      st.daemon.den.motif = dn["motif"] | "nest"; st.daemon.den.wall = dn["wall"] | "#67625a"; st.daemon.den.deep = dn["deep"] | "#3b3832";
      st.daemon.den.floor = dn["floor"] | "#2b2924"; st.daemon.den.glow = dn["glow"] | "#e4ded3";
    }
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
int dayIndex() {                                  // C-50: the day, Sunday 0, for its tunes
  static const char *D[] = { "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday" };
  for (int i = 0; i < 7; i++) if (st.day == D[i]) return i;
  return 0;
}

// C-51: the routines are the daemon's -- they speak in its name
String daemonName() { return st.carrying && st.daemon.nickname.length() ? st.daemon.nickname : "Your daemon"; }
