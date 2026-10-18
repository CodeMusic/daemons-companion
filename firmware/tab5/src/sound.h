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
void soundCare(int what);                  // C-114, C-118: fed 0, watered 1, trained 2, put to bed 3 -- tunes.h's phrases
void soundStep(bool undone);
// C-158: THE CASINO's, as the boards play them (esp32 sound.cpp soundSlots): 0 the lever, 1 a loss, 2 a small win, 3 a big
// one, 4 the jackpot, 5 a cheer -- a big win on a holiday its own (look: pumpkins, presents, fireworks, hearts)
void soundSlots(int what, const String &look);
void soundSong(const int *midi, const int *ms, int n);   // C-156: a SONGBOOK song, its notes (MIDI) for their lengths
// C-99: a voice, 16-bit mono PCM; the buffer (PSRAM) is the sound's to free once it is over or stopped
void soundVoice(int16_t *pcm, size_t samples, int rate);
void soundVoiceStop();
bool soundVoicePlaying();               // a step done (its tune), or undone (reversed) -- the carried daemon's own
