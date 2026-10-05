// C-55: the phone as the board's bridge, over Bluetooth Low Energy. See link.h.
//
// One GATT service with two characteristics, as the Nordic UART service has them: the phone WRITES lines to RX and
// the board NOTIFIES lines on TX. A line is cut into pieces the connection can carry and joined again at '\n' by the
// other side -- an ART line is ~3 KB and a piece is at most ~240 bytes.
//
// Both characteristics need an encrypted, authenticated link, so the first thing a phone does with them makes iOS
// ask for the code (passkey entry, the board as DISPLAY ONLY), and the bond is kept on both sides. The code is only
// ever shown while PAIR MY PHONE is open; the rest of the time it is a random number nobody sees, so nobody else can
// pair. A connection that has not authenticated within half a minute is dropped, so a stranger cannot sit on a slot.
#include "link.h"
#include <NimBLEDevice.h>
#include <deque>

static const char *LINK_SERVICE = "DAE00001-5C0D-4E5A-8C0D-E0C0DEC0DE00";
static const char *LINK_RX      = "DAE00002-5C0D-4E5A-8C0D-E0C0DEC0DE00";   // the phone writes here
static const char *LINK_TX      = "DAE00003-5C0D-4E5A-8C0D-E0C0DEC0DE00";   // the board notifies here
static const char *UART_SERVICE = "6E400001-B5A3-F393-E0A9-E50E24DCCA9E";   // WHISPER's test
static const char *UART_RX      = "6E400002-B5A3-F393-E0A9-E50E24DCCA9E";
static const char *UART_TX      = "6E400003-B5A3-F393-E0A9-E50E24DCCA9E";
static const uint32_t STRANGER_MS = 30000;
static const size_t MAX_LINE = 6000;                 // as readUsb's: an ART line is ~3 KB

static NimBLEServer *server = nullptr;
static NimBLECharacteristic *tx = nullptr, *uartTx = nullptr;
static portMUX_TYPE lock = portMUX_INITIALIZER_UNLOCKED;
static std::deque<String> inbox;                     // whole lines from the phone, for the main loop
static String partial;                               // a line still arriving
static volatile int phone = -1;                      // the paired phone's connection, or -1
static volatile bool listening = false;              // ... and it has asked for TX's notes
static volatile uint16_t mtu = 23;
static volatile bool pairing = false, pairedNow = false;
static volatile int stranger = -1; static volatile uint32_t strangerAt = 0;
static volatile bool uartHere = false;
static bool beaconOn = false;                        // C-15: advertise even with the phone here, so others hear us
static String uartSaid;

static uint32_t secretCode() {                       // never 123456: NimBLE reads that one as "ask the callback"
  uint32_t c;
  do c = 100000 + esp_random() % 900000; while (c == 123456);
  return c;
}

namespace {                                          // file-local: these names must never meet another file's
class Link : public NimBLEServerCallbacks {
  void onConnect(NimBLEServer *, ble_gap_conn_desc *d) override {
    stranger = d->conn_handle; strangerAt = millis();          // until it proves it is a paired phone
  }
  void onDisconnect(NimBLEServer *, ble_gap_conn_desc *d) override {
    if (d->conn_handle == phone) { phone = -1; listening = false; mtu = 23; }
    if (d->conn_handle == stranger) stranger = -1;
    uartHere = false;
  }
  void onMTUChange(uint16_t m, ble_gap_conn_desc *d) override { if (d->conn_handle == phone || phone < 0) mtu = m; }
  void onAuthenticationComplete(ble_gap_conn_desc *d) override {
    if (d->sec_state.encrypted && d->sec_state.authenticated && d->sec_state.bonded) {
      phone = d->conn_handle;
      if (stranger == d->conn_handle) stranger = -1;
      if (pairing) pairedNow = true;
    } else {
      server->disconnect(d->conn_handle);                     // a wrong code, or a phone that would not bond
    }
  }
};

class Heard : public NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic *c, ble_gap_conn_desc *) override {
    std::string v = c->getValue();
    portENTER_CRITICAL(&lock);
    for (char ch : v) {
      if (ch == '\n') { partial.trim(); if (partial.length()) inbox.push_back(partial); partial = ""; }
      else if (partial.length() < MAX_LINE) partial += ch;
    }
    while (inbox.size() > 16) inbox.pop_front();
    portEXIT_CRITICAL(&lock);
  }
  void onSubscribe(NimBLECharacteristic *, ble_gap_conn_desc *d, uint16_t sub) override {
    if (d->conn_handle == phone) listening = sub != 0;
  }
};

class UartHeard : public NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic *c) override { uartSaid = String(c->getValue().c_str()); }
  void onSubscribe(NimBLECharacteristic *, ble_gap_conn_desc *, uint16_t sub) override { uartHere = sub != 0; }
};
}  // namespace

void linkBegin() {
  NimBLEDevice::init("DAEMONS companion");
  NimBLEDevice::setMTU(247);
  NimBLEDevice::setSecurityAuth(true, true, true);            // bond, man-in-the-middle protection, secure connections
  NimBLEDevice::setSecurityIOCap(BLE_HS_IO_DISPLAY_ONLY);      // the board shows the code; the phone types it
  NimBLEDevice::setSecurityPasskey(secretCode());
  server = NimBLEDevice::createServer();
  server->setCallbacks(new Link());

  NimBLEService *link = server->createService(LINK_SERVICE);
  tx = link->createCharacteristic(LINK_TX, NIMBLE_PROPERTY::NOTIFY | NIMBLE_PROPERTY::READ |
                                           NIMBLE_PROPERTY::READ_ENC | NIMBLE_PROPERTY::READ_AUTHEN);
  link->createCharacteristic(LINK_RX, NIMBLE_PROPERTY::WRITE | NIMBLE_PROPERTY::WRITE_NR |
                                      NIMBLE_PROPERTY::WRITE_ENC | NIMBLE_PROPERTY::WRITE_AUTHEN)
      ->setCallbacks(new Heard());
  tx->setCallbacks(new Heard());
  link->start();

  NimBLEService *uart = server->createService(UART_SERVICE);
  uartTx = uart->createCharacteristic(UART_TX, NIMBLE_PROPERTY::NOTIFY);
  uartTx->setCallbacks(new UartHeard());
  uart->createCharacteristic(UART_RX, NIMBLE_PROPERTY::WRITE | NIMBLE_PROPERTY::WRITE_NR)->setCallbacks(new UartHeard());
  uart->start();

  NimBLEAdvertising *adv = NimBLEDevice::getAdvertising();
  adv->addServiceUUID(LINK_SERVICE);
  adv->setScanResponse(true);                                  // the name goes in the scan response
  adv->setMinInterval(800); adv->setMaxInterval(1600);         // 0.5-1 s: slow, for the battery
  adv->start();
}

void linkLoop(uint32_t now) {
  if (stranger >= 0 && !uartHere && now - strangerAt > STRANGER_MS)   // WHISPER's test app is let stay
  { server->disconnect(stranger); stranger = -1; }
  // a connection stops advertising; keep it going while no paired phone is here, so the phone can come back -- and
  // while the meeting beacon is on, always (C-15), so others nearby hear the board with the phone linked
  if ((phone < 0 || beaconOn) && server->getConnectedCount() < 2 && !NimBLEDevice::getAdvertising()->isAdvertising())
    NimBLEDevice::getAdvertising()->start();
}

bool linkPhoneHere() { return phone >= 0 && listening; }

void linkSend(const String &line) {
  if (!linkPhoneHere()) return;
  String all = line + "\n";
  size_t piece = mtu > 3 ? mtu - 3 : 20;
  for (size_t at = 0; at < all.length() && linkPhoneHere(); at += piece) {
    size_t n = min(piece, all.length() - at);
    tx->setValue((const uint8_t *)all.c_str() + at, n);
    tx->notify();
    if (at + n < all.length()) delay(8);                       // the radio's buffers are few: let them drain
  }
}

void linkSetBeacon(const char *uuid) {
  NimBLEAdvertising *adv = NimBLEDevice::getAdvertising();
  NimBLEAdvertisementData sr;
  if (uuid) sr.setCompleteServices(NimBLEUUID(uuid));
  else sr.setName("DAEMONS companion");
  bool was = adv->isAdvertising();
  if (was) adv->stop();
  adv->setScanResponseData(sr);
  beaconOn = uuid != nullptr;
  if (was || beaconOn) adv->start();
}

bool linkTake(String &line) {
  bool got = false;
  portENTER_CRITICAL(&lock);
  if (!inbox.empty()) { line = inbox.front(); inbox.pop_front(); got = true; }
  portEXIT_CRITICAL(&lock);
  return got;
}

uint32_t linkPairStart() {
  uint32_t code = secretCode();
  NimBLEDevice::setSecurityPasskey(code);
  pairedNow = false; pairing = true;
  if (!NimBLEDevice::getAdvertising()->isAdvertising()) NimBLEDevice::getAdvertising()->start();
  return code;
}
void linkPairStop() { pairing = false; NimBLEDevice::setSecurityPasskey(secretCode()); }
bool linkPairedNow() { bool p = pairedNow; pairedNow = false; return p; }
int linkBonds() { return NimBLEDevice::getNumBonds(); }
void linkForget() {
  if (phone >= 0) server->disconnect(phone);
  NimBLEDevice::deleteAllBonds();
}

bool whisperHere() { return uartHere; }
void whisperSay(const String &word) { uartTx->setValue(word.c_str()); uartTx->notify(); }
String whisperHeard() { return uartSaid; }
void whisperClear() { uartSaid = ""; }
void whisperDrop() {                                           // a general app on the phone is not a paired phone: let it go
  for (int i = 0; i < (int)server->getConnectedCount(); i++) {
    uint16_t h = server->getPeerInfo(i).getConnHandle();
    if (h != phone) server->disconnect(h);
  }
}
