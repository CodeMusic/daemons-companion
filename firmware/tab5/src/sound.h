#pragma once
// C-94: the Tab5's sounds -- the same notes as every handheld (firmware/common/tunes.h), on its own speaker: the title's
// opening at start, a tone for a tap, a step's own tune when one is done and its reverse when undone. Played on a task of
// their own, so a tune never holds up the screen.
#include <Arduino.h>

void soundBegin();
void soundFromState();                     // the volume, on or off, and the day's note -- from the kept state
void soundWake();                          // the title's opening, in C#
void soundSelect();                        // a tap: the day's note, an octave up
void soundBack();                          // back: the day's note, an octave down, softly
void soundStep(bool undone);
// C-99: a voice, 16-bit mono PCM; the buffer (PSRAM) is the sound's to free once it is over or stopped
void soundVoice(int16_t *pcm, size_t samples, int rate);
void soundVoiceStop();
bool soundVoicePlaying();               // a step done (its tune), or undone (reversed) -- the carried daemon's own
