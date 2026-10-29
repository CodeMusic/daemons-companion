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
long gpsMetresToday() { return -1; }
String gpsStatus() { return "GPS none"; }

#else

#include <TinyGPSPlus.h>
#include <Preferences.h>
void watchGnssPower(bool on);                             // watch.cpp: BLDO1

enum Why : uint8_t { OFF, WALK, POLL, FIND };
static TinyGPSPlus gps;
static Why why = OFF;
static uint32_t onAt = 0, toldAt = 0, stillSince = 0, polledAt = 0, beepAt = 0;
static int told = 0;
static uint32_t findAt = 0;                               // when FIND began (a touch after it ends it)

static void power(Why w) {
  if (w == why) return;
  if (w != OFF && why == OFF) { watchGnssPower(true); Serial1.begin(38400, SERIAL_8N1, 44, 43); onAt = millis(); }
  if (w == OFF && why != OFF) { Serial1.end(); watchGnssPower(false); }
  why = w;
}
static bool goodFix() { return gps.location.isValid() && gps.location.age() < 2000 && gps.hdop.isValid() && gps.hdop.hdop() < 5; }
// the distance walked today: the walk's fixes joined, each leg between eight metres (the receiver's own wander) and two
// kilometres (a gap, not a stride), at most ten minutes apart. Kept in flash by the day, so a restart keeps it.
static double lastLat = 0, lastLon = 0; static uint32_t lastAt = 0;
static long metres = -1; static int metresDay = -1;
static int today() { struct tm t; return watchLocalTime(t) ? t.tm_year * 400 + t.tm_yday : -1; }
long gpsMetresToday() {
  int d = today();
  if (metres < 0 || d != metresDay) {
    Preferences p; p.begin("gps", true);
    metresDay = d; metres = p.getInt("day", -2) == d ? p.getLong("metres", 0) : 0; p.end();
  }
  return metres;
}
static void walked() {
  double la = gps.location.lat(), lo = gps.location.lng();
  uint32_t now = millis();
  if (lastAt && now - lastAt < 10UL * 60000) {
    double m = TinyGPSPlus::distanceBetween(lastLat, lastLon, la, lo);
    if (m < 8) return;                                     // standing still: keep the first fix as the leg's start
    if (m < 2000 && gpsMetresToday() >= 0) {
      metres += (long)m;
      Preferences p; p.begin("gps", false); p.putInt("day", metresDay); p.putLong("metres", metres); p.end();
    }
  }
  lastLat = la; lastLon = lo; lastAt = now;
}
static void tell() {
  char d[48];
  struct tm lt; long taken = watchLocalTime(lt) ? (long)time(nullptr) : 0;   // C-199: when, so a fix told late is filed then
  snprintf(d, sizeof d, "%.6f %.6f %d %ld", gps.location.lat(), gps.location.lng(), (int)(gps.hdop.hdop() * 5), taken);   // HDOP x 5 m, roughly
  report("where", d);
  toldAt = millis(); told++;
}

void gpsLoop(uint32_t now) {
  while (why != OFF && Serial1.available()) gps.encode(Serial1.read());
  MotionKind k = motionKind();
  bool moving = k == M_WALKING || k == M_RUNNING || k == M_CYCLING;
  if (moving) stillSince = 0; else if (!stillSince) stillSince = now;
  if (why == FIND) {
    // found by hand (the user, 2026-10-28: the beeping went on with the watch in hand): a touch or a press stops it
    if ((int32_t)(lastInput - findAt) > 1500) { say("FOUND"); power(OFF); return; }                    // DRAFT
    if (now - beepAt > 4000) { beepAt = now; soundAccomplish(1, st.daemon.species, 0); haptic(16); }   // here, here
    if (goodFix()) { tell(); say("FOUND"); power(OFF); }                                                // DRAFT
    else if (now - onAt > 120000) power(OFF);
    return;
  }
  // C-242: BATTERY's GPS -- Off (or low power) keeps it off but for FIND; "When it moves" only walks; "Always" polls too
  if (!powerGps()) { if (why != OFF) power(OFF); return; }
  if (moving && why != WALK) power(WALK);
  if (why == WALK) {
    if (goodFix() && now - toldAt > 30000) { walked(); tell(); }
    if (stillSince && now - stillSince > powerStillMs()) power(OFF);
    return;
  }
  if (why == OFF && powerGpsPolls() && now - polledAt > 15UL * 60000) { polledAt = now; power(POLL); }
  if (why == POLL) {
    if (goodFix()) { tell(); power(OFF); }
    else if (now - onAt > 90000) power(OFF);
  }
}

// the state's `find`: a time, new each time the app asks -- answered once
void gpsFromState(JsonVariantConst f) {
  static String last;
  String at = f | "";
  if (!at.length() && why == FIND && last.length()) { say("FOUND"); power(OFF); }   // taken back in the app: Found it   // DRAFT
  if (!at.length() || at == last) return;
  last = at;
  wake(); say("HERE!"); beepAt = 0; findAt = millis(); lastInput = findAt;   // DRAFT
  power(OFF); power(FIND);
}
String gpsStatus() {
  static const char *W[] = { "off", "walk", "poll", "find" };
  return String("GPS ") + W[why] + " sats " + String(gps.satellites.isValid() ? gps.satellites.value() : 0) +
         (gps.location.isValid() ? " at " + String(gps.location.lat(), 5) + "," + String(gps.location.lng(), 5) : " no fix") +
         " told " + String(told) + " walked " + String(gpsMetresToday()) + "m" + " chars " + String(gps.charsProcessed());
}

#endif
