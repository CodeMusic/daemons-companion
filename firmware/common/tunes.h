// C-94: the companion's tunes, one copy for every device (the user, 2026-10-09: "the sounds should also be the same for
// all devices"). The handhelds (firmware/esp32/src/sound.cpp) and the Tab5 (firmware/tab5/src/sound.cpp) play these
// notes, each on its own speaker; nothing here touches hardware.
//
// A tune is notes in semitones over a base: the DAY'S NOTE for everything (vision 9.21: Sunday C ... Saturday B, the
// octave above middle C), except the wake jingle, which is the title's opening in the title's own C# whatever the day.
#pragma once
#include <stdint.h>

struct Note { int8_t semis; uint16_t ms; };          // semis from the base; 127 is a rest

// C-40: a routine's tune -- about six notes, its own shape
static const Note TUNE_FLARE[]      = { {0, 60}, {4, 60}, {7, 60}, {12, 60}, {16, 60}, {19, 140} };   // a flare going up
static const Note TUNE_WHISPER[]    = { {12, 110}, {7, 110}, {9, 110}, {4, 110}, {7, 110}, {0, 200} }; // said softly, settling
static const Note TUNE_TOUCHSTONE[] = { {0, 70}, {127, 50}, {0, 70}, {7, 90}, {127, 40}, {12, 160} }; // a knock, and an answer
static const Note TUNE_LONGWAVE[]   = { {0, 120}, {-5, 120}, {0, 120}, {-5, 120}, {0, 120}, {7, 200} }; // a long slow wave
static const Note TUNE_UPLINK[]     = { {0, 70}, {7, 70}, {12, 70}, {7, 70}, {14, 70}, {12, 160} };   // looking, finding

// C-41: the title theme's opening phrase (mus_title.mid, its first track: C#4 held, up to G#4, then F#-D#-F#, onto a
// long F), quickened to a second and a half and an octave up -- at every start, and on waking
static const Note TUNE_WAKE[]       = { {0, 190}, {7, 330}, {5, 50}, {2, 140}, {5, 190}, {4, 470} };
static const int WAKE_BASE = 61 + 12;                // C#5

// C-13: tending it -- fed (a full chord, settling), watered (a splash and a sip), trained (up, and up)
static const Note TUNE_CARE[3][3] = { { {0, 70}, {4, 70}, {7, 150} }, { {7, 60}, {12, 60}, {9, 140} },
                                      { {0, 60}, {7, 60}, {12, 150} } };

// The day's note as MIDI: "C" (Sunday) .. "B" (Saturday), in the octave above middle C
inline int dayRoot(char note) {
  static const char NAMES[] = "C D EF G A B";        // C=0 D=2 E=4 F=5 G=7 A=9 B=11
  for (int i = 0; i < 12; i++) if (NAMES[i] == note) return 72 + i;
  return 72;
}
inline float noteHz(int midi) {                      // without powf, so this header needs nothing
  static const float SEMI[12] = { 1.0f, 1.059463f, 1.122462f, 1.189207f, 1.259921f, 1.334840f, 1.414214f, 1.498307f,
                                  1.587401f, 1.681793f, 1.781797f, 1.887749f };
  int d = midi - 69, oct = d >= 0 ? d / 12 : -((11 - d) / 12);
  float f = 440.0f * SEMI[d - oct * 12];
  for (; oct > 0; oct--) f *= 2; for (; oct < 0; oct++) f /= 2;
  return f;
}

// The interactions: a turn (an ascending pair, or descending), a select (the day's note an octave up), back (an octave
// down, softly)
static const Note TUNE_TURN_UP[]   = { {0, 28}, {7, 34} };
static const Note TUNE_TURN_DOWN[] = { {7, 28}, {0, 34} };
static const Note TUNE_SELECT[]    = { {12, 55} };
static const Note TUNE_BACK[]      = { {-12, 45} };

// ---- C-50: accomplishment. Each daemon's tunes are its own: GENERATED from its species number and the day of the week,
// in a pentatonic scale on the day's note, with a voice (the wave's duty) of its own. A step: five notes, rising. Undone:
// the same five, reversed. A milestone: seven. The whole goal: twelve, climbing and blooming.
static const int8_t TUNE_PENTA[] = {0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24};
inline int tuneRand(uint32_t &s) { s = s * 1103515245u + 12345u; return (s >> 16) & 0x7fff; }
inline int accomplishTune(Note *out, int kind, int species, int day) {      // kind 0 a step, 1 a milestone, 2 the goal
  int n = kind == 0 ? 5 : kind == 1 ? 7 : 12;
  uint32_t s = (uint32_t)species * 2654435761u ^ (uint32_t)(day * 97 + kind * 13 + 1);
  int at = tuneRand(s) % 3;                                  // start low in the scale
  for (int i = 0; i < n; i++) {
    bool last = i == n - 1;
    if (last) at = kind == 0 ? 5 : kind == 1 ? 8 : 10;      // a step lands on the octave, a milestone higher, the goal highest
    out[i].semis = TUNE_PENTA[at < 0 ? 0 : at > 10 ? 10 : at];
    out[i].ms = last ? (kind == 2 ? 360 : 200) : (kind == 2 ? 95 : 80) + (tuneRand(s) % 3) * 20;
    at += 1 + tuneRand(s) % 2 - (tuneRand(s) % 5 == 0 ? 2 : 0);   // mostly up, now and then a step back
  }
  return n;
}
inline float voiceDuty(int species, int day) { static const float D[] = {0.125f, 0.25f, 0.5f}; return D[(species + day) % 3]; }

// C-68: a routine from the game: a phrase GENERATED from its name (so PUSH always sounds like PUSH), its type choosing the
// voice (`duty`) and the ring's dance (`dance`, 0..4: sparkle, glimmer, pulse, wave, sweep)
static const int8_t TUNE_GAME_PENTA[] = {0, 2, 4, 7, 9, 12, 14, 16, 19};
inline void gameTune(Note *out, const char *name, const char *type, float &duty, int &dance) {
  uint32_t s = 2166136261u;
  for (const char *c = name; *c; c++) s = (s ^ (uint8_t)*c) * 16777619u;   // FNV-1a: the name's own seed
  uint32_t ts = 0; for (const char *c = type; *c; c++) ts = ts * 31 + (uint8_t)*c;
  static const float D[] = {0.125f, 0.25f, 0.5f};
  duty = D[ts % 3]; dance = ts % 5;
  int at = s % 3;
  for (int i = 0; i < 6; i++) {
    s = s * 1103515245u + 12345u;
    bool last = i == 5;
    int k = last ? (int)((s >> 16) % 2) * 3 + 5 : at;
    out[i].semis = TUNE_GAME_PENTA[k < 0 ? 0 : k > 8 ? 8 : k];
    out[i].ms = last ? 220 : 60 + ((s >> 20) % 3) * 25;
    at += (int)((s >> 18) % 4) - 1; if (at < 0) at = 0; if (at > 7) at = 7;   // wandering upward
  }
}
