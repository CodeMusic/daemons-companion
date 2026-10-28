// C-199 (the user, 2026-10-27: "I'd love the books/library/songs all on the watch"; decided by multiple choice): the
// T-Watch Ultra's microSD card -- FAT32, up to 32 GB (LilyGO's limit), on the bus it shares with the LoRa radio and the
// NFC reader (35/33/34, its CS 21), powered from ALDO1. Mounted when first wanted, not at boot (a watch without a card
// starts as fast as ever). What is kept on it, under /daemons: the books the save holds (C-208) -- the shelf and every
// chapter read, or all of them at once with KEEP ON THE CARD -- so BOOKS opens away from any network. Every other
// board: no card here (the stubs).
#include "app.h"
#include "card.h"

#if !defined(BOARD_TWATCH_ULTRA)

bool cardReady() { return false; }
bool cardWrite(const String &, const String &) { return false; }
String cardRead(const String &) { return ""; }
String cardStatus() { return "CARD none"; }
bool cardWriteBytes(const String &, const uint8_t *, size_t) { return false; }
uint8_t *cardReadBytes(const String &, size_t &n) { n = 0; return nullptr; }
bool cardRemove(const String &) { return false; }
bool cardRename(const String &, const String &) { return false; }
std::vector<String> cardList(const String &) { return {}; }
bool cardStreamBegin(const String &) { return false; }
void cardStreamWrite(const uint8_t *, size_t) {}
void cardStreamEnd(bool) {}
bool cardStreamOpen(const String &) { return false; }
size_t cardStreamRead(uint8_t *, size_t) { return 0; }
void cardStreamClose() {}
bool cardHas(const String &) { return false; }
bool cardAppendLine(const String &, const String &) { return false; }

#else

#include <SD.h>
#include <SPI.h>
#include <algorithm>

static int state = 0;                                      // 0 not tried, 1 mounted, -1 tried and none
static uint32_t triedAt = 0;
bool cardReady() {
  if (state == 1) return true;
  if (state == -1 && millis() - triedAt < 60000) return false;   // no card: asked again a minute on, not every call
  triedAt = millis();
  // the bus is already the LoRa radio's (lora.cpp begins it on these pins); the card joins it at 20 MHz
  state = SD.begin(21, SPI, 20000000, "/sd", 5) && SD.cardType() != CARD_NONE ? 1 : -1;
  if (state == 1) SD.mkdir("/daemons");
  Serial.printf("card: %s\n", state == 1 ? "mounted" : "none");
  return state == 1;
}
static void dirsFor(const String &path) {                  // every folder above it, made
  for (int i = 1; (i = path.indexOf('/', i)) > 0; i++) SD.mkdir(path.substring(0, i));
}
// a file under /daemons, written whole (a temporary first, then renamed, so a pulled card never holds half a chapter)
bool cardWriteBytes(const String &name, const uint8_t *data, size_t len) {
  if (!cardReady()) return false;
  String path = "/daemons/" + name, tmp = path + ".tmp";
  dirsFor(path);
  File f = SD.open(tmp, FILE_WRITE);
  if (!f) return false;
  size_t n = f.write(data, len); f.close();
  if (n != len) { SD.remove(tmp); return false; }
  SD.remove(path);
  return SD.rename(tmp, path);
}
bool cardWrite(const String &name, const String &body) { return cardWriteBytes(name, (const uint8_t *)body.c_str(), body.length()); }
uint8_t *cardReadBytes(const String &name, size_t &n) {
  n = 0;
  if (!cardReady()) return nullptr;
  File f = SD.open("/daemons/" + name, FILE_READ);
  if (!f) return nullptr;
  n = f.size();
  uint8_t *b = (uint8_t *)(psramFound() ? ps_malloc(n) : malloc(n));
  if (b && f.read(b, n) != n) { free(b); b = nullptr; n = 0; }
  f.close();
  return b;
}
bool cardRemove(const String &name) { return cardReady() && (SD.remove("/daemons/" + name) || SD.rmdir("/daemons/" + name)); }
bool cardRename(const String &from, const String &to) { return cardReady() && SD.rename("/daemons/" + from, "/daemons/" + to); }
std::vector<String> cardList(const String &dir) {
  std::vector<String> out;
  if (!cardReady()) return out;
  File d = SD.open("/daemons/" + dir);
  if (!d || !d.isDirectory()) return out;
  for (File f = d.openNextFile(); f; f = d.openNextFile()) { String n = f.name(); if (!n.endsWith(".tmp")) out.push_back(n.substring(n.lastIndexOf('/') + 1)); f.close(); }
  std::sort(out.begin(), out.end(), [](const String &a, const String &b) { return a.toInt() < b.toInt(); });
  return out;
}
// ---- C-199: a stream -- a voice kept as it plays (to a temporary, renamed when it ended whole), or played from the card
static File stream; static String streamPath;
bool cardStreamBegin(const String &name) {
  if (!cardReady()) return false;
  streamPath = "/daemons/" + name; dirsFor(streamPath);
  stream = SD.open(streamPath + ".tmp", FILE_WRITE);
  return (bool)stream;
}
void cardStreamWrite(const uint8_t *data, size_t n) { if (stream) stream.write(data, n); }
void cardStreamEnd(bool keep) {
  if (!stream) return;
  stream.close();
  if (keep) { SD.remove(streamPath); SD.rename(streamPath + ".tmp", streamPath); } else SD.remove(streamPath + ".tmp");
}
bool cardStreamOpen(const String &name) { if (!cardReady()) return false; stream = SD.open("/daemons/" + name, FILE_READ); return (bool)stream; }
size_t cardStreamRead(uint8_t *buf, size_t n) { return stream ? stream.read(buf, n) : 0; }
void cardStreamClose() { if (stream) stream.close(); }
bool cardHas(const String &name) { return cardReady() && SD.exists("/daemons/" + name); }
bool cardAppendLine(const String &name, const String &line) {
  if (!cardReady()) return false;
  File f = SD.open("/daemons/" + name, FILE_APPEND);
  if (!f) return false;
  f.print(line); f.print('\n'); f.close();
  return true;
}

String cardRead(const String &name) {
  if (!cardReady()) return "";
  File f = SD.open("/daemons/" + name, FILE_READ);
  if (!f) return "";
  f.setTimeout(0);                                       // at the end of the file readString would wait its full second
  String s = f.readString(); f.close();
  return s;
}
String cardStatus() {
  if (!cardReady()) return "CARD none";
  return "CARD " + String((unsigned long)(SD.totalBytes() / 1048576)) + " MB, " + String((unsigned long)(SD.usedBytes() / 1048576)) + " used";
}

#endif
