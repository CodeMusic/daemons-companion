// C-28: the ROUTINES that use the board's own radios -- FLARE (IR), WHISPER (Bluetooth), TOUCHSTONE (NFC).
// Each is a test that the radio works, run against the author's own gear only (CONTEXT.md): their remote and TV,
// their phone, their tags. A routine may wait for something (a tag, a remote's button, a phone); while it waits it
// says so on the screen, and the side key gives up.
#include <Arduino.h>
#include <Wire.h>
#include <Preferences.h>
#include <Adafruit_PN532.h>
#include <IRrecv.h>
#include <IRsend.h>
#include <IRutils.h>
#include <NimBLEDevice.h>
#include "radios.h"

// LilyGO's pin map (examples/utilities.h): IR out and in, the PN532 on I2C with its IRQ and reset.
static const int PIN_IR_TX = 2, PIN_IR_RX = 1, PIN_SDA = 8, PIN_SCL = 18, PIN_NFC_IRQ = 17, PIN_NFC_RST = 45;

// Waits up to `ms`, a little at a time; false if the side key gave up first.
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
  progress("Hold your tag to the back of the board.\n\nside key: give up");
  uint8_t uid[7], len = 0;
  uint32_t until = millis() + 15000;
  while (millis() < until) {
    if (giveUp()) return "Given up.";
    // a short wait each time, so the side key is heard
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

// ---- FLARE (IR): learn one button from your own remote, then send it. Remembered across power-offs. ---------------
static IRrecv irIn(PIN_IR_RX, 1024, 50, true);
static IRsend irOut(PIN_IR_TX);
static Preferences flareMemory;

String runLearnMyRemote() {
  irIn.enableIRIn();
  progress("Point your TV's remote at the board and press its POWER button once.\n\nside key: give up");
  decode_results got;
  uint32_t until = millis() + 15000;
  bool heard = false;
  while (millis() < until && !heard) {
    if (giveUp()) { irIn.disableIRIn(); return "Given up."; }
    if (irIn.decode(&got)) {
      if (got.repeat || got.decode_type == UNKNOWN && got.rawlen < 12) irIn.resume();   // a repeat, or noise
      else heard = true;
    }
    delay(5);
  }
  irIn.disableIRIn();
  if (!heard) return "Heard nothing in 15 seconds.\nPress to try again.";
  flareMemory.begin("flare", false);
  flareMemory.putInt("type", got.decode_type);
  if (hasACState(got.decode_type)) {                 // long codes (air conditioners) keep their whole state
    flareMemory.putBytes("state", got.state, got.bits / 8);
  } else if (got.decode_type != UNKNOWN) {
    flareMemory.putULong64("value", got.value);
  } else {                                           // an unknown remote: keep its timings to send them back as they were
    uint16_t n = getCorrectedRawLength(&got);
    uint16_t *raw = resultToRawArray(&got);
    flareMemory.putBytes("raw", raw, n * sizeof(uint16_t));
    delete[] raw;
  }
  flareMemory.putUShort("bits", got.bits);
  flareMemory.end();
  return "Learned it: " + typeToString(got.decode_type) + ", " + String(got.bits) + " bits.\n\nNow choose SEND TO MY TV.";
}

String runSendToMyTv() {
  flareMemory.begin("flare", true);
  if (!flareMemory.isKey("type")) { flareMemory.end(); return "Nothing learned yet.\nChoose LEARN MY REMOTE first."; }
  decode_type_t type = (decode_type_t)flareMemory.getInt("type");
  uint16_t bits = flareMemory.getUShort("bits");
  irOut.begin();
  if (hasACState(type)) {
    uint8_t state[64]; size_t n = flareMemory.getBytes("state", state, sizeof state);
    irOut.send(type, state, n);
  } else if (type != UNKNOWN) {
    irOut.send(type, flareMemory.getULong64("value"), bits);
  } else {
    size_t bytes = flareMemory.getBytesLength("raw");
    uint16_t *raw = new uint16_t[bytes / 2];
    flareMemory.getBytes("raw", raw, bytes);
    irOut.sendRaw(raw, bytes / 2, 38);
    delete[] raw;
  }
  flareMemory.end();
  return "Sent " + typeToString(type) + ".\n\nDid your TV answer? Point the board's end at it and press to send again.";
}

// ---- WHISPER (Bluetooth): your phone opens it, and a word goes each way. -----------------------------------------
// The Nordic UART service, which a general Bluetooth app on the phone (nRF Connect, or LightBlue) already knows:
// the board says hello on TX, and whatever the phone writes to RX comes back on the screen.
static const char *UART_SERVICE = "6E400001-B5A3-F393-E0A9-E50E24DCCA9E";
static const char *UART_RX      = "6E400002-B5A3-F393-E0A9-E50E24DCCA9E";   // the phone writes here
static const char *UART_TX      = "6E400003-B5A3-F393-E0A9-E50E24DCCA9E";   // the board notifies here
static NimBLEServer *whisperServer = nullptr;
static NimBLECharacteristic *whisperTx = nullptr;
static volatile bool phoneHere = false;
static String phoneSaid;

class WhisperLink : public NimBLEServerCallbacks {
  void onConnect(NimBLEServer *) override { phoneHere = true; }
  void onDisconnect(NimBLEServer *) override { phoneHere = false; }
};
class WhisperHeard : public NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic *c) override { phoneSaid = String(c->getValue().c_str()); }
};

String runOpenToMyPhone() {
  if (!whisperServer) {
    NimBLEDevice::init("DAEMONS companion");
    whisperServer = NimBLEDevice::createServer();
    whisperServer->setCallbacks(new WhisperLink());
    NimBLEService *uart = whisperServer->createService(UART_SERVICE);
    whisperTx = uart->createCharacteristic(UART_TX, NIMBLE_PROPERTY::NOTIFY);
    uart->createCharacteristic(UART_RX, NIMBLE_PROPERTY::WRITE | NIMBLE_PROPERTY::WRITE_NR)
        ->setCallbacks(new WhisperHeard());
    uart->start();
    NimBLEDevice::getAdvertising()->addServiceUUID(UART_SERVICE);
  }
  phoneSaid = "";
  NimBLEDevice::getAdvertising()->start();
  progress("Open \"DAEMONS companion\" from your phone's Bluetooth app (nRF Connect).\n\nside key: give up");
  uint32_t until = millis() + 60000;
  while (!phoneHere) {
    if (millis() > until) { NimBLEDevice::getAdvertising()->stop(); return "No phone in a minute.\nPress to try again."; }
    if (!waitALittle(100)) { NimBLEDevice::getAdvertising()->stop(); return "Given up."; }
  }
  NimBLEDevice::getAdvertising()->stop();
  waitALittle(1500);                                   // let the phone find the service and ask for its notes
  String hello = "Hello from your daemon.";
  whisperTx->setValue(hello.c_str());
  whisperTx->notify();
  progress("Your phone is here. The board said hello.\n\nNow write a word to it from the phone (the RX line, as text).\n\nside key: done");
  until = millis() + 60000;
  while (phoneHere && !phoneSaid.length() && millis() < until)
    if (!waitALittle(100)) break;
  String said = phoneSaid;
  if (phoneHere) whisperServer->disconnect(whisperServer->getPeerInfo(0).getConnHandle());
  if (said.length()) return "Both ways work.\n\nSent: " + hello + "\nHeard: " + said;
  return "Your phone connected and the hello went out, but no word came back.\nPress to try again.";
}
