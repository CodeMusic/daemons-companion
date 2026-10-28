// C-200 (the user, 2026-10-28: "sleep tracking ... it should be creative relating to daemons and dreams"; decided by
// multiple choice): the night, on a watch. It begins either way -- the daemon tucked in (CARE, SLEEP), or, on the Ultra,
// half an hour's stillness between eight at night and four in the morning (its motion sensor, C-201: the night is
// counted from when the stillness began) -- and it ends with the daemon woken (CARE, WAKE) or three minutes on the move
// (or after sixteen hours, whatever happens). In between every stir is counted. A night of an hour or more is told to
// the companion as an interaction -- "night <from> <to> <stirs> <tucked>" -- and the dream is shown at once, written here
// from the night's shape (the companion's own words, server/src/dreams.ts, a smaller handful of them); when the hub's
// modules write their own telling, the next state brings it and it is shown once too. Kept in flash, so a restart in the
// night does not lose it. Every word DRAFT.
#include "app.h"
#include "motion.h"
#include "sound.h"
#include <Preferences.h>
#include <sys/time.h>

static bool on = false, tucked = false;
static long from = 0;                                     // seconds since 1970
static uint32_t stirsAt = 0, movingSince = 0;
static String dreamText; static uint32_t dreamUntil = 0; static bool dreamLater = false;

static void keep() {
  Preferences p; p.begin("night", false);
  p.putBool("on", on); p.putBool("tucked", tucked); p.putLong("from", from); p.putULong("stirs", stirsAt); p.end();
}
void nightBegin() {
  Preferences p; p.begin("night", true);
  on = p.getBool("on", false); tucked = p.getBool("tucked", false); from = p.getLong("from", 0); stirsAt = p.getULong("stirs", 0); p.end();
  stirsAt = 0;                                            // the motion sensor counts again from nought after a restart
}
static long epochNow() { struct tm t; return watchLocalTime(t) ? (long)time(nullptr) : 0; }

// ---- the dream, written here (DRAFT) ----------------------------------------------------------------------------------
static const char *IMAGES[] = {
  "running beside you through tall grass that hummed", "a library whose books read themselves aloud",
  "a door it had never been through, standing open", "falling slowly upward into the stars",
  "a tree that grew a leaf for every step you took", "rain that fell upward and hummed a tune",
  "a bridge of numbers over a river of moonlight", "you, small and far away, waving",
};
static const char *WAKES[] = { "bright", "rested", "humming", "glad of you" };
static String dreamOf(float hours, int stirs) {
  uint32_t s = (uint32_t)(from / 3600) * 2654435761u;
  String name = st.daemon.nickname.length() ? st.daemon.nickname : String("Your daemon");
  const char *a = IMAGES[s % 8], *b = IMAGES[(s / 8 + 3) % 8];
  if (hours < 4 || stirs > max(4.0f, hours * 1.2f)) return name + " dreamt in pieces: " + a + "... then " + b + ".";
  if (hours >= 6.5f && stirs <= max(2.0f, hours / 3)) return name + " dreamt of " + a + ". It woke " + WAKES[(s / 64) % 4] + ".";
  return name + " dreamt of " + a + ", and slept on.";
}

static void showDream(const String &text, bool later) { dreamText = text; dreamLater = later; dreamUntil = millis() + 30000; wake(); dirty = true; }
bool dreamShowing() { return dreamUntil && (int32_t)(dreamUntil - millis()) > 0; }
void dreamDismiss() { dreamUntil = 0; dirty = true; }

// the dream, over whatever is shown: its title, the words, a tap to put it away
void drawDream(uint16_t day) {
  if (!dreamShowing()) return;
  canvas.fillRect(0, 26, W, H - 26, INK);
  canvas.setTextFont(2); canvas.setTextColor(day); canvas.setTextDatum(TL_DATUM);
  canvas.drawString(dreamLater ? "IT REMEMBERS MORE" : "WHILE YOU SLEPT", 10, 34);   // DRAFT
  wrap(dreamText, 10, 60, W - 20, 2, 19, (H - 100) / 19, PAPER);
  canvas.setTextFont(1); canvas.setTextColor(QUIET); canvas.setTextDatum(BC_DATUM);
  canvas.drawString("tap: good morning", W / 2, H - 8);                            // DRAFT
  canvas.setTextDatum(TL_DATUM);
}

// ---- the night -----------------------------------------------------------------------------------------------------------
static void start(long at, bool byHand) {
  on = true; tucked = byHand; from = at; stirsAt = motionStirs(); movingSince = 0; keep();
}
static void end(long at) {
  if (!on) return;
  on = false; keep();
  float hours = (at - from) / 3600.0f;
  int stirs = (int)(motionStirs() - stirsAt);
  if (hours < 1 || hours > 16 || !from || !at) return;   // a nap, or a clock not yet set: no night to tell
  char d[48]; snprintf(d, sizeof d, "%ld %ld %d %d", from, at, stirs, tucked ? 1 : 0);
  report("night", d);
  if (st.carrying) { showDream(dreamOf(hours, stirs), false); soundWake(); }
}
void nightTuck() { long t = epochNow(); if (t && !on) { start(t, true); intuitionMoment(READ_NIGHT); } }   // CARE, SLEEP; C-203: perhaps a read of the night
void nightWake() { long t = epochNow(); if (t) end(t); }                  // CARE, WAKE

void nightLoop(uint32_t now) {
  static uint32_t at = 0;
  if (now - at < 5000) return;
  at = now;
  long t = epochNow();
  if (!t || !motionReady()) return;
  struct tm lt; watchLocalTime(lt);
  MotionKind k = motionKind();
  if (!on && (lt.tm_hour >= 20 || lt.tm_hour < 4) && motionStillFor() > 30UL * 60000) start(t - motionStillFor() / 1000, false);
  if (!on) return;
  bool moving = k == M_WALKING || k == M_RUNNING || k == M_CYCLING;
  if (!moving) movingSince = 0; else if (!movingSince) movingSince = now;
  if (movingSince && now - movingSince > 3UL * 60000) end(t - 180);   // up and about: the night ended as the walking began
  else if (t - from > 16L * 3600) end(t);
}

// the state's dream (server/src/dreams.ts freshDream): the module's telling, shown once
void nightFromState(JsonVariantConst d) {
  if (d.isNull()) return;
  int id = d["id"] | 0; String by = d["by"] | ""; String text = d["text"] | "";
  if (by != "module" || !text.length()) return;
  Preferences p; p.begin("night", false);
  if (p.getInt("shown", 0) != id) { p.putInt("shown", id); showDream(text, true); }
  p.end();
}
String nightStatus() {
  return String("NIGHT ") + (on ? "on" : "off") + (tucked ? " tucked" : "") + " from " + String(from) +
         " stirs " + String(on ? motionStirs() - stirsAt : 0) + (dreamShowing() ? " dreaming" : "");
}
