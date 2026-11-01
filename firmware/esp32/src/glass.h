#pragma once
// C-262: the T-Glass's one screen (glass.cpp), chosen in the app's GLASSES; elsewhere these do nothing
#include <Arduino.h>
#include <ArduinoJson.h>

void glassFromState(JsonVariantConst doc);   // the state's `glass` and its clock
void glassLoop(uint32_t now);                // the touch button, the moment's end, HOME's minute
void glassDraw();                            // in place of draw()'s screens
bool glassDark();                            // DARK: the screen off
void glassTap(); void glassTwice(); void glassHold();
String glassCable(const String &arg);        // GLASS ... down the cable
void glassPanelSettings();                   // display.cpp: the turn, mirror, row and brightness kept in flash
