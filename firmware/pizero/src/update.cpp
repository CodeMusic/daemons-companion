// C-515: the program updating itself (update.h).
#include "update.h"

#include <ArduinoJson.h>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <sys/stat.h>
#include <unistd.h>

#include "board.h"
#include "game/hash.h"
#include "hub/http.h"
#include "paths.h"

namespace update {
namespace {
// DAEMONS_UPDATES: another place holding the same files (a check against a pretend release, or a mirror)
std::string from() { const char *e = getenv("DAEMONS_UPDATES"); return e ? std::string(e) + "/" : "https://github.com/CodeMusic/daemons-companion/releases/download/pizero/"; }

std::string home() { return dataSub("program"); }
std::string linkOf(const char *name) {
  char buf[512];
  ssize_t n = readlink((home() + "/" + name).c_str(), buf, sizeof buf - 1);
  if (n <= 0) return "";
  buf[n] = 0;
  return buf;
}
long long builtOf(const std::string &dir) {
  std::string s;
  return readText(dir + "/built", s) ? atoll(s.c_str()) : 0;
}
bool pointAt(const char *name, const std::string &dir) {   // a symlink swapped in by a rename, never half made
  std::string tmp = home() + "/." + name + ".new";
  unlink(tmp.c_str());
  return symlink(dir.c_str(), tmp.c_str()) == 0 && rename(tmp.c_str(), (home() + "/" + name).c_str()) == 0;
}
}  // namespace

void hop(int argc, char **argv) {
  if (getenv("DAEMONS_HOPPED")) return;   // the kept copy itself, or one already hopped to
  std::string dir = linkOf("current");
  if (dir.empty() || builtOf(dir) <= built()) return;
  std::string program = dir + "/daemons-zero";
  if (access(program.c_str(), X_OK) != 0) return;
  setenv("DAEMONS_HOPPED", "1", 1);
  argv[0] = (char *)program.c_str();
  execv(program.c_str(), argv);
  (void)argc;   // execv failed: run as the package's program
}

std::string keptCommit() {
  std::string dir = linkOf("current");
  if (dir.empty()) return "";
  size_t slash = dir.find_last_of('/');
  return slash == std::string::npos ? dir : dir.substr(slash + 1);
}

Offer look() {
  Offer o;
  Reply r = httpGet(from() + "manifest.json", {}, 15000);
  JsonDocument d;
  if (!r.ok() || deserializeJson(d, (const char *)r.body.data(), r.body.size())) {
    o.why = r.status == 404 ? "GitHub holds no build yet" : "GitHub did not answer: " + (r.error.empty() ? std::to_string(r.status) : r.error);   // DRAFT
    return o;
  }
  JsonVariantConst b = d["boards"][board::ID];
  if (!b.is<JsonObjectConst>()) { o.why = std::string("no build for the ") + board::NAME + " yet"; return o; }   // DRAFT
  o.found = true;
  o.commit = b["commit"] | "";
  o.at = b["at"] | "";
  std::string running = getenv("DAEMONS_HOPPED") ? keptCommit() : commit();
  std::string c12 = o.commit.substr(0, 12);   // a kept copy is named by its commit's first twelve
  o.newer = !c12.empty() && c12 != running.substr(0, 12) && c12 != keptCommit().substr(0, 12);
  return o;
}

std::string take() {
  Reply m = httpGet(from() + "manifest.json", {}, 15000);
  JsonDocument d;
  if (!m.ok() || deserializeJson(d, (const char *)m.body.data(), m.body.size())) return "GitHub did not answer";   // DRAFT
  JsonVariantConst b = d["boards"][board::ID];
  std::string c = b["commit"] | "", file = b["file"] | "", sha = b["sha1"] | "";
  if (c.empty() || file.empty() || sha.empty()) return std::string("no build for the ") + board::NAME + " yet";   // DRAFT
  Reply t = httpGet(from() + file, {}, 180000);
  if (!t.ok()) return "the download failed: " + (t.error.empty() ? std::to_string(t.status) : t.error);          // DRAFT
  if (sha1Hex(t.body) != sha) return "the download did not match its SHA-1; nothing was kept";                   // DRAFT
  std::string dir = home() + "/" + c.substr(0, 12), tar = dir + ".tar.gz";
  if (!writeFileAtomic(tar, t.body)) return "could not keep the download";
  std::string cmd = "rm -rf '" + dir + "' && mkdir -p '" + dir + "' && tar -xzf '" + tar + "' -C '" + dir + "' && rm -f '" + tar + "'";
  if (system(cmd.c_str()) != 0) return "could not unpack the download";
  // its own built time, asked of it (it says it and stops)
  std::string ask = "DAEMONS_HOPPED=1 '" + dir + "/daemons-zero' --version";
  FILE *p = popen(ask.c_str(), "r");
  char line[128] = {};
  if (!p || !fgets(line, sizeof line, p)) { if (p) pclose(p); return "the new program would not run here"; }   // DRAFT
  pclose(p);
  long long when = atoll(line);
  if (when <= 0) return "the new program did not say when it was built";                                        // DRAFT
  if (!writeTextAtomic(dir + "/built", std::to_string(when) + "\n")) return "could not keep its build time";
  std::string was = linkOf("current");
  if (!was.empty() && was != dir) pointAt("previous", was);
  if (!pointAt("current", dir)) return "could not make it current";
  return "";
}

std::string back() {
  std::string prev = linkOf("previous"), cur = linkOf("current");
  if (prev.empty()) return "no earlier copy is kept";                                                            // DRAFT
  if (!pointAt("current", prev)) return "could not go back";
  if (!cur.empty()) pointAt("previous", cur);
  writeTextAtomic(prev + "/built", std::to_string(built() + 1) + "\n");   // so the hop still prefers it over the package's
  return "";
}
}  // namespace update
