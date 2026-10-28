// C-174 (the user, 2026-10-27, by multiple choice: "walks + regular polling so u can track its location on the iphone
// app -- also a where am I ping that also makes an audible tone on the watch"): the T-Watch Ultra's u-blox MIA-M10Q, on
// Serial1 at 38400 (its TX to the S3's 44, its RX from 43, as LilyGO's library opens it), powered from the AXP2101's
// BLDO1 only while it is wanted -- it is the hungriest thing on the watch. Three reasons to switch it on:
//
//   a walk     the motion sensor says walking, running or cycling (C-201): a fix told every thirty seconds while it lasts,
//              and the receiver off again after five minutes without moving
//   a poll     every fifteen minutes otherwise: on until one good fix (or ninety seconds), told, off -- its backup rail
//              (VRTC, always on) keeps the almanac, so a fix comes in seconds
//   FIND       the companion asked (the state's `find`, the app's FIND IT): the watch wakes, says HERE and sounds and
//              buzzes every few seconds until it has a fix to tell, or two minutes pass
//
// Each fix goes to the companion as a `where` interaction ("<lat> <lon> <metres>", server/src/where.ts) for the app's map.
#include "app.h"
#include "motion.h"
#include "sound.h"

#if !defined(BOARD_TWATCH_ULTRA)

void gpsLoop(uint32_t) {}
void gpsFromState(JsonVariantConst) {}
String gpsStatus() { return "GPS none"; }

#else

#include <TinyGPSPlus.h>
void watchGnssPower(bool on);                             // watch.cpp: BLDO1

enum Why : uint8_t { OFF, WALK, POLL, FIND };
static TinyGPSPlus gps;
static Why why = OFF;
static uint32_t onAt = 0, toldAt = 0, stillSince = 0, polledAt = 0, beepAt = 0;
static int told = 0;

static void power(Why w) {
  if (w == why) return;
  if (w != OFF && why == OFF) { watchGnssPower(true); Serial1.begin(38400, SERIAL_8N1, 44, 43); onAt = millis(); }
  if (w == OFF && why != OFF) { Serial1.end(); watchGnssPower(false); }
  why = w;
}
static bool goodFix() { return gps.location.isValid() && gps.location.age() < 2000 && gps.hdop.isValid() && gps.hdop.hdop() < 5; }
static void tell() {
  char d[48];
  snprintf(d, sizeof d, "%.6f %.6f %d", gps.location.lat(), gps.location.lng(), (int)(gps.hdop.hdop() * 5));   // HDOP x 5 m, roughly
  report("where", d);
  toldAt = millis(); told++;
}

void gpsLoop(uint32_t now) {
  while (why != OFF && Serial1.available()) gps.encode(Serial1.read());
  MotionKind k = motionKind();
  bool moving = k == M_WALKING || k == M_RUNNING || k == M_CYCLING;
  if (moving) stillSince = 0; else if (!stillSince) stillSince = now;
  if (why == FIND) {
    if (now - beepAt > 4000) { beepAt = now; soundAccomplish(1, st.daemon.species, 0); haptic(16); }   // here, here
    if (goodFix()) { tell(); say("FOUND"); power(OFF); }                                                // DRAFT
    else if (now - onAt > 120000) power(OFF);
    return;
  }
  if (moving && why != WALK) power(WALK);
  if (why == WALK) {
    if (goodFix() && now - toldAt > 30000) tell();
    if (stillSince && now - stillSince > 5UL * 60000) power(OFF);
    return;
  }
  if (why == OFF && now - polledAt > 15UL * 60000) { polledAt = now; power(POLL); }
  if (why == POLL) {
    if (goodFix()) { tell(); power(OFF); }
    else if (now - onAt > 90000) power(OFF);
  }
}

// the state's `find`: a time, new each time the app asks -- answered once
void gpsFromState(JsonVariantConst f) {
  static String last;
  String at = f | "";
  if (!at.length() || at == last) return;
  last = at;
  wake(); say("HERE!"); beepAt = 0;                        // DRAFT
  power(OFF); power(FIND);
}
String gpsStatus() {
  static const char *W[] = { "off", "walk", "poll", "find" };
  return String("GPS ") + W[why] + " sats " + String(gps.satellites.isValid() ? gps.satellites.value() : 0) +
         (gps.location.isValid() ? " at " + String(gps.location.lat(), 5) + "," + String(gps.location.lng(), 5) : " no fix") +
         " told " + String(told) + " chars " + String(gps.charsProcessed());
}

#endif
