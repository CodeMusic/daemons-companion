#include "store.h"
#include <LittleFS.h>
#include <esp_heap_caps.h>

void *PsramAllocator::allocate(size_t n) { return heap_caps_malloc(n, MALLOC_CAP_SPIRAM); }
void PsramAllocator::deallocate(void *p) { heap_caps_free(p); }
void *PsramAllocator::reallocate(void *p, size_t n) { return heap_caps_realloc(p, n, MALLOC_CAP_SPIRAM); }
PsramAllocator *PsramAllocator::instance() { static PsramAllocator a; return &a; }

static SemaphoreHandle_t lock;                  // the network task writes while the screen reads
struct Locked { Locked() { xSemaphoreTake(lock, portMAX_DELAY); } ~Locked() { xSemaphoreGive(lock); } };

bool storeBegin() {
  lock = xSemaphoreCreateMutex();
  if (!LittleFS.begin(true, "/store", 10, "store")) return false;   // formats the first time
  LittleFS.mkdir("/k"); LittleFS.mkdir("/art");
  return true;
}

static bool writeFile(const String &path, const uint8_t *data, size_t n) {
  String tmp = path + ".new";                   // whole or not at all: a power cut never leaves half a file
  File f = LittleFS.open(tmp, "w");
  if (!f) return false;
  bool ok = f.write(data, n) == n;
  f.close();
  if (!ok) { LittleFS.remove(tmp); return false; }
  LittleFS.remove(path);
  return LittleFS.rename(tmp, path);
}

bool keep(const char *name, const String &json) {
  Locked l;
  return writeFile(String("/k/") + name + ".json", (const uint8_t *)json.c_str(), json.length());
}

bool kept(const char *name, JsonDocument &doc) {
  Locked l;
  File f = LittleFS.open(String("/k/") + name + ".json", "r");
  if (!f) return false;
  bool ok = !deserializeJson(doc, f);
  f.close();
  return ok;
}

String keptAt() {
  Locked l;
  File f = LittleFS.open("/k/_at.txt", "r");
  if (!f) return "";
  String s = f.readString(); f.close();
  return s;
}
void keptAtNow(const String &when) { Locked l; writeFile("/k/_at.txt", (const uint8_t *)when.c_str(), when.length()); }

bool keepArt(const String &key, const uint8_t *png, size_t n) { Locked l; return writeFile("/art/" + key + ".png", png, n); }

bool hasArt(const String &key) { Locked l; return LittleFS.exists("/art/" + key + ".png"); }

uint8_t *loadArt(const String &key, size_t &n) {
  Locked l;
  File f = LittleFS.open("/art/" + key + ".png", "r");
  if (!f) return nullptr;
  n = f.size();
  uint8_t *buf = (uint8_t *)heap_caps_malloc(n, MALLOC_CAP_SPIRAM);
  if (buf && f.read(buf, n) != n) { heap_caps_free(buf); buf = nullptr; }
  f.close();
  return buf;
}

// The outbox: one JSON line per write, {"m":..,"p":..,"b":..}, sent first to last.
static const char *OUTBOX = "/outbox.jsonl";
void outboxAdd(const char *method, const String &path, const String &body) {
  Locked l;
  File f = LittleFS.open(OUTBOX, "a");
  if (!f) return;
  JsonDocument d; d["m"] = method; d["p"] = path; d["b"] = body;
  serializeJson(d, f); f.print('\n'); f.close();
}
int outboxCount() {
  Locked l;
  File f = LittleFS.open(OUTBOX, "r");
  if (!f) return 0;
  int n = 0; while (f.available()) if (f.read() == '\n') n++;
  f.close();
  return n;
}
bool outboxFirst(String &method, String &path, String &body) {
  Locked l;
  File f = LittleFS.open(OUTBOX, "r");
  if (!f) return false;
  String line = f.readStringUntil('\n'); f.close();
  JsonDocument d;
  if (!line.length() || deserializeJson(d, line)) return false;
  method = d["m"] | "POST"; path = d["p"] | ""; body = d["b"] | "";
  return path.length() > 0;
}
void outboxDropFirst() {
  Locked l;
  File f = LittleFS.open(OUTBOX, "r");
  if (!f) return;
  f.readStringUntil('\n');
  String rest = f.readString(); f.close();
  if (!rest.length()) { LittleFS.remove(OUTBOX); return; }
  writeFile(OUTBOX, (const uint8_t *)rest.c_str(), rest.length());
}
