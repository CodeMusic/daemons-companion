// C-28: the ROUTINES that use the board's own radios -- FLARE (IR), WHISPER (Bluetooth), TOUCHSTONE (NFC).
// Each is a test that the radio works, run against the author's own gear only (CONTEXT.md): their remote and TV,
// their phone, their tags. A routine may wait for something (a tag, a remote's button, a phone); while it waits it
// says so on the screen, and the top button gives up.
#include <Arduino.h>
#include <Wire.h>
#include <Preferences.h>
#include <Adafruit_PN532.h>
#include <IRrecv.h>
#include <IRsend.h>
#include <IRutils.h>
#include "link.h"
#include "radios.h"
#include "sound.h"

// LilyGO's pin map (examples/utilities.h): IR out and in, the PN532 on I2C with its IRQ and reset.
static const int PIN_IR_TX = 2, PIN_IR_RX = 1, PIN_SDA = 8, PIN_SCL = 18, PIN_NFC_IRQ = 17, PIN_NFC_RST = 45;

// Waits up to `ms`, a little at a time; false if the top button gave up first.
static bool waitALittle(uint32_t ms) {
  uint32_t until = millis() + ms;
  while (millis() < until) { if (giveUp()) return false; delay(10); }
  return true;
}

// ---- TOUCHSTONE (NFC): what a tag says it is -- its type and its identifier. Reads nothing else from it. ----------
static Adafruit_PN532 nfc(PIN_NFC_IRQ, PIN_NFC_RST, &Wire);
static bool nfcReady = false;

String runReadMyTag() {
  if (!nfcReady) {
    Wire.begin(PIN_SDA, PIN_SCL);
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
    if (nfc.readPassiveTargetID(PN532_MIFARE_ISO14443A, uid, &len, 150)) {
      String id;
      for (int i = 0; i < len; i++) { char b[4]; snprintf(b, sizeof b, i ? ":%02X" : "%02X", uid[i]); id += b; }
      // A 4-byte identifier is a MIFARE Classic card; 7 bytes is an NTAG (or an Ultralight)
      String kind = len == 4 ? "MIFARE Classic (or alike)" : len == 7 ? "NTAG / Ultralight" : "ISO 14443-A";
      return "A tag, and it answered.\n\n" + kind + "\nID " + id;
    }
  }
  return "No tag in 15 seconds.\nPress to try again.";
}

// ---- FLARE (IR): the daemon learns your remotes (C-51) ------------------------------------------------------------
// A REMOTE is three buttons -- POWER, VOLUME UP, VOLUME DOWN -- taught together ("press POWER: ARTSAI is listening"),
// or added from the site by brand (a brand's three codes are known once its POWER is). Up to six are kept in the
// board's flash; one is chosen, and FLARE's buttons send from it. They belong to the board -- the daemons share them.
static IRrecv irIn(PIN_IR_RX, 1024, 50, true);
static IRsend irOut(PIN_IR_TX);
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

// C-59: a remote renamed on the site or the phone (the user, 2026-10-05: "it helps personalize it")
String flareRename(int r, const String &name) {
  if (r < 0 || r >= flareCount()) return "No such remote.";
  String was = flareName(r);
  remotes.begin("remotes", false);
  remotes.putString(key("n", r).c_str(), name);
  remotes.end();
  return was + " is " + name + " now.";
}

String flareRemove(int r) {
  int n = flareCount();
  if (r < 0 || r >= n) return "No such remote.";
  String gone = flareName(r);
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

static String addRemote(const String &name, Button *buttons) {
  int n = flareCount();
  if (n >= MAX_REMOTES) return "";
  saveRemote(n, name, buttons);
  remotes.begin("remotes", false); remotes.putUChar("count", n + 1); remotes.putUChar("active", n); remotes.end();
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

// The remotes, for the site (sent with LIST).
String flareRemotesJson() {
  String out = "{\"active\":" + String(flareActive()) + ",\"remotes\":[";
  for (int r = 0, n = flareCount(); r < n; r++) {
    if (r) out += ",";
    out += "{\"name\":\"" + flareName(r) + "\",\"buttons\":[";
    for (int b = 0; b < 3; b++) { Button x; out += String(b ? "," : "") + (loadButton(r, b, x) ? "true" : "false"); }
    out += "]}";
  }
  return out + "]}";
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
  irIn.enableIRIn();
  decode_results got;
  uint32_t until = millis() + 20000;
  bool heard = false;
  while (millis() < until && !heard) {
    if (giveUp()) break;
    if (irIn.decode(&got)) {
      if (got.repeat || (got.decode_type == UNKNOWN && got.rawlen < 12)) irIn.resume();   // a repeat, or noise
      else heard = true;
    }
    delay(5);
  }
  irIn.disableIRIn();
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

// TEACH A REMOTE: three buttons, one after another, then kept as a remote and chosen.
String runTeachRemote() {
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
  irOut.begin();
  if (b.type == UNKNOWN) irOut.sendRaw(b.raw, b.rawLen, 38);
  else irOut.send((decode_type_t)b.type, b.value, b.bits, b.repeat);
  return daemonName() + " sent " + BUTTONS[which] + "  (" + flareName(r) + ").\n\nPress to send it again.";
}
String runPower()      { return sendButton(0); }
String runVolumeUp()   { return sendButton(1); }
String runVolumeDown() { return sendButton(2); }

// C-34: one code the site is trying (a brand's POWER), sent once.
String runFlareCode(const String &protocol, uint64_t value, uint16_t bits, uint16_t repeat, bool) {
  decode_type_t type = strToDecodeType(protocol.c_str());
  if (type == UNKNOWN) return "Could not send: this board does not know the protocol " + protocol + ".";
  irOut.begin();
  if (!irOut.send(type, value, bits, repeat)) return "Could not send " + protocol + " with " + String(bits) + " bits.";
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
