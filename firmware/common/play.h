#pragma once
// T-426: the game's songs, keys and colours -- written by firmware/common/play.py from server/data/play.json (do
// not edit by hand). A note is a MIDI number (C4 = 60); a frame is the game's, a sixtieth of a second.
#include <stdint.h>
struct PlaySong { const char *id, *title; uint8_t key; const uint8_t *notes; const uint8_t *frames; uint8_t n; };
static const char *const PLAY_KEYS[12] = { "C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B" };
static const uint32_t PLAY_COLOURS[12] = { 0xFF0000, 0xFF4100, 0xFF8300, 0xFFC500, 0xFFFF00, 0x00FF00, 0x00C5C5, 0x0041FF, 0x3100FF, 0x6200FF, 0x9400FF, 0xC500FF };
static const uint32_t PLAY_OUTLINE = 0x201841;
static const int PLAY_LISTEN = 16;   // a song is heard from the last this many notes
static const uint8_t PLAY_NOTES_0[] = { 65, 70, 70, 70, 72, 74, 74, 74 };
static const uint8_t PLAY_FRAMES_0[] = { 30, 22, 8, 40, 18, 22, 8, 40 };
static const uint8_t PLAY_NOTES_1[] = { 64, 69, 71, 71, 68, 69, 71, 71, 66, 68, 66 };
static const uint8_t PLAY_FRAMES_1[] = { 15, 7, 15, 22, 15, 7, 15, 7, 7, 22, 30 };
static const uint8_t PLAY_NOTES_2[] = { 58, 63, 65, 67, 67, 65, 67, 65, 67 };
static const uint8_t PLAY_FRAMES_2[] = { 16, 11, 16, 22, 11, 11, 22, 22, 22 };
static const uint8_t PLAY_NOTES_3[] = { 62, 62, 64, 66, 59, 62 };
static const uint8_t PLAY_FRAMES_3[] = { 20, 20, 10, 10, 10, 39 };
static const uint8_t PLAY_NOTES_4[] = { 59, 62, 59, 62, 64, 57, 59 };
static const uint8_t PLAY_FRAMES_4[] = { 8, 16, 8, 16, 16, 8, 33 };
static const uint8_t PLAY_NOTES_5[] = { 66, 64, 62, 57, 57, 66, 64, 62, 64, 59 };
static const uint8_t PLAY_FRAMES_5[] = { 20, 10, 29, 10, 10, 10, 10, 10, 10, 39 };
static const uint8_t PLAY_NOTES_6[] = { 62, 61, 59, 57, 59, 61, 62, 59, 61, 62 };
static const uint8_t PLAY_FRAMES_6[] = { 10, 10, 10, 10, 10, 10, 20, 10, 10, 40 };
static const uint8_t PLAY_NOTES_7[] = { 62, 64, 64, 62, 59, 57, 55, 57, 59, 59 };
static const uint8_t PLAY_FRAMES_7[] = { 14, 14, 43, 21, 7, 7, 7, 14, 14, 29 };
static const PlaySong PLAY_SONGS[] = {
  { "FIR", "O CHRISTMAS TREE", 10, PLAY_NOTES_0, PLAY_FRAMES_0, 8 },
  { "NAMING", "TWELVE DAYS OF DECEMBER", 4, PLAY_NOTES_1, PLAY_FRAMES_1, 11 },
  { "STILL", "THE REALIZATION", 3, PLAY_NOTES_2, PLAY_FRAMES_2, 9 },
  { "MEND", "FORGIVENESS OFFERED", 2, PLAY_NOTES_3, PLAY_FRAMES_3, 6 },
  { "PRACTICE", "SEQUEL THE GUARDIAN", 7, PLAY_NOTES_4, PLAY_FRAMES_4, 7 },
  { "STANCE", "HARMONY IN BALANCE", 2, PLAY_NOTES_5, PLAY_FRAMES_5, 10 },
  { "NOTICE", "THE SHIMMERING CANVAS", 2, PLAY_NOTES_6, PLAY_FRAMES_6, 10 },
  { "REFLECT", "REFLECTIONS WITHIN", 7, PLAY_NOTES_7, PLAY_FRAMES_7, 10 },
};
static const int PLAY_SONG_N = 8;
