#pragma once
// C-457: the one thing that differs between the Linux boards, apart from hal/'s two sides -- which board this program
// was built for. Everything else (the game, the save and the hub, the pages, the caps) is the same program on every
// board; a board adds one file, src/boards/<id>.cpp, and CMake's ZERO_BOARD picks it (docs/PIBOARDS.md).
//
// C-593: every board has a canvas of its own size (CANVAS_W, CANVAS_H; hal::W and hal::H while it runs), which the
// pages fill: the screen itself, or the screen at a whole fraction of its size where its pixels are small. The pages
// were first drawn for the Cardputer Zero's 320x170 and place what they draw from the canvas's edges (app.h's lay).
#include <cstdint>
#include "keys.h"

namespace caps { struct Found; }

namespace board {
extern const char *const ID;       // "cardputer-zero": the start of the name this device gives the hub
extern const char *const NAME;     // "Cardputer Zero": what the hub shows (DRAFT)
extern const int SCREEN_W, SCREEN_H;   // the screen as it is held: never smaller than the canvas
// C-593: the canvas the pages draw, shown a whole number of times over so its pixels stay square and sharp: 320x170 at
// least. The Cardputer Zero's is its screen; the HackberryPi's 720x720 is a 360x360 canvas twice over.
extern const int CANVAS_W, CANVAS_H;
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

// C-514: an evdev code hal/device.cpp does not know, as this board means it (the uConsole's joystick buttons), or
// Key::None. Asked only for codes the common table leaves unmapped.
Key rawKey(int code);

// C-514: the radios. CAP_HEADER: the Cardputer's EXT header, whose cap is looked for by asking its chips (docs/CAPS.md)
// -- only there, since its POWER_EN, GPIO26, is a button or another chip's line on every other board. RADIOS: radios
// the board carries itself (the uConsole's AIO), which builtInRadios() adds to what CAPS lists; it never transmits.
extern const bool CAP_HEADER;
extern const bool RADIOS;
void builtInRadios(caps::Found &f);
}
