// C-511: EUDAIMONIA asked from the device (eudaimonia.h).
#include "sites/eudaimonia.h"

#include <ArduinoJson.h>
#include <sys/stat.h>

#include "paths.h"

namespace eudaimonia {
namespace {
const char *kDefault = "http://roverbyteseer:4741";
std::string sessionPath() { return inConfig("eudaimonia-session"); }
std::string session() {
  std::string s;
  readText(sessionPath(), s);
  while (!s.empty() && (s.back() == '\n' || s.back() == ' ')) s.pop_back();
  return s;
}
std::vector<std::string> headers() {
  std::string s = session();
  if (s.empty()) return {};
  return { "cookie: " + s };
}
}  // namespace

std::string address() {
  std::string a;
  readText(inConfig("eudaimonia"), a);
  while (!a.empty() && (a.back() == '\n' || a.back() == '/' || a.back() == ' ')) a.pop_back();
  return a.empty() ? kDefault : a;
}
bool signedIn() { return !session().empty(); }

std::string jsonString(const std::string &s) {
  JsonDocument d;
  d.set(s);
  std::string out;
  serializeJson(d, out);
  return out;
}

std::string signIn(const std::string &name, const std::string &password) {
  Reply r = httpPost(address() + "/api/signin", "{\"name\":" + jsonString(name) + ",\"password\":" + jsonString(password) + "}", {}, 15000);
  JsonDocument d;
  bool read = !deserializeJson(d, (const char *)r.body.data(), r.body.size());
  if (!r.ok()) return read && d["error"].is<const char *>() ? d["error"].as<const char *>() : !r.error.empty() ? r.error : "the site said " + std::to_string(r.status);
  if (r.cookie.empty()) return "the site gave no session";
  if (read && (d["limited"] | false)) return "change this account's password on the site first";
  if (!writeTextAtomic(sessionPath(), r.cookie + "\n")) return "could not keep the session";
  chmod(sessionPath().c_str(), 0600);
  return "";
}

void signOut() {
  if (signedIn()) httpPost(address() + "/api/signout", "{}", headers(), 8000);
  remove(sessionPath().c_str());
}

Reply get(const std::string &path, long timeoutMs) { return httpGet(address() + path, headers(), timeoutMs); }
Reply post(const std::string &path, const std::string &json, long timeoutMs) { return httpPost(address() + path, json, headers(), timeoutMs); }
}  // namespace eudaimonia
