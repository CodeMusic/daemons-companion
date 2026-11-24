// C-513: ACCOUNTS and THE COMMONS from the device (commons.h).
#include "sites/commons.h"

#include <ArduinoJson.h>
#include <mutex>
#include <sys/stat.h>

#include "hub/hub.h"
#include "paths.h"
#include "sites/eudaimonia.h"

namespace commons {
namespace {
std::string tokenPath() { return inConfig("profile-token"); }
std::string trimmed(std::string s) {
  while (!s.empty() && (s.back() == '\n' || s.back() == ' ' || s.back() == '/')) s.pop_back();
  return s;
}
std::string token() { std::string t; readText(tokenPath(), t); return trimmed(t); }
std::vector<std::string> headers() {
  std::string t = token();
  if (t.empty()) return {};
  return { "x-daemons-profile: " + t };
}
std::mutex lock;
std::string learned;   // what the hub said, asked once a run
}  // namespace

std::string address() {
  std::string a;
  readText(inConfig("commons"), a);
  if (!(a = trimmed(a)).empty()) return a;
  std::lock_guard<std::mutex> g(lock);
  if (learned.empty() && hub::paired()) {
    Reply r = hub::get("/api/commons", 8000);
    JsonDocument d;
    if (r.ok() && !deserializeJson(d, (const char *)r.body.data(), r.body.size()) && d["url"].is<const char *>())
      learned = trimmed(d["url"].as<const char *>());
  }
  return learned;
}
bool joined() { return !token().empty(); }

std::string join(const std::string &code) {
  std::string at = address();
  if (at.empty()) return "no commons is known: pair with the hub first";
  std::string label = hub::deviceName().empty() ? "a Linux device" : hub::deviceName();
  Reply r = httpPost(at + "/accounts/device/join", "{\"code\":" + eudaimonia::jsonString(code) + ",\"label\":" + eudaimonia::jsonString(label) + "}", {}, 15000);
  JsonDocument d;
  bool read = !deserializeJson(d, (const char *)r.body.data(), r.body.size());
  if (!r.ok()) return read && d["error"].is<const char *>() ? d["error"].as<const char *>() : !r.error.empty() ? r.error : "the commons said " + std::to_string(r.status);
  if (!read || !d["token"].is<const char *>()) return "the commons gave no token";
  if (!writeTextAtomic(tokenPath(), std::string(d["token"].as<const char *>()) + "\n")) return "could not keep the token";
  chmod(tokenPath().c_str(), 0600);
  return "";
}
void leave() { remove(tokenPath().c_str()); }

Reply get(const std::string &path, long timeoutMs) { return httpGet(address() + path, headers(), timeoutMs); }
Reply post(const std::string &path, const std::string &json, long timeoutMs) { return httpPost(address() + path, json, headers(), timeoutMs); }
}  // namespace commons
