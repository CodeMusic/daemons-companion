#include "watch.h"
#include "app.h"
#include "talk.h"

#if !defined(BOARD_TWATCH_S3) && !defined(BOARD_CORES3)

void watchPower() {}
void watchBegin() {}
void watchLoop(uint32_t) {}
bool watchBattery(Battery &b) { b.present = false; return false; }
void watchSetClock(time_t, int) {}
bool watchLocalTime(struct tm &) { return false; }
long watchSteps() { return -1; }
bool watchTalking() { return false; }
bool watchTouchDown() { return false; }

#else

#include <Wire.h>
#include <Preferences.h>
#include <sys/time.h>
#define XPOWERS_CHIP_AXP2101
#include <XPowersLib.h>
#include <SensorBMA423.hpp>
#include <SensorPCF8563.hpp>
#include <TouchDrvFT6X36.hpp>

// Pins and rails from LilyGO's TTGO_TWatch_Library (t-watch-s3 branch, src/utilities.h); docs/HARDWARE.md.
// C-75: the CoreS3 shares all of this but the rails, the steps and the touch's bus: its touch is on the main bus, the
// right way round, and its power chip's interrupt does not reach the ESP32, so the power key is read by asking.
#ifdef BOARD_CORES3
static const int PMU_IRQ = -1;
static TwoWire &touchWire = Wire;
#else
static const int PMU_IRQ = 21, TOUCH_SDA = 39, TOUCH_SCL = 40;
static TwoWire &touchWire = Wire1;
#endif

static XPowersAXP2101 pmu;
static SensorPCF8563 rtc;
static SensorBMA423 accel;
static TouchDrvFT6X36 touchPanel;
static bool havePmu = false, haveRtc = false, haveAccel = false, haveTouch = false;
static volatile bool pmuIrq = false;
static int offsetMin = 0;                 // the local offset from UTC, kept for when the server is away
static bool clockSet = false;

void watchPower() {
  havePmu = pmu.begin(Wire, AXP2101_SLAVE_ADDRESS, board.sda, board.scl);
  if (!havePmu) return;
#ifndef BOARD_CORES3                              // the CoreS3's rails are set in boardBegin(), as M5Unified sets them
  pmu.setALDO1Voltage(3300); pmu.enableALDO1();   // the clock's backup
  pmu.setALDO2Voltage(3300); pmu.enableALDO2();   // the backlight
  pmu.setALDO3Voltage(3300); pmu.enableALDO3();   // the screen and the touch
  pmu.setALDO4Voltage(3300); pmu.enableALDO4();   // the LoRa radio (C-72)
  pmu.setBLDO2Voltage(3300); pmu.enableBLDO2();   // the vibration motor
#endif
  pmu.enableBattDetection(); pmu.enableBattVoltageMeasure(); pmu.enableVbusVoltageMeasure();
  pmu.disableIRQ(XPOWERS_AXP2101_ALL_IRQ);
  pmu.clearIrqStatus();
  pmu.enableIRQ(XPOWERS_AXP2101_PKEY_SHORT_IRQ | XPOWERS_AXP2101_PKEY_LONG_IRQ);
  if (PMU_IRQ >= 0) { pinMode(PMU_IRQ, INPUT_PULLUP); attachInterrupt(PMU_IRQ, [] { pmuIrq = true; }, FALLING); }
  delay(20);
}

void watchBegin() {
  Preferences p; p.begin("watch", true); offsetMin = p.getInt("offset", 0); p.end();
  haveRtc = rtc.begin(Wire, board.sda, board.scl);
  if (haveRtc) {                                       // the clock kept time while the watch slept: start from it
    RTC_DateTime d = rtc.getDateTime();
    if (d.getYear() >= 2025) {
      struct tm t = {}; t.tm_year = d.getYear() - 1900; t.tm_mon = d.getMonth() - 1; t.tm_mday = d.getDay();
      t.tm_hour = d.getHour(); t.tm_min = d.getMinute(); t.tm_sec = d.getSecond();
      setenv("TZ", "UTC0", 1); tzset();
      struct timeval tv = { mktime(&t), 0 }; settimeofday(&tv, nullptr);
      clockSet = true;
    }
  }
#ifdef BOARD_CORES3
  haveTouch = touchPanel.begin(touchWire, FT6X36_SLAVE_ADDRESS, board.sda, board.scl);   // no step counter: a BMI270
#else
  haveAccel = accel.begin(Wire, BMA423_I2C_ADDR_SECONDARY, board.sda, board.scl);
  if (haveAccel) { accel.configAccelerometer(); accel.enableAccelerometer(); accel.enablePedometer(); }
  Wire1.begin(TOUCH_SDA, TOUCH_SCL);
  haveTouch = touchPanel.begin(touchWire, FT6X36_SLAVE_ADDRESS, TOUCH_SDA, TOUCH_SCL);
#endif
  Serial.printf("watch: pmu %d clock %d steps %d touch %d\n", havePmu, haveRtc, haveAccel, haveTouch);
}

bool watchBattery(Battery &b) {
  if (!havePmu) { b.present = false; return false; }
  b.present = pmu.isBatteryConnect();
  b.percent = b.present ? pmu.getBatteryPercent() : -1;
  b.mv = pmu.getBattVoltage();
  b.usb = pmu.isVbusIn();
  b.charging = pmu.isCharging();
  b.full = b.usb && !b.charging && b.percent >= 99;
  return b.present;
}

// The server's clock is the truth when it speaks; the watch's own clock keeps time between.
void watchSetClock(time_t epoch, int offsetMinutes) {
  if (epoch < 1700000000) return;
  struct timeval tv = { epoch, 0 }; settimeofday(&tv, nullptr);
  clockSet = true;
  if (offsetMinutes != offsetMin) {
    offsetMin = offsetMinutes;
    Preferences p; p.begin("watch", false); p.putInt("offset", offsetMin); p.end();
  }
  static time_t written = 0;                           // the RTC once an hour is plenty
  if (haveRtc && labs(epoch - written) > 3600) {
    written = epoch;
    struct tm u; gmtime_r(&epoch, &u);
    rtc.setDateTime(u.tm_year + 1900, u.tm_mon + 1, u.tm_mday, u.tm_hour, u.tm_min, u.tm_sec);
  }
}

bool watchLocalTime(struct tm &out) {
  if (!clockSet) return false;
  time_t t = time(nullptr) + offsetMin * 60;
  gmtime_r(&t, &out);
  return true;
}

// Today's steps: the counter runs on while the watch has power, so the count at the start of each local day is kept,
// and today is what it has counted since.
long watchSteps() {
  if (!haveAccel) return -1;
  long count = accel.getPedometerCounter();
  struct tm t;
  if (!watchLocalTime(t)) return count;
  static int dayWas = -1; static long base = -1;
  int today = (t.tm_year % 100) * 400 + t.tm_yday;
  if (base < 0) { Preferences p; p.begin("watch", true); dayWas = p.getInt("stepsDay", -1); base = p.getLong("stepsBase", 0); p.end(); }
  if (today != dayWas || count < base) {
    if (count < base) base = 0;                        // the counter started again (it lost power): all of it is today's
    if (today != dayWas) { dayWas = today; base = count; }   // a new day starts at nought
    Preferences p; p.begin("watch", false); p.putInt("stepsDay", dayWas); p.putLong("stepsBase", base); p.end();
  }
  return count - base;
}

// ---- touch: a swipe turns between the pages, a tap presses, a long hold goes back; on the face, the TALK button is
// held to talk (C-66). The watch's panel's corner is the screen's opposite one (the screen is turned half round,
// rotation 2); the CoreS3's is the screen's own (a guess, as the watch's was, to check on the board).
static bool down = false, talking = false;
static int16_t xFrom, yFrom, xNow, yNow;
static uint32_t downAt = 0;
bool watchTalking() { return talking; }
bool watchTouchDown() { int16_t x[1], y[1]; return haveTouch && touchPanel.getPoint(x, y, 1) > 0; }

static bool onTalk(int x, int y) { int dx = x - W / 2, dy = y - (H - 34); return dx * dx + dy * dy <= 30 * 30; }

static void touchLoop(uint32_t now) {
  if (!haveTouch) return;
  int16_t xs[1], ys[1];
  bool pressed = touchPanel.getPoint(xs, ys, 1) > 0;
  if (pressed) {
#ifdef BOARD_CORES3
    int x = xs[0], y = ys[0];
#else
    int x = W - 1 - xs[0], y = H - 1 - ys[0];
#endif
    if (!down) {
      down = true; downAt = now; xFrom = x; yFrom = y;
      if (asleep) return;
      if (screen == HOME && page == FACE_PAGE && onTalk(x, y) && talkCan()) {   // C-66: held, it listens (talk.cpp)
        talking = true; draw();
        talkHold();                                            // returns once the finger lifts and the answer is said
        talking = false; down = false; lastInput = millis(); dirty = true;
      }
    }
    xNow = x; yNow = y;
    return;
  }
  if (!down) return;
  down = false;
  if (talking) { talking = false; dirty = true; return; }      // let go of TALK: C-66 sends what was heard
  if (asleep) return;                                          // only the crown wakes the watch (C-79)
  int dx = xNow - xFrom, dy = yNow - yFrom;
  if (abs(dx) > 50 && abs(dx) > abs(dy)) turn(dx < 0 ? 1 : -1);  // swipe left: the next page, as the dial turned right
  else if (abs(dy) > 50) turn(dy < 0 ? 1 : -1);
  else if (now - downAt > 700) back();
  else press();
}

// ---- the crown: a short press wakes the watch, or goes back; a long one, asleep (the PMU powers off on a longer hold)
static void crownLoop(uint32_t now) {
  static uint32_t askedAt = 0;
  if (!havePmu) return;
  if (PMU_IRQ >= 0 ? !pmuIrq : now - askedAt < 100) return;   // C-75: no interrupt pin -- ask ten times a second
  askedAt = now; pmuIrq = false;
  pmu.getIrqStatus();
  bool shortPress = pmu.isPekeyShortPressIrq(), longPress = pmu.isPekeyLongPressIrq();
  pmu.clearIrqStatus();
  if (shortPress) { if (!wake()) back(); }
  else if (longPress && !asleep) sleepNow();
}

void watchLoop(uint32_t now) {
  touchLoop(now);
  crownLoop(now);
  static uint32_t tickAt = 0;                                   // the face's clock and steps: once a second is enough
  if (!asleep && screen == HOME && page == FACE_PAGE && now - tickAt > 1000) { tickAt = now; dirty = true; }
}

#endif
