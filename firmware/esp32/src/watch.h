#pragma once
// C-71: the T-Watch S3's own parts -- its power chip (the AXP2101, which switches every rail, the screen's included),
// its clock (PCF8563), its step counter (BMA423), its touch screen (FT6336) and its one button, the crown (the PMU's
// power key). C-75: the M5Stack CoreS3 has the same power chip, a clock that speaks the PCF8563's registers and the same
// touch, so it uses this file too (no step counter). On the T-Embeds every call here does nothing, so the rest of the
// firmware calls them freely.
#include <Arduino.h>
#include <time.h>
#include "battery.h"

void watchPower();                        // in boardBegin(): the rails on, before the screen starts
void watchBegin();                        // after the screen: the clock, the steps, the touch, the crown
void watchLoop(uint32_t now);             // the touch and the crown, every pass of the loop
bool watchBattery(Battery &b);            // the PMU's view of the cell
void watchSetClock(time_t epoch, int offsetMinutes);   // from the server's state: the clock, and the local offset
bool watchLocalTime(struct tm &out);      // the local time, if the clock has been set
long watchSteps();                        // today's steps, -1 without a step counter
bool watchTalking();                      // push to talk held on the face (C-66 listens)
bool watchTouchDown();                    // a finger on the screen now (talk.cpp listens while it stays)
