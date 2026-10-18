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
static const uint8_t PLAY_NOTES_1[] = { 73, 71, 68, 69, 66, 68, 66, 64, 63, 64 };
static const uint8_t PLAY_FRAMES_1[] = { 15, 15, 15, 15, 15, 15, 15, 15, 15, 40 };
static const uint8_t PLAY_NOTES_2[] = { 60, 58, 60, 62, 63, 62, 60, 65, 63, 65 };
static const uint8_t PLAY_FRAMES_2[] = { 22, 22, 22, 22, 22, 22, 22, 22, 22, 48 };
static const uint8_t PLAY_NOTES_3[] = { 64, 62, 59, 64, 66, 64, 61, 64, 62, 59, 57 };
static const uint8_t PLAY_FRAMES_3[] = { 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 48 };
static const uint8_t PLAY_NOTES_4[] = { 59, 57, 62, 60, 62, 64, 55, 59, 57 };
static const uint8_t PLAY_FRAMES_4[] = { 17, 17, 17, 17, 17, 17, 17, 17, 44 };
static const uint8_t PLAY_NOTES_5[] = { 69, 71, 73, 69, 66, 64, 66, 62 };
static const uint8_t PLAY_FRAMES_5[] = { 20, 20, 20, 20, 20, 20, 20, 48 };
static const uint8_t PLAY_NOTES_6[] = { 73, 71, 66, 62, 64, 62, 66, 64 };
static const uint8_t PLAY_FRAMES_6[] = { 20, 20, 20, 20, 20, 20, 20, 48 };
static const uint8_t PLAY_NOTES_7[] = { 59, 64, 62, 60, 59, 62, 59, 60, 59, 55 };
static const uint8_t PLAY_FRAMES_7[] = { 22, 22, 22, 22, 22, 22, 22, 22, 22, 48 };
static const PlaySong PLAY_SONGS[] = {
  { "FIR", "O CHRISTMAS TREE", 10, PLAY_NOTES_0, PLAY_FRAMES_0, 8 },
  { "NAMING", "TWELVE DAYS OF DECEMBER", 4, PLAY_NOTES_1, PLAY_FRAMES_1, 10 },
  { "STILL", "THE REALIZATION", 3, PLAY_NOTES_2, PLAY_FRAMES_2, 10 },
  { "MEND", "FORGIVENESS OFFERED", 2, PLAY_NOTES_3, PLAY_FRAMES_3, 11 },
  { "PRACTICE", "SEQUEL THE GUARDIAN", 7, PLAY_NOTES_4, PLAY_FRAMES_4, 9 },
  { "STANCE", "HARMONY IN BALANCE", 2, PLAY_NOTES_5, PLAY_FRAMES_5, 8 },
  { "NOTICE", "THE SHIMMERING CANVAS", 2, PLAY_NOTES_6, PLAY_FRAMES_6, 8 },
  { "REFLECT", "REFLECTIONS WITHIN", 7, PLAY_NOTES_7, PLAY_FRAMES_7, 10 },
};
static const int PLAY_SONG_N = 8;
