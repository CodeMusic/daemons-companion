// C-40, C-41: the board's sounds -- the interactions in the day's key, a tune for each routine (the ring moving with
// it), and the wake jingle from DAEMONS' title theme.
#pragma once
#include <Arduino.h>

void soundBegin();
void soundIdle();     // every pass of the loop: the M5GO and Fire let their DAC go once nothing has played a moment
void soundLoop();     // C-121: every pass of the loop instead -- the tune task's dance shown, then soundIdle()
void soundTap();      // C-121: a press, heard the moment it lands
bool soundQuiet();    // C-121: nothing holding the speaker's memory (the M5GO and Fire's DAC let go)
void soundPause();    // C-74: the StickS3 lends its codec to the microphone
void soundResume();
void es8311Mic();
void soundSettings(bool on, int volume);   // C-43: from the site
void soundDay(const String &note);         // the day's note: "C" (Sunday) .. "B" (Saturday)
void soundEdition(const String &edition); // C-164: the save's instrument -- the harp for CONTENT, the flute for CONTEXT
void soundTurn(int dir);                   // the dial: right an ascending pair, left a descending one
void soundSelect();                        // one tone, the day's own
void soundBack();                          // the day's note an octave down, softly
void soundRoutine(const char *type);       // a routine starting: its tune, the ring dancing to it
void soundGameRoutine(const String &name, const String &type, uint32_t rgb);   // C-68: a game routine, the ring its colour
void soundPcm(const int16_t *samples, size_t n);
void soundInstrumentNote(int midi, int ms);   // C-164: one note, MIDI (C4 60), on the save's instrument where there is one
void playNoteSemis(int semis, int ms);     // C-70: one note, this many semitones over the day's note   // C-66: a voice, 16 kHz mono, streamed in
uint32_t soundRateTest();
void soundDacRate(int hz);                  // C-95: the check only                  // C-95: ms to play 2 s of samples (RATETEST down the cable)
void soundWake();                          // waking from sleep: the title theme's opening, quickened (C-121: from its task)
void soundCare(int what);                  // C-13, C-114: fed (0), watered (1), trained (2), put to bed (3) -- a phrase of the game (C-121: from its task)
void soundAccomplish(int kind, int species, int day);   // C-50: 0 a step, 1 a milestone, 2 the whole goal
void soundUndo(int species, int day);                   // C-50: a step undone -- its tune reversed
void soundReelTick();                      // C-149: a reel ticking past (at most every 70 ms)
void soundReelStop(int reel);              // C-149: a reel stopping, 0..2
void soundCoin(int i);                     // C-149: a coin counted in
void soundSlots(int what, const String &look);   // C-149: 0 the lever, 1 a loss, 2 a win, 3 a big win, 4 the jackpot; C-151: 5 a cheer
