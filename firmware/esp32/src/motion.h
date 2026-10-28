#pragma once
// C-201: the T-Watch Ultra's BHI260AP -- Bosch's motion sensor with its own processor: the steps, what kind of moving
// (still, walking, running, cycling, in a vehicle), the wrist lifted, and a shake or a double tap read from its
// accelerometer. Every other board has none of it (the stubs say so).
#include <Arduino.h>

enum MotionKind : uint8_t { M_UNKNOWN, M_STILL, M_WALKING, M_RUNNING, M_CYCLING, M_VEHICLE };

void motionBegin();                 // after watchBegin(): the sensor's firmware goes up from a task of its own
bool motionReady();                 // the firmware is running and the sensors are on
long motionSteps();                 // steps counted, rising, kept across restarts (cars left out); -1 not yet
MotionKind motionKind();            // what the wrist is doing now
uint32_t motionStillFor();          // how long the wrist has been still, ms (C-200: the night)
uint32_t motionStirs();             // C-200: every stir counted, rising -- moving off stillness, or the wrist lifted
bool motionTakeRaise();             // the wrist was lifted to look (since last asked)
bool motionTakeShake();             // it was shaken
bool motionTakeDoubleTap();         // it was tapped twice
bool motionTakeKindChange(MotionKind &now);   // the kind of moving changed (since last asked)
String motionStatus();              // MOTION? down the cable
