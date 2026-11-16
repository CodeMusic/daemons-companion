// C-380: the mirror, as app/screens/game/Game.tsx keeps it (mirrorIn, mirrorOut), with the hub's own rule for which
// copy wins (server/src/game/mirror.ts). Nothing here writes the hub while the mode is Read or Off.
#include "hub/mirror.h"

#include <ArduinoJson.h>

#include <chrono>
#include <condition_variable>
#include <cstdlib>
#include <mutex>
#include <thread>

#include "hub/http.h"
#include "hub/hub.h"
#include "paths.h"

namespace mirror {
static Mode current = ZERO_DEVICE ? Mode::Send : Mode::Read;
Mode mode() { return current; }
void setMode(Mode m) { current = m; }
const char *modeName(Mode m) { return m == Mode::Send ? "send" : m == Mode::Read ? "read" : "off"; }
Mode modeByName(const std::string &n, Mode otherwise) {
  return n == "send" ? Mode::Send : n == "read" ? Mode::Read : n == "off" ? Mode::Off : otherwise;
}

static std::string agreedPath() { return inData("mirror.json"); }
std::string agreed() {
  std::string t;
  if (!readText(agreedPath(), t)) return "";
  JsonDocument d;
  return deserializeJson(d, t) ? "" : std::string(d["sha1"] | "");
}
static void agree(const std::string &sha1) { writeTextAtomic(agreedPath(), "{\"sha1\":\"" + sha1 + "\"}\n"); }

// mirrorChoice: the same copy; the hub's taken while this device's has not moved since they agreed; both moved -- the
// truth's. One case more than server/src/game/mirror.ts has (2026-11-16): ONLY this device moved (a game saved while the
// hub was away, the hub's copy still the one they agreed) is "keep" -- this device's goes out -- where mirrorChoice
// would call it both moved and, the companion being the truth, set the newer save aside for the older.
static std::string choose(const std::string &theirs, const std::string &mine, const std::string &last, const std::string &truth) {
  if (theirs == mine) return "same";
  if (mine.empty() || mine == last) return "take";
  if (!last.empty() && theirs == last) return "keep";
  return truth == "device" ? "keep" : "replace";
}

static std::string errorOf(const Reply &r) {
  JsonDocument d;
  if (!r.body.empty() && !deserializeJson(d, (const char *)r.body.data(), r.body.size()) && d["error"].is<const char *>())
    return d["error"].as<const char *>();
  return !r.error.empty() ? r.error : "the hub said " + std::to_string(r.status);   // DRAFT
}

In pull(const Bytes &mine) {
  In in;
  if (current == Mode::Off) { in.why = "the mirror is off here"; return in; }   // DRAFT
  if (!hub::paired()) { in.why = "not paired with a hub"; return in; }   // DRAFT
  Reply r = httpGet(hub::address() + "/api/save/mirror", hub::headers(), 8000);
  if (r.status == 404) { in.why = "the hub keeps no mirror yet"; return in; }   // DRAFT
  if (!r.ok()) { in.why = "the hub is away: " + errorOf(r); return in; }   // DRAFT
  JsonDocument d;
  if (deserializeJson(d, (const char *)r.body.data(), r.body.size()) || !d["b64"].is<const char *>()) {
    in.why = "the hub's copy did not read";   // DRAFT
    return in;
  }
  Bytes theirs;
  if (!unbase64(d["b64"].as<const char *>(), theirs) || sha1Hex(theirs) != std::string(d["sha1"] | "")) {
    in.why = "the hub's copy came down damaged";   // DRAFT
    return in;
  }
  const std::string theirId = sha1Hex(theirs), mineId = mine.empty() ? "" : sha1Hex(mine), last = agreed();
  in.choice = choose(theirId, mineId, last, d["truth"] | "device");   // an older hub sends no truth: the device's, as it was
  if (in.choice == "same") { agree(theirId); in.why = "in step with the hub"; return in; }   // DRAFT
  if (in.choice == "keep") {
    in.why = theirId == last ? "this device's save is newer: it goes to the hub" : "this device's save is the truth: it goes to the hub";   // DRAFT
    return in;
  }
  if (in.choice == "replace") {
    // C-365: both moved and the hub's is the truth -- this device's own goes into the hub's trail first (C-364), and only
    // once it is safely there is it replaced. Read only, nothing is written there: the copy here is a preview's
    if (current == Mode::Send) {
      Reply h = httpPost(hub::address() + "/api/saves/history",
                         "{\"b64\":\"" + base64(mine) + "\",\"note\":\"this device's own, replaced by the companion's\"}",
                         hub::headers(), 15000);
      if (!h.ok()) { in.choice = ""; in.why = "this device's save could not be set aside first, so it stays: " + errorOf(h); return in; }   // DRAFT
    }
    in.why = "both moved: the hub's is the truth, and this device's own is kept in its trail";   // DRAFT
  } else {
    in.why = "took the hub's copy";   // DRAFT
  }
  in.took = true;
  in.save = std::move(theirs);
  agree(theirId);
  return in;
}

Out push(const Bytes &save) {
  Out out;
  if (current != Mode::Send) { out.why = current == Mode::Read ? "read only here: kept on this device" : "the mirror is off here"; return out; }   // DRAFT
  if (!hub::paired()) { out.why = "not paired: kept on this device"; return out; }   // DRAFT
  const std::string id = sha1Hex(save), last = agreed();
  if (id == last) { out.sent = true; out.why = "the hub already holds it"; return out; }   // DRAFT
  std::string body = "{\"b64\":\"" + base64(save) + "\"";
  if (!last.empty()) body += ",\"base\":\"" + last + "\"";
  body += "}";
  Reply r = httpPost(hub::address() + "/api/save/mirror", body, hub::headers(), 15000);
  if (r.ok()) {
    JsonDocument d;
    std::string s = !deserializeJson(d, (const char *)r.body.data(), r.body.size()) ? std::string(d["sha1"] | "") : "";
    agree(s.empty() ? id : s);
    out.sent = true;
    out.why = "the hub holds it";   // DRAFT
    return out;
  }
  out.why = errorOf(r);
  // "another game": a new game begun here never takes the hub's place (C-215); "moved on": a SYNC wrote the hub's copy
  // while this one was on its way -- the next pull settles it
  out.otherGame = r.status == 409 && out.why.find("another game") != std::string::npos;
  return out;
}

// ---- the save on its way, on a thread of its own ----------------------------------------------------------------------
static std::mutex qlock;
static std::condition_variable qwake;
static Bytes waiting;
static bool haveWaiting, busy, quitting;
static Out lastResult;
static uint64_t lastSerial;
static std::thread sender;

static void sendLoop() {
  std::unique_lock<std::mutex> g(qlock);
  for (;;) {
    qwake.wait(g, [] { return haveWaiting || quitting; });
    if (!haveWaiting) return;
    Bytes s = std::move(waiting);
    haveWaiting = false;
    busy = true;
    g.unlock();
    Out o = push(s);
    g.lock();
    busy = false;
    lastResult = o;
    lastSerial++;
    qwake.notify_all();
  }
}

void pushLater(const Bytes &save) {
  std::lock_guard<std::mutex> g(qlock);
  waiting = save;
  haveWaiting = true;
  if (!sender.joinable()) sender = std::thread(sendLoop);
  qwake.notify_all();
}
bool pushing() { std::lock_guard<std::mutex> g(qlock); return busy || haveWaiting; }
Out lastOut(uint64_t &serial) { std::lock_guard<std::mutex> g(qlock); serial = lastSerial; return lastResult; }

void finish(int waitMs) {
  bool done;
  {
    std::unique_lock<std::mutex> g(qlock);
    done = qwake.wait_for(g, std::chrono::milliseconds(waitMs), [] { return !busy && !haveWaiting; });
    quitting = true;
    haveWaiting = false;   // what has not gone by now stays on the device: the next start's pull sees it is newer and sends it
  }
  qwake.notify_all();
  if (sender.joinable()) { if (done) sender.join(); else sender.detach(); }   // a send past the wait dies with the program
}
}  // namespace mirror
