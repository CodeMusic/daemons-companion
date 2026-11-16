// C-379: patches.json -- the list as published now (fetched from the companion's repository on GitHub, kept for when
// it is offline), never one older than the copy this program carries -- then the patch, the checks and the game.
#include "game/rom.h"

#include <ArduinoJson.h>
#include <dirent.h>
#include <sys/stat.h>

#include <algorithm>
#include <cstdio>
#include <ctime>
#include <stdexcept>

#include "game/bps.h"
#include "hub/http.h"
#include "paths.h"

#ifndef ZERO_PATCHES_JSON
#define ZERO_PATCHES_JSON ""
#endif
static const char *LIVE = "https://raw.githubusercontent.com/CodeMusic/daemons-companion/main/server/data/patches.json";
static const char *INSTALLED = "/usr/share/APPLaunch/share/daemons/patches.json";   // the package's copy

std::string romPath() { return inData("daemons.gba"); }
static std::string infoPath() { return inData("game.json"); }
static std::string originalPath() { return inData("original.gba"); }

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

std::string latestRelease() {
  JsonDocument doc;
  return loadPatches(doc, false) ? std::string(doc["latest"] | "") : "";
}

static std::string jsonEscape(const std::string &s) {
  std::string o;
  for (char c : s) { if (c == '"' || c == '\\') o += '\\'; if ((unsigned char)c >= 0x20) o += c; }
  return o;
}
static void keepInfo(const Game &g) {
  char at[32];
  time_t now = time(nullptr);
  strftime(at, sizeof at, "%Y-%m-%dT%H:%M:%SZ", gmtime(&now));
  writeTextAtomic(infoPath(), "{\"edition\":\"" + jsonEscape(g.edition) + "\",\"release\":\"" + jsonEscape(g.release) +
                  "\",\"sha1\":\"" + g.sha1 + "\",\"from\":\"" + jsonEscape(g.from) + "\",\"at\":\"" + at +
                  "\",\"testing\":" + (g.testing ? "true" : "false") + "}\n");
}

bool heldGame(Game &g) {
  std::string t;
  if (!exists(romPath()) || !readText(infoPath(), t)) return false;
  JsonDocument d;
  if (deserializeJson(d, t)) return false;
  g.edition = d["edition"] | ""; g.release = d["release"] | ""; g.sha1 = d["sha1"] | ""; g.from = d["from"] | "";
  g.testing = d["testing"] | false;
  return true;
}

static void lookIn(const std::string &dir, std::vector<std::string> &out, int depth) {
  DIR *d = opendir(dir.c_str());
  if (!d) return;
  while (dirent *e = readdir(d)) {
    if (e->d_name[0] == '.') continue;
    std::string p = dir + "/" + e->d_name, n = e->d_name;
    struct stat st;
    if (stat(p.c_str(), &st) != 0) continue;
    if (S_ISDIR(st.st_mode)) { if (depth > 0) lookIn(p, out, depth - 1); continue; }
    std::string low = n;
    std::transform(low.begin(), low.end(), low.begin(), ::tolower);
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

Game makeGame(const std::string &original, const std::function<void(const std::string &)> &step) {
  step("reading");
  Bytes rom;
  if (!readFile(original, rom)) throw std::runtime_error("That file could not be read.");   // DRAFT
  step("checking");
  const std::string id = sha1Hex(rom);
  JsonDocument doc;
  if (!loadPatches(doc, true)) throw std::runtime_error("The list of DAEMONS releases could not be read.");   // DRAFT
  const std::string latest = doc["latest"] | "";
  // one of our releases already: taken as it is
  for (JsonObject r : doc["releases"].as<JsonArray>())
    for (JsonObject p : r["patches"].as<JsonArray>())
      if (id == std::string(p["target"]["sha1"] | "")) {
        if (!writeFileAtomic(romPath(), rom)) throw std::runtime_error("The game could not be kept on this device.");   // DRAFT
        Game g{ p["edition"] | "", r["version"] | "", id, original, false };
        keepInfo(g);
        return g;
      }
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
  if (!writeFileAtomic(romPath(), made)) throw std::runtime_error("The game could not be kept on this device.");   // DRAFT
  if (original != originalPath()) writeFileAtomic(originalPath(), rom);   // the player's own, untouched, for the next release
  Game g{ patch["edition"] | "", latest, madeId, original, false };
  keepInfo(g);
  return g;
}

Game takeAsTesting(const std::string &path) {
  Bytes rom;
  if (!readFile(path, rom)) throw std::runtime_error("That file could not be read.");   // DRAFT
  if (!writeFileAtomic(romPath(), rom)) throw std::runtime_error("The game could not be kept on this device.");   // DRAFT
  // which edition, by the header's title (DAEMONS keeps FireRed's and LeafGreen's game codes)
  std::string code = rom.size() > 0xB0 ? std::string((const char *)&rom[0xAC], 4) : "";
  Game g{ code == "BPGE" ? "CONTEXT" : "CONTENT", "testing", sha1Hex(rom), path, true };
  keepInfo(g);
  return g;
}
