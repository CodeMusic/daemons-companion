// C-205 (the user, 2026-10-28: "the watch ultra should have alarm options for waking up in the morning, also stopwatch,
// etc... with a similar daemon theme"): HOURS, a routine type on the watches, three routines in the daemon's keeping.
//
//   WAKE ME      the alarm: an hour and a minute, on or off, and GENTLE -- in the twenty minutes before it, the first
//                stir the motion sensor feels (C-201, on the Ultra) rings it then, at the light top of a sleep rather
//                than the bottom of one. It rings as the daemon waking you: the wake tune, a buzz, the daemon in the
//                middle of the glass, its words louder each time round. A tap is I'M UP -- the night ends (C-200,
//                nightWake) and its dream follows; a swipe is FIVE MORE MINUTES (three times at most). Unanswered, it
//                gives up after five minutes. Kept in flash; it rings from the loop wherever the watch is.
//   STOPWATCH    a tap starts and stops it; a swipe while it runs marks a lap, while stopped clears it. The daemon
//                keeps pace beside the numbers.
//   COUNTDOWN    a swipe sets the minutes, a tap starts or pauses it; at nought the daemon calls, as the alarm does.
//
// Every word is DRAFT, the names too (the user names routines).
#include "app.h"
#include "motion.h"
#include "sound.h"
#include <Preferences.h>

void drawArt(int x, int y, int scale, bool mirrored = false);   // ui.cpp: the daemon carried, in its expression

static int alarmH = 7, alarmM = 0; static bool alarmOn = false, gentle = true;
static int firedDay = -1;                                 // the day it last rang, so a minute is never rung twice
static uint32_t snoozeUntil = 0; static int snoozes = 0;
static uint32_t windowStirs = 0; static bool inWindow = false;

static void keep() {
  Preferences p; p.begin("alarm", false);
  p.putInt("h", alarmH); p.putInt("m", alarmM); p.putBool("on", alarmOn); p.putBool("gentle", gentle); p.end();
}
void clockBegin() {
  Preferences p; p.begin("alarm", true);
  alarmH = p.getInt("h", 7); alarmM = p.getInt("m", 0); alarmOn = p.getBool("on", false); gentle = p.getBool("gentle", true); p.end();
}
static String two(int n) { return (n < 10 ? "0" : "") + String(n); }
static String hhmm(int h, int m) { return two(h) + ":" + two(m); }
static String name() { return st.carrying ? daemonName() : String("YOUR DAEMON"); }   // DRAFT

// ---- COUNTDOWN -------------------------------------------------------------------------------------------------------
static const int STEPS[] = { 1, 2, 3, 5, 10, 15, 20, 25, 30, 45, 60, 90 };
static int cdAt = 3; static uint32_t cdLeft = 5 * 60000, cdFrom = 0; static bool cdRunning = false;
static uint32_t cdNow() { return cdRunning ? (millis() - cdFrom >= cdLeft ? 0 : cdLeft - (millis() - cdFrom)) : cdLeft; }
// ---- the ringing, the alarm's and the countdown's ----------------------------------------------------------------------
static int ringRound = 0; static String ringTitle;
static String drawRing(uint16_t day, uint16_t ink) {
  canvas.setTextDatum(TC_DATUM); canvas.setTextFont(2); canvas.setTextColor(readable(day));
  canvas.drawString(ringTitle, W / 2, 32);
  if (st.carrying) drawArt(W / 2 - 64, 58, 4, ringRound & 1);        // the daemon, hopping side to side as it calls
  static const char *CALLS[] = { "Psst.", "Hey. HEY.", "UP! The day is waiting!", "I'm not going anywhere." };   // DRAFT
  canvas.setTextColor(PAPER);
  wrap(name() + ": " + CALLS[min(ringRound / 3, 3)], 14, 196, W - 28, 2, 18, 2, PAPER);
  canvas.setTextDatum(TL_DATUM);
  return snoozes < 3 ? "tap: I'M UP   swipe: FIVE MORE MINUTES" : "tap: I'M UP";   // DRAFT
}
// rings until answered: true a tap (up), false a swipe (snooze) or five minutes unanswered
static bool ring(const String &title, bool canSnooze) {
  wake();
  Screen was = screen; screen = RUN; ringTitle = title; ringRound = 0;
  runPanel = drawRing; progress("");
  uint32_t t0 = millis(), roundAt = 0; bool up = false;
  while (millis() - t0 < 5UL * 60000) {
    if (millis() - roundAt > 3000) {
      roundAt = millis(); ringRound++;
      soundWake(); haptic(ringRound > 6 ? 47 : 16); progress("");
    }
    int step, ev; routineInput(step, ev);
    if (ev == 1 || ev == -1 || giveUp()) { up = true; break; }
    if (step && canSnooze && snoozes < 3) break;
    delay(10);
  }
  runPanel = nullptr; screen = was; lastInput = millis(); dirty = true;
  return up;
}

// from the loop: the alarm's minute, or a stir in GENTLE's window before it; and a snooze run out
void clockLoop(uint32_t now) {
  static uint32_t at = 0;
  if (now - at < 1000 || !isWatch()) return;
  at = now;
  if (snoozeUntil && (int32_t)(now - snoozeUntil) >= 0) {
    snoozeUntil = 0;
    if (ring("FIVE MINUTES ARE UP", true)) { snoozes = 0; nightWake(); } else { snoozes++; snoozeUntil = millis() + 5UL * 60000; }   // DRAFT
    return;
  }
  if (cdRunning && !cdNow() && !routineRunning) {          // a countdown left running behind the routine
    cdRunning = false; cdLeft = STEPS[cdAt] * 60000UL; ring("TIME!", false); return;               // DRAFT
  }
  struct tm t;
  if (!alarmOn || !watchLocalTime(t)) return;
  int day = t.tm_year * 400 + t.tm_yday, mins = t.tm_hour * 60 + t.tm_min, want = alarmH * 60 + alarmM;
  int before = (want - mins + 1440) % 1440;               // minutes until it
  if (firedDay == day) return;
  bool due = before == 0;
  if (gentle && motionReady() && before > 0 && before <= 20) {
    if (!inWindow) { inWindow = true; windowStirs = motionStirs(); }
    else if (motionStirs() > windowStirs) due = true;     // a stir near the top of a sleep: ring now
  } else inWindow = false;
  if (!due) return;
  firedDay = day; inWindow = false; snoozes = 0;
  if (ring("GOOD MORNING  " + hhmm(t.tm_hour, t.tm_min), true)) nightWake();   // DRAFT
  else { snoozes++; snoozeUntil = millis() + 5UL * 60000; }
}
String clockStatus() {
  return String("ALARM ") + (alarmOn ? "on " : "off ") + hhmm(alarmH, alarmM) + (gentle ? " gentle" : "") +
         (snoozeUntil ? " snoozed " + String(snoozes) : "");
}
String alarmWords() { return alarmOn ? hhmm(alarmH, alarmM) : ""; }   // for a face to show

// ---- WAKE ME: the alarm set -------------------------------------------------------------------------------------------
static int field = 0;                                     // 0 the hour, 1 the minute, 2 on, 3 gentle
static String drawWake(uint16_t day, uint16_t ink) {
  canvas.setTextDatum(TC_DATUM); canvas.setTextFont(2); canvas.setTextColor(readable(day));
  canvas.drawString("WAKE ME", W / 2, 32);                                                       // DRAFT
  canvas.setTextFont(7);
  int x = W / 2;
  canvas.setTextColor(field == 0 ? day : (alarmOn ? PAPER : QUIET)); canvas.setTextDatum(TR_DATUM); canvas.drawString(two(alarmH), x - 8, 64);
  canvas.setTextColor(alarmOn ? PAPER : QUIET); canvas.setTextDatum(TC_DATUM); canvas.drawString(":", x, 64);
  canvas.setTextColor(field == 1 ? day : (alarmOn ? PAPER : QUIET)); canvas.setTextDatum(TL_DATUM); canvas.drawString(two(alarmM), x + 8, 64);
  canvas.setTextFont(2); canvas.setTextDatum(TC_DATUM);
  canvas.setTextColor(field == 2 ? day : PAPER); canvas.drawString(alarmOn ? "ON" : "OFF", W / 2, 130);   // DRAFT
  canvas.setTextColor(field == 3 ? day : PAPER);
  canvas.drawString(gentle ? "GENTLE: AT YOUR FIRST STIR" : "GENTLE: OFF", W / 2, 152);           // DRAFT
  canvas.setTextColor(QUIET);
  wrap(alarmOn ? name() + " will wake you." : name() + " will let you sleep.", 14, 182, W - 28, 2, 18, 2, QUIET);   // DRAFT
  canvas.setTextDatum(TL_DATUM);
  return "swipe: change   tap: next   hold: done";                                              // DRAFT
}
String runWakeMe() {
  field = 0; runPanel = drawWake; progress("");
  while (true) {
    int step, ev; routineInput(step, ev);
    if (ev == -1 || giveUp()) break;
    if (ev == 1) field = (field + 1) % 4;
    if (step) {
      if (field == 0) alarmH = (alarmH + step + 24) % 24;
      else if (field == 1) alarmM = (alarmM + step * 5 + 60) % 60;      // five minutes a swipe
      else if (field == 2) alarmOn = !alarmOn;
      else gentle = !gentle;
      if (field < 2) alarmOn = true;                      // a time set is a time wanted
      haptic(1);
    }
    if (step || ev) progress("");
    delay(10);
  }
  keep(); firedDay = -1; runPanel = nullptr;
  return alarmOn ? name() + " will wake you at " + hhmm(alarmH, alarmM) + "." : "No alarm.";        // DRAFT
}

// ---- STOPWATCH -------------------------------------------------------------------------------------------------------
static uint32_t swStart = 0, swHeld = 0; static bool swRunning = false;
static uint32_t laps[4]; static int lapN = 0;
static uint32_t swNow() { return swHeld + (swRunning ? millis() - swStart : 0); }
static String clockOf(uint32_t ms) {
  uint32_t m = ms / 60000, s = ms / 1000 % 60, c = ms / 10 % 100;
  return two(m) + ":" + two(s) + "." + two(c);
}
static String drawStopwatch(uint16_t day, uint16_t ink) {
  canvas.setTextDatum(TC_DATUM); canvas.setTextFont(2); canvas.setTextColor(readable(day));
  canvas.drawString("STOPWATCH", W / 2, 32);                                                     // DRAFT
  canvas.setTextFont(7); canvas.setTextColor(swRunning ? PAPER : day);
  canvas.drawString(clockOf(swNow()), W / 2, 60);
  canvas.setTextFont(2);
  for (int i = 0; i < lapN; i++) {
    canvas.setTextColor(i == 0 ? PAPER : QUIET);
    canvas.drawString("LAP " + String(lapN - i) + "   " + clockOf(laps[i]), W / 2, 120 + i * 18);   // DRAFT
  }
  if (st.carrying) drawArt(W - 74, H - 110, 2, (swNow() / 400) & 1);   // keeping pace
  canvas.setTextDatum(TL_DATUM);
  return swRunning ? "tap: stop   swipe: lap" : (swNow() ? "tap: go on   swipe: clear" : "tap: go");   // DRAFT
}
String runStopwatch() {
  runPanel = drawStopwatch; progress("");
  uint32_t drawnAt = 0;
  while (true) {
    int step, ev; routineInput(step, ev);
    if (ev == -1 || giveUp()) break;
    if (ev == 1) {
      if (swRunning) { swHeld = swNow(); swRunning = false; } else { swStart = millis(); swRunning = true; }
      haptic(1); progress("");
    }
    if (step) {
      if (swRunning) { for (int i = 3; i > 0; i--) laps[i] = laps[i - 1]; laps[0] = swNow(); lapN = min(lapN + 1, 4); }
      else { swHeld = 0; lapN = 0; }
      haptic(24); progress("");
    }
    if (swRunning && millis() - drawnAt > 90) { drawnAt = millis(); progress(""); }
    delay(5);
  }
  runPanel = nullptr;
  return swNow() ? name() + " kept count: " + clockOf(swNow()) + (lapN ? ", " + String(lapN) + " laps." : ".") : "";   // DRAFT
}

static String drawCountdown(uint16_t day, uint16_t ink) {
  canvas.setTextDatum(TC_DATUM); canvas.setTextFont(2); canvas.setTextColor(readable(day));
  canvas.drawString("COUNTDOWN", W / 2, 32);                                                     // DRAFT
  uint32_t ms = cdNow() + 999;
  canvas.setTextFont(7); canvas.setTextColor(cdRunning ? PAPER : day);
  canvas.drawString(two(ms / 60000) + ":" + two(ms / 1000 % 60), W / 2, 66);
  if (st.carrying) drawArt(W / 2 - 32, 130, 2, false);
  canvas.setTextDatum(TL_DATUM);
  return cdRunning ? "tap: pause" : "swipe: minutes   tap: go";                                  // DRAFT
}
String runCountdown() {
  runPanel = drawCountdown; progress("");
  uint32_t drawnAt = 0; String result = "";
  while (true) {
    int step, ev; routineInput(step, ev);
    if (ev == -1 || giveUp()) break;
    if (ev == 1) {
      if (cdRunning) { cdLeft = cdNow(); cdRunning = false; } else { cdFrom = millis(); cdRunning = true; }
      haptic(1); progress("");
    }
    if (step && !cdRunning) { cdAt = constrain(cdAt + step, 0, 11); cdLeft = STEPS[cdAt] * 60000UL; haptic(1); progress(""); }
    if (cdRunning && !cdNow()) {
      cdRunning = false; cdLeft = STEPS[cdAt] * 60000UL;
      ring("TIME!", false);                                                                      // DRAFT
      result = name() + " called time."; break;                                                  // DRAFT
    }
    if (cdRunning && millis() - drawnAt > 250) { drawnAt = millis(); progress(""); }
    delay(10);
  }
  runPanel = nullptr;
  return result;
}
