// C-40, C-41: the board's sounds -- the interactions in the day's key, a tune for each routine (the ring moving with
// it), and the wake jingle from DAEMONS' title theme.
#pragma once
#include <Arduino.h>

void soundBegin();
void soundSettings(bool on, int volume);   // C-43: from the site
void soundDay(const String &note);         // the day's note: "C" (Sunday) .. "B" (Saturday)
void soundTurn(int dir);                   // the dial: right an ascending pair, left a descending one
void soundSelect();                        // one tone, the day's own
void soundBack();                          // the day's note an octave down, softly
void soundRoutine(const char *type);       // a routine starting: its tune, the ring dancing to it
void soundWake();                          // waking from sleep: the title theme's opening, quickened
void soundCare(int what);                  // C-13: fed (0), watered (1), trained (2) -- a little glad phrase
