// C-378: the device's side, every Linux board's (C-457) -- the screen through /dev/fb_lcd, else /dev/fb0 (the framebuffer APPLaunch itself draws on), the keys through
// evdev (the TCA8418's input device), the cell through power_supply. What is not yet seen on the device is guessed at
// from M5Stack's own code and can be set from the environment until tools/probe.sh says what it really is:
//   ZERO_FB=/dev/fb1          another framebuffer
//   ZERO_ROTATE=0|1|2|3       quarter turns clockwise, when the framebuffer is not already 320 wide
//   ZERO_KEYS=/dev/input/...  the keyboard, when the search below picks the wrong one
//   ZERO_GRAB=1               take the keys for ourselves while we run (if APPLaunch keeps reading them behind us)
#include <dirent.h>
#include <fcntl.h>
#include <linux/fb.h>
#include <linux/input.h>
#include <sys/ioctl.h>
#include <sys/mman.h>
#include <unistd.h>

#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>

#include "board.h"
#include "hal/hal.h"
#include "paths.h"

namespace hal {
static bool headlessMode;
static int fbFd = -1, keyFd = -1;
static uint8_t *fbMem;
static size_t fbLen;
static fb_var_screeninfo vinfo;
static fb_fix_screeninfo finfo;
static int rotate;              // quarter turns clockwise from our canvas to the framebuffer
static int offX, offY;          // C-457: where the canvas sits on a bigger screen (in the middle)
static bool shiftHeld;

static bool testBit(const unsigned long *bits, int n) { return (bits[n / (8 * sizeof(long))] >> (n % (8 * sizeof(long)))) & 1; }

static int openKeyboard() {
  if (const char *k = getenv("ZERO_KEYS")) return open(k, O_RDONLY | O_NONBLOCK | O_CLOEXEC);
  // C-457: the board's own first (the Cardputer Zero's TCA8418 on I2C1, the GamePi20's buttons). Failing those, the
  // first input device with letter keys -- or, on a pad, with a gamepad's A.
  int fd = -1;
  for (const char *const *in = board::INPUTS; *in; in++)
    if ((fd = open(*in, O_RDONLY | O_NONBLOCK | O_CLOEXEC)) >= 0) return fd;
  DIR *d = opendir("/dev/input");
  if (!d) return -1;
  while (dirent *e = readdir(d)) {
    if (strncmp(e->d_name, "event", 5) != 0) continue;
    std::string p = std::string("/dev/input/") + e->d_name;
    int f = open(p.c_str(), O_RDONLY | O_NONBLOCK | O_CLOEXEC);
    if (f < 0) continue;
    unsigned long bits[(KEY_MAX + 1) / (8 * sizeof(long)) + 1] = {};
    if (ioctl(f, EVIOCGBIT(EV_KEY, sizeof bits), bits) >= 0 &&
        (board::KEYBOARD ? testBit(bits, KEY_A) && testBit(bits, KEY_Z) : testBit(bits, BTN_A))) { fd = f; break; }
    close(f);
  }
  closedir(d);
  return fd;
}

bool begin(int, bool headless) {
  headlessMode = headless;
  if (headless) return true;
  // C-444 / C-449: /dev/fb_lcd is M5Stack's udev link to the ST7789's framebuffer, whichever number it got -- with a
  // screen in the HDMI at boot the small screen need not be fb0. APPLaunch looks for it first too.
  // C-457: failing that, the framebuffer the panel-mipi-dbi driver made (the GamePi20's ST7789, by its sysfs name), so an
  // HDMI framebuffer that came first is never drawn on by mistake; and last of all fb0
  static std::string panel;
  for (int n = 0; n < 4 && panel.empty(); n++) {
    std::string name;
    if (readText("/sys/class/graphics/fb" + std::to_string(n) + "/name", name) && name.find("mipi-dbi") != std::string::npos)
      panel = "/dev/fb" + std::to_string(n);
  }
  const char *path = getenv("ZERO_FB") ? getenv("ZERO_FB") : access("/dev/fb_lcd", F_OK) == 0 ? "/dev/fb_lcd"
                     : !panel.empty() ? panel.c_str() : "/dev/fb0";
  fbFd = open(path, O_RDWR | O_CLOEXEC);
  if (fbFd < 0) { perror(path); return false; }
  if (ioctl(fbFd, FBIOGET_VSCREENINFO, &vinfo) || ioctl(fbFd, FBIOGET_FSCREENINFO, &finfo)) { perror("framebuffer"); return false; }
  fbLen = finfo.smem_len;
  fbMem = (uint8_t *)mmap(nullptr, fbLen, PROT_READ | PROT_WRITE, MAP_SHARED, fbFd, 0);
  if (fbMem == MAP_FAILED) { fbMem = nullptr; perror("mmap"); return false; }
  if (const char *r = getenv("ZERO_ROTATE")) rotate = atoi(r) & 3;
  else rotate = (vinfo.xres >= (unsigned)W && vinfo.yres >= (unsigned)H) ? 0 : (vinfo.yres >= (unsigned)W && vinfo.xres >= (unsigned)H) ? 1 : 0;
  // C-457: on a bigger screen (the GamePi20's 320x240) the canvas in the middle, the rest dark
  const int fw = (rotate & 1) ? (int)vinfo.yres : (int)vinfo.xres, fh = (rotate & 1) ? (int)vinfo.xres : (int)vinfo.yres;
  offX = fw > W ? (fw - W) / 2 : 0;
  offY = fh > H ? (fh - H) / 2 : 0;
  memset(fbMem, 0, fbLen);
  fprintf(stderr, "screen: %s %ux%u, %u bits, line %u bytes, turned %d\n", path, vinfo.xres, vinfo.yres,
          vinfo.bits_per_pixel, finfo.line_length, rotate);
  keyFd = openKeyboard();
  if (keyFd < 0) fprintf(stderr, "keys: no keyboard found (set ZERO_KEYS)\n");
  else if (getenv("ZERO_GRAB")) ioctl(keyFd, EVIOCGRAB, 1);
  return true;
}

void present(const uint16_t *px) {
  if (!fbMem) return;
  const int bpp = vinfo.bits_per_pixel;
  for (int y = 0; y < H; y++) {
    for (int x = 0; x < W; x++) {
      uint16_t s = px[y * W + x];
      uint16_t c = (uint16_t)(s << 8 | s >> 8);   // LovyanGFX keeps it high byte first
      // the point on the screen as held, then turned onto the framebuffer
      const int sx = x + offX, sy = y + offY, sw = W + 2 * offX, sh = H + 2 * offY;
      int fx = sx, fy = sy;
      switch (rotate) {
        case 1: fx = sh - 1 - sy; fy = sx; break;
        case 2: fx = sw - 1 - sx; fy = sh - 1 - sy; break;
        case 3: fx = sy; fy = sw - 1 - sx; break;
      }
      if ((unsigned)fx >= vinfo.xres || (unsigned)fy >= vinfo.yres) continue;
      uint8_t *at = fbMem + (size_t)(fy + vinfo.yoffset) * finfo.line_length + (size_t)(fx + vinfo.xoffset) * (bpp / 8);
      if (bpp == 16) *(uint16_t *)at = c;
      else if (bpp == 32) {
        uint32_t r = (c >> 11) & 31, g = (c >> 5) & 63, b = c & 31;
        r = r << 3 | r >> 2; g = g << 2 | g >> 4; b = b << 3 | b >> 2;
        *(uint32_t *)at = 0xFF000000u | r << vinfo.red.offset | g << vinfo.green.offset | b << vinfo.blue.offset;
      }
    }
  }
}

static Key keyOf(int code) {
  switch (code) {
    case KEY_A: return Key::A; case KEY_B: return Key::B; case KEY_C: return Key::C; case KEY_D: return Key::D;
    case KEY_E: return Key::E; case KEY_F: return Key::F; case KEY_G: return Key::G; case KEY_H: return Key::H;
    case KEY_I: return Key::I; case KEY_J: return Key::J; case KEY_K: return Key::K; case KEY_L: return Key::L;
    case KEY_M: return Key::M; case KEY_N: return Key::N; case KEY_O: return Key::O; case KEY_P: return Key::P;
    case KEY_Q: return Key::Q; case KEY_R: return Key::R; case KEY_S: return Key::S; case KEY_T: return Key::T;
    case KEY_U: return Key::U; case KEY_V: return Key::V; case KEY_W: return Key::W; case KEY_X: return Key::X;
    case KEY_Y: return Key::Y; case KEY_Z: return Key::Z;
    case KEY_0: return Key::N0; case KEY_1: return Key::N1; case KEY_2: return Key::N2; case KEY_3: return Key::N3;
    case KEY_4: return Key::N4; case KEY_5: return Key::N5; case KEY_6: return Key::N6; case KEY_7: return Key::N7;
    case KEY_8: return Key::N8; case KEY_9: return Key::N9;
    case KEY_ENTER: case KEY_KPENTER: case KEY_OK: return Key::Enter;
    case KEY_ESC: case KEY_HOME: case KEY_BACK: return Key::Esc;
    case KEY_TAB: return Key::Tab;
    case KEY_SPACE: return Key::Space;
    case KEY_BACKSPACE: case KEY_DELETE: return Key::Backspace;
    case KEY_LEFTSHIFT: case KEY_RIGHTSHIFT: return Key::Shift;
    case KEY_LEFTCTRL: case KEY_RIGHTCTRL: return Key::Ctrl;
    case KEY_LEFTALT: return Key::Alt;
    case KEY_RIGHTALT: case KEY_LEFTMETA: case KEY_RIGHTMETA: return Key::Sym;   // which Sym is: seen on the first day
    case KEY_FN: return Key::Fn;
    case KEY_UP: return Key::Up; case KEY_DOWN: return Key::Down;
    case KEY_LEFT: return Key::Left; case KEY_RIGHT: return Key::Right;
    // C-457: a pad's buttons (tools/boards/gamepi20.sh sends these; a USB gamepad does too)
    case BTN_A: return Key::PadA; case BTN_B: return Key::PadB; case BTN_X: return Key::PadX; case BTN_Y: return Key::PadY;
    case BTN_TL: return Key::PadL; case BTN_TR: return Key::PadR;
    case BTN_START: return Key::PadStart; case BTN_SELECT: return Key::PadSelect;
    case BTN_DPAD_UP: return Key::Up; case BTN_DPAD_DOWN: return Key::Down;
    case BTN_DPAD_LEFT: return Key::Left; case BTN_DPAD_RIGHT: return Key::Right;
    default: return Key::None;
  }
}

bool poll(KeyEvent &e) {
  if (keyFd < 0) return false;
  input_event ev;
  while (read(keyFd, &ev, sizeof ev) == (ssize_t)sizeof ev) {
    if (ev.type != EV_KEY || ev.value == 2) continue;   // 2: the key repeating -- every page counts its own
    Key k = keyOf(ev.code);
    if (k == Key::None) { if (getenv("ZERO_KEYLOG")) fprintf(stderr, "keys: code %d unmapped\n", ev.code); continue; }
    if (k == Key::Shift) shiftHeld = ev.value != 0;
    e.key = k;
    e.down = ev.value != 0;
    e.ch = e.down ? keyChar(k, shiftHeld) : 0;
    return true;
  }
  return false;
}

bool closed() { return false; }

void end() {
  if (fbMem) { munmap(fbMem, fbLen); fbMem = nullptr; }
  if (fbFd >= 0) close(fbFd);
  if (keyFd >= 0) { ioctl(keyFd, EVIOCGRAB, 0); close(keyFd); }
}

// The cell: the first power_supply that is a battery (the BQ27220's, by M5Stack's own docs)
Power power() {
  Power p;
  DIR *d = opendir("/sys/class/power_supply");
  if (!d) return p;
  while (dirent *e = readdir(d)) {
    if (e->d_name[0] == '.') continue;
    std::string base = std::string("/sys/class/power_supply/") + e->d_name + "/", type, cap, status;
    if (!readText(base + "type", type) || type.rfind("Battery", 0) != 0) continue;
    if (readText(base + "capacity", cap)) p.percent = atoi(cap.c_str());
    if (readText(base + "status", status)) p.charging = status.rfind("Charging", 0) == 0 || status.rfind("Full", 0) == 0;
    break;
  }
  closedir(d);
  return p;
}
const char *side() { return "device"; }

// As the boards name themselves (board, then the last three bytes of the MAC): here the Wi-Fi's MAC
std::string deviceId() {
  std::string mac;
  if (readText("/sys/class/net/wlan0/address", mac) && mac.size() >= 17) {
    std::string tail;
    for (char c : mac.substr(9, 8)) if (c != ':') tail += c;
    return std::string(board::ID) + "-" + tail;
  }
  return board::ID;
}
}  // namespace hal
