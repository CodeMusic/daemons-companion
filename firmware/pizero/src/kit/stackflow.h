#pragma once
// BRAIN: bridge -- StackFlow over the cable
// C-461 (docs/ZEROKIT.md, docs/LLM630.md): StackFlow, the LLM630 Compute Kit's front door -- one JSON object at a time
// over TCP 10001 (the cable's network, C-458), found by its braces, no delimiter. A request names the unit (work_id), the
// action and the object (the data's format, read word by word: "stream" in pieces, "base64" encoded). Every reply carries
// the request's id; a streamed answer comes back one delta at a time until finish.
#include <functional>
#include <string>
#include <vector>

namespace stackflow {

// The braces reader, kept apart from the socket so the checks can feed it bytes (test/tests.cpp): whole objects come
// out as they close, a brace inside a string is not counted, and anything outside an object (a boot line) is dropped.
struct Reader {
  std::string buf;
  int depth = 0;
  bool inString = false, escaped = false;
  std::string current;
  void feed(const char *p, size_t n, std::vector<std::string> &out);
};

std::string escape(const std::string &s);   // as a JSON string's inside

struct Model { std::string mode, type; };   // sys.lsmode: "qwen2.5-0.5B-p256-ax630c", "llm"

class Link {
 public:
  Link(std::string host, int port) : host(std::move(host)), port(port) {}
  ~Link();
  bool open(int timeoutMs, std::string &why);
  void close();
  bool isOpen() const { return fd >= 0; }

  // one request and its one reply (a setup, an exit, a sys call): the reply's whole JSON, or "" with why
  std::string call(const std::string &workId, const std::string &action, const std::string &object, const std::string &dataJson,
                   int timeoutMs, std::string &why);
  // a request whose answer streams: each reply's data handed to onPiece (its delta, or its whole data) until one says
  // finish, the time runs out, or onPiece returns false. False with why when it stopped short.
  bool stream(const std::string &workId, const std::string &action, const std::string &object, const std::string &dataJson,
              int timeoutMs, const std::function<bool(const std::string &replyJson)> &onPiece, std::string &why);
  // pieces sent into a unit (a recording to whisper): data as {"delta","index","finish"}, then the answer as stream()
  bool send(const std::string &json, std::string &why);
  bool next(int timeoutMs, std::string &obj, std::string &why);   // the next whole object

 private:
  std::string host;
  int port;
  int fd = -1;
  unsigned n = 0;
  Reader reader;
  std::vector<std::string> ready;
  std::string request(const std::string &workId, const std::string &action, const std::string &object, const std::string &dataJson);
  std::string lastId;
 public:
  const std::string &requestId() const { return lastId; }
  std::string newRequest(const std::string &workId, const std::string &action, const std::string &object, const std::string &dataJson) {
    return request(workId, action, object, dataJson);
  }
};

}  // namespace stackflow
