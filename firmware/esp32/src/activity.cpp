// C-183 (the user, 2026-10-24: "i'd love to visualize ... the steps and other activity the user takes... all these
// should combine and provide visual feedback on the device-fast... where it feels similar to the game"): what was just
// done, shown at once at the foot of the screen as the game shows a battle's reward -- the daemon's name and level, and
// its EXP bar filling to where the step left it; growing a level, said large with the milestone's tune. The day's
// tallies (steps walked, cares given, routines run, steps done) for the DAY page.
#include "app.h"
#include "display.h"
#include "sound.h"
#include "watch.h"
#include <Preferences.h>

int dayIndex();
struct Act { String what; uint32_t at = 0; float from = 0, to = 0; bool grew = false; };
static Act act;
static const uint32_t SHOW_MS = 2800, FILL_MS = 700;
static int routinesToday = 0, caresToday = 0, doneToday = 0; static String countedDay;

static void dayRoll() { if (countedDay != st.date) { countedDay = st.date; routinesToday = caresToday = doneToday = 0; } }
float expFill() {
  long span = st.daemon.expNext - st.daemon.expFrom;
  return span <= 0 ? 1.0f : constrain((float)(st.daemon.expTotal - st.daemon.expFrom) / span, 0.0f, 1.0f);
}
// kind: 0 a care, 1 a routine, 2 a step done
void activity(int kind, const String &what, int expGain) {
  dayRoll();
  if (kind == 0) caresToday++; else if (kind == 1) routinesToday++; else doneToday++;
  if (!st.carrying) return;
  long span = max(1L, st.daemon.expNext - st.daemon.expFrom);
  act.what = what; act.at = millis(); act.grew = false;
  act.from = expFill(); act.to = min(1.0f, act.from + (float)expGain / span);
  dirty = true;
}
// a state that says it grew: the level, said large, and the milestone's tune
void activityGrew(int to) {
  act.what = upper(st.daemon.nickname) + " GREW TO Lv " + String(to) + "!";   // DRAFT
  act.at = millis(); act.grew = true; act.from = 0; act.to = expFill();
  soundAccomplish(1, st.daemon.species, dayIndex());
  dirty = true;
}
// C-184: it evolved on the companion -- said large, with the whole goal's tune; told once for each evolution (kept, so
// a restart does not tell it again)
void activityEvolved(const String &from, const String &to, const String &at) {
  Preferences p; p.begin("activity", false);
  if (p.getString("evolved", "") == at) { p.end(); return; }
  p.putString("evolved", at); p.end();
  act.what = upper(from) + " EVOLVED INTO " + upper(to) + "!";   // DRAFT
  act.at = millis(); act.grew = true; act.from = act.to = expFill();
  soundAccomplish(2, st.daemon.species, dayIndex());
  dirty = true;
}
// a thousand steps walked, each time (the watch's step counter)
void activityLoop(uint32_t now) {
  static uint32_t at = 0; static long thousands = -1;
  if (now - at < 2000) return;
  at = now;
  long s = watchSteps();
  if (s < 0) return;
  if (thousands >= 0 && s / 1000 > thousands && st.carrying) {
    act.what = String(s / 1000) + ",000 STEPS TOGETHER"; act.at = millis(); act.grew = false; act.from = act.to = expFill(); dirty = true;   // DRAFT
  }
  thousands = s / 1000;
}
bool activityShowing() { return act.at && millis() - act.at < SHOW_MS; }

// the panel: what happened, then the daemon and its EXP bar, filling
void drawActivity(uint16_t day, uint16_t ink) {
  if (!activityShowing()) return;
  uint32_t t = millis() - act.at;
  int h = 56, y = H - h - 6, x = 8, w = W - 16;
  canvas.fillRoundRect(x, y, w, h, 6, INK); canvas.drawRoundRect(x, y, w, h, 6, act.grew ? PAPER : day);
  canvas.setTextDatum(TL_DATUM); canvas.setTextFont(2);
  canvas.setTextColor(act.grew ? readable(day) : PAPER);
  String what = act.what;
  while (what.length() > 4 && canvas.textWidth(what) > w - 16) what.remove(what.length() - 1);
  canvas.drawString(what, x + 8, y + 6);
  canvas.setTextFont(1); canvas.setTextColor(QUIET);
  canvas.drawString(upper(st.daemon.nickname) + "  Lv" + String(max(st.daemon.level, st.daemon.grownTo)), x + 8, y + 30);
  int bx = x + 8, bw = w - 16, by = y + h - 12;
  float f = act.from + (act.to - act.from) * min(1.0f, (float)t / FILL_MS);
  canvas.setTextColor(readable(day)); canvas.setTextDatum(TR_DATUM); canvas.drawString("EXP", x + w - 8, y + 30);
  canvas.drawRect(bx, by, bw, 6, QUIET);
  canvas.fillRect(bx + 1, by + 1, (int)((bw - 2) * f), 4, canvas.color565(0x40, 0xA8, 0xF8));   // the game's EXP blue
  canvas.setTextDatum(TL_DATUM);
  dirty = true;                                                  // drawn again until it goes
}

// the day's tallies, for the DAY page
String activityToday() {
  dayRoll();
  long s = watchSteps();
  String out;
  if (s >= 0) out += String(s) + " STEPS   ";
  out += String(doneToday) + " DONE   " + String(caresToday) + " CARES   " + String(routinesToday) + " ROUTINES";   // DRAFT
  return out;
}
