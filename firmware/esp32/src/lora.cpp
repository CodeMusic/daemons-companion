// C-72: LoRa -- the daemons nearby, a wave or a word between them, and a small mesh (PLAN 10, PLAN 11's "LoRa epic").
//
// THE FRAME, the same on every board whatever its chip (an SX1262 or an SX1278 hear each other at the same settings):
//
//     'D' 'A'  kind  hops  FROM(4)  SPECIES(2)  ID(2)  TO(4)  NAME(10)  TEXT(0..80)
//
// FROM is the board's hourly tag -- the SAME tag its Bluetooth beacon carries (meet.cpp), so the server tells our own
// companions from strangers the one way it already does, and a daemon heard on both radios is one meeting. SPECIES and
// NAME are the carried daemon's, as the game names it, so a board can list who is near without a table of names (it
// has none). TEXT is a word, or a message, of up to eighty letters (C-123; forty before -- a board not yet updated
// keeps the first forty). A frame says nothing about who carries the board.
//
// Kinds: 1 BEACON (I am here; every two minutes or so while a daemon is carried), 2 WAVE, 3 SAY, 4 CALL (who is there?
// each board that hears it beacons back a moment later). TO is a tag, or 0 for everyone. C-151: 7 TABLE, "1" sitting at
// the CASINO's reels (every half minute while there), "0" up from them -- sent with no hops, so never passed on: the
// table is who is near.
//
// THE MESH is a flood: a frame that arrives with hops left is sent on once, a moment later, with one hop fewer, unless
// this board has seen that FROM+ID already -- so a daemon out of radio range is still heard through a board between.
// Two hops at most. A board never passes on its own frames, and never hears its own echoes.
//
// THE RADIO: 125 kHz, spreading factor 9, coding 4/5, sync word 0x12 (Meshtastic's is 0x2B: the two never mix), 10 dBm,
// at the band the site chose (DEVICE, ITS SETTINGS: 433, 868 or 915 MHz -- it must match what the board was bought
// with, and the other boards'). A frame is a fifth of a second on the air; a beacon every two minutes is a tenth of a
// percent of the time. Listening is continuous (the chip wakes the loop through DIO1), a few milliamps.
#include "lora.h"
#include "app.h"
#include "meet.h"
#include "leds.h"
#include "sound.h"
#include "radios.h"
#include <deque>

static const uint8_t K_BEACON = 1, K_WAVE = 2, K_SAY = 3, K_CALL = 4, K_ACT = 5, K_REPLY = 6, K_TABLE = 7;   // C-134: 5, 6; C-151: 7
// C-175 (the user, 2026-10-27: "it should always use Lora to ping other devices, and mesh if needed to reach the hub"):
// 8 RELAY -- a watch out of reach of Wi-Fi and the phone sends its fixes and nights on the air ("<device>\t<kind>\t<detail>");
// any of the user's boards that hears it, and is in reach of the companion, tells the companion for it (the companion
// keeps a thing told twice once: the watch's own outbox tells it again later)
static const uint8_t K_RELAY = 8;
static String relayIn;                                     // one heard, to tell the companion from the loop
#include "broadcast.h"
#include "casino.h"                                                  // C-151: the table
static const int HOPS = 2, HEAD = 26, TEXT_MAX = 80, NEARBY_MAX = 12, FRAME_MAX = HEAD + TEXT_MAX;
static const uint32_t BEACON_EVERY_MS = 120000, NEARBY_FOR_MS = 600000, ROTATE_MS = 3600000;

static Nearby nearby[NEARBY_MAX]; static int nearbyN = 0;
static std::deque<std::pair<int, uint32_t>> heardQ;                 // species, tag -- for the server, once an hour
static std::deque<std::pair<uint32_t, uint32_t>> recent;            // tag -> when, for the once an hour
struct Said { String dir, kind; int species; uint32_t tag; int relayed; String text; };
static std::deque<Said> saidQ;
static String banner; static uint32_t bannerUntil = 0;              // the last wave or word, on the NEARBY screen

static String hex8(uint32_t v) { char b[9]; snprintf(b, sizeof b, "%08lx", (unsigned long)v); return b; }

static void remember(uint32_t tag, int species, const String &name, int relayed, int rssi) {
  int i = 0;
  for (; i < nearbyN; i++) if (nearby[i].tag == tag) break;
  if (i == nearbyN) {
    if (nearbyN == NEARBY_MAX) { int old = 0; for (int k = 1; k < nearbyN; k++) if (nearby[k].at < nearby[old].at) old = k; i = old; }
    else nearbyN++;
    nearby[i].relayed = relayed;
  } else nearby[i].relayed = min(nearby[i].relayed, relayed);        // heard directly once: nearer than a relay says
  nearby[i].tag = tag; nearby[i].species = species; nearby[i].name = name; nearby[i].rssi = rssi; nearby[i].at = millis();
  // once per tag per hour, for the server
  uint32_t now = millis();
  while (!recent.empty() && now - recent.front().second > ROTATE_MS) recent.pop_front();
  for (auto &r : recent) if (r.first == tag) return;
  recent.push_back({ tag, now }); if (recent.size() > 64) recent.pop_front();
  if (heardQ.size() < 16) heardQ.push_back({ species, tag });
}

int loraNearby(Nearby *out, int max) {
  uint32_t now = millis(); int n = 0;
  for (int i = 0; i < nearbyN && n < max; i++) if (now - nearby[i].at < NEARBY_FOR_MS) out[n++] = nearby[i];
  for (int a = 0; a < n; a++) for (int b = a + 1; b < n; b++) if (out[b].at > out[a].at) { Nearby t = out[a]; out[a] = out[b]; out[b] = t; }
  return n;
}

bool loraTakeHeard(int &species, String &tag, int &relayed, bool &mine) {
  if (heardQ.empty()) return false;
  auto h = heardQ.front(); heardQ.pop_front();
  species = h.first; tag = hex8(h.second); mine = meetIsOurs(tag);
  relayed = 0; for (int i = 0; i < nearbyN; i++) if (nearby[i].tag == h.second) relayed = nearby[i].relayed;
  return true;
}
bool loraTakeSaid(String &dir, String &kind, int &species, String &tag, int &relayed, String &text) {
  if (saidQ.empty()) return false;
  Said s = saidQ.front(); saidQ.pop_front();
  dir = s.dir; kind = s.kind; species = s.species; tag = hex8(s.tag); relayed = s.relayed; text = s.text;
  return true;
}

#if defined(BOARD_TDECK) || defined(BOARD_TWATCH_S3) || defined(BOARD_M5CORE) || defined(BOARD_CARDPUTER)   // the M5s: with a LoRa433 module (board.cpp); C-136 the Cardputer ADV's cap
#include <RadioLib.h>
#include <SPI.h>

static SPIClass *bus = nullptr;
static PhysicalLayer *radio = nullptr;
// C-123, the M5s' first ESP32: the screen's driver leaves the shared host (SPI3) set to send only, for speed, and
// Arduino's SPI never sets it back -- so the radio's every read came back empty ("chip not found"). Set again before
// each use of the radio; the screen's driver sets its own at the start of each of its transactions.
#if CONFIG_IDF_TARGET_ESP32
#include <soc/spi_struct.h>
static void radioBus() { SPI3.user.usr_miso = 1; SPI3.user.usr_mosi = 1; SPI3.user.doutdin = 1; SPI3.user.sio = 0; }
#else
static void radioBus() {}
#endif
static bool ready = false; static int bandMhz = 0; static uint32_t triedAt = 0;
static volatile bool gotFrame = false;
static void IRAM_ATTR onFrame() { gotFrame = true; }
static uint32_t beaconAt = 0; static bool beaconOn = false; static int ourSpecies = 0;
static uint8_t pending[FRAME_MAX]; static int pendingN = 0; static uint32_t pendingAt = 0;   // one frame waiting to go out
// C-123: the last message heard, kept on the screen until it is read (a key or a button), with who sent it
static String msgFrom, msgText; static bool msgShown = false;
static uint16_t ourId = 0;
static std::deque<uint64_t> seen;                                    // FROM<<16 | ID of frames already handled

// C-136: the band this board's antenna can use -- the site's, unless it is below what the antenna is made for
static int bandFor(int asked) { return board.loraMinMhz && asked < board.loraMinMhz ? 868 : asked; }
static bool radioOn() {
  if (ready) return true;
  if (board.loraChip == LoraChip::None || (triedAt && millis() - triedAt < 60000)) return false;
  triedAt = millis();
  bandMhz = bandFor(cfg.band);
  tft.waitDMA();
  if (!bus) {
    bool shared = board.loraSck == board.lcdSclk;                // the T-Deck: the screen's bus, as the CC1101 shares it
    // the screen's own host, SPI3 (display.cpp) -- Arduino calls it HSPI on the S3 and VSPI on the M5s' first ESP32,
    // whose HSPI is SPI2: taken there, the screen's pins would be routed away from it
#if CONFIG_IDF_TARGET_ESP32
    bus = new SPIClass(shared ? VSPI : HSPI);
    // and its chip select left to RadioLib: given to the bus, the host raised it between bytes, and every read came
    // back empty (the LoRa433's on G0, seen 2026-10-15) -- the finder (board.cpp), which gave it none, read it fine
    bus->begin(board.loraSck, board.loraMiso, board.loraMosi, -1);
#elif defined(BOARD_TWATCH_ULTRA)
    // C-176: the Ultra's NFC reader is on this bus too (radios.cpp): both on Arduino's own SPI, as LilyGO's library has
    // them -- two SPIClass objects on one host would take it from each other
    bus = &SPI;
    bus->begin(board.loraSck, board.loraMiso, board.loraMosi, -1);
#else
    bus = new SPIClass(shared ? HSPI : FSPI);
    bus->begin(board.loraSck, board.loraMiso, board.loraMosi, board.loraCs);
#endif
  }
  int st;
  radioBus();
  if (board.loraChip == LoraChip::SX1262) {
    SX1262 *r = new SX1262(new Module(board.loraCs, board.loraDio1, board.loraRst, board.loraBusy, *bus));
    st = r->begin((float)bandMhz, 125.0, 9, 5, 0x12, 10, 12, 1.8);   // LilyGO's modules: a TCXO at 1.8 V on DIO3
    radio = r;
  } else {
    SX1278 *r = new SX1278(new Module(board.loraCs, board.loraDio1, board.loraRst, RADIOLIB_NC, *bus));
    st = r->begin((float)bandMhz, 125.0, 9, 5, 0x12, 10, 12);
    radio = r;
  }
  if (st != RADIOLIB_ERR_NONE) { Serial.printf("lora: the radio did not start (%d)\n", st); radio = nullptr; return false; }
  radio->setPacketReceivedAction(onFrame);
  radioBus(); radio->startReceive();
  ready = true;
  Serial.printf("lora: listening at %d MHz\n", bandMhz);
  return true;
}

bool loraReady() { return ready; }

// DIAG (C-123, the Fire's LoRa433): the version register read three ways on the running board -- as it is, with the
// host set back to full duplex, and with GPIO 19 attached again as the host's MISO
String loraDiag() {   // the LoRa433's pins as found (board.cpp), and its version register read now
  if (board.loraChip != LoraChip::SX1278) return "LORADIAG not an SX1278";
  uint8_t v = 0;
  if (bus) {
    tft.waitDMA(); radioBus();
    bus->beginTransaction(SPISettings(1000000, MSBFIRST, SPI_MODE0));
    digitalWrite(board.loraCs, LOW); bus->transfer(0x42); v = bus->transfer(0); digitalWrite(board.loraCs, HIGH);
    bus->endTransaction();
  }
  char out[96];
  snprintf(out, sizeof out, "LORADIAG cs %d irq %d rst %d version 0x%02X%s", board.loraCs, board.loraDio1, board.loraRst, v,
           board.loraRst == 25 ? " (reset on the speaker's pin: silent)" : "");
  return out;
}
void loraBegin() { radioOn(); }

static void put32(uint8_t *b, uint32_t v) { b[0] = v >> 24; b[1] = v >> 16; b[2] = v >> 8; b[3] = v; }
static uint32_t get32(const uint8_t *b) { return ((uint32_t)b[0] << 24) | ((uint32_t)b[1] << 16) | ((uint32_t)b[2] << 8) | b[3]; }

static void airTime(const uint8_t *b, int n) {
  tft.waitDMA(); radioBus();
  radio->transmit((uint8_t *)b, n);
  radio->startReceive();
}

// C-123: a message to everyone nearby; the one heard, until read
bool loraCanSay() { return ready && st.carrying && meetTag(); }
bool loraSay(const String &text) { return loraSend(K_SAY, 0, text); }
int loraTextMax() { return TEXT_MAX; }
bool loraMessage(String &from, String &text) { if (!msgShown) return false; from = msgFrom; text = msgText; return true; }
bool loraMessageRead() { if (!msgShown) return false; msgShown = false; dirty = true; return true; }
void loraPretendHeard(const String &name, const String &text) { msgFrom = name; msgText = text.substring(0, TEXT_MAX); msgShown = true; dirty = true; }

static bool sendWithId(uint8_t kind, uint32_t to, const String &text, uint16_t id, uint8_t hops = HOPS);
// C-151: at the reels ("1") or up from them ("0"), to whoever is near -- no hops: never passed on
bool loraTable(bool here) { if (!ourId) ourId = esp_random(); return sendWithId(K_TABLE, 0, here ? "1" : "0", ++ourId, 0); }
bool loraSend(uint8_t kind, uint32_t to, const String &text) {
  if (!ourId) ourId = esp_random();
  return sendWithId(kind, to, text, ++ourId);
}
bool loraCast(uint8_t kind, uint16_t id, const String &text) { return sendWithId(kind, 0, text, id); }
static bool sendWithId(uint8_t kind, uint32_t to, const String &text, uint16_t id, uint8_t hops) {
  uint32_t me = meetTag();
  if (!ready || !me || !st.carrying) return false;
  uint8_t b[FRAME_MAX]; int n = 0;
  b[n++] = 'D'; b[n++] = 'A'; b[n++] = kind; b[n++] = hops;
  put32(b + n, me); n += 4;
  b[n++] = st.daemon.species >> 8; b[n++] = st.daemon.species;
  b[n++] = id >> 8; b[n++] = id;
  put32(b + n, to); n += 4;
  for (int i = 0; i < 10; i++) b[n++] = i < (int)st.daemon.name.length() ? st.daemon.name[i] : ' ';
  String t = text.substring(0, TEXT_MAX);
  for (int i = 0; i < (int)t.length(); i++) b[n++] = t[i];
  seen.push_back(((uint64_t)me << 16) | id); if (seen.size() > 32) seen.pop_front();   // never relay our own echo
  airTime(b, n);
  if (kind == K_WAVE || kind == K_SAY) saidQ.push_back({ "out", kind == K_WAVE ? "wave" : "say", st.daemon.species, to, 0, t });
  return true;
}

static void take(const uint8_t *b, int n, int rssi) {
  if (n < HEAD || b[0] != 'D' || b[1] != 'A') return;
  uint8_t kind = b[2], hops = b[3];
  uint32_t from = get32(b + 4), to = get32(b + 12), me = meetTag();
  int species = (b[8] << 8) | b[9]; uint16_t id = (b[10] << 8) | b[11];
  if (!from || from == me) return;
  uint64_t key = ((uint64_t)from << 16) | id;
  for (auto &s : seen) if (s == key) return;
  seen.push_back(key); if (seen.size() > 32) seen.pop_front();
  String name; for (int i = 16; i < 26; i++) if (b[i] != ' ') name += (char)b[i];
  String text; for (int i = HEAD; i < n && i < HEAD + TEXT_MAX; i++) text += (char)b[i];
  int relayed = kind == K_TABLE ? 0 : HOPS - hops;               // C-151: a TABLE goes with no hops, heard directly or not at all
  remember(from, species, name, relayed, rssi);
  if (kind == K_TABLE) { casinoHeard(from, species, name, text == "1", 1); return; }   // C-151: the table, never passed on
  if (kind == K_RELAY && meetIsOurs(hex8(from)) && online() && !relayIn.length()) relayIn = text;   // C-175: ours, and we can reach home
  bool forMe = to == 0 || to == me;
  // C-134: a broadcast -- a word to everyone, an act, an answer -- goes to broadcast.cpp, which shows it once however
  // it came (and may answer it); the mesh below passes it on as any frame
  if ((kind == K_SAY && to == 0) || kind == K_ACT || kind == K_REPLY) {
    if (kind == K_SAY) saidQ.push_back({ "in", "say", species, from, relayed, text });
    String body = text; uint32_t rFrom = 0; uint16_t rId = 0;
    if (kind == K_REPLY && text.length() >= 14) {
      rFrom = strtoul(text.substring(0, 8).c_str(), nullptr, 16); rId = strtoul(text.substring(8, 12).c_str(), nullptr, 16);
      body = text.substring(13);
    }
    castIn(from, id, kind == K_SAY ? CAST_SAY : kind == K_ACT ? CAST_ACT : CAST_REPLY, species, name, body, rFrom, rId, VIA_LORA);
  }
  else if ((kind == K_WAVE || kind == K_SAY) && forMe) {
    saidQ.push_back({ "in", kind == K_WAVE ? "wave" : "say", species, from, relayed, text });
    banner = kind == K_WAVE ? name + " waves" : name + ": " + text; bannerUntil = millis() + 12000;   // DRAFT
    if (kind == K_SAY) { msgFrom = name; msgText = text; msgShown = true; dirty = true; }   // C-123: kept until read
    if (!asleep) { ledsFlash(); if (kind == K_WAVE) say(banner); }       // a flash and a word, never a sound
  }
  // the mesh: on it goes, once, a moment later, one hop fewer -- or, for a CALL, our own beacon in answer
  if (hops > 0 && !pendingN && n <= (int)sizeof pending) {
    memcpy(pending, b, n); pending[3] = hops - 1; pendingN = n; pendingAt = millis() + 300 + esp_random() % 900;
  }
  if (kind == K_CALL && beaconOn) beaconAt = millis() - BEACON_EVERY_MS + 200 + esp_random() % 1300;
}

static void pump() {
  if (!gotFrame) return;
  gotFrame = false;
  tft.waitDMA(); radioBus();
  size_t n = radio->getPacketLength();
  uint8_t b[FRAME_MAX];
  int st = n && n <= sizeof b ? radio->readData(b, n) : -1;
  int rssi = (int)radio->getRSSI();
  radio->startReceive();
  if (st == RADIOLIB_ERR_NONE) take(b, n, rssi);
}

// C-175: a watch's fix or night onto the air, for one of the user's boards to tell the companion
bool loraRelay(const String &kind, const String &detail) {
  String t = deviceId() + "\t" + kind + "\t" + detail;
  return t.length() <= TEXT_MAX && sendWithId(K_RELAY, 0, t, ++ourId);
}
static void relayOut() {                                   // what was heard, told to the companion for the watch it came from
  if (!relayIn.length()) return;
  String t = relayIn; relayIn = "";
  int a = t.indexOf('\t'), b = t.indexOf('\t', a + 1);
  if (a <= 0 || b <= a) return;
  JsonDocument d; d["for"] = t.substring(0, a); d["kind"] = t.substring(a + 1, b); d["detail"] = t.substring(b + 1);
  String body; serializeJson(d, body);
  http("POST", "/api/device/interact", body);           // over Wi-Fi: the cable's INTERACT carries no `for`
  Serial.println("lora: relayed " + t.substring(0, 60));
}

void loraLoop(uint32_t now, bool on, int species) {
  relayOut();                                              // C-175
  if (!radioOn()) return;
  if (bandFor(cfg.band) != bandMhz && (cfg.band == 433 || cfg.band == 868 || cfg.band == 915)) {   // the site moved the band
    bandMhz = bandFor(cfg.band); tft.waitDMA(); radioBus(); radio->setFrequency((float)bandMhz); radio->startReceive();
  }
  pump();
  beaconOn = on && species > 0 && meetTag(); ourSpecies = species;
  if (beaconOn && (!beaconAt || now - beaconAt > BEACON_EVERY_MS)) { beaconAt = now; loraSend(K_BEACON, 0, ""); }
  if (pendingN && (int32_t)(now - pendingAt) >= 0) { airTime(pending, pendingN); pendingN = 0; }
}

String loraStatus() {
  Nearby n[NEARBY_MAX]; int k = loraNearby(n, NEARBY_MAX);
  String s = String(ready ? "ready" : "no radio") + " band " + String(bandMhz) + " tag " + hex8(meetTag()) + " nearby " + String(k);
  for (int i = 0; i < k; i++) s += " " + n[i].name + "/" + String(n[i].species) + "/" + hex8(n[i].tag) + "/" + String(n[i].rssi) + "dBm/" + String(n[i].relayed);
  return s;
}

// ---- MESH / NEARBY: the list, and a wave or a word to one of them ---------------------------------------------------
// Turn (the dial, or the T-Deck's trackball) to choose a daemon -- or EVERYONE, the first row -- press to open what can
// be sent: a WAVE, one of four set words, or on a board with a keyboard a word of your own. A wave or word that arrives
// shows along the bottom for a moment. The top button (held, on a board without one) leaves.
static const char *WORDS[] = { "HELLO", "WELL MET", "COME FIND ME", "ALL IS WELL" };   // DRAFT
static const int WORDS_N = 4;
enum MeshMode { M_LIST, M_ACTS, M_TYPE };
static MeshMode mode = M_LIST; static int at = 0, actAt = 0; static String typedWord;
static Nearby rows[NEARBY_MAX]; static int rowsN = 0; static uint32_t t0 = 0; static int calledFor = 0;
extern void listRow(int i, int at, const String &text, uint16_t day, uint16_t ink, int width);

static String ago(uint32_t at) { uint32_t s = (millis() - at) / 1000; return s < 60 ? String(s) + " s" : String(s / 60) + " min"; }

static String drawMesh(uint16_t day, uint16_t ink) {
  canvas.setTextFont(2); canvas.setTextColor(readable(day)); canvas.setTextDatum(TL_DATUM);
  rowsN = loraNearby(rows, NEARBY_MAX);
  if (mode == M_LIST) {
    canvas.drawString(calledFor ? "WHO ANSWERS " + upper(daemonName()) + "'S CALL   " + String(max(0, calledFor - (int)((millis() - t0) / 1000))) + " s"
                                : "NEAR " + upper(daemonName()) + "   " + String(bandMhz) + " MHz", 10, 32);   // DRAFT
    if (!rowsN) wrap(calledFor ? "Nothing yet. A board that hears the call beacons back within a moment."
                               : "No daemon heard in the last ten minutes. Another board on the same band, hosting a daemon, says so every two minutes.", 12, 58, W - 24, 2, 18, 4, QUIET);   // DRAFT
    else {
      int fit = listRowsFit(), from = max(0, at - (fit - 1)), rowsAll = rowsN + 1;
      for (int i = from; i < rowsAll && i < from + fit; i++) {
        String text = i == 0 ? "EVERYONE NEARBY" : rows[i - 1].name + "   " + String(rows[i - 1].rssi) + " dBm   " +
                               (rows[i - 1].relayed ? "passed on   " : "") + ago(rows[i - 1].at);
        listRow(i - from, at - from, text, day, ink, W - 12);
      }
    }
  } else if (mode == M_ACTS) {
    canvas.drawString("TO " + (at == 0 ? String("EVERYONE") : rows[at - 1].name), 10, 32);
    int n = WORDS_N + 1 + (board.keyboard ? 1 : 0);
    for (int i = 0; i < n && i < 6; i++)
      listRow(i, actAt, i == 0 ? "WAVE" : i <= WORDS_N ? "SAY " + String(WORDS[i - 1]) : "TYPE A WORD", day, ink, W - 12);   // DRAFT
  } else {
    canvas.drawString("A WORD TO " + (at == 0 ? String("EVERYONE") : rows[at - 1].name), 10, 32);
    canvas.setTextColor(PAPER); canvas.drawString(typedWord + "_", 12, 60);
    canvas.setTextColor(QUIET); canvas.drawString(String(TEXT_MAX - typedWord.length()) + " letters left   enter: send", 12, 84);
  }
  if (bannerUntil && millis() < bannerUntil) { canvas.setTextColor(readable(day)); canvas.drawString(banner, 10, H - 34); }
  return mode == M_TYPE ? "type    enter: send    hold: back" : mode == M_ACTS ? "turn: choose    press: send    hold: back"
                        : (board.hasSideKey() ? "turn: choose    press: open    top button: done" : "turn: choose    press: open    hold: done");
}

static String sendChosen(int act) {
  uint32_t to = at == 0 ? 0 : rows[at - 1].tag;
  String who = at == 0 ? "everyone nearby" : rows[at - 1].name;
  bool ok = act == 0 ? loraSend(K_WAVE, to, "") : loraSend(K_SAY, to, act <= WORDS_N ? String(WORDS[act - 1]) : typedWord);
  if (!ok) return daemonName() + " could not send: the radio is not ready, or no daemon is hosted here.";   // DRAFT
  soundSelect(); ledsFlash();
  return daemonName() + (act == 0 ? " waved at " : " said \"" + (act <= WORDS_N ? String(WORDS[act - 1]) : typedWord) + "\" to ") + who + ".";   // DRAFT
}

String runNearby() {
  if (!radioOn()) return "No LoRa radio answered. This needs the T-Watch S3 or the T-Deck (and the band set on the site).";   // DRAFT
  if (!st.carrying) return "Routines are a daemon's: send one to the board from the game first.";
  mode = M_LIST; at = 0; actAt = 0; typedWord = ""; calledFor = 0; t0 = millis();
  runPanel = drawMesh; progress("");
  String result; uint32_t shown = 0; int sent = 0;
  while (true) {
    if (int step = dialStep()) {
      if (mode == M_LIST) at = constrain(at + step, 0, rowsN);
      else if (mode == M_ACTS) actAt = (actAt + WORDS_N + 1 + (board.keyboard ? 1 : 0) + step) % (WORDS_N + 1 + (board.keyboard ? 1 : 0));
      progress("");
    }
    int ev = buttonEvent();
    int ch = deckTakeKey();
    if (mode == M_TYPE && ch) {
      if (ch == 13 || ch == 10) { if (typedWord.length()) { result = sendChosen(WORDS_N + 1); sent++; mode = M_LIST; } }
      else if (ch == 8) { if (typedWord.length()) typedWord.remove(typedWord.length() - 1); }
      else if (ch >= 32 && ch < 127 && (int)typedWord.length() < TEXT_MAX) typedWord += (char)ch;
      progress("");
    } else if (ch == 13 || ch == 10) ev = 1;
    else if (ch == 8) ev = -1;
    if (ev == -1) {
      if (mode == M_LIST) break;
      mode = mode == M_TYPE ? M_ACTS : M_LIST; progress("");
    } else if (ev == 1) {
      if (mode == M_LIST) { if (at > rowsN) at = rowsN; mode = M_ACTS; actAt = 0; }
      else if (mode == M_ACTS) {
        if (actAt > WORDS_N) { mode = M_TYPE; typedWord = ""; }
        else { result = sendChosen(actAt); sent++; mode = M_LIST; }
      }
      progress("");
    }
    if (millis() - shown > 1000) { shown = millis(); progress(""); }   // the ages tick, the banner fades
    ledsLoop();
    delay(5);
  }
  runPanel = nullptr; lastInput = millis();
  if (result.length()) return result;
  rowsN = loraNearby(rows, NEARBY_MAX);
  return daemonName() + (rowsN ? " heard " + String(rowsN) + (rowsN == 1 ? " daemon" : " daemons") + " nearby and sent nothing." : " heard no daemon nearby.");   // DRAFT
}

// ---- MESH / CALL OUT: a call, and who answers in thirty seconds -----------------------------------------------------
String runCallOut() {
  if (!radioOn()) return "No LoRa radio answered. This needs the T-Watch S3 or the T-Deck (and the band set on the site).";   // DRAFT
  if (!st.carrying) return "Routines are a daemon's: send one to the board from the game first.";
  int before = loraNearby(rows, NEARBY_MAX);
  uint32_t was[NEARBY_MAX]; for (int i = 0; i < before; i++) was[i] = rows[i].tag;
  mode = M_LIST; at = 0; calledFor = 30; t0 = millis();
  runPanel = drawMesh; progress("");
  loraSend(K_CALL, 0, "");
  soundRoutine("MESH");
  uint32_t shown = 0;
  while (millis() - t0 < 30000 && !giveUp()) {
    int ev = buttonEvent(); int ch = deckTakeKey();
    if (ev == -1 || ch == 8) break;
    if (millis() - shown > 500) { shown = millis(); progress(""); }
    ledsLoop(); delay(5);
  }
  runPanel = nullptr; calledFor = 0; lastInput = millis();
  int n = loraNearby(rows, NEARBY_MAX), fresh = 0; String names;
  for (int i = 0; i < n; i++) if (rows[i].at >= t0) { fresh++; names += (names.length() ? ", " : "") + rows[i].name; }
  (void)was; (void)before;
  return fresh ? daemonName() + " called, and " + String(fresh) + (fresh == 1 ? " daemon answered: " : " daemons answered: ") + names + "."
               : daemonName() + " called, and no daemon answered within thirty seconds.";   // DRAFT
}

#else   // a board with no LoRa radio: every call does nothing, and the MESH type is not offered (routines.cpp)
bool loraReady() { return false; }
void loraBegin() {}
void loraLoop(uint32_t, bool, int) {}
bool loraSend(uint8_t, uint32_t, const String &) { return false; }
bool loraRelay(const String &, const String &) { return false; }
bool loraCast(uint8_t, uint16_t, const String &) { return false; }   // C-134
bool loraTable(bool) { return false; }                               // C-151
bool loraCanSay() { return false; }
bool loraSay(const String &) { return false; }
int loraTextMax() { return 0; }
bool loraMessage(String &, String &) { return false; }
bool loraMessageRead() { return false; }
void loraPretendHeard(const String &, const String &) {}
String loraStatus() { return "no radio"; }
String loraDiag() { return "LORADIAG no radio"; }
String runNearby() { return "This needs a board with a LoRa radio."; }    // DRAFT
String runCallOut() { return "This needs a board with a LoRa radio."; }   // DRAFT
#endif
