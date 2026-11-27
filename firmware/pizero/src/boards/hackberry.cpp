// C-593: the HackberryPi (ZitaoTech's; a Raspberry Pi Zero 2 W in a BlackBerry's body) -- a 4-inch 720x720 screen on
// DPI (the kernel's vc4-kms-dpi-hyperpixel4sq overlay; one framebuffer, 16 bits), a BlackBerry keyboard and trackpad
// read by a chip of their own and sent as one USB keyboard and mouse (Vial firmware), no speaker and no microphone
// (sound leaves by the HDMI or Bluetooth), two Nokia BL-5C cells the kernel cannot read. docs/PIBOARDS.md has what
// the probe found on the first one (2026-11-27, the 9900 keyboard).
//
// The keyboard sends plain letters, SPACE, ENTER, BACKSPACE, and a tap of two of its top keys ESC and TAB. It has no
// arrow keys of its own: the maker's keymap puts them on W A S D while a layer key is held. So in the game the pad is
// W A S D plain (the arrows too, for a keymap that has them), and on a page the arrows are the layer's, or F X Z C as
// on the Cardputer Zero (keys.cpp's dirOf).
//
// The chip's own keymap, read from it over Vial on the first one (2026-11-27; docs/PIBOARDS.md has it whole). Plain:
// the letters, the delete key (BACKSPACE), ENTER, SPACE, the $ key (Shift and 4), the BlackBerry's alt key (SHIFT), its
// left aA key (CTRL) and its 0 key (ALT). Its top row: the call key (TAB), the menu key (keypad .), the trackpad's
// press (a mouse button, not read), the back key (keypad /), the end key (the keys' light, nothing sent). With its
// right aA key held: the digits and marks printed on the keys. NO KEY IS ESC in that map, and ESC is how every page
// is left -- so the back key goes back (rawKey), and so does the left aA key held with the delete key (forPage), two
// keys every keymap of this keyboard sends. Seen on the device: the screen, the keyboard held, DAEMONS at boot. A
// key pressed by a thumb: not yet (DRAFT).
#if __has_include(<linux/input-event-codes.h>)
#include <linux/input-event-codes.h>
#else
#define KEY_KPDOT 83
#define KEY_KPSLASH 98
#endif
#include "board.h"

namespace board {
const char *const ID = "hackberry";
const char *const NAME = "HackberryPi";   // DRAFT
const int SCREEN_W = 720, SCREEN_H = 720;   // square: the canvas twice its size (640x340) in the middle
const bool KEYBOARD = true;
// The keyboard's chip is on the third port of the board's own USB hub, whichever keyboard it carries (Q10, Q20 or
// 9900); failing it, the search finds the first device with letter keys. Its mouse is not read.
const char *const INPUTS[] = { "/dev/input/by-path/platform-3f980000.usb-usb-0:1.3:1.0-event-kbd", nullptr };

void gameKeyDefaults(Key m[GBA_KEYS][2]) {
  const Key d[GBA_KEYS][2] = {
    { Key::L, Key::None },        // A: under the right thumb, to the right of B as on a GBA
    { Key::K, Key::None },        // B
    { Key::Space, Key::None },    // SELECT
    { Key::Enter, Key::None },    // START
    { Key::D, Key::Right },       // the pad: W A S D under the left thumb, and the layer's arrows
    { Key::A, Key::Left },
    { Key::W, Key::Up },
    { Key::S, Key::Down },
    { Key::P, Key::None },        // R and L: the top row's two ends
    { Key::Q, Key::None },
  };
  for (int i = 0; i < GBA_KEYS; i++) { m[i][0] = d[i][0]; m[i][1] = d[i][1]; }
}

// A keyboard: every key as it is, but one. The left aA key (CTRL) held and the delete key pressed is the way back,
// on a page and in the game: both are in every keymap of this keyboard, where ESC is in none.
bool forPage(KeyEvent &e, const bool *held, bool) {
  if (e.key == Key::Backspace && held[(size_t)Key::Ctrl]) { e.key = Key::Esc; e.ch = 0; }
  return true;
}

const char *word(Key k) { return keyName(k); }
// The two top keys the chip sends as keypad codes: the back key goes back, the menu key is SYM (DRAFT: neither has
// been pressed yet, and the chip's own program may send something else for a tap; ZERO_KEYLOG=1 prints what comes)
Key rawKey(int code) {
  switch (code) {
    case KEY_KPSLASH: return Key::Esc;
    case KEY_KPDOT: return Key::Sym;
    default: return Key::None;
  }
}
const bool CAP_HEADER = false;   // the DPI screen takes nearly every pin: no cap header, no SPI
const bool RADIOS = false;
void builtInRadios(caps::Found &) {}
}  // namespace board
