// C-514: the ClockworkPi uConsole (a Raspberry Pi CM4, to be confirmed on the device) -- a 5-inch 1280x720 IPS on DSI
// (the panel is 720x1280, portrait; the desktop turns it), a keyboard of its own (a USB HID from the keyboard's own
// chip: keys, the trackball as a mouse, and a joystick), a d-pad and A B X Y, SELECT and START above the keys, PWM
// sound to its two speakers and the jack, the cells read by the AXP228 (axp20x-battery). Its radios are the
// HackerGadgets AIO's, not a cap on a header (docs/PIBOARDS.md, docs/CAPS.md). Everything here is from ClockworkPi's
// firmware and the community's notes, not yet seen on this uConsole (DRAFT).
//
// The keyboard's switch on its back sets what A B X Y SELECT START send: keys (A j, B k, X u, Y i, SELECT space, START
// enter) or joystick buttons (X 1, A 2, B 3, Y 4, SELECT 9, START 10 in ClockworkPi's firmware). Both are read: the
// keyboard and the joystick are opened together (hal/device.cpp), and rawKey below names the joystick's buttons. The
// d-pad is always the arrow keys. The uConsole has no shoulder buttons: X and Y stand in for L and R.
#if __has_include(<linux/input-event-codes.h>)
#include <linux/input-event-codes.h>
#else   // the SDL window on a computer: the same numbers, so the board builds there too
enum { BTN_TRIGGER = 0x120, BTN_THUMB, BTN_THUMB2, BTN_TOP, BTN_BASE3 = 0x128, BTN_BASE4 };
#endif
#include <sys/stat.h>

#include <dirent.h>

#include <string>

#include "board.h"
#include "boards/pad.h"
#include "caps/cap.h"
#include "paths.h"

namespace board {
const char *const ID = "uconsole";
const char *const NAME = "uConsole";   // DRAFT
const int SCREEN_W = 1280, SCREEN_H = 720;   // as held, landscape; the canvas four times its size fits (1280x680)
const bool KEYBOARD = true;
// Its names under /dev/input/by-id are seen on the first day; until then the search finds the keyboard and the joystick
const char *const INPUTS[] = { nullptr };

void gameKeyDefaults(Key m[GBA_KEYS][2]) {
  const Key d[GBA_KEYS][2] = {
    { Key::J, Key::PadA },          // A: the A button, as a key (j) or a joystick button
    { Key::K, Key::PadB },          // B
    { Key::Space, Key::PadSelect }, // SELECT
    { Key::Enter, Key::PadStart },  // START (the keyboard's own ENTER too)
    { Key::Right, Key::None },      // the d-pad: the arrow keys
    { Key::Left, Key::None },
    { Key::Up, Key::None },
    { Key::Down, Key::None },
    { Key::I, Key::PadY },          // R: the Y button
    { Key::U, Key::PadX },          // L: the X button
  };
  for (int i = 0; i < GBA_KEYS; i++) { m[i][0] = d[i][0]; m[i][1] = d[i][1]; }
}

// The keys as they are; the joystick's buttons as a pad's (A is ENTER, B is ESC; SELECT and START together leave the game)
bool forPage(KeyEvent &e, const bool *held, bool inGame) {
  switch (e.key) {
    case Key::PadA: case Key::PadB: case Key::PadX: case Key::PadY:
    case Key::PadL: case Key::PadR: case Key::PadStart: case Key::PadSelect:
      return pad::forPage(e, held, inGame);
    default: return true;
  }
}

const char *word(Key k) { return keyName(k); }

// A HID joystick's buttons 1 to 10 come as BTN_TRIGGER onwards: ClockworkPi's firmware sends X 1, A 2, B 3, Y 4,
// SELECT 9, START 10 (ZERO_KEYLOG=1 prints any code still unmapped, to check on the device)
Key rawKey(int code) {
  switch (code) {
    case BTN_TRIGGER: return Key::PadX;    // 1
    case BTN_THUMB: return Key::PadA;      // 2
    case BTN_THUMB2: return Key::PadB;     // 3
    case BTN_TOP: return Key::PadY;        // 4
    case BTN_BASE3: return Key::PadSelect; // 9
    case BTN_BASE4: return Key::PadStart;  // 10
    default: return Key::None;
  }
}

const bool CAP_HEADER = false;
const bool RADIOS = true;

namespace {
// A USB device by its id, from sysfs: nothing is opened, nothing is sent
bool usbHere(const char *vendor, const char *product) {
  DIR *d = opendir("/sys/bus/usb/devices");
  if (!d) return false;
  bool here = false;
  while (dirent *e = readdir(d)) {
    std::string base = std::string("/sys/bus/usb/devices/") + e->d_name + "/", v, p;
    if (!readText(base + "idVendor", v) || !readText(base + "idProduct", p)) continue;
    if (v.rfind(vendor, 0) == 0 && (!product || p.rfind(product, 0) == 0)) { here = true; break; }
  }
  closedir(d);
  return here;
}
bool exists(const char *path) { struct stat s; return stat(path, &s) == 0; }
}  // namespace

// The AIO's radios and the modem, found without asking any chip: by USB id and by the devices its config.txt lines
// make. The AIO v2 starts with every module off, so a module not powered is not on USB yet: listed by its device node
// where it has one. Nothing here powers a module, and nothing transmits (docs/CAPS.md: the SDR receive only, LoRa
// 902-928 only, a loose antenna none).
void builtInRadios(caps::Found &f) {
  const bool sdr = usbHere("0bda", "2838") || usbHere("0bda", "2832");    // RTL2832U
  const bool lora = exists("/dev/spidev1.0");                               // SPI1 CE0, from spi1-1cs
  const bool gps = lora && exists("/dev/ttyS0");                            // the AIO's UART, beside its LoRa
  const bool modem = usbHere("1e0e", nullptr) || usbHere("2c7c", nullptr);  // SIMCom (the 4G board) or Quectel
  if (sdr) f.offers.push_back({ "LISTEN", "SDR, receive only", "to come" });                  // DRAFT
  if (lora) f.offers.push_back({ "MESH", "LoRa 915", "to come" });                            // DRAFT (C-446)
  if (gps) f.offers.push_back({ "WHERE", "GPS", "to come" });                                 // DRAFT (C-174)
  if (modem) f.offers.push_back({ "ONLINE", "cellular", "to come" });                         // DRAFT
  if (f.kind != caps::Kind::None || f.offers.empty()) return;
  f.kind = caps::Kind::BuiltIn;
  f.name = lora || sdr ? "HackerGadgets AIO" : "a cellular modem";                            // DRAFT
  f.detail = std::string(sdr ? "SDR " : "") + (lora ? "LoRa " : "") + (gps ? "GPS " : "") + (modem ? "modem" : "");
}
}  // namespace board
