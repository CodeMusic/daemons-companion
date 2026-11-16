// C-335 (the user, 2026-11-11, by multiple choice: "the watch updated from its card"): a new firmware put on the card by
// the hub over Wi-Fi and installed from it, no cable. The hub keeps the newest image of each board (firmwareimages.ts);
// now and then -- on the charger, or awake, never in the night -- the Ultra asks GET /api/firmware?board=, and when the
// build differs from its own it copies the image onto its card (firmware/next.bin), checks its SHA-256 as it comes, and
// keeps what it found (firmware/next.json). It installs from the card only when told: the site's or app's UPDATE (the
// command "update"), or the cable's UPDATE FROM CARD -- on the charger or above a third of the battery. The old firmware
// stays in the other app slot until the new one has started (the bootloader's own rollback). Every other board: no card.
#include "app.h"
#include "card.h"

#if !defined(BOARD_TWATCH_ULTRA)

void firmwareLoop(uint32_t) {}
String firmwareInstall() { return "This board has no card to update from."; }   // DRAFT
String firmwareStatus() { return "FIRMWARE none"; }

#else

#include <HTTPClient.h>
#include <Update.h>
#include <mbedtls/sha256.h>

static const char *NEXT = "firmware/next.bin", *NOTE = "firmware/next.json";
static const uint32_t ASK_MS = 6UL * 3600 * 1000;         // a quarter of a day
static uint32_t askedAt = 0;
static bool asked = false;
static String lastWhy;

static String hex(const uint8_t *h, int n) { String s; char b[3]; for (int i = 0; i < n; i++) { sprintf(b, "%02x", h[i]); s += b; } return s; }
static bool kept(String &build, String &sha, long &size) {
  JsonDocument d;
  if (deserializeJson(d, cardRead(NOTE)) || !cardHas(NEXT)) return false;
  build = d["build"] | ""; sha = d["sha256"] | ""; size = d["size"] | 0L;
  return build.length() && size > 0;
}

// the image, onto the card as it comes, its hash taken on the way; kept only when whole and matching
static bool fetchImage(const String &build, const String &sha, long size) {
  HTTPClient h;
  h.setTimeout(30000);
  h.begin(serverUrl + "/api/firmware/image?board=" + String(board.id));
  h.addHeader("x-device", deviceId());
  if (h.GET() != 200) { h.end(); lastWhy = "the hub did not send it"; return false; }
  WiFiClient *in = h.getStreamPtr();
  long left = h.getSize();
  if (left != size || !cardStreamBegin(NEXT)) { h.end(); lastWhy = "the card would not take it"; return false; }
  mbedtls_sha256_context c; mbedtls_sha256_init(&c); mbedtls_sha256_starts(&c, 0);
  static uint8_t buf[2048];
  uint32_t quietSince = millis();
  while (left > 0 && millis() - quietSince < 15000) {
    int got = in->readBytes(buf, min((long)sizeof buf, left));
    if (got <= 0) { delay(5); continue; }
    quietSince = millis(); left -= got;
    mbedtls_sha256_update(&c, buf, got);
    cardStreamWrite(buf, got);
  }
  uint8_t out[32]; mbedtls_sha256_finish(&c, out); mbedtls_sha256_free(&c);
  h.end();
  bool whole = left == 0 && hex(out, 32) == sha;
  cardStreamEnd(whole);
  if (!whole) { lastWhy = left ? "it stopped coming" : "it did not match its hash"; return false; }
  JsonDocument d; d["build"] = build; d["sha256"] = sha; d["size"] = size;
  String note; serializeJson(d, note);
  cardWrite(NOTE, note);
  lastWhy = "";
  return true;
}

void firmwareLoop(uint32_t now) {
  if (routineRunning || nightQuiet() || !online() || netBusy() || !cardReady()) return;
  if (asked && now - askedAt < ASK_MS) return;
  if (!bat.usb && (asleep || bat.percent < 40)) return;      // on the charger, or awake with the battery to spare
  asked = true; askedAt = now;
  bool ok; String got = http("GET", "/api/firmware?board=" + String(board.id), "", &ok);
  JsonDocument d;
  if (!ok || deserializeJson(d, got)) return;
  String build = d["build"] | "", sha = d["sha256"] | ""; long size = d["size"] | 0L;
  if (!build.length() || build == COMPANION_BUILD || size <= 0) return;   // this one, already
  String kb, ks; long kz;
  if (kept(kb, ks, kz) && ks == sha) return;                 // on the card, already
  if (fetchImage(build, sha, size)) say("UPDATE READY", 2500);   // DRAFT
}

// install what the card keeps, then restart into it; the reason when it cannot
String firmwareInstall() {
  String build, sha; long size;
  if (!cardReady() || !kept(build, sha, size)) return "No new firmware is on the card.";          // DRAFT
  if (build == COMPANION_BUILD) return "The card's firmware is this one.";                        // DRAFT
  if (!bat.usb && bat.percent >= 0 && bat.percent < 33) return "Charge the watch first.";          // DRAFT
  if (!Update.begin(size, U_FLASH)) return "The watch would not start the update.";               // DRAFT
  if (!cardStreamOpen(NEXT)) { Update.abort(); return "The card would not open it."; }            // DRAFT
  progress("UPDATING...");                                                                         // DRAFT
  mbedtls_sha256_context c; mbedtls_sha256_init(&c); mbedtls_sha256_starts(&c, 0);
  static uint8_t buf[2048];
  size_t got; long wrote = 0;
  while ((got = cardStreamRead(buf, sizeof buf)) > 0) {
    mbedtls_sha256_update(&c, buf, got);
    if (Update.write(buf, got) != got) break;
    wrote += got;
  }
  cardStreamClose();
  uint8_t out[32]; mbedtls_sha256_finish(&c, out); mbedtls_sha256_free(&c);
  if (wrote != size || hex(out, 32) != sha) { Update.abort(); return "The card's copy is damaged."; }   // DRAFT
  if (!Update.end(true)) return "The update did not finish.";                                    // DRAFT
  cardRemove(NOTE);                                                                                // the next one asked for afresh
  say("UPDATED", 2000);                                                                           // DRAFT
  draw(); delay(1500);
  ESP.restart();
  return "";
}
String firmwareStatus() {
  String build, sha; long size;
  bool k = cardReady() && kept(build, sha, size);
  return String("FIRMWARE ") + COMPANION_BUILD + (k ? " next " + build + " " + String(size) : String(" next none")) +
         (lastWhy.length() ? " (" + lastWhy + ")" : "");
}

#endif
