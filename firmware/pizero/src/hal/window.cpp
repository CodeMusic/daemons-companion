// C-378: the computer's side -- the Cardputer Zero's 320x170 in an SDL window, three times over, and the computer's
// keys taken as the device's (F1 is SYM and F2 is FN, as M5Stack's own simulator has them).
#include <SDL.h>
#include <string>
#include "hal/hal.h"

namespace hal {
static SDL_Window *win;
static SDL_Renderer *ren;
static SDL_Texture *tex;
static bool headlessMode, wasClosed;

bool begin(int scale, bool headless) {
  headlessMode = headless;
  if (headless) return true;
  if (SDL_Init(SDL_INIT_VIDEO | SDL_INIT_EVENTS) != 0) { fprintf(stderr, "SDL: %s\n", SDL_GetError()); return false; }
  SDL_SetHint(SDL_HINT_RENDER_SCALE_QUALITY, "0");   // pixels stay pixels
  win = SDL_CreateWindow("DAEMONS -- Cardputer Zero", SDL_WINDOWPOS_CENTERED, SDL_WINDOWPOS_CENTERED, W * scale, H * scale, 0);
  if (!win) { fprintf(stderr, "SDL: %s\n", SDL_GetError()); return false; }
  ren = SDL_CreateRenderer(win, -1, SDL_RENDERER_ACCELERATED | SDL_RENDERER_PRESENTVSYNC);
  if (!ren) ren = SDL_CreateRenderer(win, -1, 0);
  tex = SDL_CreateTexture(ren, SDL_PIXELFORMAT_RGB565, SDL_TEXTUREACCESS_STREAMING, W, H);
  return ren && tex;
}

void present(const uint16_t *px) {
  if (headlessMode) return;
  void *dst;
  int pitch;
  if (SDL_LockTexture(tex, nullptr, &dst, &pitch) != 0) return;
  for (int y = 0; y < H; y++) {
    uint16_t *row = (uint16_t *)((uint8_t *)dst + y * pitch);
    const uint16_t *src = px + y * W;
    for (int x = 0; x < W; x++) row[x] = (uint16_t)(src[x] << 8 | src[x] >> 8);
  }
  SDL_UnlockTexture(tex);
  SDL_RenderClear(ren);
  SDL_RenderCopy(ren, tex, nullptr, nullptr);
  SDL_RenderPresent(ren);
}

static Key keyOf(SDL_Keycode k) {
  if (k >= SDLK_a && k <= SDLK_z) return (Key)((int)Key::A + (k - SDLK_a));
  if (k >= SDLK_0 && k <= SDLK_9) return (Key)((int)Key::N0 + (k - SDLK_0));
  switch (k) {
    case SDLK_RETURN: case SDLK_KP_ENTER: return Key::Enter;
    case SDLK_ESCAPE: return Key::Esc;
    case SDLK_TAB: return Key::Tab;
    case SDLK_SPACE: return Key::Space;
    case SDLK_BACKSPACE: case SDLK_DELETE: return Key::Backspace;
    case SDLK_LSHIFT: case SDLK_RSHIFT: return Key::Shift;
    case SDLK_LCTRL: case SDLK_RCTRL: return Key::Ctrl;
    case SDLK_LALT: case SDLK_RALT: return Key::Alt;
    case SDLK_F1: return Key::Sym;
    case SDLK_F2: return Key::Fn;
    case SDLK_UP: return Key::Up;
    case SDLK_DOWN: return Key::Down;
    case SDLK_LEFT: return Key::Left;
    case SDLK_RIGHT: return Key::Right;
    default: return Key::None;
  }
}

bool poll(KeyEvent &e) {
  if (headlessMode) return false;
  SDL_Event ev;
  while (SDL_PollEvent(&ev)) {
    if (ev.type == SDL_QUIT) { wasClosed = true; continue; }
    if ((ev.type != SDL_KEYDOWN && ev.type != SDL_KEYUP) || ev.key.repeat) continue;
    Key k = keyOf(ev.key.keysym.sym);
    if (k == Key::None) continue;
    e.key = k;
    e.down = ev.type == SDL_KEYDOWN;
    e.ch = e.down ? keyChar(k, (ev.key.keysym.mod & KMOD_SHIFT) != 0) : 0;
    return true;
  }
  return false;
}

bool closed() { return wasClosed; }

void end() {
  if (tex) SDL_DestroyTexture(tex);
  if (ren) SDL_DestroyRenderer(ren);
  if (win) SDL_DestroyWindow(win);
  if (!headlessMode) SDL_Quit();
}

Power power() {
  Power p;
  int pct = -1;
  SDL_PowerState s = SDL_GetPowerInfo(nullptr, &pct);
  p.percent = pct;
  p.charging = s == SDL_POWERSTATE_CHARGING || s == SDL_POWERSTATE_CHARGED;
  return p;
}
const char *side() { return "window"; }
std::string deviceId() { return "cardputer-zero-window"; }
}  // namespace hal
