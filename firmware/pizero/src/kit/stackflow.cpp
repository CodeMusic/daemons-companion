// BRAIN: bridge -- StackFlow over the cable
// C-461: StackFlow over TCP, by plain POSIX sockets (nothing to install on either side).
#include "kit/stackflow.h"

#include <ArduinoJson.h>
#include <arpa/inet.h>
#include <fcntl.h>
#include <netdb.h>
#include <poll.h>
#include <sys/socket.h>
#include <unistd.h>

#include <chrono>
#include <cstring>

namespace stackflow {

void Reader::feed(const char *p, size_t n, std::vector<std::string> &out) {
  for (size_t i = 0; i < n; i++) {
    char c = p[i];
    if (depth == 0) {
      if (c != '{') continue;   // outside an object: a boot line, a newline -- dropped
      current.clear();
    }
    current += c;
    if (inString) {
      if (escaped) escaped = false;
      else if (c == '\\') escaped = true;
      else if (c == '"') inString = false;
      continue;
    }
    if (c == '"') inString = true;
    else if (c == '{') depth++;
    else if (c == '}' && --depth == 0) { out.push_back(current); current.clear(); }
  }
}

std::string escape(const std::string &s) {
  std::string o;
  for (unsigned char c : s) {
    if (c == '"' || c == '\\') { o += '\\'; o += (char)c; }
    else if (c == '\n') o += "\\n";
    else if (c == '\r') o += "\\r";
    else if (c == '\t') o += "\\t";
    else if (c < 0x20) continue;
    else o += (char)c;
  }
  return o;
}

static long long nowMs() {
  return std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::steady_clock::now().time_since_epoch()).count();
}

Link::~Link() { close(); }

void Link::close() {
  if (fd >= 0) ::close(fd);
  fd = -1;
  reader = Reader();
  ready.clear();
}

bool Link::open(int timeoutMs, std::string &why) {
  close();
  addrinfo hints{}, *res = nullptr;
  hints.ai_family = AF_UNSPEC;
  hints.ai_socktype = SOCK_STREAM;
  if (getaddrinfo(host.c_str(), std::to_string(port).c_str(), &hints, &res) != 0 || !res) { why = "no such address: " + host; return false; }
  for (addrinfo *a = res; a; a = a->ai_next) {
    int s = socket(a->ai_family, a->ai_socktype, a->ai_protocol);
    if (s < 0) continue;
    fcntl(s, F_SETFL, fcntl(s, F_GETFL) | O_NONBLOCK);
    int rc = connect(s, a->ai_addr, a->ai_addrlen);
    if (rc != 0 && errno == EINPROGRESS) {
      pollfd pf{ s, POLLOUT, 0 };
      if (poll(&pf, 1, timeoutMs) == 1) {
        int err = 0;
        socklen_t len = sizeof err;
        getsockopt(s, SOL_SOCKET, SO_ERROR, &err, &len);
        rc = err ? -1 : 0;
      } else rc = -1;
    }
    if (rc == 0) { fd = s; break; }
    ::close(s);
  }
  freeaddrinfo(res);
  if (fd < 0) { why = "the Kit did not answer at " + host + ":" + std::to_string(port); return false; }   // DRAFT
  return true;
}

std::string Link::request(const std::string &workId, const std::string &action, const std::string &object, const std::string &dataJson) {
  lastId = std::to_string(++n);
  return "{\"request_id\":\"" + lastId + "\",\"work_id\":\"" + escape(workId) + "\",\"action\":\"" + escape(action) +
         "\",\"object\":\"" + escape(object) + "\",\"data\":" + (dataJson.empty() ? "\"None\"" : dataJson) + "}";
}

bool Link::send(const std::string &json, std::string &why) {
  if (fd < 0) { why = "not open"; return false; }
  size_t at = 0;
  long long until = nowMs() + 10000;
  while (at < json.size()) {
    ssize_t w = ::send(fd, json.data() + at, json.size() - at, 0
#ifdef MSG_NOSIGNAL
                       | MSG_NOSIGNAL
#endif
    );
    if (w > 0) { at += (size_t)w; continue; }
    if (w < 0 && (errno == EAGAIN || errno == EWOULDBLOCK) && nowMs() < until) {
      pollfd pf{ fd, POLLOUT, 0 };
      poll(&pf, 1, 200);
      continue;
    }
    why = "the Kit's link broke";   // DRAFT
    close();
    return false;
  }
  return true;
}

bool Link::next(int timeoutMs, std::string &obj, std::string &why) {
  long long until = nowMs() + timeoutMs;
  while (ready.empty()) {
    if (fd < 0) { why = "not open"; return false; }
    long long left = until - nowMs();
    if (left <= 0) { why = "the Kit took too long"; return false; }   // DRAFT
    pollfd pf{ fd, POLLIN, 0 };
    if (poll(&pf, 1, (int)left) != 1) continue;
    char b[4096];
    ssize_t r = recv(fd, b, sizeof b, 0);
    if (r <= 0) {
      if (r < 0 && (errno == EAGAIN || errno == EWOULDBLOCK)) continue;
      why = "the Kit closed the link";   // DRAFT
      close();
      return false;
    }
    reader.feed(b, (size_t)r, ready);
  }
  obj = ready.front();
  ready.erase(ready.begin());
  return true;
}

// the reply to this request: StackFlow answers each request with its own id
static bool ours(const std::string &obj, const std::string &id) {
  JsonDocument d;
  if (deserializeJson(d, obj)) return false;
  return std::string(d["request_id"] | "") == id;
}

static bool failed(const std::string &obj, std::string &why) {
  JsonDocument d;
  if (deserializeJson(d, obj)) { why = "not JSON"; return true; }
  int code = d["error"]["code"] | 0;
  if (code == 0) return false;
  why = std::string(d["error"]["message"] | "the Kit refused") + " (" + std::to_string(code) + ")";
  return true;
}

std::string Link::call(const std::string &workId, const std::string &action, const std::string &object, const std::string &dataJson,
                       int timeoutMs, std::string &why) {
  if (!send(request(workId, action, object, dataJson), why)) return "";
  const std::string id = lastId;
  long long until = nowMs() + timeoutMs;
  std::string obj;
  while (true) {
    long long left = until - nowMs();
    if (left <= 0 || !next((int)left, obj, why)) { if (why.empty()) why = "the Kit took too long"; return ""; }
    if (!ours(obj, id)) continue;
    if (failed(obj, why)) return "";
    return obj;
  }
}

bool Link::stream(const std::string &workId, const std::string &action, const std::string &object, const std::string &dataJson,
                  int timeoutMs, const std::function<bool(const std::string &)> &onPiece, std::string &why) {
  if (!send(request(workId, action, object, dataJson), why)) return false;
  const std::string id = lastId;
  long long until = nowMs() + timeoutMs;
  std::string obj;
  while (true) {
    long long left = until - nowMs();
    if (left <= 0 || !next((int)left, obj, why)) { if (why.empty()) why = "the Kit took too long"; return false; }
    JsonDocument d;
    if (deserializeJson(d, obj)) continue;
    // a unit's answer carries its work_id (and, mostly, this request's id): another unit's, or another request's, is not ours
    const std::string rid = d["request_id"] | "", wid = d["work_id"] | "";
    if (wid != workId && rid != id) continue;
    if (failed(obj, why)) return false;
    if (!onPiece(obj)) return true;
    bool finish = d["data"]["finish"] | false;
    if (!d["data"].is<JsonObject>()) finish = true;   // a whole answer at once
    if (finish) return true;
  }
}

}  // namespace stackflow
