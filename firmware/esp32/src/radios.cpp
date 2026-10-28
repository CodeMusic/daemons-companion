// C-28: the ROUTINES that use the board's own radios -- FLARE (IR), WHISPER (Bluetooth), TOUCHSTONE (NFC).
// Each is a test that the radio works, run against the author's own gear only (CONTEXT.md): their remote and TV,
// their phone, their tags. A routine may wait for something (a tag, a remote's button, a phone); while it waits it
// says so on the screen, and the top button gives up.
#include <Arduino.h>
#include <Wire.h>
#include "battery.h"
#include <Preferences.h>
#include <Adafruit_PN532.h>
#include <IRrecv.h>
#include "leds.h"
#include <IRsend.h>
#include <IRutils.h>
#include "link.h"
#include "radios.h"
#include "board.h"
#include "app.h"                       // C-124: the card's screen, the state and the companion
#include <ArduinoJson.h>
#include <vector>
void listRow(int i, int at, const String &text, uint16_t day, uint16_t ink, int width);
#include "sound.h"

// LilyGO's pin map (examples/utilities.h): IR out and in, the PN532 on I2C with its IRQ and reset.
#ifdef BOARD_STICKC_PLUS
// C-148: the StickC-Plus has no NFC, and its ESP32-PICO-D4's own flash is wired to 17: the PN532's object, made before
// setup(), sets both its pins' modes, and 17 taken as an input stopped the flash -- the board hung before it printed a
// word. It is never used there, so it is given two input-only pins it can do nothing to (36 and 38, both free; 38 as
// an output only logs that it cannot be one).
static const int PIN_SDA = 8, PIN_SCL = 18, PIN_NFC_IRQ = 36, PIN_NFC_RST = 38;
#else
static const int PIN_SDA = 8, PIN_SCL = 18, PIN_NFC_IRQ = 17, PIN_NFC_RST = 45;
#endif

// Waits up to `ms`, a little at a time; false if the top button gave up first.
static bool waitALittle(uint32_t ms) {
  uint32_t until = millis() + ms;
  while (millis() < until) { if (giveUp()) return false; delay(10); }
  return true;
}

// ---- TOUCHSTONE (NFC): what a tag says it is -- its type and its identifier. Reads nothing else from it. ----------
static Adafruit_PN532 nfc(PIN_NFC_IRQ, PIN_NFC_RST, &Wire);
static bool nfcReady = false;

// C-102: the M5Stack Dial's reader is a WS1850S, which speaks the MFRC522's registers, on I2C at 0x28 (M5Stack's M5Dial
// library). Enough of it to ask a tag its identifier: REQA, then the anticollision loop and SELECT at each cascade level
// (ISO 14443-3), as the MFRC522's own datasheet and its common libraries do it.
namespace rc522 {
static const uint8_t ADDR = 0x28;
static void w(uint8_t reg, uint8_t v) { Wire.beginTransmission(ADDR); Wire.write(reg); Wire.write(v); Wire.endTransmission(); }
static uint8_t r(uint8_t reg) {
  Wire.beginTransmission(ADDR); Wire.write(reg);
  if (Wire.endTransmission(false) != 0 || Wire.requestFrom(ADDR, (uint8_t)1) != 1) return 0;
  return Wire.read();
}
static void bits(uint8_t reg, uint8_t mask, bool on) { uint8_t v = r(reg); w(reg, on ? v | mask : v & ~mask); }
static bool begin() {
  w(0x01, 0x0F); delay(50);                            // SoftReset
  uint8_t version = r(0x37);
  if (version == 0x00 || version == 0xFF) return false;
  w(0x2A, 0x80); w(0x2B, 0xA9); w(0x2C, 0x03); w(0x2D, 0xE8);   // a timer of ~25 ms for every answer
  w(0x15, 0x40); w(0x11, 0x3D);                        // 100% ASK; CRC preset 6363h
  bits(0x14, 0x03, true);                              // the antenna on
  return true;
}
// Send, and take the answer. validBits: how many bits of the last byte go (7 for REQA).
static int transceive(const uint8_t *send, int n, uint8_t *back, int most, uint8_t validBits = 0) {
  w(0x01, 0x00); w(0x04, 0x7F); bits(0x0A, 0x80, true);         // idle, interrupts cleared, the FIFO emptied
  for (int i = 0; i < n; i++) w(0x09, send[i]);
  w(0x0D, validBits); w(0x01, 0x0C); bits(0x0D, 0x80, true);   // Transceive, StartSend
  uint32_t t0 = millis(); uint8_t irq;
  do { irq = r(0x04); if (irq & 0x01) return -1; } while (!(irq & 0x30) && millis() - t0 < 40);   // the timer: no tag
  bits(0x0D, 0x80, false);
  if (!(irq & 0x30) || (r(0x06) & 0x13)) return -1;              // no answer, or a buffer, parity or protocol error
  int got = min((int)r(0x0A), most);
  for (int i = 0; i < got; i++) back[i] = r(0x09);
  return got;
}
static bool crc(const uint8_t *data, int n, uint8_t *out) {
  w(0x01, 0x00); w(0x05, 0x04); bits(0x0A, 0x80, true);
  for (int i = 0; i < n; i++) w(0x09, data[i]);
  w(0x01, 0x03);
  uint32_t t0 = millis();
  while (!(r(0x05) & 0x04)) if (millis() - t0 > 20) return false;
  w(0x01, 0x00); out[0] = r(0x22); out[1] = r(0x21);
  return true;
}
// A tag's identifier (4, 7 or 10 bytes), or 0 when none answered.
static int readUid(uint8_t *uid) {
  uint8_t atqa[2], reqa = 0x26;
  w(0x0E, 0x80);                                       // collisions: keep the bits received after one
  if (transceive(&reqa, 1, atqa, 2, 7) != 2) return 0;
  int len = 0;
  for (uint8_t level : { (uint8_t)0x93, (uint8_t)0x95, (uint8_t)0x97 }) {
    uint8_t ac[2] = { level, 0x20 }, got[5];
    if (transceive(ac, 2, got, 5) != 5 || (got[0] ^ got[1] ^ got[2] ^ got[3]) != got[4]) return 0;
    uint8_t sel[9] = { level, 0x70, got[0], got[1], got[2], got[3], got[4] }, sak[3];
    if (!crc(sel, 7, sel + 7) || transceive(sel, 9, sak, 3) < 1) return 0;
    bool more = got[0] == 0x88;                        // the cascade tag: the rest of the identifier is a level down
    for (int i = more ? 1 : 0; i < 4; i++) uid[len++] = got[i];
    if (!(sak[0] & 0x04)) break;                       // complete
  }
  return len;
}
// C-124: an NTAG's pages, once it is selected (readUid): READ gives four pages, WRITE takes one and answers ACK (0xA)
static bool readPages(uint8_t page, uint8_t *out16) {
  uint8_t cmd[4] = { 0x30, page }, got[18];
  if (!crc(cmd, 2, cmd + 2)) return false;
  w(0x0D, 0x00);
  if (transceive(cmd, 4, got, 18) < 16) return false;
  memcpy(out16, got, 16);
  return true;
}
static bool writePage(uint8_t page, const uint8_t *in4) {
  uint8_t cmd[8] = { 0xA2, page, in4[0], in4[1], in4[2], in4[3] }, ack = 0;
  if (!crc(cmd, 6, cmd + 6)) return false;
  return transceive(cmd, 8, &ack, 1) >= 1 && (ack & 0x0F) == 0x0A;
}
}

#if defined(BOARD_TWATCH_ULTRA)
// C-176: the T-Watch Ultra's ST25R3916, through ST's RFAL (lewisxhe's ESP32 build of it, as LilyGO's own library): on the
// SPI bus the LoRa radio shares (Arduino's own SPI, lora.cpp; its chip select 4, its interrupt 5), powered from DLDO1.
// It answers as the Dial's RC522 does -- a card selected, its identifier; NTAG pages read four at a time, written one
// at a time -- so TOUCHSTONE and THE CARD run on it unchanged.
#include <rfal_rfst25r3916.h>
#include <rfal_nfc.h>
void watchNfcPower(bool on);                              // watch.cpp: DLDO1
namespace st25 {
static RfalRfST25R3916Class rf(&SPI, 4, 5);
static RfalNfcClass reader(&rf);
static bool begin() {
  watchNfcPower(true); delay(10);
  SPI.begin(35, 33, 34);                                  // the shared bus (lora.cpp opens the same, with its own select)
  pinMode(36, OUTPUT); digitalWrite(36, HIGH);            // the LoRa radio and the SD card deselected while it starts
  pinMode(21, OUTPUT); digitalWrite(21, HIGH);
  return reader.rfalNfcInitialize() == ST_ERR_NONE;
}
// one round of looking for an NFC-A card (a fifth of a second): its identifier, or 0
static int readUid(uint8_t *uid) {
  rfalNfcDiscoverParam p; memset(&p, 0, sizeof p);
  p.compMode = RFAL_COMPLIANCE_MODE_NFC; p.techs2Find = RFAL_NFC_POLL_TECH_A; p.totalDuration = 200; p.devLimit = 1;
  p.nfcfBR = RFAL_BR_212; p.ap2pBR = RFAL_BR_424; p.wakeupConfigDefault = true;
  reader.rfalNfcDeactivate(false);
  if (reader.rfalNfcDiscover(&p) != ST_ERR_NONE) return 0;
  uint32_t t = millis();
  while (millis() - t < 300 && reader.rfalNfcGetState() != RFAL_NFC_STATE_ACTIVATED) { reader.rfalNfcWorker(); delay(1); }
  rfalNfcDevice *d = nullptr;
  if (reader.rfalNfcGetState() != RFAL_NFC_STATE_ACTIVATED || reader.rfalNfcGetActiveDevice(&d) != ST_ERR_NONE || !d) return 0;
  int n = min<int>(d->nfcidLen, 10); memcpy(uid, d->nfcid, n);
  return n;                                               // left selected: its pages are read next
}
static bool readPages(uint8_t page, uint8_t *out16) { uint16_t n = 0; return reader.rfalT2TPollerRead(page, out16, 16, &n) == ST_ERR_NONE && n >= 16; }
static bool writePage(uint8_t page, const uint8_t *four) { return reader.rfalT2TPollerWrite(page, four) == ST_ERR_NONE; }
}  // namespace st25
#endif
// C-102, C-176: the readers that are not a PN532 -- the Dial's RC522 and the Ultra's ST25R3916, both answering alike
static bool altReader() { return board.kind == BoardKind::M5Dial || board.kind == BoardKind::TWatchUltra; }
#if defined(BOARD_TWATCH_ULTRA)
static bool altBegin() { return st25::begin(); }
static int altUid(uint8_t *uid) { return st25::readUid(uid); }
static bool altPages(uint8_t page, uint8_t *out16) { return st25::readPages(page, out16); }
static bool altWrite(uint8_t page, const uint8_t *four) { return st25::writePage(page, four); }
#else
static bool altBegin() { return rc522::begin(); }
static int altUid(uint8_t *uid) { return rc522::readUid(uid); }
static bool altPages(uint8_t page, uint8_t *out16) { return rc522::readPages(page, out16); }
static bool altWrite(uint8_t page, const uint8_t *four) { return rc522::writePage(page, four); }
#endif
static const char *holdIt() {                             // where a card is held, said on the screen (DRAFT)
  return board.kind == BoardKind::TWatchUltra ? "Hold a card to the watch.\n\nhold: give up"
       : "Hold a card flat to the Dial's face.\n\nhold the dial: give up";
}

static String tagSays(const uint8_t *uid, int len) {
  String id;
  for (int i = 0; i < len; i++) { char b[4]; snprintf(b, sizeof b, i ? ":%02X" : "%02X", uid[i]); id += b; }
  // A 4-byte identifier is a MIFARE Classic card; 7 bytes is an NTAG (or an Ultralight)
  String kind = len == 4 ? "MIFARE Classic (or alike)" : len == 7 ? "NTAG / Ultralight" : "ISO 14443-A";
  return "A tag, and it answered.\n\n" + kind + "\nID " + id;
}

// ---- C-124: a card that holds a daemon --------------------------------------------------------------------------------
// The user, 2026-10-15: "the cards are like pokeballs -- u can put your daemon easily into it -- or receive one that is
// there or swap". Chosen: a card is a HOST, as a board is (the companion's cards.ts keeps who is where, so a daemon is
// never in two places); a stranger's card means the two daemons meet; the T-Deck leaves notes for cards.
// THE CARD, an NTAG213/215/216's user pages from page 4:
//     'D' 'M' 'N' 'C'  version  kind (0 empty, 1 daemon, 2 note)  length  0
//     COMPANION(4)  PERSONALITY(4)  SPECIES(2)  LEVEL  0  NAME(12)        a daemon: 32 bytes, pages 4-11
//     ... or a note: its words from byte 20, eighty at most                 pages 4-28
// For our own cards the companion is the truth (POST /api/device/card); the pages are for a stranger's board, which
// reads whose it is, and for a reader with no companion to ask.
static const int CARD_PAGE = 4, CARD_HEAD = 20, CARD_NOTE_MAX = 80;
struct CardSeen { bool dmnc = false; uint8_t kind = 0; uint32_t owner = 0, personality = 0; int species = 0, level = 0; String name, note; };

static bool readerUp(String &why) {
  if (altReader()) {
    static bool up = false;
    if (!up && !(up = altBegin())) { why = "The RFID reader did not answer.\nPress to try again."; return false; }   // DRAFT
    return true;
  }
  if (!nfcReady) {
    batteryWire();
    nfc.begin();
    if (!nfc.getFirmwareVersion()) { why = "The NFC reader did not answer.\nIs the board's power on? Press to try again."; return false; }
    nfc.SAMConfig();
    nfcReady = true;
  }
  return true;
}
static int cardSelect(uint8_t *uid) {                  // a card in the field, selected: its identifier's length, or 0
  if (altReader()) return altUid(uid);
  uint8_t len = 0;
  return nfc.readPassiveTargetID(PN532_MIFARE_ISO14443A, uid, &len, 150) ? len : 0;
}
static bool cardRead(int pages, uint8_t *out) {        // from page 4, `pages` of them
  for (int p = 0; p < pages; ) {
    if (altReader()) { uint8_t b[16]; if (!altPages(CARD_PAGE + p, b)) return false; memcpy(out + p * 4, b, min(16, (pages - p) * 4)); p += 4; }
    else { if (!nfc.ntag2xx_ReadPage(CARD_PAGE + p, out + p * 4)) return false; p++; }
  }
  return true;
}
static bool cardWrite(const uint8_t *in, int bytes) {
  for (int p = 0; p * 4 < bytes; p++) {
    uint8_t four[4] = { 0, 0, 0, 0 }; memcpy(four, in + p * 4, min(4, bytes - p * 4));
    bool ok = altReader() ? altWrite(CARD_PAGE + p, four) : nfc.ntag2xx_WritePage(CARD_PAGE + p, four);
    if (!ok) return false;
  }
  return true;
}
static uint32_t be32(const uint8_t *b) { return ((uint32_t)b[0] << 24) | ((uint32_t)b[1] << 16) | ((uint32_t)b[2] << 8) | b[3]; }
static void put32(uint8_t *b, uint32_t v) { b[0] = v >> 24; b[1] = v >> 16; b[2] = v >> 8; b[3] = v; }
static CardSeen cardParse() {
  CardSeen c; uint8_t b[CARD_HEAD + CARD_NOTE_MAX];
  if (!cardRead(8, b)) return c;
  c.dmnc = !memcmp(b, "DMNC", 4);
  if (!c.dmnc) return c;
  c.kind = b[5]; c.owner = be32(b + 8);
  if (c.kind == 1) {
    c.personality = be32(b + 12); c.species = (b[16] << 8) | b[17]; c.level = b[18];
    for (int i = 20; i < 32 && b[i] && b[i] != ' '; i++) c.name += (char)b[i];
  } else if (c.kind == 2) {
    int n = min((int)b[6], CARD_NOTE_MAX);
    if (n > 12 && !cardRead((CARD_HEAD + n + 3) / 4, b)) return c;
    for (int i = 0; i < n; i++) c.note += (char)b[CARD_HEAD + i];
  }
  return c;
}
static bool cardWriteDaemon(uint32_t owner, JsonVariant d) {   // d: the companion's brief -- or null, an empty card
  uint8_t b[32] = { 'D', 'M', 'N', 'C', 1, (uint8_t)(d.isNull() ? 0 : 1), 0, 0 };
  put32(b + 8, owner);
  if (!d.isNull()) {
    put32(b + 12, d["personality"] | 0u); int sp = d["species"] | 0; b[16] = sp >> 8; b[17] = sp; b[18] = d["level"] | 0;
    String n = d["nickname"] | ""; for (int i = 0; i < 12; i++) b[20 + i] = i < (int)n.length() ? n[i] : ' ';
  }
  return cardWrite(b, d.isNull() ? 8 : 32);
}
static bool cardWriteNote(uint32_t owner, const String &text) {
  uint8_t b[CARD_HEAD + CARD_NOTE_MAX] = { 'D', 'M', 'N', 'C', 1, 2, 0, 0 };
  int n = min((int)text.length(), CARD_NOTE_MAX); b[6] = n;
  put32(b + 8, owner);
  for (int i = 0; i < n; i++) b[CARD_HEAD + i] = text[i];
  return cardWrite(b, CARD_HEAD + n);
}
static bool cardAsk(const String &uid, const char *op, JsonDocument &out) {   // the companion: what each holds, or a move
  bool ok; String got = http("POST", "/api/device/card", String("{\"uid\":\"") + uid + "\",\"op\":\"" + op + "\"}", &ok);
  return !deserializeJson(out, got) && !out.isNull();
}

// The card's screen: what it holds, and what can be done with it here
static String cardTitle, cardLines; static std::vector<String> cardOpts; static int cardAt = 0;
static String drawCard(uint16_t day, uint16_t ink) {
  canvas.setTextFont(2); canvas.setTextDatum(TL_DATUM); canvas.setTextColor(readable(day));
  canvas.drawString(cardTitle, 10, 30);
  wrap(cardLines, 10, 50, W - 20, 2, 16, 3, PAPER);
  for (int i = 0; i < (int)cardOpts.size(); i++) listRow(i + 3, cardAt, cardOpts[i], day, ink, W - 12);
  return "turn: choose    press: do it    top button: leave";                          // DRAFT
}

String runCard() {
  String why; if (!readerUp(why)) return why;
  progress(altReader() ? holdIt()
                                           : "Hold a card to the back of the board.\n\ntop button: give up");   // DRAFT
  uint8_t uid[10]; int len = 0;
  for (uint32_t until = millis() + 20000; !(len = cardSelect(uid)); delay(40)) {
    if (giveUp()) return "Given up.";
    if (millis() > until) return "No card in 20 seconds.\nPress to try again.";
  }
  soundSelect();
  String hex; for (int i = 0; i < len; i++) { char h[3]; snprintf(h, sizeof h, "%02x", uid[i]); hex += h; }
  CardSeen c = cardParse();
  uint32_t ours = strtoul(st.companion.c_str(), nullptr, 16);
  // a stranger's daemon: the two meet, and nothing changes hands
  if (c.dmnc && c.kind == 1 && ours && c.owner != ours) {
    char peer[9]; snprintf(peer, sizeof peer, "%08x", (unsigned)c.owner);
    http("POST", "/api/device/met", String("{\"species\":\"") + c.species + "\",\"peer\":\"" + peer + "\",\"how\":\"card\"}");
    return (st.carrying ? daemonName() : String("Your board")) + " met " + c.name + ", L" + c.level + " -- someone else's daemon, on a card.";   // DRAFT
  }
  if (c.dmnc && c.kind == 2 && !st.cardNote.length()) return "A note on this card:\n\n\"" + c.note + "\"";   // DRAFT
  if (!online()) return c.dmnc && c.kind == 1 ? c.name + " is on this card.\nMoving a daemon needs the companion." : "A card, but the companion cannot be reached to say what it holds.";   // DRAFT
  JsonDocument r;
  if (!cardAsk(hex, "read", r)) return "The companion did not answer.\nPress to try again.";   // DRAFT
  JsonVariant onCard = r["card"], onBoard = r["board"];
  uint32_t me = strtoul((const char *)(r["companion"] | ""), nullptr, 16);
  // what can be done, and what each is called
  std::vector<String> ops; cardOpts.clear(); cardAt = 0;
  String cardName = onCard["nickname"] | "", boardName = onBoard["nickname"] | "";
  if (onCard.isNull() && !onBoard.isNull()) { cardOpts.push_back("PUT " + boardName + " ON IT"); ops.push_back("put"); }
  if (!onCard.isNull() && onBoard.isNull()) { cardOpts.push_back("TAKE " + cardName); ops.push_back("take"); }
  if (!onCard.isNull() && !onBoard.isNull()) { cardOpts.push_back("SWAP " + boardName + " FOR " + cardName); ops.push_back("swap"); }
  if (onCard.isNull() && st.cardNote.length()) { cardOpts.push_back("WRITE THE NOTE ON IT"); ops.push_back("note"); }
  cardOpts.push_back("LEAVE IT"); ops.push_back("");
  cardTitle = onCard.isNull() ? (c.dmnc && c.kind == 2 ? "A CARD WITH A NOTE" : "AN EMPTY CARD") : cardName + " IS ON THIS CARD";   // DRAFT
  cardLines = !onCard.isNull() ? String("L") + (int)(onCard["level"] | 0) + "   " + (onBoard.isNull() ? "This board hosts none." : boardName + " is here.")
            : c.dmnc && c.kind == 2 ? "\"" + c.note + "\"" : onBoard.isNull() ? "This board hosts none." : boardName + " is here.";   // DRAFT
  runPanel = drawCard; progress("");
  int chosen = -1;
  while (chosen < 0) {
    if (int step = dialStep()) { cardAt = (cardAt + (int)cardOpts.size() + step) % (int)cardOpts.size(); progress(""); }
    int ev = buttonEvent();
    if (ev == 1) chosen = cardAt;
    else if (ev == -1 || giveUp()) chosen = (int)cardOpts.size() - 1;
    delay(5);
  }
  runPanel = nullptr; lastInput = millis();
  String op = ops[chosen];
  if (!op.length()) return "Left as it was.";                                          // DRAFT
  // the card has to be there still, to be written
  progress("Keep the card there...");                                                  // DRAFT
  bool held = false;
  for (uint32_t until = millis() + 5000; millis() < until && !held; delay(40)) held = cardSelect(uid) == len;
  if (!held) return "The card went away. Nothing was moved.";                          // DRAFT
  if (op == "note") {
    if (!cardWriteNote(me ? me : ours, st.cardNote)) return "The card could not be written. Nothing was changed.";   // DRAFT
    http("POST", "/api/device/note/written", "{}");
    String n = st.cardNote; st.cardNote = "";
    return "The note is on the card:\n\n\"" + n + "\"";                             // DRAFT
  }
  JsonDocument m;
  if (!cardAsk(hex, op.c_str(), m) || !(m["ok"] | false)) return String("Not done: ") + (const char *)(m["error"] | "the companion did not answer") + ".";   // DRAFT
  if (!cardWriteDaemon(me, m["card"])) {                                               // undone, so the card and the companion agree
    JsonDocument u; cardAsk(hex, op == "put" ? "take" : op == "take" ? "put" : "swap", u);
    return "The card could not be written, so nothing was moved.";                     // DRAFT
  }
  String body; serializeJson(m["state"], body); takeState(body);                       // the board's own daemon, now
  soundSelect();
  return op == "put" ? boardName + " is on the card now." : op == "take" ? cardName + " is here now; the card is empty."
                     : cardName + " is here now, and " + boardName + " is on the card.";   // DRAFT
}

// On a board with a keyboard and no reader (the T-Deck): a note, kept by the companion for the next card a reader holds
String runCardNote() {
  if (!online()) return "A note for a card needs the companion.";                     // DRAFT
  String t;
  auto show = [&]() { progress("A NOTE FOR A CARD\n\n" + t + "_\n\n" + String(CARD_NOTE_MAX - (int)t.length()) + " letters left   enter: keep it"); };   // DRAFT
  show();
  while (true) {
    if (giveUp()) return "Given up.";
    int ch = deckTakeKey();
    if (!ch) { delay(10); continue; }
    if (ch == 13 || ch == 10) break;
    if (ch == 8) { if (!t.length()) return "No note."; t.remove(t.length() - 1); }
    else if (ch >= 32 && ch < 127 && (int)t.length() < CARD_NOTE_MAX) t += (char)ch;
    show();
  }
  t.trim();
  if (!t.length()) return "No note.";
  bool ok; JsonDocument d; d["text"] = t; String body; serializeJson(d, body);
  http("POST", "/api/device/note", body, &ok);
  return ok ? "Kept for a card: \"" + t + "\"\n\nHold a card to a Dial or the T-Embed CC1101, and choose WRITE THE NOTE ON IT."   // DRAFT
            : "The companion did not keep it.";
}

String runReadMyTag() {
  if (altReader()) {                                   // C-102, C-176
    static bool up = false;
    if (!up && !(up = altBegin())) return "The RFID reader did not answer.\nPress to try again.";   // DRAFT
    progress(holdIt());                                                                         // DRAFT
    uint8_t uid[10];
    uint32_t until = millis() + 15000;
    while (millis() < until) {
      if (giveUp()) return "Given up.";
      int len = altUid(uid);
      if (len) { soundSelect(); return tagSays(uid, len); }
      delay(60);
    }
    return "No tag in 15 seconds.\nPress to try again.";
  }
  if (!nfcReady) {
    batteryWire();                     // C-63: the bus is shared with the battery's gauge and charger
    nfc.begin();
    uint32_t version = nfc.getFirmwareVersion();
    if (!version) return "The NFC reader did not answer.\nIs the board's power on? Press to try again.";
    nfc.SAMConfig();
    nfcReady = true;
  }
  progress("Hold your tag to the back of the board.\n\ntop button: give up");
  uint8_t uid[7], len = 0;
  uint32_t until = millis() + 15000;
  while (millis() < until) {
    if (giveUp()) return "Given up.";
    // a short wait each time, so the top button is heard
    if (nfc.readPassiveTargetID(PN532_MIFARE_ISO14443A, uid, &len, 150)) return tagSays(uid, len);
  }
  return "No tag in 15 seconds.\nPress to try again.";
}

// ---- FLARE (IR): the daemon learns your remotes (C-51) ------------------------------------------------------------
// A REMOTE is three buttons -- POWER, VOLUME UP, VOLUME DOWN -- taught together ("press POWER: ARTSAI is listening"),
// or added from the site by brand (a brand's three codes are known once its POWER is). Up to six are kept in the
// board's flash; one is chosen, and FLARE's buttons send from it. They belong to the board -- the daemons share them.
#if defined(BOARD_M5CORE) || defined(BOARD_STICKC_PLUS)
// C-75: the M5GO and Fire have no IR receiver (board.ir is false, so nothing here runs on them), and IRrecv's interrupt
// handler is instruction RAM the original ESP32 has none of to spare. C-148: nor the StickC-Plus -- where PIN_IR_RX, 1, is
// the UART's TX: IRrecv took the pin as it was made, before setup(), and the board ran with its cable silent.
struct NoIrIn { void enableIRIn() {} void disableIRIn() {} bool decode(decode_results *) { return false; } void resume() {} };
static NoIrIn noIrIn;
static NoIrIn &irIn() { return noIrIn; }
#else
// C-150: made on first use from the board's own receiver pin (board.irRx) -- not before setup(), and not the T-Embed's
// 1 on every board. The routines that listen are offered only where there is a receiver (routines.cpp).
static IRrecv *irInMade = nullptr;
static IRrecv &irIn() { if (!irInMade) irInMade = new IRrecv(board.irRx, 1024, 50, true); return *irInMade; }
#endif
// C-150: the board's own IR out (board.irTx) -- the StickS3's 46, the StickC-Plus's 9 -- where it was the T-Embed's 2
// on every board (the StickS3 sent on a pin with no LED; the StickC-Plus's 2 is its buzzer)
static IRsend *irOutMade = nullptr;
static IRsend &irOut() { if (!irOutMade) irOutMade = new IRsend(board.irTx); return *irOutMade; }
static Preferences remotes;
static const int MAX_REMOTES = 6;
static const char *BUTTONS[3] = { "POWER", "VOLUME UP", "VOLUME DOWN" };

// One button as kept: a protocol's value, or -- for a remote the library cannot name -- its timings, sent back as heard.
struct Button { int32_t type = -1; uint16_t bits = 0, repeat = 0; uint64_t value = 0; uint16_t rawLen = 0; uint16_t raw[300]; };
static Button scratch[3];

static String key(const char *what, int r, int b = -1) { return String(what) + r + (b >= 0 ? "_" + String(b) : ""); }
static size_t keptSize(const Button &b) { return offsetof(Button, raw) + b.rawLen * sizeof(uint16_t); }

int flareCount()  { remotes.begin("remotes", true); int n = remotes.getUChar("count", 0); remotes.end(); return n; }
int flareActive() { remotes.begin("remotes", true); int a = remotes.getUChar("active", 0); remotes.end(); return a; }
String flareName(int r) { remotes.begin("remotes", true); String n = remotes.getString(key("n", r).c_str(), "REMOTE " + String(r + 1)); remotes.end(); return n; }
void flareSetActive(int r) { if (r < 0 || r >= flareCount()) return; remotes.begin("remotes", false); remotes.putUChar("active", r); remotes.end(); }

static bool loadButton(int r, int b, Button &out) {
  remotes.begin("remotes", true);
  size_t got = remotes.getBytes(key("b", r, b).c_str(), &out, sizeof out);
  remotes.end();
  return got >= offsetof(Button, raw) && out.type != -1;
}

static void saveRemote(int r, const String &name, Button *buttons) {
  remotes.begin("remotes", false);
  remotes.putString(key("n", r).c_str(), name);
  for (int b = 0; b < 3; b++) remotes.putBytes(key("b", r, b).c_str(), &buttons[b], keptSize(buttons[b]));
  remotes.end();
}

static void moveRemote(int from, int to) {
  Button b3[3];
  for (int b = 0; b < 3; b++) if (!loadButton(from, b, b3[b])) b3[b] = Button();
  saveRemote(to, flareName(from), b3);
}

// C-165: what this board has taught (fresh) or removed (forgot) since it last took the shared list -- names, one a line,
// kept so a board that was away tells the server when it is back
static String syncList(const char *which) { remotes.begin("remotes", true); String s = remotes.getString(which, ""); remotes.end(); return s; }
static String withoutLine(const String &lines, const String &name) {   // the list, that name's line taken out
  String out, s = lines + "\n";
  for (int at = 0, nl; (nl = s.indexOf('\n', at)) >= 0; at = nl + 1) {
    String one = s.substring(at, nl);
    if (one.length() && one != name) out += (out.length() ? "\n" : "") + one;
  }
  return out;
}
static void syncMark(const char *which, const String &name, const char *other) {
  String s = withoutLine(syncList(which), name);
  s += (s.length() ? "\n" : "") + name;
  remotes.begin("remotes", false); remotes.putString(which, s); remotes.putString(other, withoutLine(syncList(other), name)); remotes.end();
}
static void markFresh(const String &name) { syncMark("fresh", name, "forgot"); }
static void markForgot(const String &name) { syncMark("forgot", name, "fresh"); }

// C-59: a remote renamed on the site or the phone (the user, 2026-10-05: "it helps personalize it")
String flareRename(int r, const String &name) {
  if (r < 0 || r >= flareCount()) return "No such remote.";
  String was = flareName(r);
  remotes.begin("remotes", false);
  remotes.putString(key("n", r).c_str(), name);
  remotes.end();
  markForgot(was); markFresh(name);                         // C-165: on every device, under its new name
  return was + " is " + name + " now.";
}

static String removeAt(int r, bool here);
String flareRemove(int r) { return removeAt(r, true); }
static String removeAt(int r, bool here) {                // here: removed on this board, so on every device (C-165)
  int n = flareCount();
  if (r < 0 || r >= n) return "No such remote.";
  String gone = flareName(r);
  if (here) markForgot(gone);
  for (int k = r; k < n - 1; k++) moveRemote(k + 1, k);
  remotes.begin("remotes", false);
  remotes.remove(key("n", n - 1).c_str());
  for (int b = 0; b < 3; b++) remotes.remove(key("b", n - 1, b).c_str());
  remotes.putUChar("count", n - 1);
  int a = remotes.getUChar("active", 0);
  remotes.putUChar("active", a > r ? a - 1 : (a == r ? 0 : a));
  remotes.end();
  return "Forgot " + gone + ".";
}

static String addRemote(const String &name, Button *buttons, bool here = true) {
  int n = flareCount();
  if (n >= MAX_REMOTES) return "";
  saveRemote(n, name, buttons);
  remotes.begin("remotes", false); remotes.putUChar("count", n + 1); if (here) remotes.putUChar("active", n); remotes.end();
  if (here) markFresh(name);                                // C-165: taught here: every device takes it
  return name;
}

// From the site: a brand's three codes (C-34's search, now whole remotes).
String flareAdd(const String &name, const String protocol[3], const uint64_t value[3], const uint16_t bits[3], const uint16_t repeat[3]) {
  Button b3[3];
  for (int b = 0; b < 3; b++) {
    decode_type_t t = strToDecodeType(protocol[b].c_str());
    if (t == UNKNOWN) return "Could not keep it: this board does not know the protocol " + protocol[b] + ".";
    b3[b].type = t; b3[b].value = value[b]; b3[b].bits = bits[b]; b3[b].repeat = repeat[b];
  }
  return addRemote(name, b3).length() ? daemonName() + " knows " + name + " now, and FLARE uses it." :
                                        daemonName() + " knows six remotes already. Remove one on the site first.";
}

// The remotes, for the site (sent with LIST) -- and, C-165, their codes for the one list every device shares (known),
// and what this board removed (forgot). A button the library could not name, or an air conditioner's whole state,
// stays here (null).
static String buttonJson(const Button &x) {
  if (x.type == -1 || x.type == UNKNOWN || hasACState((decode_type_t)x.type)) return "null";
  return "{\"p\":\"" + typeToString((decode_type_t)x.type, false) + "\",\"v\":\"" + uint64ToString(x.value, 16) +
         "\",\"b\":" + String(x.bits) + ",\"r\":" + String(x.repeat) + "}";
}
static String namesJson(const String &lines) {
  String out = "[", s = lines + "\n";
  for (int at = 0, nl; (nl = s.indexOf('\n', at)) >= 0; at = nl + 1) {
    String one = s.substring(at, nl); one.trim();
    if (one.length()) out += String(out.length() > 1 ? "," : "") + "\"" + one + "\"";
  }
  return out + "]";
}
String flareRemotesJson() {
  String out = "{\"active\":" + String(flareActive()) + ",\"remotes\":[", known = "[", fresh = "\n" + syncList("fresh") + "\n";
  for (int r = 0, n = flareCount(); r < n; r++) {
    if (r) { out += ","; known += ","; }
    String name = flareName(r);
    out += "{\"name\":\"" + name + "\",\"buttons\":[";
    known += "{\"name\":\"" + name + "\",\"buttons\":[";
    for (int b = 0; b < 3; b++) {
      Button x; bool have = loadButton(r, b, x);
      out += String(b ? "," : "") + (have ? "true" : "false");
      known += String(b ? "," : "") + (have ? buttonJson(x) : String("null"));
    }
    out += "]}";
    known += "]" + String(fresh.indexOf("\n" + name + "\n") >= 0 ? ",\"fresh\":true" : "") + "}";
  }
  return out + "],\"known\":" + known + "],\"forgot\":" + namesJson(syncList("forgot")) + "}";
}

// C-165: the shared list, as the server hands it back -- what was removed anywhere, removed here; what this board has not
// got, added (not made the one FLARE uses); then nothing here is fresh any more
static int remoteIndex(const String &name) { for (int r = 0, n = flareCount(); r < n; r++) if (flareName(r) == name) return r; return -1; }
bool flareTakeShared(const String &json) {
  JsonDocument d;
  if (deserializeJson(d, json) || !d["shared"].is<JsonArray>()) return false;
  for (JsonVariant f : d["forget"].as<JsonArray>()) { int r = remoteIndex(f | ""); if (r >= 0) removeAt(r, false); }
  for (JsonVariant s : d["shared"].as<JsonArray>()) {
    String name = s["name"] | "";
    if (!name.length() || remoteIndex(name) >= 0 || flareCount() >= MAX_REMOTES) continue;
    Button b3[3]; bool any = false;
    for (int b = 0; b < 3; b++) {
      JsonVariant x = s["buttons"][b];
      if (x.isNull()) continue;
      decode_type_t t = strToDecodeType(String(x["p"] | "").c_str());
      if (t == UNKNOWN) continue;
      b3[b].type = t; b3[b].value = strtoull(String(x["v"] | "0").c_str(), nullptr, 16);
      b3[b].bits = x["b"] | 0; b3[b].repeat = x["r"] | 0; any = true;
    }
    if (any) addRemote(name, b3, false);
  }
  remotes.begin("remotes", false); remotes.putString("fresh", ""); remotes.putString("forgot", ""); remotes.end();
  return true;
}

// The single code taught before remotes (the user's first learned POWER) becomes the first remote, once.
void flareBegin() {
  Preferences old;
  old.begin("flare", true);
  bool had = old.isKey("type");
  Button power;
  if (had) {
    power.type = old.getInt("type"); power.bits = old.getUShort("bits"); power.repeat = old.getUShort("repeat", 0);
    if (old.isKey("value")) power.value = old.getULong64("value");
    if (old.isKey("raw")) { power.rawLen = old.getBytesLength("raw") / 2; old.getBytes("raw", power.raw, min((size_t)power.rawLen * 2, sizeof power.raw)); }
  }
  old.end();
  if (!had || flareCount() > 0) return;
  Button b3[3]; b3[0] = power;
  addRemote("REMOTE 1", b3);
  old.begin("flare", false); old.clear(); old.end();
}

static bool listenFor(Button &out, int which) {
  progress("Point your remote at " + daemonName() + " and press " + BUTTONS[which] + ".\n\n" + daemonName() +
           " is listening.  (" + String(which + 1) + " of 3)\n\ntop button: give up");
  irIn().enableIRIn();
  decode_results got;
  uint32_t until = millis() + 20000;
  bool heard = false;
  while (millis() < until && !heard) {
    if (giveUp()) break;
    if (irIn().decode(&got)) {
      if (got.repeat || (got.decode_type == UNKNOWN && got.rawlen < 12)) irIn().resume();   // a repeat, or noise
      else heard = true;
    }
    delay(5);
  }
  irIn().disableIRIn();
  if (!heard) return false;
  out = Button();
  out.type = got.decode_type; out.bits = got.bits;
  out.repeat = got.decode_type == SONY ? kSonyMinRepeat : 0;            // Sony's TVs want their code three times
  if (got.decode_type != UNKNOWN && !hasACState(got.decode_type)) out.value = got.value;
  else {                                                                 // timings, sent back as they were heard
    out.type = UNKNOWN;
    uint16_t n = getCorrectedRawLength(&got);
    uint16_t *raw = resultToRawArray(&got);
    out.rawLen = min((int)n, 300);
    memcpy(out.raw, raw, out.rawLen * sizeof(uint16_t));
    delete[] raw;
  }
  return true;
}

// WHAT REMOTE IS THIS: point any of your remotes at the board and press its buttons -- each press is named: its
// protocol (for most, the maker: SAMSUNG, SONY, LG ...), its bits and its code. It only listens, for a minute.
String runWhatRemote() {
  if (board.irRx < 0) return "This board has no IR receiver.";   // C-150 (not offered there: routines.cpp); DRAFT
  irIn().enableIRIn();
  decode_results got;
  String heard[3]; int n = 0;
  uint32_t t0 = millis(), shown = 0;
  while (millis() - t0 < 60000 && !giveUp()) {
    if (irIn().decode(&got)) {
      if (!got.repeat && !(got.decode_type == UNKNOWN && got.rawlen < 12)) {
        String what = got.decode_type == UNKNOWN ? String("an unknown kind, ") + got.rawlen + " pulses"
                    : typeToString(got.decode_type, false) + "  " + String(got.bits) + " bits  0x" + uint64ToString(got.value, 16);
        heard[2] = heard[1]; heard[1] = heard[0]; heard[0] = what; n++;
        ledsFlash();
        shown = 0;
      }
      irIn().resume();
    }
    if (millis() - shown > 500) {
      shown = millis();
      progress(n ? "Heard " + String(n) + (n == 1 ? " press" : " presses") + ":\n" + heard[0] + "\n" + heard[1] + "\n" + heard[2]
                 : "Point a remote at " + daemonName() + " and press any button.");                       // DRAFT
    }
    ledsLoop();
    delay(5);
  }
  irIn().disableIRIn();
  return n ? daemonName() + " heard " + String(n) + (n == 1 ? " press" : " presses") + "; the last: " + heard[0] + "."
           : daemonName() + " heard no remote.";                                                          // DRAFT
}

// TEACH A REMOTE: three buttons, one after another, then kept as a remote and chosen.
String runTeachRemote() {
  if (board.irRx < 0) return "This board has no IR receiver.";   // C-150; DRAFT
  if (flareCount() >= MAX_REMOTES) return daemonName() + " knows six remotes already.\nRemove one on the site first.";
  for (int b = 0; b < 3; b++) {
    if (!listenFor(scratch[b], b)) return giveUp() ? "Given up. " + daemonName() + " forgets this one."
                                                   : daemonName() + " heard nothing for " + BUTTONS[b] + ".\nPress to start again.";
    progress(daemonName() + " learned " + BUTTONS[b] + ".");
    delay(500);
  }
  String name = "REMOTE " + String(flareCount() + 1);
  addRemote(name, scratch);
  return daemonName() + " learned your remote: POWER, VOLUME UP and VOLUME DOWN.\n\nIt is " + name + ", and FLARE uses it now.";
}

static String sendButton(int which) {
  int n = flareCount();
  if (!n) return daemonName() + " knows no remote yet.\nChoose TEACH A REMOTE, or add one by brand on the site.";
  int r = flareActive();
  Button b;
  if (!loadButton(r, which, b))
    return flareName(r) + " has no " + BUTTONS[which] + " yet.\nTEACH A REMOTE teaches all three.";
  irOut().begin();
  if (b.type == UNKNOWN) irOut().sendRaw(b.raw, b.rawLen, 38);
  else irOut().send((decode_type_t)b.type, b.value, b.bits, b.repeat);
  return daemonName() + " sent " + BUTTONS[which] + "  (" + flareName(r) + ").\n\nPress to send it again.";
}
String runPower()      { return sendButton(0); }
String runVolumeUp()   { return sendButton(1); }
String runVolumeDown() { return sendButton(2); }

// C-34: one code the site is trying (a brand's POWER), sent once.
String runFlareCode(const String &protocol, uint64_t value, uint16_t bits, uint16_t repeat, bool) {
  if (!board.ir) return "This board has no IR.";   // C-148: and PIN_IR_TX, 2, is the StickC-Plus's buzzer; DRAFT
  decode_type_t type = strToDecodeType(protocol.c_str());
  if (type == UNKNOWN) return "Could not send: this board does not know the protocol " + protocol + ".";
  irOut().begin();
  if (!irOut().send(type, value, bits, repeat)) return "Could not send " + protocol + " with " + String(bits) + " bits.";
  return daemonName() + " sent " + protocol + " " + uint64ToString(value, 16) + ".";
}

// ---- WHISPER (Bluetooth) ---------------------------------------------------------------------------------------------
// C-55: PAIR MY PHONE -- the board shows a code and the companion app's pairing asks for it once; after that the phone
// carries the board's link wherever both go (link.cpp). FORGET MY PHONES undoes every pairing.
String runPairMyPhone() {
  uint32_t code = linkPairStart();
  char shown[8]; snprintf(shown, sizeof shown, "%03lu %03lu", (unsigned long)(code / 1000), (unsigned long)(code % 1000));
  // six lines at most on the RUN screen: two of asking, the code on its own, and the way out
  progress(String("In the companion app: DEVICE, Pair the handheld. When iOS asks, type:\n\n") + shown + "\n\ntop button: give up");
  uint32_t until = millis() + 120000;
  bool paired = false;
  while (!(paired = linkPairedNow())) {
    if (millis() > until) { linkPairStop(); return "No phone paired in two minutes.\nPress to try again."; }
    if (!waitALittle(100)) { linkPairStop(); return "Given up."; }
  }
  linkPairStop();
  return "Paired.\n\n" + daemonName() + " talks to your phone whenever it is near, at home or away.";
}

String runForgetPhones() {
  int n = linkBonds();
  if (!n) return "No phone is paired.";
  linkForget();
  return daemonName() + " forgot " + String(n) + (n == 1 ? " phone." : " phones.") + "\nPair again with PAIR MY PHONE.";
}

// The Nordic UART service, which a general Bluetooth app on the phone (nRF Connect, or LightBlue) already knows:
// the board says hello on TX, and whatever the phone writes to RX comes back on the screen.
String runOpenToMyPhone() {
  whisperClear();
  progress("Open \"DAEMONS companion\" from your phone's Bluetooth app (nRF Connect), and listen on its TX.\n\ntop button: give up");
  uint32_t until = millis() + 60000;
  while (!whisperHere()) {
    if (millis() > until) return "No phone in a minute.\nPress to try again.";
    if (!waitALittle(100)) return "Given up.";
  }
  waitALittle(500);
  String hello = "Hello from your daemon.";
  whisperSay(hello);
  progress("Your phone is here. The board said hello.\n\nNow write a word to it from the phone (the RX line, as text).\n\ntop button: done");
  until = millis() + 60000;
  while (whisperHere() && !whisperHeard().length() && millis() < until)
    if (!waitALittle(100)) break;
  String said = whisperHeard();
  whisperDrop();
  if (said.length()) return "Both ways work.\n\nSent: " + hello + "\nHeard: " + said;
  return "Your phone connected and the hello went out, but no word came back.\nPress to try again.";
}
