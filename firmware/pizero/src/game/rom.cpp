// C-379: patches.json -- the list as published now (fetched from the companion's repository on GitHub, kept for when
// it is offline), never one older than the copy this program carries -- then the patch, the checks and the game.
// C-395: both editions, each a release or a TESTING build; C-397: all of them on one save. rom.h says where each lives.
#include "game/rom.h"

#include <ArduinoJson.h>
#include <dirent.h>
#include <sys/stat.h>

#include <algorithm>
#include <cstdio>
#include <ctime>
#include <mutex>
#include <stdexcept>

#include "game/bps.h"
#include "hub/http.h"
#include "hub/hub.h"
#include "paths.h"

#ifndef ZERO_PATCHES_JSON
#define ZERO_PATCHES_JSON ""
#endif
static const char *LIVE = "https://raw.githubusercontent.com/CodeMusic/daemons-companion/main/server/data/patches.json";
static const char *INSTALLED = "/usr/share/APPLaunch/share/daemons/patches.json";   // the package's copy (the Cardputer Zero's)
static const char *INSTALLED_ELSEWHERE = "/usr/share/daemons/patches.json";          // C-457: on a board with no APPLaunch

static std::string lower(std::string s) { std::transform(s.begin(), s.end(), s.begin(), ::tolower); return s; }
static std::string upperOf(std::string s) { std::transform(s.begin(), s.end(), s.begin(), ::toupper); return s; }

std::string Game::key() const { return lower(edition) + (testing ? "-testing" : ""); }

static std::string gamePath(const std::string &key) { return dataSub("games") + "/" + key + ".gba"; }
static std::string gameInfo(const std::string &key) { return dataSub("games") + "/" + key + ".json"; }
static std::string originalPath(const std::string &sha1) { return dataSub("originals") + "/" + sha1 + ".gba"; }
static std::string playingPath() { return inData("playing"); }

// ---- patches.json ------------------------------------------------------------------------------------------------------

static std::vector<int> versionOf(const std::string &v) {
  std::vector<int> n;
  size_t at = 0;
  while (at <= v.size()) {
    size_t dot = v.find('.', at);
    n.push_back(atoi(v.substr(at, dot == std::string::npos ? std::string::npos : dot - at).c_str()));
    if (dot == std::string::npos) break;
    at = dot + 1;
  }
  return n;
}
static bool older(const std::string &a, const std::string &b) {   // a < b, as versions
  auto x = versionOf(a), y = versionOf(b);
  for (size_t i = 0; i < std::max(x.size(), y.size()); i++) {
    int p = i < x.size() ? x[i] : 0, q = i < y.size() ? y[i] : 0;
    if (p != q) return p < q;
  }
  return false;
}

// The newest list that reads, from wherever one is
static bool loadPatches(JsonDocument &doc, bool online) {
  std::string best;
  std::string bestLatest;
  auto consider = [&](const std::string &text) {
    JsonDocument d;
    if (deserializeJson(d, text) || !d["latest"].is<const char *>() || !d["releases"].is<JsonArray>()) return;
    std::string latest = d["latest"].as<const char *>();
    if (best.empty() || older(bestLatest, latest)) { best = text; bestLatest = latest; }
  };
  std::string t;
  if (readText(ZERO_PATCHES_JSON, t)) consider(t);
  if (readText(INSTALLED, t)) consider(t);
  if (readText(INSTALLED_ELSEWHERE, t)) consider(t);
  if (readText(inData("patches.json"), t)) consider(t);
  if (online) {
    Reply r = httpGet(LIVE, { "cache-control: no-cache" }, 15000);
    if (r.ok()) {
      std::string fresh = text(r);
      std::string before = bestLatest;
      consider(fresh);
      if (bestLatest != before || before.empty()) writeTextAtomic(inData("patches.json"), fresh);
    }
  }
  return !best.empty() && !deserializeJson(doc, best);
}

std::string latestRelease(bool online) {
  JsonDocument doc;
  return loadPatches(doc, online) ? std::string(doc["latest"] | "") : "";
}

// What patches.json says a ROM is: one of the player's originals (by a patch's source), or one of our own releases
struct Known { bool original = false, ours = false; std::string edition, name, release; };
static Known knownAs(JsonDocument &doc, const std::string &sha1) {
  Known k;
  for (JsonObject r : doc["releases"].as<JsonArray>())
    for (JsonObject p : r["patches"].as<JsonArray>()) {
      if (sha1 == std::string(p["source"]["sha1"] | "")) {
        k.original = true; k.edition = p["edition"] | ""; k.name = p["source"]["name"] | "";
        return k;
      }
      if (!k.ours && sha1 == std::string(p["target"]["sha1"] | "")) { k.ours = true; k.edition = p["edition"] | ""; k.release = r["version"] | ""; }
    }
  return k;
}

// ---- the games kept ----------------------------------------------------------------------------------------------------

static std::string jsonEscape(const std::string &s) {
  std::string o;
  for (char c : s) { if (c == '"' || c == '\\') o += '\\'; if ((unsigned char)c >= 0x20) o += c; }
  return o;
}
static void keepInfo(const std::string &path, const Game &g) {
  char at[32];
  time_t now = time(nullptr);
  strftime(at, sizeof at, "%Y-%m-%dT%H:%M:%SZ", gmtime(&now));
  writeTextAtomic(path, "{\"edition\":\"" + jsonEscape(g.edition) + "\",\"release\":\"" + jsonEscape(g.release) +
                  "\",\"sha1\":\"" + g.sha1 + "\",\"from\":\"" + jsonEscape(g.from) + "\",\"at\":\"" + at +
                  "\",\"testing\":" + (g.testing ? "true" : "false") + "}\n");
}
static bool readInfo(const std::string &path, Game &g) {
  std::string t;
  JsonDocument d;
  if (!readText(path, t) || deserializeJson(d, t)) return false;
  g.edition = d["edition"] | ""; g.release = d["release"] | ""; g.sha1 = d["sha1"] | ""; g.from = d["from"] | "";
  g.testing = d["testing"] | false;
  return !g.edition.empty();
}
static Game keepGame(const Bytes &made, const Game &g) {
  if (!writeFileAtomic(gamePath(g.key()), made)) throw std::runtime_error("The game could not be kept on this device.");   // DRAFT
  keepInfo(gameInfo(g.key()), g);
  return g;
}
static void keepOriginal(const Bytes &rom, const std::string &sha1) {
  if (!exists(originalPath(sha1))) writeFileAtomic(originalPath(sha1), rom);   // the player's own, untouched
}

// Before C-395 there was one game (daemons.gba, game.json) and one original (original.gba): each moved once to where it
// lives now, the game it was chosen. The save stays daemons.sav. C-395's own saves (saves/<key>.sav, a morning's worth):
// one becomes the one save when there is none yet -- the hub's agreed copy first -- and every one of them is left where it is
static void moveOnce() {
  static std::once_flag once;
  std::call_once(once, [] {
    Game g;
    if (exists(inData("daemons.gba")) && readInfo(inData("game.json"), g)) {
      const std::string k = g.key();
      if (!exists(gamePath(k))) {
        rename(inData("daemons.gba").c_str(), gamePath(k).c_str());
        rename(inData("game.json").c_str(), gameInfo(k).c_str());
        if (!exists(playingPath())) writeTextAtomic(playingPath(), k + "\n");
      }
    }
    if (!exists(inData("daemons.sav"))) {
      // the one the hub agrees with first (mirror.json: a save the hub has never seen never goes out as the real one), then
      // the newest of the releases', then the newest of any
      std::string agreed, t;
      JsonDocument m;
      if (readText(inData("mirror.json"), t) && !deserializeJson(m, t)) agreed = m["sha1"] | "";
      std::string pick, newestRelease, newestAny;
      time_t atRelease = 0, atAny = 0;
      for (const char *k : { "content", "context", "content-testing", "context-testing" }) {
        struct stat st;
        const std::string p = inData(std::string("saves/") + k + ".sav");
        if (stat(p.c_str(), &st) != 0) continue;
        Bytes b;
        if (pick.empty() && !agreed.empty() && readFile(p, b) && sha1Hex(b) == agreed) pick = p;
        const bool testing = std::string(k).find("-testing") != std::string::npos;
        if (!testing && st.st_mtime >= atRelease) { atRelease = st.st_mtime; newestRelease = p; }
        if (st.st_mtime >= atAny) { atAny = st.st_mtime; newestAny = p; }
      }
      if (pick.empty()) pick = !newestRelease.empty() ? newestRelease : newestAny;
      Bytes b;
      if (!pick.empty() && readFile(pick, b)) writeFileAtomic(inData("daemons.sav"), b);
    }
    Bytes o;
    if (exists(inData("original.gba")) && readFile(inData("original.gba"), o)) {
      keepOriginal(o, sha1Hex(o));
      remove(inData("original.gba").c_str());
    }
  });
}

static std::string playingKey() {
  moveOnce();
  std::string k;
  readText(playingPath(), k);
  while (!k.empty() && (k.back() == '\n' || k.back() == ' ')) k.pop_back();
  return k;
}

std::string romPath() { return gamePath(playingKey()); }
std::string savePath() { moveOnce(); return inData("daemons.sav"); }

bool heldGame(Game &g) {
  const std::string k = playingKey();
  return !k.empty() && exists(gamePath(k)) && readInfo(gameInfo(k), g);
}

std::vector<Game> heldGames() {
  moveOnce();
  std::vector<Game> out;
  for (const char *k : { "content", "content-testing", "context", "context-testing" }) {
    Game g;
    if (exists(gamePath(k)) && readInfo(gameInfo(k), g)) out.push_back(g);
  }
  return out;
}

bool chooseGame(const std::string &key) {
  moveOnce();
  return exists(gamePath(key)) && writeTextAtomic(playingPath(), key + "\n");
}

// ---- the player's originals --------------------------------------------------------------------------------------------

static void lookIn(const std::string &dir, std::vector<std::string> &out, int depth) {
  DIR *d = opendir(dir.c_str());
  if (!d) return;
  while (dirent *e = readdir(d)) {
    if (e->d_name[0] == '.') continue;
    std::string p = dir + "/" + e->d_name, n = e->d_name;
    struct stat st;
    if (stat(p.c_str(), &st) != 0) continue;
    if (S_ISDIR(st.st_mode)) { if (depth > 0) lookIn(p, out, depth - 1); continue; }
    std::string low = lower(n);
    if (low.size() > 4 && low.compare(low.size() - 4, 4, ".gba") == 0 && st.st_size >= (4 << 20) && st.st_size <= (32 << 20))
      out.push_back(p);
  }
  closedir(d);
}

std::vector<std::string> originalsFound() {
  std::vector<std::string> out;
  const char *h = getenv("HOME");
  std::string home = h ? h : "";
  if (!home.empty()) {
    lookIn(home + "/DAEMONS", out, 1);
    lookIn(home, out, 0);
    lookIn(home + "/Downloads", out, 0);
  }
  lookIn("/media", out, 2);   // a USB stick in the USB-A port, mounted as /media/<user>/<its name>
  lookIn("/mnt", out, 1);
  std::string ours = dataDir();
  out.erase(std::remove_if(out.begin(), out.end(), [&](const std::string &p) { return p.rfind(ours, 0) == 0; }), out.end());
  std::sort(out.begin(), out.end());
  out.erase(std::unique(out.begin(), out.end()), out.end());
  return out;
}

std::vector<Original> originals() {
  moveOnce();
  JsonDocument doc;
  bool listed = loadPatches(doc, false);
  std::vector<std::string> paths;
  lookIn(dataSub("originals"), paths, 0);
  for (auto &p : originalsFound()) paths.push_back(p);
  std::vector<Original> out;
  for (auto &p : paths) {
    Bytes rom;
    if (!readFile(p, rom)) continue;
    std::string id = sha1Hex(rom);
    if (std::any_of(out.begin(), out.end(), [&](const Original &o) { return o.sha1 == id; })) continue;
    Known k = listed ? knownAs(doc, id) : Known{};
    if (k.original) out.push_back({ p, id, k.edition, k.name });
  }
  return out;
}

static bool originalFor(const std::string &edition, const std::vector<std::string> &sources, Original &o) {
  for (auto &x : originals())
    if (x.edition == edition && (sources.empty() || std::find(sources.begin(), sources.end(), x.sha1) != sources.end())) { o = x; return true; }
  return false;
}

static std::string gameName(const std::string &edition) { return edition == "CONTEXT" ? "LeafGreen" : "FireRed"; }

// ---- making them -------------------------------------------------------------------------------------------------------

Game makeGame(const std::string &original, const Step &step) {
  step("reading");
  Bytes rom;
  if (!readFile(original, rom)) throw std::runtime_error("That file could not be read.");   // DRAFT
  step("checking");
  const std::string id = sha1Hex(rom);
  JsonDocument doc;
  if (!loadPatches(doc, true)) throw std::runtime_error("The list of DAEMONS releases could not be read.");   // DRAFT
  const std::string latest = doc["latest"] | "";
  Known k = knownAs(doc, id);
  if (k.ours) return keepGame(rom, Game{ k.edition, k.release, id, original, false });   // one of our releases: as it is
  JsonObject patch;
  for (JsonObject r : doc["releases"].as<JsonArray>())
    if (std::string(r["version"] | "") == latest)
      for (JsonObject p : r["patches"].as<JsonArray>())
        if (id == std::string(p["source"]["sha1"] | "")) patch = p;
  if (patch.isNull())
    throw std::runtime_error("That file is not a ROM DAEMONS knows. It takes FireRed or LeafGreen (USA, 1.0 or Rev 1), "
                             "unchanged -- the .gba you own.");   // DRAFT, the app's words
  step("fetching");
  Reply r = httpGet(patch["url"] | "", {}, 180000);
  if (!r.ok())
    throw std::runtime_error("The patch did not come down (" + (r.error.empty() ? std::to_string(r.status) : r.error) +
                             "). Is this device online?");   // DRAFT
  if (r.body.size() != (size_t)(patch["patch"]["size"] | 0) || sha1Hex(r.body) != std::string(patch["patch"]["sha1"] | ""))
    throw std::runtime_error("The patch came down damaged. Try again.");   // DRAFT
  step("patching");
  Bytes made;
  try { made = applyBps(rom, r.body); }
  catch (const PatchError &e) { throw std::runtime_error(std::string("The patch would not go on: ") + e.what() + "."); }   // DRAFT
  const std::string madeId = sha1Hex(made);
  if (madeId != std::string(patch["target"]["sha1"] | ""))
    throw std::runtime_error("The game made does not match the release. Nothing was kept.");   // DRAFT
  step("keeping");
  keepOriginal(rom, id);
  return keepGame(made, Game{ patch["edition"] | "", latest, madeId, original, false });
}

Game makeRelease(const std::string &edition, const Step &step) {
  Original o;
  if (!originalFor(edition, {}, o))
    throw std::runtime_error("No " + gameName(edition) + " here yet. Put your own .gba in DAEMONS in your home folder, or on a "
                             "USB stick, then TAB to look again.");   // DRAFT
  return makeGame(o.path, step);
}

Testing testingOffered() {
  Testing t;
  if (!hub::paired()) { t.why = "LINK this device to the hub first: the testing builds are kept there."; return t; }   // DRAFT
  Reply r = hub::get("/api/game/debug", 8000);
  if (r.status == 404) { t.why = "The hub holds no testing builds (./syncCompanion.sh debug sends them)."; return t; }   // DRAFT
  if (r.status == 403 || hub::away()) { t.why = "The testing builds are given only at home."; return t; }   // DRAFT
  if (!r.ok()) { t.why = "The hub did not answer."; return t; }   // DRAFT
  JsonDocument d;
  if (deserializeJson(d, (const char *)r.body.data(), r.body.size())) { t.why = "The hub's answer did not read."; return t; }   // DRAFT
  t.version = d["version"] | "";
  for (JsonObject p : d["patches"].as<JsonArray>()) {
    std::string e = upperOf(p["edition"] | "");
    if (!e.empty() && std::find(t.editions.begin(), t.editions.end(), e) == t.editions.end()) t.editions.push_back(e);
  }
  if (t.editions.empty()) t.why = "The hub holds no testing builds.";   // DRAFT
  return t;
}

// C-216's way, as app/game/rom.ts makeTestingBuild has it: the DEBUG patch from the paired hub, never from GitHub
Game makeTesting(const std::string &edition, const Step &step) {
  step("asking the hub");
  if (!hub::paired()) throw std::runtime_error("LINK this device to the hub first: the testing builds are kept there.");   // DRAFT
  Reply m = hub::get("/api/game/debug", 8000);
  if (m.status == 404) throw std::runtime_error("The hub holds no testing builds (./syncCompanion.sh debug sends them).");   // DRAFT
  if (m.status == 403 || hub::away()) throw std::runtime_error("The testing builds are given only at home.");   // DRAFT
  if (!m.ok()) throw std::runtime_error("The hub did not answer.");   // DRAFT
  JsonDocument d;
  if (deserializeJson(d, (const char *)m.body.data(), m.body.size())) throw std::runtime_error("The hub's answer did not read.");   // DRAFT
  std::vector<std::string> sources;
  for (JsonObject p : d["patches"].as<JsonArray>())
    if (upperOf(p["edition"] | "") == edition) sources.push_back(lower(p["source"]["sha1"] | ""));
  if (sources.empty()) throw std::runtime_error("The hub has no testing build of " + edition + ".");   // DRAFT
  step("reading");
  Original o;
  if (!originalFor(edition, sources, o))
    throw std::runtime_error("The testing build of " + edition + " is made from your own " + gameName(edition) +
                             ", and it is not here yet.");   // DRAFT
  Bytes rom;
  if (!readFile(o.path, rom)) throw std::runtime_error("That file could not be read.");   // DRAFT
  JsonObject patch;
  for (JsonObject p : d["patches"].as<JsonArray>())
    if (upperOf(p["edition"] | "") == edition && lower(p["source"]["sha1"] | "") == o.sha1) patch = p;
  step("fetching");
  const std::string file = patch["file"] | "";
  std::string q;
  for (char c : file) {
    if (isalnum((unsigned char)c) || c == '.' || c == '-' || c == '_') q += c;
    else { char b[4]; snprintf(b, sizeof b, "%%%02X", (unsigned char)c); q += b; }
  }
  Reply f = hub::get("/api/game/debug/file?file=" + q, 180000);
  if (!f.ok()) throw std::runtime_error("The testing build did not come down. Try again at home.");   // DRAFT
  JsonDocument fd;
  Bytes patchBytes;
  if (deserializeJson(fd, (const char *)f.body.data(), f.body.size()) || !unbase64(fd["b64"] | "", patchBytes))
    throw std::runtime_error("The testing build came down damaged. Try again.");   // DRAFT
  f.body.clear(); f.body.shrink_to_fit(); fd.clear();
  if (patchBytes.size() != (size_t)(patch["patch"]["size"] | 0) || sha1Hex(patchBytes) != lower(patch["patch"]["sha1"] | ""))
    throw std::runtime_error("The testing build came down damaged. Try again.");   // DRAFT, the app's words
  step("patching");
  Bytes made;
  try { made = applyBps(rom, patchBytes); }
  catch (const PatchError &e) { throw std::runtime_error(std::string("The patch would not go on: ") + e.what() + "."); }   // DRAFT
  const std::string madeId = sha1Hex(made);
  if (madeId != lower(patch["target"]["sha1"] | "")) throw std::runtime_error("The testing build did not check out. Nothing was kept.");   // DRAFT, the app's words
  step("keeping");
  keepOriginal(rom, o.sha1);
  std::string version = patch["version"] | "";
  if (version.empty()) version = d["version"] | "";
  return keepGame(made, Game{ edition, version, madeId, o.path, true });
}

Game takeAsTesting(const std::string &path) {
  Bytes rom;
  if (!readFile(path, rom)) throw std::runtime_error("That file could not be read.");   // DRAFT
  // which edition, by the header's game code (DAEMONS keeps FireRed's and LeafGreen's)
  std::string code = rom.size() > 0xB0 ? std::string((const char *)&rom[0xAC], 4) : "";
  Game g = keepGame(rom, Game{ code == "BPGE" ? "CONTEXT" : "CONTENT", "testing", sha1Hex(rom), path, true });
  chooseGame(g.key());
  return g;
}
