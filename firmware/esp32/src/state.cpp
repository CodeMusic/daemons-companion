// What the server said, and the board's settings (C-67: from main.cpp).
#include <Preferences.h>
#include <mbedtls/base64.h>
#if CONFIG_IDF_TARGET_ESP32S3
#include <LittleFS.h>
#include <vector>
#endif
#include "app.h"
#include "card.h"
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
  soundForce(cfg.instrument); playForce(cfg.instrument);   // PLAY to test
  if (!asleep) backlight(true);                             // C-243: low power dims it
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
  cfg.instrument = p.getString("instr", cfg.instrument);    // PLAY to test
  cfg.quick = p.getString("quick", cfg.quick);              // C-206
  p.getBytes("power", &cfg.power, sizeof cfg.power);         // C-242: kept whole (plain values, its size checked by the read)
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
  p.putString("instr", cfg.instrument);                     // PLAY to test
  p.putString("quick", cfg.quick);                          // C-206
  p.putBytes("power", &cfg.power, sizeof cfg.power);         // C-242
  p.end();
}
// C-159: SOUND changed on the board -- a state already on its way still says the old one, so for a little while the
// board's own word stands
static uint32_t soundHereAt = 0;
uint32_t lowHereAt = 0;                                      // C-243: the same for low power, switched on the watch
void soundSetHere(bool on) {
  cfg.sound = on; soundHereAt = millis();
  saveSettings(); applySettings();
  report("setting", String("sound ") + (on ? "on " : "off ") + deviceId());
}
void settingsChanged() { saveSettings(); applySettings(); dirty = true; }
// C-243: low power switched on the watch itself (its SETTINGS, "INDEX, low power on", or ended by its charger) -- kept,
// applied, and told to the companion as its own setting, so the app's BATTERY agrees
void powerSetLow(bool on) {
  if (cfg.power.low == on) return;
  cfg.power.low = on; lowHereAt = millis();
  saveSettings(); applySettings();
  report("setting", String("low ") + (on ? "on " : "off ") + deviceId());
  dirty = true;
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
  got.instrument = s["instrument"] | cfg.instrument.c_str();   // PLAY to test
  got.quick = cfg.quick;
  if (s["quick"].is<JsonArrayConst>()) {                    // C-206: three names, kept as "a,b,c"
    String q; for (JsonVariantConst v : s["quick"].as<JsonArrayConst>()) q += (q.length() ? "," : "") + String((const char *)(v | ""));
    got.quick = q;
  }
  JsonVariant pw = s["power"];                               // C-242: absent from an older companion -- kept as it was
  if (!pw.isNull()) {
    got.power.low = pw["low"] | cfg.power.low; got.power.gps = pw["gps"] | cfg.power.gps; got.power.lora = pw["lora"] | cfg.power.lora;
    got.power.meet = pw["meet"] | cfg.power.meet; got.power.aod = pw["aod"] | cfg.power.aod; got.power.pulses = pw["pulses"] | cfg.power.pulses;
    got.power.poll = constrain((int)(pw["poll"] | cfg.power.poll), 30, 600);
    got.power.gpsOnMove = pw["gpsOnMove"] | cfg.power.gpsOnMove; got.power.radiosOnMove = pw["radiosOnMove"] | cfg.power.radiosOnMove;
    got.power.stillMinutes = constrain((int)(pw["stillMinutes"] | cfg.power.stillMinutes), 1, 60);
  } else got.power = cfg.power;
  if (soundHereAt && millis() - soundHereAt < 30000) got.sound = cfg.sound;
  if (lowHereAt && millis() - lowHereAt < 60000) got.power.low = cfg.power.low;   // C-243: switched here, not yet heard there
  if (got.home == cfg.home && got.sleepAfter == cfg.sleepAfter && got.sound == cfg.sound && got.volume == cfg.volume &&
      got.ring == cfg.ring && got.meet == cfg.meet && got.band == cfg.band && got.wakeEvery == cfg.wakeEvery && got.face == cfg.face && got.faceSky == cfg.faceSky && got.hours == cfg.hours && got.instrument == cfg.instrument && got.quick == cfg.quick && got.power == cfg.power) return;
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
  JsonVariant tk = doc["talk"];                              // C-211
  st.talk.have = !tk.isNull();
  if (st.talk.have) { st.talk.first = tk["first"] | "n8n"; st.talk.n8n = tk["n8n"] | false; st.talk.module = tk["module"] | false; }
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
  gpsFromState(doc["find"]);                               // C-174: the app asked where it is
  nightFromState(doc["dream"]);                            // C-200: the module's telling of the night
  intuitionFromState(doc["subtle"]);                       // C-203: once the save holds THE SUBTLE LAYER
  hermeticFromState(doc["hermetic"]);                      // C-238: the hour's first sight, still to be said
  halloweenFromState(doc["halloween"]);                    // C-240: the costume, a treat just left
  { JsonVariant gf = doc["gift"];                            // C-185: the HANDSHAKE given -- told once
    if (!gf.isNull()) activityGift(gf["name"] | "", gf["at"] | "", gf["home"] | false); }
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
    m.artKey = p["artKey"] | ""; m.slot = p["slot"] | -1;   // its picture, fetched ahead (askForArt)
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
    { int was = st.daemon.grownTo, now = doc["daemon"]["grown"]["level"] | 0;   // C-183: it grew while here
      st.daemon.grownTo = now;
      st.daemon.expTotal = doc["daemon"]["grown"]["total"] | 0L; st.daemon.expFrom = doc["daemon"]["grown"]["from"] | 0L;
      st.daemon.expNext = doc["daemon"]["grown"]["next"] | 0L;
      if (was > 0 && now > was) activityGrew(now); }
    { JsonVariant ev = doc["daemon"]["evolved"];             // C-184: it evolved here -- told once
      if (!ev.isNull()) activityEvolved(ev["from"] | "", ev["to"] | "", ev["at"] | ""); }
    st.daemon.fed = lf["fed"]["today"] | 0; st.daemon.watered = lf["watered"]["today"] | 0; st.daemon.due = lf["fed"]["due"] | 0;
    st.daemon.tired = lf["tired"] | "awake";
    takeExpression(doc["daemon"]["expression"]);         // C-119: how it looks now, decided on the server
    takeThrive(doc["daemon"]["thrive"]);                 // C-207: and how the week has gone
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

// The pictures already fetched, by artKey, so a daemon changed on the board shows at once (the user, 2026-10-28: "if I
// change the daemon that's on it the sprite doesn't load, you just see the shadow; eventually it usually loads"): the
// party's are fetched ahead (askForArt), and on the Ultra each is kept on the card too. Seven where there is PSRAM (the
// party and one away in a box), two elsewhere (the one before, back at once).
struct KeptArt { String key; uint16_t pal[16]; uint8_t *pix = nullptr; uint32_t used = 0; };
static KeptArt kept[7];
static int keptN() { return psramFound() ? 7 : 2; }
static KeptArt *keptFor(const String &key) {
  for (int i = 0; i < keptN(); i++) if (kept[i].pix && kept[i].key == key) return &kept[i];
  return nullptr;
}
bool artCached(const String &key) { return keptFor(key) != nullptr; }
static void keep(const String &key, const uint16_t *pal, const uint8_t *pix) {
  KeptArt *k = keptFor(key);
  if (!k) {
    k = &kept[0];
    for (int i = 0; i < keptN(); i++) { if (!kept[i].pix || kept[i].used < k->used) k = &kept[i]; if (!kept[i].pix) break; }
    if (!k->pix) k->pix = (uint8_t *)(psramFound() ? ps_malloc(sizeof artPix) : malloc(sizeof artPix));
    if (!k->pix) return;
  }
  k->key = key; memcpy(k->pal, pal, sizeof k->pal); memcpy(k->pix, pix, sizeof artPix); k->used = millis();
}
static void show(const String &key, const uint16_t *pal, const uint8_t *pix) {
  memcpy(artPal, pal, sizeof artPal); memcpy(artPix, pix, sizeof artPix);
  artKeyHave = key; dirty = true;
}

// A picture as the server sends it. The reply names whose it is (`artKey`; a server before 2026-10-28 does not, and the
// one asked for is assumed): one fetched for a daemon since changed is kept, not shown under the new one's name.
// C-241: and where there is no card (the user's Ultra has none), on the board's own flash -- the partition the build
// leaves for files, mounted once (formatted the first time), the last eight pictures kept. Without it, a board with no
// Wi-Fi asked a phone in a pocket for every picture after every start, and showed the shadow for minutes.
// Only on the S3s: on the M5GO's ESP32 LittleFS's flash code overflows IRAM, and its boards have cards (C-255).
#if CONFIG_IDF_TARGET_ESP32S3
static bool flashReady() {
  static int8_t ok = -1;
  if (ok < 0) ok = psramFound() && LittleFS.begin(true) ? 1 : 0;
  return ok == 1;
}
static void flashKeep(const String &key, const String &json) {
  if (cardReady() || !flashReady()) return;
  if (!LittleFS.exists("/art")) LittleFS.mkdir("/art");
  File d = LittleFS.open("/art"); std::vector<String> names; String oldest; time_t oldestAt = 0;
  for (File f = d.openNextFile(); f; f = d.openNextFile()) {
    names.push_back(f.name());
    if (!oldest.length() || f.getLastWrite() < oldestAt) { oldest = f.name(); oldestAt = f.getLastWrite(); }
  }
  if (names.size() >= 8 && oldest.length()) LittleFS.remove("/art/" + oldest);
  File f = LittleFS.open("/art/" + key + ".json", "w");
  if (f) { f.print(json); f.close(); }
}
static String flashRead(const String &key) {
  if (cardReady() || !flashReady()) return "";
  File f = LittleFS.open("/art/" + key + ".json", "r");
  if (!f) return "";
  String s = f.readString(); f.close();
  return s;
}
#else
static void flashKeep(const String &, const String &) {}
static String flashRead(const String &) { return ""; }
#endif

bool takeArt(const String &json) {
  JsonDocument doc;
  if (deserializeJson(doc, json) || (doc["w"] | 0) != 64 || (doc["h"] | 0) != 64) return false;
  uint16_t pal[16]; static uint8_t pix[2048];
  JsonArray pa = doc["palette"].as<JsonArray>();
  for (int i = 0; i < 16; i++) pal[i] = i < (int)pa.size() ? (uint16_t)(pa[i] | 0) : 0;
  const char *b64 = doc["pixels"] | "";
  size_t got = 0;
  if (mbedtls_base64_decode(pix, sizeof pix, &got, (const unsigned char *)b64, strlen(b64)) || got != sizeof pix)
    return false;
  String key = doc["artKey"] | "";
  if (!key.length()) key = doc["slot"].isNull() ? st.daemon.artKey : String("");
  if (!key.length()) return false;
  bool fresh = !artCached(key);
  keep(key, pal, pix);
  if (fresh && !cardWrite("art/" + key + ".json", json)) flashKeep(key, json);   // C-199: on the Ultra's card, for the next time; C-241: or its flash
  if (key == st.daemon.artKey) show(key, pal, pix);
  return true;
}
// the picture kept in memory, or on the card -- shown now if it is the one carried
bool artFromCache(const String &key) {
  if (KeptArt *k = keptFor(key)) { k->used = millis(); if (key == st.daemon.artKey) show(key, k->pal, k->pix); return true; }
  String c = cardRead("art/" + key + ".json");
  if (!c.length()) c = flashRead(key);                               // C-241
  return c.length() && takeArt(c) && artCached(key);
}

// Index 0 is transparent, as in the game.
int dayIndex() {                                  // C-50: the day, Sunday 0, for its tunes
  static const char *D[] = { "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday" };
  for (int i = 0; i < 7; i++) if (st.day == D[i]) return i;
  return 0;
}

// C-51: the routines are the daemon's -- they speak in its name
String daemonName() { return st.carrying && st.daemon.nickname.length() ? st.daemon.nickname : "Your daemon"; }
