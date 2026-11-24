// C-447: LONGWAVE ROLL CALL -- see longwave.h, docs/CAPS.md and firmware/common/rollcall.h.
#include "caps/longwave.h"

#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <ctime>
#include <thread>
#include <unistd.h>

#include "caps/cap.h"
#include "caps/cc1101.h"
#include "common/rollcall.h"
#include "hal/hal.h"
#include "hub/hub.h"
#include "paths.h"

namespace longwave {
namespace {
using clock_t_ = std::chrono::steady_clock;
using std::chrono::milliseconds;

int powerDbm = rollcall::POWER_DEFAULT_DBM;
bool confRead = false;
bool listening = false;          // answering others' calls
int answeredN = 0;
uint16_t lastCaller = 0, lastCall = 0;
uint16_t nextCall = 0;

void readConf() {
  if (confRead) return;
  confRead = true;
  std::string t;
  if (readText(inConfig("rollcall.conf"), t)) {
    size_t at = t.find("power =");
    if (at != std::string::npos) powerDbm = rollcall::clampPower(atoi(t.c_str() + at + 7));
  }
  nextCall = (uint16_t)(time(nullptr) & 0xFFFF);
}
void writeConf() {
  writeTextAtomic(inConfig("rollcall.conf"), "# C-447: LONGWAVE ROLL CALL (docs/CAPS.md); power in dBm, -30 to 0\npower = " +
                                              std::to_string(powerDbm) + "\n");
}

// The household's key: a key of the user's own in rollcall.key; else the paired hub's name, which every device of the
// household shares; else none, and any DAEMONS device answers.
std::string key(std::string *said = nullptr) {
  std::string k;
  if (readText(inConfig("rollcall.key"), k)) {
    while (!k.empty() && isspace((unsigned char)k.back())) k.pop_back();
    if (!k.empty()) { if (said) *said = "YOUR OWN KEY"; return k; }   // DRAFT
  }
  std::string a = hub::address();
  size_t s = a.find("://");
  if (s != std::string::npos) a = a.substr(s + 3);
  a = a.substr(0, a.find_first_of(":/"));
  for (auto &c : a) c = (char)tolower((unsigned char)c);
  if (!a.empty()) { if (said) *said = "YOUR HUB (" + a + ")"; return "hub:" + a; }   // DRAFT
  if (said) *said = "ANY DAEMONS DEVICE";                                            // DRAFT
  return "DAEMONS";
}
uint32_t hour() { return (uint32_t)(time(nullptr) / 3600); }

// The last call's time on each band, kept on disk so two runs a second apart still keep the band's quiet
long lastCallAt(const std::string &band) {
  std::string t;
  return readText(inConfig("rollcall.last." + band), t) ? atol(t.c_str()) : 0;
}
int quietFor(caps::Band b) { return b == caps::Band::B433 ? rollcall::QUIET_433_S : 2; }

void sleepUntil(clock_t_::time_point t) { std::this_thread::sleep_until(t); }

// Pretend: two devices of the household in the next room, for the window on a computer
Result pretendCall(uint8_t mode, const std::vector<uint16_t> &targets, Result r) {
  std::this_thread::sleep_for(milliseconds(rollcall::CALL_PACKETS * rollcall::CALL_SPACING_MS + rollcall::listenMs(rollcall::slotsFor(mode, (int)targets.size()))));
  struct P { uint16_t id; const char *name; int here, there, heard; };
  static const P ps[] = { { 0x2A41, "ADV", -61, -63, 3 }, { 0x7C12, "ZERO-TWO", -78, -80, 2 } };
  for (auto &p : ps) {
    Answer a;
    rollcall::Frame call;
    call.mode = mode;
    for (size_t i = 0; i < targets.size() && i < rollcall::MAX_TARGETS; i++) call.targets[i] = targets[i];
    a.slot = rollcall::slotFor(call, p.id);
    if (a.slot < 0) continue;
    a.id = p.id; a.name = p.name; a.here = p.here; a.there = p.there; a.heard = p.heard; a.of = rollcall::CALL_PACKETS;
    r.answers.push_back(a);
  }
  if (mode == rollcall::ONCE && r.answers.size() > 1) { r.answers.resize(1); r.broken = 1; }   // the collision, as it would be
  r.noise = 2;
  return r;
}
}  // namespace

uint16_t me() { return rollcall::shortId(hal::deviceId().c_str()); }
std::string myName() {
  char h[64] = {};
  gethostname(h, sizeof h - 1);
  std::string n = h;
  if (n.rfind("daemons-", 0) == 0 && n.size() > 8) n = n.substr(8);
  std::string out;
  for (char c : n) if (isalnum((unsigned char)c) || c == '-') out += (char)toupper((unsigned char)c);
  return out.substr(0, 8);
}
std::string keyName() { std::string s; key(&s); return s; }

int power() { readConf(); return powerDbm; }
void setPower(int dbm) { readConf(); powerDbm = rollcall::clampPower(dbm); writeConf(); }

int quietLeft() {
  caps::Band b = caps::band();
  long left = lastCallAt(caps::bandName(b)) + quietFor(b) - (long)time(nullptr);
  return left > 0 ? (int)left : 0;
}

std::string mayCall() {
  const caps::Found &f = caps::found();
  if (f.kind != caps::Kind::Cc1101Nfc) return "no CC1101 cap is fitted";                                      // DRAFT
  caps::Band b = caps::band();
  if (b == caps::Band::B315) return "315 MHz is for listening only";                                          // DRAFT
  if (!caps::mayTransmit(b)) return std::string("no ") + caps::bandName(b) + " MHz antenna is said to be on";   // DRAFT
  if (!f.pretend && !caps::radio()) return "the CC1101 did not answer";                                       // DRAFT
  int q = quietLeft();
  if (q > 0) return "the band rests " + std::to_string(q) + " s more";                                        // DRAFT
  return "";
}

Result call(uint8_t mode, const std::vector<uint16_t> &targets) {
  readConf();
  Result r;
  r.mode = mode;
  r.why = mayCall();
  if (!r.why.empty()) return r;
  if ((mode == rollcall::ONE || mode == rollcall::SOME) && targets.empty()) { r.why = "name a device to call"; return r; }   // DRAFT
  caps::Band b = caps::band();
  writeTextAtomic(inConfig(std::string("rollcall.last.") + caps::bandName(b)), std::to_string((long)time(nullptr)) + "\n");
  r.call = ++nextCall;
  r.power = rollcall::clampPower(powerDbm);
  r.sent = true;
  if (caps::found().pretend) { r.packets = rollcall::CALL_PACKETS; return pretendCall(mode, targets, r); }

  cc1101::Chip *chip = caps::radio();
  std::string k = key();
  bool wasListening = listening;
  listening = false;
  chip->packetMode(rollcall::FRAME, rollcall::SYNC1, rollcall::SYNC0);
  chip->setPower(r.power, caps::bandMhz(b));

  rollcall::Frame f;
  f.kind = rollcall::CALL;
  f.mode = mode;
  f.call = r.call;
  f.from = me();
  f.total = rollcall::CALL_PACKETS;
  f.power = (int8_t)r.power;
  f.slots = (uint8_t)rollcall::slotsFor(mode, (int)targets.size());
  for (size_t i = 0; i < targets.size() && i < rollcall::MAX_TARGETS; i++) f.targets[i] = targets[i];
  auto start = clock_t_::now();
  uint8_t out[rollcall::FRAME];
  for (int i = 0; i < rollcall::CALL_PACKETS; i++) {
    sleepUntil(start + milliseconds(i * rollcall::CALL_SPACING_MS));
    f.index = (uint8_t)i;
    rollcall::pack(f, k.c_str(), hour(), out);
    if (chip->send(out, rollcall::FRAME)) r.packets++;
  }
  // the answers, slot by slot, until the last slot has closed
  auto lastSent = start + milliseconds((rollcall::CALL_PACKETS - 1) * rollcall::CALL_SPACING_MS);
  auto until = lastSent + milliseconds(rollcall::listenMs(f.slots));
  chip->listen();
  uint8_t in[rollcall::FRAME];
  while (clock_t_::now() < until) {
    int rssi = -127;
    bool crc = false;
    if (chip->receive(in, rollcall::FRAME, rssi, crc) != rollcall::FRAME) { std::this_thread::sleep_for(std::chrono::microseconds(500)); continue; }
    if (!crc) { r.broken++; continue; }
    rollcall::Frame a;
    rollcall::Read got = rollcall::unpack(in, k.c_str(), hour(), a);
    if (got == rollcall::NOT_OURS) { r.noise++; continue; }
    if (got == rollcall::NOT_HOUSEHOLD) { r.strangers++; continue; }
    if (a.kind != rollcall::ANSWER || a.call != r.call) continue;
    bool dup = false;
    for (auto &x : r.answers) dup = dup || x.id == a.from;
    if (dup) continue;
    Answer ans;
    ans.id = a.from; ans.name = a.name; ans.slot = a.index; ans.here = rssi; ans.there = a.heard; ans.heard = a.total; ans.of = rollcall::CALL_PACKETS;
    r.answers.push_back(ans);
  }
  caps::setBand(b);   // back to listening on the band, as CAPS shows it
  if (wasListening) setAnswering(true);
  return r;
}

bool setAnswering(bool on) {
  if (!on) { listening = false; return true; }
  const caps::Found &f = caps::found();
  // answering transmits too: the same rule as a call, but an answer is not a call, so the band's rest does not apply
  if (f.kind != caps::Kind::Cc1101Nfc || !caps::mayTransmit(caps::band())) { listening = false; return false; }
  if (!f.pretend) {
    cc1101::Chip *chip = caps::radio();
    if (!chip) return listening = false;
    chip->packetMode(rollcall::FRAME, rollcall::SYNC1, rollcall::SYNC0);
    chip->setPower(power(), caps::bandMhz(caps::band()));
    chip->listen();
  }
  return listening = true;
}
bool answering() { return listening; }
int answeredCount() { return answeredN; }

std::string tick() {
  if (!listening || caps::found().pretend) return "";
  cc1101::Chip *chip = caps::radio();
  if (!chip) return "";
  uint8_t in[rollcall::FRAME];
  int rssi = -127;
  bool crc = false;
  if (chip->receive(in, rollcall::FRAME, rssi, crc) != rollcall::FRAME || !crc) return "";
  auto heardAt = clock_t_::now();
  std::string k = key();
  rollcall::Frame c;
  if (rollcall::unpack(in, k.c_str(), hour(), c) != rollcall::OK || c.kind != rollcall::CALL) return "";
  if (c.from == lastCaller && c.call == lastCall) return "";   // answered already
  uint16_t self = me();
  if (c.from == self) return "";
  int slot = rollcall::slotFor(c, self);
  lastCaller = c.from; lastCall = c.call;
  if (slot < 0) return "";
  // the rest of the call, counted, until this device's slot opens
  auto at = heardAt + milliseconds(rollcall::msUntilSlot(c, slot));
  int heard = 1, sum = rssi;
  while (clock_t_::now() + milliseconds(1) < at) {
    rollcall::Frame more;
    int r2 = -127;
    if (chip->receive(in, rollcall::FRAME, r2, crc) == rollcall::FRAME && crc &&
        rollcall::unpack(in, k.c_str(), hour(), more) == rollcall::OK && more.kind == rollcall::CALL && more.from == c.from && more.call == c.call) {
      heard++; sum += r2;
    } else std::this_thread::sleep_for(std::chrono::microseconds(500));
  }
  sleepUntil(at);
  rollcall::Frame a;
  a.kind = rollcall::ANSWER;
  a.mode = c.mode;
  a.call = c.call;
  a.from = self;
  a.index = (uint8_t)slot;
  a.total = (uint8_t)heard;
  a.power = (int8_t)rollcall::clampPower(power());
  a.heard = (int8_t)(sum / heard);
  std::string n = myName();
  for (size_t i = 0; i < 8 && i < n.size(); i++) a.name[i] = n[i];
  uint8_t out[rollcall::FRAME];
  rollcall::pack(a, k.c_str(), hour(), out);
  chip->setPower(a.power, caps::bandMhz(caps::band()));
  bool ok = chip->send(out, rollcall::FRAME);
  chip->listen();
  if (!ok) return "";
  answeredN++;
  char line[96];
  snprintf(line, sizeof line, "ANSWERED %04X'S CALL %u (%s) IN SLOT %d, HEARD %d OF %d AT %d dBm", c.from, c.call,   // DRAFT
           rollcall::modeName(c.mode), slot, heard, c.total, sum / heard);
  return line;
}

}  // namespace longwave
