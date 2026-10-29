#include "watch.h"
#include "app.h"
#include "talk.h"
#include "motion.h"                                         // C-201: the Ultra's motion sensor
#include "casino.h"
#if defined(BOARD_TWATCH_S3)
#include <SensorDRV2605.hpp>                               // C-176: both watches have the DRV2605 (0x5A)
#endif

#if defined(BOARD_CORES3) || defined(BOARD_DIAL) || defined(BOARD_TDISPLAY_PRO) || defined(BOARD_TDISPLAY_AMOLED)
#define MAIN_BUS_TOUCH 1                                  // C-102: the Dial reads its touch as the CoreS3 does; C-105 the T-Display-S3 Pro
#endif

#if !defined(BOARD_TWATCH_S3) && !defined(MAIN_BUS_TOUCH)

void watchPower() {}
void watchBegin() {}
void watchLoop(uint32_t) {}
bool watchBattery(Battery &b) { b.present = false; return false; }
void watchSetClock(time_t, int) {}
bool watchLocalTime(struct tm &) { return false; }
long watchSteps() { return -1; }
bool watchTalking() { return false; }
bool watchTouchDown() { return false; }
bool watchFinger(int &, int &) { return false; }
void haptic(uint8_t) {}
int watchGesture() { return 0; }
bool watchGestureAcross() { return false; }
bool watchPowerOff() { return false; }
int watchCableIn() { return -1; }
String watchStatus() { return "WATCH none"; }

#else

#include <Wire.h>
#include <Preferences.h>
#include <sys/time.h>
#define XPOWERS_CHIP_AXP2101
#include <XPowersLib.h>
#include <SensorBMA423.hpp>
#include <SensorPCF8563.hpp>
#include <TouchDrvFT6X36.hpp>
#if defined(BOARD_TWATCH_ULTRA)
#include <SensorPCF85063.hpp>                              // C-173: the Ultra's clock is a PCF85063A
#include <TouchDrvCSTXXX.hpp>                              // and its touch a CST9217
#endif

// Pins and rails from LilyGO's TTGO_TWatch_Library (t-watch-s3 branch, src/utilities.h); docs/HARDWARE.md.
// C-75: the CoreS3 shares all of this but the rails, the steps and the touch's bus: its touch is on the main bus, the
// right way round, and its power chip's interrupt does not reach the ESP32, so the power key is read by asking.
#ifdef MAIN_BUS_TOUCH
static const int PMU_IRQ = -1;
static TwoWire &touchWire = Wire;
#elif defined(BOARD_TWATCH_ULTRA)
// C-173: the Ultra's touch is on the main bus (3, 2), its interrupt on 12; the power chip's on 7
static const int PMU_IRQ = 7, TOUCH_INT = 12;
static TwoWire &touchWire = Wire;
#else
static const int PMU_IRQ = 21, TOUCH_SDA = 39, TOUCH_SCL = 40;
static TwoWire &touchWire = Wire1;
#endif

static XPowersAXP2101 pmu;
#if defined(BOARD_TWATCH_ULTRA)
static SensorPCF85063 rtc;
#else
static SensorPCF8563 rtc;
#endif
static SensorBMA423 accel;
#if defined(BOARD_TDISPLAY_PRO) || defined(BOARD_TDISPLAY_AMOLED)
// C-135: the AMOLED's touch version has a CST816 (0x15), read by the same driver. C-105: the T-Display-S3 Pro's CST226SE (0x5A, RST 13, INT 21), set up as LilyGO's CapacitiveTouch example sets it for
// the screen turned to landscape (rotation 1): its coordinates swapped and Y mirrored, so a point is the screen's own.
// Its home key, under the glass, goes home (homeKey, read in touchLoop).
#include <TouchDrvCSTXXX.hpp>
static TouchDrvCSTXXX touchPanel;
static volatile bool homeKey = false;
#elif defined(MAIN_BUS_TOUCH)
// C-98: the CoreS3 SE's touch answers with a maker's id SensorLib does not know (0x20, not FocalTech's 0x11) and so was
// refused, though it speaks the FT5x06 registers as M5GFX reads them (Touch_FT5x06): how many fingers at 0x02, the first
// finger's X and Y at 0x03-0x06. Read directly.
struct DirectFT {
  bool begin(TwoWire &w, uint8_t, int, int) { wire = &w; wire->beginTransmission(0x38); return wire->endTransmission() == 0; }
  uint8_t getPoint(int16_t *x, int16_t *y, uint8_t) {
    uint8_t b[5];
    wire->beginTransmission(0x38); wire->write(0x02);
    if (wire->endTransmission(false) != 0 || wire->requestFrom((uint8_t)0x38, (uint8_t)5) != 5) return 0;
    for (int i = 0; i < 5; i++) b[i] = wire->read();
    if ((b[0] & 0x0F) == 0) return 0;
    x[0] = ((b[1] & 0x0F) << 8) | b[2]; y[0] = ((b[3] & 0x0F) << 8) | b[4];
    return 1;
  }
  TwoWire *wire = nullptr;
};
static DirectFT touchPanel;
#elif defined(BOARD_TWATCH_ULTRA)
static TouchDrvCST92xx touchPanel;
#else
static TouchDrvFT6X36 touchPanel;
#endif
static bool havePmu = false, haveRtc = false, haveAccel = false, haveTouch = false;
static volatile bool pmuIrq = false;
static int offsetMin = 0;                 // the local offset from UTC, kept for when the server is away
static bool clockSet = false;

#if defined(BOARD_TWATCH_ULTRA)
// C-173: the fuel gauge's model of the Ultra's 1100 mAh cell, LilyGO's (LilyGoWatchUltra.cpp, BATTER_PARAMS). Without it
// the AXP2101 reports 255% -- it is written once and kept by the chip while the battery holds it.
static uint8_t GAUGE[128] = {
    0x01, 0xf5, 0x40, 0x00, 0x1b, 0x1e, 0x28, 0x0f, 0x0c, 0x1e, 0x32, 0x02, 0x14, 0x05, 0x0a, 0x04,
    0x74, 0xfc, 0xf4, 0x0d, 0x43, 0x10, 0x52, 0xfb, 0xa6, 0x01, 0xea, 0x04, 0x64, 0x06, 0x52, 0x06,
    0x18, 0x0a, 0xe7, 0x0f, 0x9f, 0x0f, 0x51, 0x09, 0xf7, 0x0e, 0x89, 0x0e, 0x71, 0x04, 0x58, 0x04,
    0x43, 0x09, 0x32, 0x0e, 0x1c, 0x0e, 0x14, 0x09, 0x04, 0x0d, 0xe9, 0x0d, 0xde, 0x03, 0xc8, 0x03,
    0xb3, 0x08, 0x9d, 0x0d, 0x79, 0x0d, 0x3a, 0x07, 0xf5, 0x9e, 0x56, 0x47, 0x36, 0x20, 0x24, 0x17,
    0xc5, 0x98, 0x7e, 0x66, 0x4e, 0x44, 0x38, 0x1a, 0x12, 0x0a, 0xf6, 0x00, 0x00, 0xf6, 0x00, 0xf6,
    0x00, 0xfb, 0x00, 0x00, 0xfb, 0x00, 0x00, 0xfb, 0x00, 0x00, 0xf6, 0x00, 0x00, 0xf6, 0x00, 0xf6,
    0x00, 0xfb, 0x00, 0x00, 0xfb, 0x00, 0x00, 0xfb, 0x00, 0x00, 0xf6, 0x00, 0x00, 0xf6, 0x00, 0xf6,
};

// C-173: the XL9555 (0x20) -- outputs high: the haptic driver's enable (6), the screen's power (7), the touch out of
// reset (8, after a low pulse) and the LoRa antenna to the watch's own (11; low gives it to the USB-C). Its registers:
// outputs at 2 and 3, directions at 6 and 7 (a 0 is an output); pins 0-7 the first port, 8-15 the second.
static void xlWrite(uint8_t reg, uint8_t v) { Wire.beginTransmission(0x20); Wire.write(reg); Wire.write(v); Wire.endTransmission(); }
static void ultraExpander() {
  const uint8_t port0 = (1 << 6) | (1 << 7), port1 = (1 << 3);    // 6, 7; 11 -- the touch's reset (8) held low first
  xlWrite(0x02, port0); xlWrite(0x03, port1);
  xlWrite(0x06, (uint8_t)~port0); xlWrite(0x07, (uint8_t)~(port1 | 1));
  delay(20);
  xlWrite(0x03, port1 | 1);                                        // the touch out of reset
  delay(60);
}
#endif

void watchPower() {
#ifdef BOARD_DIAL
  return;                                         // C-102: no power chip -- GPIO 46 holds it on (board.cpp)
#endif
  havePmu = pmu.begin(Wire, AXP2101_SLAVE_ADDRESS, board.sda, board.scl);
  if (!havePmu) return;
#if defined(BOARD_TWATCH_ULTRA)
  // C-173: the Ultra's rails, as LilyGO's LilyGoUltra::initPMU sets them -- ALDO4 is the BHI260AP's and is 1.8 V, never
  // the S3's 3.3. The GNSS (BLDO1) and the NFC reader (DLDO1) stay off until C-174 and C-176 use them. Charged at 500 mA:
  // LilyGO's warning (more heats the PMU; 0.5 C of its 1100 mAh).
  pmu.setALDO1Voltage(3300); pmu.enableALDO1();   // the SD card
  pmu.setALDO2Voltage(3300); pmu.enableALDO2();   // the screen
  pmu.setALDO3Voltage(3300); pmu.enableALDO3();   // the LoRa radio
  pmu.setALDO4Voltage(1800); pmu.enableALDO4();   // the sensor hub (1.8 V)
  pmu.setBLDO2Voltage(3300); pmu.enableBLDO2();   // the speaker's amplifier
  pmu.disableBLDO1(); pmu.disableDLDO1();
  pmu.disableDC2(); pmu.disableDC3(); pmu.disableDC4(); pmu.disableDC5(); pmu.disableCPUSLDO();
  pmu.setChargerConstantCurr(XPOWERS_AXP2101_CHG_CUR_500MA);
  pmu.setButtonBatteryChargeVoltage(3300); pmu.enableButtonBatteryCharge();   // the clock's coin cell
  if (!pmu.compareGaugeData(GAUGE, sizeof GAUGE)) Serial.printf("watch: gauge written %d\n", pmu.writeGaugeData(GAUGE, sizeof GAUGE));
  ultraExpander();
#elif !defined(BOARD_CORES3)                      // the CoreS3's rails are set in boardBegin(), as M5Unified sets them
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

#if defined(BOARD_TWATCH_ULTRA)
// C-174: the GNSS's rail (BLDO1), on only while gps.cpp wants a fix; its backup (VRTC) is always on
void watchNfcPower(bool on) {                          // C-176: the ST25R3916's rail (DLDO1)
  if (!havePmu) return;
  if (on) { pmu.setDLDO1Voltage(3300); pmu.enableDLDO1(); delay(5); } else pmu.disableDLDO1();
}
void watchGnssPower(bool on) {
  if (!havePmu) return;
  if (on) { pmu.setBLDO1Voltage(3300); pmu.enableBLDO1(); delay(5); } else pmu.disableBLDO1();
}
#endif

#if defined(BOARD_TWATCH_S3)
// C-176: the DRV2605's taps and buzzes -- its first library, triggered from here, one effect at a time (as LilyGO's
// vibrator() plays one). Its enable is the S3's BLDO2 rail and the Ultra's expander pin 6, both on by now.
static SensorDRV2605 drv;
static bool haveDrv = false;
static void hapticBegin() {
  haveDrv = drv.begin(Wire, board.sda, board.scl);
  if (haveDrv) { drv.selectLibrary(1); drv.setMode(SensorDRV2605::MODE_INTTRIG); }
}
void haptic(uint8_t effect) {
  if (!haveDrv || !effect || !cfg.sound) return;        // quiet is quiet: the sound setting holds the buzz too
  drv.setWaveform(0, min<uint8_t>(effect, 123)); drv.setWaveform(1, 0); drv.run();
}
#else
void haptic(uint8_t) {}
#endif

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
#if defined(BOARD_TDISPLAY_PRO) || defined(BOARD_TDISPLAY_AMOLED)
#if defined(BOARD_TDISPLAY_AMOLED)
  if (!board.touch) return;                                    // C-135: the version without touch
  touchPanel.setPins(-1, 21);
  pinMode(21, INPUT_PULLUP);
  for (int i = 0; i < 6 && !haveTouch; i++) { haveTouch = touchPanel.begin(touchWire, 0x15, board.sda, board.scl); if (!haveTouch) delay(15); }
#else
  touchPanel.setPins(13, 21);
  haveTouch = touchPanel.begin(touchWire, CST226SE_SLAVE_ADDRESS, board.sda, board.scl);
#endif
  if (haveTouch) {
#if defined(BOARD_TDISPLAY_PRO)
    touchPanel.setMaxCoordinates(board.width, board.height);
    touchPanel.setSwapXY(true);
    touchPanel.setMirrorXY(false, true);
#else
    pinMode(21, INPUT_PULLUP);                                 // C-135: the CST816's interrupt, low while a finger is down
#endif
    touchPanel.setHomeButtonCallback([](void *) { homeKey = true; });
  }
#elif defined(BOARD_TWATCH_ULTRA)
  // C-173: the CST9217 answers at 0x1A (some at 0x5A, as LilyGO asks); its coordinates are the portrait screen's own.
  // No step counter yet: the BHI260AP needs its firmware loaded first (a later ticket).
  touchPanel.setPins(-1, TOUCH_INT);
  pinMode(TOUCH_INT, INPUT_PULLUP);
  Wire.beginTransmission(0x1A);
  uint8_t addr = Wire.endTransmission() == 0 ? 0x1A : 0x5A;
  haveTouch = touchPanel.begin(touchWire, addr, board.sda, board.scl);
  if (haveTouch) touchPanel.setMaxCoordinates(410, 502);   // the glass's own pixels; touchRead turns them into the canvas's
#elif defined(MAIN_BUS_TOUCH)
  haveTouch = touchPanel.begin(touchWire, FT6X36_SLAVE_ADDRESS, board.sda, board.scl);   // no step counter: a BMI270
#else
  haveAccel = accel.begin(Wire, BMA423_I2C_ADDR_SECONDARY, board.sda, board.scl);
  if (haveAccel) { accel.configAccelerometer(); accel.enableAccelerometer(); accel.enablePedometer(); }
  Wire1.begin(TOUCH_SDA, TOUCH_SCL);
  haveTouch = touchPanel.begin(touchWire, FT6X36_SLAVE_ADDRESS, TOUCH_SDA, TOUCH_SCL);
#endif
  Serial.printf("watch: pmu %d clock %d steps %d touch %d\n", havePmu, haveRtc, haveAccel, haveTouch);
#if defined(BOARD_TWATCH_S3)
  hapticBegin();                                       // C-176
#endif
#if defined(BOARD_TWATCH_ULTRA)
  motionBegin();                                       // C-201: its steps come from the BHI260AP, once its firmware is up
#endif
}

bool watchBattery(Battery &b) {
  if (!havePmu) { b.present = false; return false; }
  b.present = pmu.isBatteryConnect();
  b.percent = b.present ? pmu.getBatteryPercent() : -1;
  if (b.percent > 100) { b.present = false; b.percent = -1; }   // C-173: a gauge with no model of its cell says 255
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
#if defined(BOARD_TWATCH_ULTRA)
  long count = motionSteps();                          // C-201: rising, kept across restarts, cars left out
  if (count < 0) return -1;
#else
  if (!haveAccel) return -1;
  long count = accel.getPedometerCounter();
#endif
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
// 2026-10-09: at 5% the firmware slept until the BOOT pin -- which the watch has no way to press, so it would have looked
// dead until its battery was pulled. Off through the PMU instead: the crown starts it again.
bool watchPowerOff() { if (!havePmu) return false; pmu.shutdown(); return true; }
// C-182: the cable, as the PMU sees it -- 1 in, 0 out, -1 no PMU to ask (a quick read, for the tone when it goes in)
int watchCableIn() { return havePmu ? (pmu.isVbusIn() ? 1 : 0) : -1; }
// C-161: how far a finger moves to be a swipe -- on the watch's 240 px a swipe is short (29 and 49 px were read as taps,
// 2026-10-18) and a tap moves under 10; the larger screens keep their 50
#if defined(BOARD_TWATCH_S3)                                     // the Ultra too: its touch is turned into the S3's canvas
static const int SWIPE_PX = 20;
#else
static const int SWIPE_PX = 50;
#endif
#define SWIPE SWIPE_PX
// One finger, in the screen's own coordinates. C-135: the AMOLED's CST816 repeats its last point while no finger is
// down, so it is read only while its interrupt says one is (as LilyGO's own library reads it), and turned to the
// landscape screen here: its panel is 240 wide and 536 tall.
static uint8_t touchRead(int16_t *x, int16_t *y) {
#if defined(BOARD_TDISPLAY_AMOLED)
  if (digitalRead(21)) return 0;
  int16_t rx[1], ry[1];
  if (touchPanel.getPoint(rx, ry, 1) <= 0) return 0;
  x[0] = ry[0]; y[0] = 239 - rx[0];
  return 1;
#elif defined(BOARD_TWATCH_S3)
  // C-161: as a finger lifts the watch's FT6336 often gives one false point at the very edge -- x or y 0 or 239 (seen
  // 2026-10-18: a tap at 54,34 "ended" at 239,61, a 185 px swipe, so a CARE tile tapped did the chosen one). Such a
  // point is not taken: the last real one stands, and the lift after it ends the touch there.
  static int16_t lastX = -1, lastY = -1;
  if (touchPanel.getPoint(x, y, 1) <= 0) { lastX = -1; return 0; }
#if defined(BOARD_TWATCH_ULTRA)
  // C-173: the glass's pixels to the canvas's -- shown 1.6 times larger, inset, a face lowered by screenOY (present)
  x[0] = (int16_t)((x[0] - board.screenX) / board.zoom); y[0] = (int16_t)((y[0] - board.screenY) / board.zoom) - screenOY;
#endif
  if (x[0] <= 0 || x[0] >= W - 1 || y[0] <= 0 || y[0] >= H - 1) {
    if (lastX < 0) return 0;
    x[0] = lastX; y[0] = lastY; return 1;
  }
  lastX = x[0]; lastY = y[0];
  return 1;
#else
  return touchPanel.getPoint(x, y, 1);
#endif
}
#if defined(BOARD_TWATCH_S3)
// C-171 (the user, 2026-10-21: "on the watch any screen swipes or bet swipes were finicky"): the touch read on its own,
// a hundred times a second, by a task of its own -- the loop stalls (the living face redrawn, a Wi-Fi call that blocks),
// and a quick swipe inside one stall was a single point, a tap. The watch's touch has its own bus (Wire1), so nothing
// else reads it once this runs. Each touch becomes one gesture as the finger lifts, in the screen's own coordinates
// (the panel turned half round), kept in a little queue for whichever screen or routine reads next.
struct Touch { uint8_t kind; int16_t x, y, dx, dy; uint32_t ms, at; };   // kind: 1 tap, 2 swipe, 3 hold
static Touch touchQ[8]; static volatile uint8_t touchHead = 0, touchTail = 0;
static portMUX_TYPE touchMux = portMUX_INITIALIZER_UNLOCKED;
static volatile bool fingerDown = false, swallowTouch = false;
static volatile int16_t fingerX0 = 0, fingerY0 = 0, fingerX = 0, fingerY = 0;
static volatile uint32_t fingerAt = 0;
static volatile int16_t fingerMoved = 0;                       // the farthest it has gone from where it came down
bool motionHoldsBus();                                         // motion.cpp
static void touchTask(void *) {
  bool was = false;
  for (;;) {
    if (motionHoldsBus()) { vTaskDelay(pdMS_TO_TICKS(20)); continue; }   // the motion sensor's upload has the bus
    int16_t xs[1], ys[1];
    bool on = touchRead(xs, ys) > 0;
    uint32_t now = millis();
    if (on) {
      // the panel's own coordinates ARE the screen's (2026-10-21: a tap on the top-right tile opened the bottom-left one
      // while they were turned half round -- the C-161 mirror was the mistake, and the "reversed" swipes with it)
      int16_t x = xs[0], y = ys[0];
      if (!was) { was = true; fingerX0 = x; fingerY0 = y; fingerAt = now; fingerMoved = 0; swallowTouch = false; }
      fingerX = x; fingerY = y;
      int16_t m = max(abs(x - fingerX0), abs(y - fingerY0));
      if (m > fingerMoved) fingerMoved = m;
      fingerDown = true;
    } else if (was) {
      was = false; fingerDown = false;
      if (!swallowTouch) {
        Touch t; t.x = fingerX0; t.y = fingerY0; t.dx = fingerX - fingerX0; t.dy = fingerY - fingerY0;
        t.ms = now - fingerAt; t.at = now;
        bool swipe = abs(t.dx) > SWIPE_PX || abs(t.dy) > SWIPE_PX;
        t.kind = swipe ? 2 : t.ms > 700 ? 3 : 1;
        portENTER_CRITICAL(&touchMux);
        uint8_t next = (touchHead + 1) % 8;
        if (next != touchTail) { touchQ[touchHead] = t; touchHead = next; }
        portEXIT_CRITICAL(&touchMux);
      }
      swallowTouch = false;
    }
    vTaskDelay(pdMS_TO_TICKS(10));
  }
}
static bool touchTake(Touch &t) {
  portENTER_CRITICAL(&touchMux);
  bool got = touchTail != touchHead;
  if (got) { t = touchQ[touchTail]; touchTail = (touchTail + 1) % 8; }
  portEXIT_CRITICAL(&touchMux);
  return got;
}
static void touchDrop() { Touch t; while (touchTake(t)) {} }
bool watchTouchDown() { return fingerDown; }
// the user, 2026-10-28 (the harp's strings plucked, the flute's holes held): where the finger is now, in the canvas's
// coordinates -- and that touch kept from becoming a gesture as it lifts, so a glissando is never a swipe or a hold
bool watchFinger(int &x, int &y) { x = fingerX; y = fingerY; if (fingerDown) swallowTouch = true; return fingerDown; }
#else
bool watchTouchDown() { int16_t x[1], y[1]; return haveTouch && touchRead(x, y) > 0; }
bool watchFinger(int &x, int &y) { int16_t xs[1], ys[1]; bool on = haveTouch && touchRead(xs, ys) > 0; x = xs[0]; y = ys[0]; return on; }
#endif

// C-134: a routine's own screen reads the touch itself (the loop, and so touchLoop, waits while it runs): a swipe
// either way turns, a tap presses, a hold goes back -- each reported when the finger lifts.
static int crownPoll();                                        // below, beside crownLoop
static bool across = false;                                    // the last swipe went across, not up or down
bool watchGestureAcross() { return across; }
int watchGesture() {
  static bool was = false; static int16_t x0, y0, x1, y1; static uint32_t at = 0;
  // C-161: inside a routine the loop waits, and crownLoop with it -- so the crown is read here, and goes back
  if (crownPoll() == 1) return -2;
  if (!haveTouch) return 0;
#if defined(BOARD_TWATCH_S3)
  Touch g;                                                     // C-171: the task's, in the screen's own coordinates
  if (!touchTake(g)) return 0;
  if (g.kind == 3) return -2;
  if (g.kind == 1) return 2;
  across = abs(g.dx) > abs(g.dy);                              // the axis of this very gesture, for watchGestureAcross
  return across ? (g.dx < 0 ? 1 : -1) : (g.dy < 0 ? 1 : -1);
#endif
  int16_t x[1], y[1];
  bool on = touchRead(x, y) > 0;
  if (on) { if (!was) { was = true; at = millis(); x0 = x[0]; y0 = y[0]; } x1 = x[0]; y1 = y[0]; return 0; }
  if (!was) return 0;
  was = false;
  int dx = x1 - x0, dy = y1 - y0;
#if defined(BOARD_TWATCH_S3)
  dx = -dx; dy = -dy;                                          // C-161: the watch's panel is turned half round (touchLoop)
#endif
  across = abs(dx) > SWIPE && abs(dx) > abs(dy);
  if (across) return dx < 0 ? 1 : -1;
  if (abs(dy) > SWIPE) return dy < 0 ? 1 : -1;
  return millis() - at > 700 ? -2 : 2;
}

String watchStatus() {
  int16_t x[1], y[1];
#if defined(BOARD_TWATCH_S3)
  bool on = fingerDown; x[0] = fingerX; y[0] = fingerY;        // C-171: the task's, in the screen's own coordinates
#else
  bool on = haveTouch && touchRead(x, y) > 0;
#endif
  return "WATCH pmu " + String(havePmu) + " clock " + String(haveRtc) + " steps " + String(haveAccel) + " touch " +
         String(haveTouch) + (on ? " finger " + String(x[0]) + "," + String(y[0]) : " no finger");
}

static bool onTalk(int x, int y) { int cx, cy, r = talkReach(); talkSpot(cx, cy); int dx = x - cx, dy = y - cy; return dx * dx + dy * dy <= r * r; }

static void touchTap(int x, int y, uint32_t now);
static void touchLoop(uint32_t now) {
#if defined(BOARD_TDISPLAY_AMOLED)
  // C-135: the CST816 asleep at start answers no one; the first finger wakes it, and the driver starts then
  if (!haveTouch && board.touch && !digitalRead(21)) haveTouch = touchPanel.begin(touchWire, 0x15, board.sda, board.scl);
#endif
  if (!haveTouch) return;
#if defined(BOARD_TWATCH_S3)
  // C-171: the task reads the finger; here, TALK when held, then every gesture it has kept
  {
    static bool started = false;
    if (!started) { started = true; xTaskCreatePinnedToCore(touchTask, "touch", 3072, nullptr, 2, nullptr, 0); }
    bool atFace = screen == HOME && page == FACE_PAGE;
    static bool heard = false;                                 // this touch already started a talk
    if (!fingerDown) heard = false;
    else if (!heard && !asleep && atFace && talkCan() && onTalk(fingerX0, fingerY0) &&
             (!faceHasDaemon() || (millis() - fingerAt > 350 && fingerMoved < 20))) {   // the daemon held a beat; TALK at once
      heard = true; swallowTouch = true;
      talking = true; draw();
      talkHold();                                              // returns once the finger lifts and the answer is said
      talking = false; lastInput = millis(); dirty = true;
      return;
    }
    Touch g;
    while (touchTake(g)) {
      if (asleep) { touchDrop(); return; }                     // only the crown wakes the watch (C-79)
      if (g.kind == 2 && screen == HOME && page == FACE_PAGE) { wake(); openLaunch(0); }   // C-172: off the face, the tiles
      else if (g.kind == 2) {
        if (abs(g.dx) > abs(g.dy)) turn(g.dx < 0 ? 1 : -1);   // right to left: the next
        else turn(g.dy < 0 ? 1 : -1);
      } else if (g.kind == 3) back();
      else touchTap(g.x, g.y, g.at);
    }
    return;
  }
#endif
  int16_t xs[1], ys[1];
  bool pressed = touchRead(xs, ys) > 0;
#if defined(BOARD_TDISPLAY_PRO)
  if (homeKey) {                                               // C-105: the home key under the glass goes home -- but,
    homeKey = false;                                           // asleep, it does nothing (C-79: no touch wakes it in a pocket)
    static uint32_t homeAt = 0;
    if (!asleep && now - homeAt > 400) { homeAt = now; wake(); screen = HOME; page = homePage(); dirty = true; }
    return;
  }
#endif
  if (pressed) {
#ifdef MAIN_BUS_TOUCH
    int x = xs[0] - board.screenX, y = ys[0] - board.screenY;   // C-102: the Dial draws in a square inside its circle
#else
    int x = W - 1 - xs[0], y = H - 1 - ys[0];
#endif
    auto listen = [&]() {                                      // C-66: held, it listens (talk.cpp)
      talking = true; draw();
      talkHold();                                              // returns once the finger lifts and the answer is said
      talking = false; down = false; lastInput = millis(); dirty = true;
    };
    bool atFace = screen == HOME && page == FACE_PAGE;
    if (!down) {
      down = true; downAt = now; xFrom = x; yFrom = y;
      if (asleep) return;
      if (atFace && !faceHasDaemon() && onTalk(x, y) && talkCan()) listen();   // the TALK button: at once
    }
    // C-162: on a face with the daemon, the daemon held a beat listens -- so a tap on it is only a tap
    else if (!asleep && atFace && faceHasDaemon() && now - downAt > 350 && abs(x - xFrom) < 20 && abs(y - yFrom) < 20 &&
             onTalk(xFrom, yFrom) && talkCan()) listen();
    xNow = x; yNow = y;
    return;
  }
  if (!down) return;
  down = false;
  if (talking) { talking = false; dirty = true; return; }      // let go of TALK: C-66 sends what was heard
  if (asleep) return;                                          // only the crown wakes the watch (C-79)
  int dx = xNow - xFrom, dy = yNow - yFrom;
  // swipe left: the next page, as the dial turned right -- on the watch the other way round (the user, 2026-10-18:
  // "reverse the swipe tab order -- right to left swipe shows settings but the should be the left to right swipe")
#if defined(BOARD_TWATCH_S3)
  if (abs(dx) > SWIPE && abs(dx) > abs(dy)) turn(screen == HOME ? (dx < 0 ? -1 : 1) : (dx < 0 ? 1 : -1));
#else
  if (abs(dx) > SWIPE && abs(dx) > abs(dy)) turn(dx < 0 ? 1 : -1);
#endif
  else if (abs(dy) > SWIPE) turn(dy < 0 ? 1 : -1);
  else if (now - downAt > 700) back();
  else touchTap(xFrom, yFrom, now);
}

// a tap, where it came down: a CARE tile or a list's row or a grid's tile done where it is; on the face, two open CARE
static void touchTap(int x, int y, uint32_t now) {
  int off, tile;
  if (dreamTap(x, y)) { lastInput = millis(); return; }            // its LISTEN, the dream aloud
  if (!dreamShowing() && quickTap(x, y)) { lastInput = millis(); return; }   // C-206: a button under the face
  if (dreamShowing()) { dreamDismiss(); lastInput = now; return; }   // C-200: good morning
  if (readShowing()) { readDismiss(); lastInput = now; return; }     // C-203: the read, put away
  if (screen == CARE_GRID && (tile = careGridAt(x, y)) >= 0) { gridAt = tile; press(); return; }   // C-163
  if (screen == HOME && page == FACE_PAGE) {                   // C-163: a double tap on the face opens CARE; one does nothing
    static uint32_t tappedAt = 0;
    if (tappedAt && now - tappedAt < 450) { tappedAt = 0; if (st.carrying && witchingNow()) openAsAbove(); else if (st.carrying) openCareGrid(); else say("No daemon here"); }   // DRAFT; C-237: in the hour, AS ABOVE SO BELOW
    else { tappedAt = now; toggleMask(); }                       // C-240: on Halloween a tap takes the mask off (or puts it on)
    return;
  }
  if (tapAt(x, y, off)) { pick(off); press(); return; }        // C-161, C-172: a row or a tile, tapped, opens that one
  if (tapAt(x, y, off, true)) return;                          // C-172: a tap between a grid's tiles does nothing
  press();
}

// ---- the crown: a short press wakes the watch, or goes back; a long one, asleep (the PMU powers off on a longer hold)
// the crown, read once wherever it is asked: 1 a short press, 2 a long one, 0 neither
static int crownPoll() {
  static uint32_t askedAt = 0;
  uint32_t now = millis();
  if (!havePmu) return 0;
  if (PMU_IRQ >= 0 ? !pmuIrq : now - askedAt < 100) return 0;   // C-75: no interrupt pin -- ask ten times a second
  askedAt = now; pmuIrq = false;
  pmu.getIrqStatus();
  bool shortPress = pmu.isPekeyShortPressIrq(), longPress = pmu.isPekeyLongPressIrq();
  pmu.clearIrqStatus();
  return shortPress ? 1 : longPress ? 2 : 0;
}
static void crownLoop(uint32_t now) {
  int c = crownPoll();
  bool shortPress = c == 1, longPress = c == 2;
  if (shortPress) {                                            // C-161: the crown is a press, not a dial
    static uint32_t lastShort = 0;
    if (wake()) lastShort = now;                               // asleep, it only wakes (to home)
    else if (lastShort && now - lastShort < 500) { lastShort = 0; goHomeNow(); }   // pressed twice: home, the face
    else { lastShort = now; back(); }
  }
  else if (longPress && !asleep) sleepNow();
}

#if defined(BOARD_TWATCH_ULTRA)
// C-201: what the motion sensor noticed -- the wrist lifted wakes the screen; a shake wakes the daemon (or, awake, it
// hops: glad of it); a double tap opens CARE; and the daemon answers a change in how you move (once a minute at most)
static void motionLoop(uint32_t now) {
  if (motionTakeRaise() && asleep) wake();
  if (!casinoAtTable() && motionTakeShake()) {           // at the reels a shake pulls the lever (casino.cpp)
    if (asleep) wake(); else { hopUntil = now + 480; lastInput = now; dirty = true; }
  }
  if (motionTakeDoubleTap() && st.carrying) { wake(); lastInput = now; if (witchingNow()) openAsAbove(); else openCareGrid(); }   // C-237
  MotionKind k; static uint32_t saidAt = 0;
  if (motionTakeKindChange(k)) {
    if (k == M_WALKING || k == M_RUNNING) intuitionMoment(READ_WALK);   // C-203: a walk begun -- perhaps a read of the way
    if (!asleep && st.carrying && now - saidAt > 60000) {
      const char *word = k == M_WALKING ? "WALKING TOGETHER" : k == M_RUNNING ? "RUNNING!" : k == M_CYCLING ? "WHEELS!"
                       : k == M_VEHICLE ? "ALONG FOR THE RIDE" : nullptr;   // DRAFT
      if (word) { saidAt = now; say(word); hopUntil = now + 480; }
    }
  }
}
#endif

void watchLoop(uint32_t now) {
  touchLoop(now);
  crownLoop(now);
#if defined(BOARD_TWATCH_ULTRA)
  motionLoop(now);
#endif
  static uint32_t tickAt = 0;                                   // the face's clock and steps: once a second is enough
  if (!asleep && screen == HOME && page == FACE_PAGE && now - tickAt > 1000) { tickAt = now; dirty = true; }
}

#endif
