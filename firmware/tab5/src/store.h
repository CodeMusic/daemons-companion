#pragma once
// C-77: what the Tab5 keeps of the companion, in its own flash (LittleFS, the `store` partition): every answer it
// shows, by name; every daemon's picture; and the writes waiting to be sent. It opens on what it holds at once, whether
// or not the companion answers -- as the phone does (C-62, C-86, C-87).
#include <Arduino.h>
#include <ArduinoJson.h>

// ArduinoJson's memory from PSRAM (32 MB): the INDEX alone is 100 KB of JSON.
struct PsramAllocator : ArduinoJson::Allocator {
  void *allocate(size_t n) override;
  void deallocate(void *p) override;
  void *reallocate(void *p, size_t n) override;
  static PsramAllocator *instance();
};
inline JsonDocument newDoc() { return JsonDocument(PsramAllocator::instance()); }

bool storeBegin();
// The kept answers, by name ("today", "goals", "party", "profile", "index", "devices", "state")
bool keep(const char *name, const String &json);
bool kept(const char *name, JsonDocument &doc);          // false when nothing is kept yet
bool hasKept(const char *name);                           // whether an answer is kept, without reading it
String keptAt();                                          // when the last full download finished ("" never)
// C-177: the companion's ETag for each kept answer ("today") and picture ("art_p3"), sent back so it answers 304 when
// nothing changed; forgotten all at once by DOWNLOAD EVERYTHING AGAIN
String keptTag(const String &key);
void keepTag(const String &key, const String &tag);      // "" forgets it
void forgetTags();
void keptAtNow(const String &when);
// The pictures: "s<species>" or "p<slot>"
bool keepArt(const String &key, const uint8_t *png, size_t n);
bool hasArt(const String &key);
uint8_t *loadArt(const String &key, size_t &n);           // PSRAM; the caller frees it (heap_caps_free); null if none
// The writes made while nothing answered, in order (C-87)
void outboxAdd(const char *method, const String &path, const String &body);
int outboxCount();
bool outboxFirst(String &method, String &path, String &body);
void outboxDropFirst();
