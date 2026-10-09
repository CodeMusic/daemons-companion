// C-40, C-41: the board's sounds -- the interactions in the day's key, a tune for each routine (the ring moving with
// it), and the wake jingle from DAEMONS' title theme.
#pragma once
#include <Arduino.h>

void soundBegin();
void soundIdle();     // every pass of the loop: the M5GO and Fire let their DAC go once nothing has played a moment
void soundPause();    // C-74: the StickS3 lends its codec to the microphone
void soundResume();
void es8311Mic();
void soundSettings(bool on, int volume);   // C-43: from the site
void soundDay(const String &note);         // the day's note: "C" (Sunday) .. "B" (Saturday)
void soundTurn(int dir);                   // the dial: right an ascending pair, left a descending one
void soundSelect();                        // one tone, the day's own
void soundBack();                          // the day's note an octave down, softly
void soundRoutine(const char *type);       // a routine starting: its tune, the ring dancing to it
void soundGameRoutine(const String &name, const String &type, uint32_t rgb);   // C-68: a game routine, the ring its colour
void soundPcm(const int16_t *samples, size_t n);
void playNoteSemis(int semis, int ms);     // C-70: one note, this many semitones over the day's note   // C-66: a voice, 16 kHz mono, streamed in
void soundWake();                          // waking from sleep: the title theme's opening, quickened
void soundCare(int what);                  // C-13: fed (0), watered (1), trained (2) -- a little glad phrase
void soundAccomplish(int kind, int species, int day);   // C-50: 0 a step, 1 a milestone, 2 the whole goal
void soundUndo(int species, int day);                   // C-50: a step undone -- its tune reversed
