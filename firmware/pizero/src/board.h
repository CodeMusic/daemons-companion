#pragma once
// C-457: the one thing that differs between the Linux boards, apart from hal/'s two sides -- which board this program
// was built for. Everything else (the game, the save and the hub, the pages, the caps) is the same program on every
// board; a board adds one file, src/boards/<id>.cpp, and CMake's ZERO_BOARD picks it (docs/PIBOARDS.md).
//
// The pages draw a 320x170 canvas (hal::W, hal::H) on every board. A board whose screen is bigger shows it in the
// middle, the rest dark, until a page is written for the bigger screen.
#include <cstdint>
#include "keys.h"

namespace board {
extern const char *const ID;       // "cardputer-zero": the start of the name this device gives the hub
extern const char *const NAME;     // "Cardputer Zero": what the hub shows (DRAFT)
extern const int SCREEN_W, SCREEN_H;   // the screen as it is held: never smaller than the canvas
extern const bool KEYBOARD;        // letters to type with (false: a pad, and LINK is done with --pair over SSH)

// The input devices to open before searching /dev/input, tried in turn (nullptr ends the list)
extern const char *const INPUTS[];

// The game's ten keys, two keys each at most, before ~/.config/daemons/keys.conf: in mGBA's order (keys.h GbaKey)
void gameKeyDefaults(Key map[GBA_KEYS][2]);

// A key as the pages are to read it. A pad has no ENTER or ESC: its A is ENTER, its B is ESC, and so on. In the game
// the keys go to the game as they are, and this is asked only for the way out (SELECT and START held together, on a
// pad). False: the page is not told of this key at all.
bool forPage(KeyEvent &e, const bool *held, bool inGame);

// A hint's words as this board's keys are printed ("ENTER" is "A" on a pad); the pages print their hints through it
const char *word(Key k);
}
