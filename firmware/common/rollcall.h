#pragma once
// C-447: LONGWAVE ROLL CALL's frame, its slots and its limits -- one header for every firmware that joins a roll call
// (the Cardputer Zero now; the ADV with C-448; a LoRa board's SX1262 in GFSK later). docs/CAPS.md has the design.
//
// Only the user's own devices: a frame carries the DAEMONS mark and a check made from the household's key and the hour;
// a frame without both is noise, counted and dropped unread. Nothing here records or replays anyone else's signal.
//
// Plain C++ with no allocation, so an ESP32 build can include it as it is.
#include <stdint.h>
#include <string.h>

namespace rollcall {

// ---- the radio: 2-GFSK, 38.4 kbaud, 20.6 kHz deviation, the same sync word and length on every device ----
constexpr uint8_t SYNC1 = 0xD3, SYNC0 = 0x91;
constexpr int FRAME = 26;                     // the frame's bytes; the chip adds preamble, sync and CRC (about 7 ms on air)

// ---- the limits: kept here, so no setting can pass them (docs/CAPS.md, "Power and time") ----
constexpr int POWER_DEFAULT_DBM = -10;
constexpr int POWER_MAX_DBM = 0;              // never above 0 dBm in a roll call
constexpr int POWER_MIN_DBM = -30;
constexpr int CALL_PACKETS = 3;               // a call is sent this many times, so a missed packet is counted, not fatal
constexpr int CALL_SPACING_MS = 25;           // between a call's packets
constexpr int GUARD_MS = 30;                  // after the call's last packet, before the first slot
constexpr int SLOT_MS = 25;                   // one answer per slot
constexpr int ALL_SLOTS = 8;                  // ALL: a device answers in the slot its id falls in
constexpr int MAX_TARGETS = 4;                // ONE and SOME name up to four devices
constexpr int QUIET_433_S = 10;               // at 433 MHz, a call at most every ten seconds
constexpr int BURST_MAX_MS = 1000;            // every burst well under a second (a whole call is under 0.4 s)

enum Kind : uint8_t { CALL = 1, ANSWER = 2 };
enum Mode : uint8_t { ONE = 0, SOME = 1, ALL = 2, ONCE = 3 };   // ONCE is ALL AT ONCE: every answer in slot 0, on purpose

inline const char *modeName(uint8_t m) {
  return m == ONE ? "ONE" : m == SOME ? "SOME" : m == ALL ? "ALL" : m == ONCE ? "ALL AT ONCE" : "?";   // DRAFT
}

struct Frame {
  uint8_t kind = CALL, mode = ALL;
  uint16_t call = 0;            // the call's number
  uint16_t from = 0;            // the sender's short id
  uint8_t index = 0;            // CALL: this packet's place in the call; ANSWER: the slot answered in
  uint8_t total = 0;            // CALL: the call's packets; ANSWER: how many of them were heard
  int8_t power = 0;             // the dBm it was sent at
  int8_t heard = 0;             // ANSWER: the call's signal at the answerer, in dBm
  uint8_t slots = 0;            // CALL: how many slots follow
  uint16_t targets[MAX_TARGETS] = {};   // CALL in ONE or SOME: who answers, in slot order (0 = none)
  char name[9] = {};            // ANSWER: the answerer's name, eight letters at most
};

// FNV-1a: small, the same everywhere, and enough to tell the household's frames from the air's
inline uint32_t fnv(const uint8_t *p, int n, uint32_t h = 2166136261u) {
  for (int i = 0; i < n; i++) { h ^= p[i]; h *= 16777619u; }
  return h;
}
inline uint16_t shortId(const char *deviceId) {
  uint32_t h = fnv((const uint8_t *)deviceId, (int)strlen(deviceId));
  uint16_t s = (uint16_t)(h ^ (h >> 16));
  return s ? s : 1;             // 0 means "nobody" in a call's targets
}
inline uint32_t check(const uint8_t *body, const char *key, uint32_t hour) {
  uint8_t hb[4] = { (uint8_t)(hour >> 24), (uint8_t)(hour >> 16), (uint8_t)(hour >> 8), (uint8_t)hour };
  return fnv(body, 22, fnv(hb, 4, fnv((const uint8_t *)key, (int)strlen(key))));
}

// The frame on the air: the mark "DM", then the fields, a version, and the check over the first 22 bytes.
inline void pack(const Frame &f, const char *key, uint32_t hour, uint8_t out[FRAME]) {
  memset(out, 0, FRAME);
  out[0] = 'D'; out[1] = 'M';
  out[2] = f.kind; out[3] = f.mode;
  out[4] = f.call >> 8; out[5] = (uint8_t)f.call;
  out[6] = f.from >> 8; out[7] = (uint8_t)f.from;
  out[8] = f.index; out[9] = f.total;
  out[10] = (uint8_t)f.power; out[11] = (uint8_t)f.heard; out[12] = f.slots;
  if (f.kind == CALL) for (int i = 0; i < MAX_TARGETS; i++) { out[13 + 2 * i] = f.targets[i] >> 8; out[14 + 2 * i] = (uint8_t)f.targets[i]; }
  else memcpy(out + 13, f.name, 8);
  out[21] = 1;                  // the frame's version
  uint32_t c = check(out, key, hour);
  out[22] = c >> 24; out[23] = c >> 16; out[24] = c >> 8; out[25] = (uint8_t)c;
}

enum Read { OK, NOT_OURS, NOT_HOUSEHOLD };
// A frame from the air: ours only with the mark, a known version and the household's check for this hour or the one
// either side (two devices' clocks a little apart). Anything else is not read further.
inline Read unpack(const uint8_t in[FRAME], const char *key, uint32_t hour, Frame &f) {
  if (in[0] != 'D' || in[1] != 'M' || in[21] != 1 || (in[2] != CALL && in[2] != ANSWER)) return NOT_OURS;
  uint32_t got = (uint32_t)in[22] << 24 | (uint32_t)in[23] << 16 | (uint32_t)in[24] << 8 | in[25];
  if (got != check(in, key, hour) && got != check(in, key, hour - 1) && got != check(in, key, hour + 1)) return NOT_HOUSEHOLD;
  f = Frame{};
  f.kind = in[2]; f.mode = in[3];
  f.call = (uint16_t)(in[4] << 8 | in[5]);
  f.from = (uint16_t)(in[6] << 8 | in[7]);
  f.index = in[8]; f.total = in[9];
  f.power = (int8_t)in[10]; f.heard = (int8_t)in[11]; f.slots = in[12];
  if (f.kind == CALL) for (int i = 0; i < MAX_TARGETS; i++) f.targets[i] = (uint16_t)(in[13 + 2 * i] << 8 | in[14 + 2 * i]);
  else { memcpy(f.name, in + 13, 8); f.name[8] = 0; }
  return OK;
}

// Which slot a device answers a call in, or -1 when the call is not for it.
inline int slotFor(const Frame &call, uint16_t me) {
  switch (call.mode) {
    case ONE: case SOME:
      for (int i = 0; i < MAX_TARGETS; i++) if (call.targets[i] == me) return i;
      return -1;
    case ALL: return me % ALL_SLOTS;
    case ONCE: return 0;
  }
  return -1;
}
inline int slotsFor(uint8_t mode, int targets) {
  return mode == ALL ? ALL_SLOTS : mode == ONCE ? 1 : targets < 1 ? 1 : targets > MAX_TARGETS ? MAX_TARGETS : targets;
}
// From a call packet heard: how long until its slot opens, in ms.
inline int msUntilSlot(const Frame &call, int slot) {
  return (call.total - 1 - call.index) * CALL_SPACING_MS + GUARD_MS + slot * SLOT_MS;
}
// How long the caller listens after its last packet.
inline int listenMs(int slots) { return GUARD_MS + slots * SLOT_MS + SLOT_MS; }

inline int clampPower(int dbm) { return dbm > POWER_MAX_DBM ? POWER_MAX_DBM : dbm < POWER_MIN_DBM ? POWER_MIN_DBM : dbm; }

}  // namespace rollcall
