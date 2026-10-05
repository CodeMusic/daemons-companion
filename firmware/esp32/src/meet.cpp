// C-15: meeting others nearby (PLAN 9). Passing someone else carrying a daemon is an event: the next SYNC writes their
// daemon into your INDEX as seen, and your daemon's friendship grows a little (the server's half, api.ts).
//
// THE BEACON is one 128-bit service UUID and nothing else:
//
//     dae0beac-0015-4d45-SSSS-PPPPPPPP0001       SSSS the carried daemon's species, PPPPPPPP a random tag
//
// -- the one form an iPhone app is allowed to advertise (no service data, no manufacturer data), so the board and the
// phone (app/beacon.ts) send the same beacon and hear each other's. The tag is four random bytes, new every hour, so a
// beacon cannot be followed from one hour to the next, and it says nothing about who carries it: a species, and
// noise. It rides in the scan response (the advertisement proper carries the link's UUID, link.cpp).
//
// THE LISTEN: four seconds every three minutes, which costs little. A tag already heard this hour is not heard again,
// and the tags of our OWN other companions (the phone, which the server names in the state) are never heard at all.
#include "meet.h"
#include "link.h"
#include <NimBLEDevice.h>
#include <deque>

static const char *PREFIX = "dae0beac-0015-4d45-";
static const uint32_t ROTATE_MS = 3600000, LISTEN_EVERY_MS = 180000;
static const int LISTEN_S = 4;

static uint32_t peer = 0, peerAt = 0, listenedAt = 0;
static int beaconSpecies = -1;
static String ours;                                        // our other companions' tags, "a1b2c3d4,..."
static portMUX_TYPE lock = portMUX_INITIALIZER_UNLOCKED;
static std::deque<std::pair<int, uint32_t>> heard;         // from the radio task, for the main loop
static std::deque<std::pair<uint32_t, uint32_t>> recent;   // tag -> when, for once an hour

static String hex8(uint32_t v) { char b[9]; snprintf(b, sizeof b, "%08lx", (unsigned long)v); return b; }

class Heard : public NimBLEAdvertisedDeviceCallbacks {
  void onResult(NimBLEAdvertisedDevice *d) override {
    for (int i = 0; i < (int)d->getServiceUUIDCount(); i++) {
      std::string u = d->getServiceUUID(i).toString();
      for (auto &c : u) c = tolower(c);
      if (u.size() != 36 || u.compare(0, 19, PREFIX) != 0) continue;
      int species = strtol(u.substr(19, 4).c_str(), nullptr, 16);
      uint32_t tag = strtoul(u.substr(24, 8).c_str(), nullptr, 16);
      if (!species || tag == peer) continue;
      portENTER_CRITICAL(&lock);
      if (heard.size() < 16) heard.push_back({ species, tag });
      portEXIT_CRITICAL(&lock);
    }
  }
};

void meetLoop(uint32_t now, bool on, int species) {
  if (!on || species <= 0) {
    if (beaconSpecies >= 0) { linkSetBeacon(nullptr); beaconSpecies = -1; peer = 0; }
    return;
  }
  if (!peer || now - peerAt > ROTATE_MS || species != beaconSpecies) {      // a new tag every hour
    do peer = esp_random(); while (!peer);
    peerAt = now; beaconSpecies = species;
    char uuid[40];
    snprintf(uuid, sizeof uuid, "%s%04x-%08lx0001", PREFIX, species & 0xFFFF, (unsigned long)peer);
    linkSetBeacon(uuid);
  }
  NimBLEScan *scan = NimBLEDevice::getScan();
  static bool ready = false;
  if (!ready) {
    scan->setAdvertisedDeviceCallbacks(new Heard(), false);
    scan->setActiveScan(true);                             // the beacon is in the scan response
    scan->setInterval(97); scan->setWindow(37);            // a light listen: about a third of the time
    ready = true;
  }
  if ((!listenedAt || now - listenedAt > LISTEN_EVERY_MS) && !scan->isScanning()) {
    listenedAt = now;
    scan->start(LISTEN_S, nullptr, false);                 // in the background; the loop carries on
  }
}

String meetOwnPeer() { return beaconSpecies >= 0 ? hex8(peer) : ""; }
void meetSetOurs(const String &peersCsv) { ours = peersCsv; }

bool meetTakeHeard(int &species, String &tag) {
  while (true) {
    std::pair<int, uint32_t> h;
    portENTER_CRITICAL(&lock);
    bool got = !heard.empty();
    if (got) { h = heard.front(); heard.pop_front(); }
    portEXIT_CRITICAL(&lock);
    if (!got) return false;
    uint32_t now = millis();
    while (!recent.empty() && now - recent.front().second > ROTATE_MS) recent.pop_front();
    bool again = false;
    for (auto &r : recent) if (r.first == h.second) again = true;
    String t = hex8(h.second);
    if (again || ours.indexOf(t) >= 0) continue;
    recent.push_back({ h.second, now });
    if (recent.size() > 64) recent.pop_front();
    species = h.first; tag = t;
    return true;
  }
}
