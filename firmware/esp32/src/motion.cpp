// C-201 (the user, 2026-10-28, by multiple choice): the T-Watch Ultra's BHI260AP. Its own processor runs Bosch's
// firmware, which is not kept on it: the APP30 image (SensorLib's, about 107 KB) goes up over I2C at every start, from a
// task of its own so the screen is not kept waiting, and then the task reads the sensor every 20 ms. Turned on:
//
//   STEP_COUNTER            the steps since the image started -- kept across restarts here (Preferences "motion"), so
//                           the day's count does not fall to nought when the watch does; steps taken while the sensor
//                           says IN A VEHICLE are left out (a bumpy road is not a walk)
//   ACTIVITY_RECOGNITION    still, walking, running, cycling, in a vehicle -- the daemon answers each change (ui.cpp)
//   WRIST_TILT_GESTURE      the wrist turned up to look: the screen wakes
//   ACCEL_PASSTHROUGH       100 a second, for what Bosch's image has no sensor for: a shake (four hard swings inside a
//                           second) and a double tap (two sharp knocks a quarter of a second apart, nothing around them).
//                           The thresholds are first guesses, to be tuned on the wrist.
#include "motion.h"

#if !defined(BOARD_TWATCH_ULTRA)

void motionBegin() {}
bool motionReady() { return false; }
bool motionHoldsBus() { return false; }
long motionSteps() { return -1; }
MotionKind motionKind() { return M_UNKNOWN; }
uint32_t motionStillFor() { return 0; }
uint32_t motionStirs() { return 0; }
bool motionTakeRaise() { return false; }
bool motionTakeShake() { return false; }
bool motionTakeDoubleTap() { return false; }
bool motionTakeKindChange(MotionKind &) { return false; }
String motionStatus() { return "MOTION none"; }

#else

#include <Wire.h>
#include <Preferences.h>
#include <SensorBHI260AP.hpp>
#define BOSCH_APP30_SHUTTLE_BHI260_FW
#include <BoschFirmware.h>

static SensorBHI260AP bhy;
static volatile bool ready = false, raised = false, shaken = false, tapped2 = false, kindChanged = false;
static volatile uint32_t rawSteps = 0, stillSince = 0, stirs = 0;
static volatile MotionKind kind = M_UNKNOWN;
static long before = 0, excluded = 0;                      // the steps kept when rawBase was the count; car steps since
static uint32_t rawBase = 0;                               // the sensor's count when `before` was last kept
static bool inVehicle = false; static uint32_t vehicleFrom = 0;   // the sensor's count when a vehicle began
static float accelScale = 1.0f / 4096;
static String why = "starting";

static void onSteps(uint8_t, uint8_t *data, uint32_t, uint64_t *, void *) { rawSteps = bhy2_parse_step_counter(data); }

static void onActivity(uint8_t, uint8_t *data, uint32_t size, uint64_t *, void *) {
  if (size < 2) return;
  uint16_t bits = data[0] | (data[1] << 8);
  MotionKind k = kind;
  if (bits & BHY2_STILL_ACTIVITY_STARTED) k = M_STILL;
  if (bits & BHY2_WALKING_ACTIVITY_STARTED) k = M_WALKING;
  if (bits & BHY2_RUNNING_ACTIVITY_STARTED) k = M_RUNNING;
  if (bits & BHY2_ON_BICYCLE_ACTIVITY_STARTED) k = M_CYCLING;
  if (bits & BHY2_IN_VEHICLE_ACTIVITY_STARTED) k = M_VEHICLE;
  if (k == kind) return;
  if (k == M_VEHICLE) { inVehicle = true; vehicleFrom = rawSteps; }
  else if (inVehicle) { excluded += (long)rawSteps - (long)vehicleFrom; inVehicle = false; }
  if (kind == M_STILL && k != M_STILL) stirs++;           // C-200: off stillness, a stir
  stillSince = k == M_STILL ? millis() : 0;
  kind = k; kindChanged = true;
}

static void onTilt(uint8_t, uint8_t *, uint32_t, uint64_t *, void *) { raised = true; stirs++; }

// a shake: four swings past 2.2 g inside a second; a double tap: two knocks (a jump of 0.9 g from one sample to the
// next) 120-450 ms apart, with no other knock for 250 ms before the first -- and no shake around them
static void onAccel(uint8_t, uint8_t *data, uint32_t, uint64_t *, void *) {
  struct bhy2_data_xyz v; bhy2_parse_xyz(data, &v);
  float g = sqrtf((float)v.x * v.x + (float)v.y * v.y + (float)v.z * v.z) * accelScale;
  static float last = 1; static uint32_t swings[4] = {0}; static int swingAt = 0; static uint32_t swingLast = 0, shakeAt = 0;
  static uint32_t knockA = 0, knockLast = 0;
  uint32_t now = millis();
  if (g > 2.2f && now - swingLast > 60) {
    swingLast = now; swings[swingAt] = now; swingAt = (swingAt + 1) % 4;
    if (now - swings[swingAt] < 1000 && swings[swingAt] && now - shakeAt > 1500) { shaken = true; shakeAt = now; knockA = 0; }
  }
  if (fabsf(g - last) > 0.9f && now - shakeAt > 1500) {
    if (knockA && now - knockA >= 120 && now - knockA <= 450) { tapped2 = true; knockA = 0; }
    else if (now - knockLast > 250) knockA = now;
    else knockA = 0;                                       // knocks crowding in: not a tap
    knockLast = now;
  }
  last = g;
}

// the firmware's upload holds the I2C bus for some seconds, and anything else on it between its chunks breaks it (on the
// glass, 2026-10-28: an IO error after a minute, with the touch, the power chip and the clock all read meanwhile). So it
// goes up here, in setup, before the loop or the touch task touch the bus -- at 400 kHz (every chip on this bus takes it;
// 11 s at 100) and tried three times -- and the task only reads what it sends after.
static volatile bool uploading = false;
bool motionHoldsBus() { return uploading; }
static bool upload() {
  bhy.setFirmware(bosch_firmware_image, bosch_firmware_size, false);
  bhy.setBootFromFlash(false);
  uploading = true; delay(30);                             // a touch read already in hand finishes first
  uint32_t was = Wire.getClock(); Wire.setClock(400000);
  bool up = false;
  for (int k = 0; k < 3 && !up; k++) {
    uint32_t t0 = millis();
    up = bhy.begin(Wire, BHI260AP_SLAVE_ADDRESS_L);
    Serial.printf("motion: upload %s in %lu ms (try %d)\n", up ? "done" : "failed", (unsigned long)(millis() - t0), k + 1);
  }
  Wire.setClock(was);
  uploading = false;
  if (!up) { why = String("not found: ") + bhy.getError(); Serial.println("motion: " + why); }
  return up;
}
static void motionTask(void *) {
  bhy.setRemapAxes(SensorBHI260AP::TOP_LAYER_BOTTOM_RIGHT_CORNER);   // as LilyGO's own library places it on the Ultra
  accelScale = bhy.getScaling(SensorBHI260AP::ACCEL_PASSTHROUGH);
  if (accelScale <= 0) accelScale = 1.0f / 4096;
  bhy.onResultEvent(SensorBHI260AP::STEP_COUNTER, onSteps);
  bhy.onResultEvent(SensorBHI260AP::ACTIVITY_RECOGNITION, onActivity);
  bhy.onResultEvent(SensorBHI260AP::WRIST_TILT_GESTURE, onTilt);
  bhy.onResultEvent(SensorBHI260AP::ACCEL_PASSTHROUGH, onAccel);
  bhy.configure(SensorBHI260AP::STEP_COUNTER, 1, 0);
  bhy.configure(SensorBHI260AP::ACTIVITY_RECOGNITION, 1, 0);
  bhy.configure(SensorBHI260AP::WRIST_TILT_GESTURE, 1, 0);
  bhy.configure(SensorBHI260AP::ACCEL_PASSTHROUGH, 50, 0);   // 50 Hz: enough for a shake or a tap, and half the FIFO
  ready = true; why = "running";
  Serial.println("motion: the BHI260AP is running");
  for (;;) { bhy.update(); vTaskDelay(pdMS_TO_TICKS(40)); }
}

void motionBegin() {
  Preferences p; p.begin("motion", true); before = p.getLong("before", 0); p.end();
  if (upload()) xTaskCreatePinnedToCore(motionTask, "motion", 8192, nullptr, 1, nullptr, 1);   // on the loop's core: on core 0 it starved the idle task (a TASK_WDT reset, on the glass)
}
bool motionReady() { return ready; }
long motionSteps() {
  if (!ready) return -1;
  uint32_t raw = rawSteps;
  long inCar = inVehicle ? (long)raw - (long)vehicleFrom : 0;
  long total = before + (long)raw - (long)rawBase - excluded - inCar;
  if (total - before >= 50) {                              // kept every fifty steps: a restart loses fewer than that
    Preferences p; p.begin("motion", false); p.putLong("before", total); p.end();
    before = total; rawBase = raw; excluded = 0;
    if (inVehicle) vehicleFrom = raw;                      // the car's steps so far are already left out of `before`
  }
  return total;
}
MotionKind motionKind() { return kind; }
uint32_t motionStillFor() { return kind == M_STILL && stillSince ? millis() - stillSince : 0; }
uint32_t motionStirs() { return stirs; }
bool motionTakeRaise() { bool r = raised; raised = false; return r; }
bool motionTakeShake() { bool r = shaken; shaken = false; return r; }
bool motionTakeDoubleTap() { bool r = tapped2; tapped2 = false; return r; }
bool motionTakeKindChange(MotionKind &now) { bool r = kindChanged; kindChanged = false; now = kind; return r; }
String motionStatus() {
  static const char *K[] = { "unknown", "still", "walking", "running", "cycling", "vehicle" };
  return "MOTION " + why + " steps " + String(motionSteps()) + " raw " + String(rawSteps) + " kind " + K[kind] +
         " still " + String(motionStillFor() / 1000) + "s";
}

#endif
