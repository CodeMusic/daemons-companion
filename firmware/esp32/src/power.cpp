// C-242 (the user, 2026-10-29: "a setting in the app for the watch regarding battery, like on or off for certain features
// ... make it smart so it only turns on GPS when the accelerometer detects movement"): what the app's BATTERY set
// (cfg.power, from the state's settings.power), read by each drain where it decides -- gps.cpp, lora.cpp, the meet,
// the poll (main.cpp), the screen (input.cpp, display.cpp) and the buzz (watch.cpp).
//
// "Moving" is the BHI260AP's walking, running or cycling (motion.cpp), and it lasts `stillMinutes` after the last of it;
// a board without the sensor counts as always moving, so a rule it cannot keep never switches its radios off.
//
// C-243: `low` puts every drain at its thrifty side at once -- GPS and LoRa off, the meet off, a poll no more often than
// five minutes, the screen dimmer and asleep after fifteen seconds, no always-on face -- and the rest stay as set, for
// when it is off again. It is switched on the watch's SETTINGS (input.cpp), by "INDEX, low power on" (talk.cpp), or in
// the app; the charger going in ends it.
#include "app.h"
#include "motion.h"
#include "watch.h"

static uint32_t movedAt = 0;

bool powerMoving() {
  if (!motionReady()) return true;
  MotionKind k = motionKind();
  if (k == M_WALKING || k == M_RUNNING || k == M_CYCLING) movedAt = millis();
  return movedAt && millis() - movedAt < powerStillMs();
}
uint32_t powerStillMs() { return (uint32_t)constrain(cfg.power.stillMinutes, 1, 60) * 60000UL; }
bool powerGps() { return cfg.power.gps && !cfg.power.low; }
bool powerGpsPolls() { return !cfg.power.gpsOnMove; }
bool powerLora() { return cfg.power.lora && !cfg.power.low && (!cfg.power.radiosOnMove || powerMoving()); }
bool powerMeet() { return cfg.meet && cfg.power.meet && !cfg.power.low && (!cfg.power.radiosOnMove || powerMoving()); }
uint32_t powerPollMs() { return (uint32_t)max(cfg.power.poll, cfg.power.low ? 300 : 30) * 1000UL; }
int powerSleepAfter() {
  if (!cfg.power.low) return cfg.sleepAfter;
  return cfg.sleepAfter > 0 && cfg.sleepAfter < 15 ? cfg.sleepAfter : 15;
}
uint8_t powerBright() { return cfg.power.low ? 70 : 200; }
// only the Ultra's AMOLED: a dark pixel there is an unlit one, so a dim face asleep costs little (the S3's LCD lights all)
bool powerAod() { return board.kind == BoardKind::TWatchUltra && cfg.power.aod && !cfg.power.low; }

// C-255: a watch asleep needs little of the chip -- 80 MHz keeps Wi-Fi, Bluetooth, LoRa and the sound (the bus clock
// stays 80 MHz), and the loop rests 20 ms a pass rather than 1. Only the watches: an M5 on its IP5306 reads a light load
// as unplugged, and switches itself off.
bool powerWatch() { return board.kind == BoardKind::TWatchUltra || board.kind == BoardKind::TWatchS3; }
void powerAsleep(bool on) {
#if CONFIG_IDF_TARGET_ESP32S3                          // the watches are S3s; on the M5GO's ESP32 the clock code costs IRAM it lacks
  if (!powerWatch()) return;
  setCpuFrequencyMhz(on ? 80 : 240);
#endif
}
int powerLoopRest() { return asleep && powerWatch() && !aodShowing() ? 20 : 1; }

void powerLoop(uint32_t now) {
  powerMoving();                                   // kept current, so the still spell counts from the last step
  // C-243: the charger ends low power -- the cable going in, held for a second (a loose one flickers)
  static int was = -1; static uint32_t inAt = 0, askedAt = 0;
  if (now - askedAt < 500) return;                 // the PMU is on the shared I2C: asked twice a second, not every pass
  askedAt = now;
  int in = watchCableIn();
  if (in < 0) return;
  if (in == 1 && was == 0) inAt = now;
  if (in == 1 && inAt && now - inAt > 1000) { inAt = 0; if (cfg.power.low) { powerSetLow(false); say("LOW POWER OFF"); } }   // DRAFT
  if (in == 0) inAt = 0;
  was = in;
}
