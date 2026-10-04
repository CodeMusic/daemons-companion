// C-38: the T-Embed CC1101's ring -- eight WS2812s on pin 14 (LilyGO's utilities.h, driven as in its own ws2812 test).
// At rest it glows the day's colour at a third. Unused for a minute it goes out, and anything done on the board brings
// it back. A turn of the dial runs one white light once round the ring; select flashes it white; back darkens it.
#include <Adafruit_NeoPixel.h>
#include "leds.h"

static const int PIN = 14, N = 8;
static const uint32_t SLEEP_MS = 60000, SPIN_MS = 360, FLASH_MS = 140, DARK_MS = 220;
// If the light runs the wrong way round on the board, flip this: which way the LEDs are numbered around the ring.
static const int CLOCKWISE = 1;

static Adafruit_NeoPixel ring(N, PIN, NEO_GRB + NEO_KHZ800);
static uint32_t dayRgb = 0x4060FF, touchedAt = 0, effectAt = 0;
static enum { NONE, SPIN, FLASH, DARK } effect = NONE;
static int spinDir = 1, spinFrom = 0, shown = -2;
static bool sleeping = false;   // `shown` avoids rewriting the ring when nothing changed

static int restPercent = 33;                        // the user's 33%; the site can change it (C-43)
static uint32_t share(uint32_t rgb, int percent) {
  return ring.Color(((rgb >> 16) & 255) * percent / 100, ((rgb >> 8) & 255) * percent / 100, (rgb & 255) * percent / 100);
}
static uint32_t third(uint32_t rgb) { return share(rgb, restPercent); }   // the ring at rest
void ledsBrightness(int percent) { restPercent = constrain(percent, 0, 100); shown = -2; }

static void fill(uint32_t c) { for (int i = 0; i < N; i++) ring.setPixelColor(i, c); }

static void touch() { touchedAt = millis(); shown = -2; }

void ledsBegin() { ring.begin(); ring.clear(); ring.show(); touch(); }
void ledsDay(uint32_t rgb) { if (rgb != dayRgb) { dayRgb = rgb; shown = -2; } }

void ledsSpin(int dir) {
  touch();
  if (effect == SPIN && dir == spinDir) return;      // a turn that keeps going lets the light finish its round
  effect = SPIN; spinDir = dir; effectAt = millis();
}
void ledsSleep(bool on) { sleeping = on; effect = NONE; touch(); }

void ledsFlash() { touch(); effect = FLASH; effectAt = millis(); }
void ledsDark()  { touch(); effect = DARK;  effectAt = millis(); }

// C-40: one frame of a dance, shown at once (the tune is playing, so the loop is not running).
void ledsDance(int kind, int step, int steps) {
  if (sleeping) return;
  touch();
  if (kind < 0) { effect = NONE; shown = -2; ledsLoop(); return; }
  uint32_t day = dayRgb, dim = share(dayRgb, 12), white = ring.Color(170, 170, 170);
  fill(dim);
  switch (kind) {
    case DANCE_SPARKLE:                                // a few bright points, a different few each note
      for (int k = 0; k < 3; k++) ring.setPixelColor(random(N), k ? share(day, 100) : white);
      break;
    case DANCE_GLIMMER: {                              // the whole ring breathing, softly
      int p = 15 + (int)(45 * (0.5f + 0.5f * sinf(step * 1.4f)));
      fill(share(day, p));
      break;
    }
    case DANCE_PULSE:                                  // a knock: all on, then dim
      if (step % 2 == 0) fill(share(day, 90));
      break;
    case DANCE_WAVE: {                                 // two lights rolling round, slowly
      int at = (step * 2) % N;
      ring.setPixelColor(at, share(day, 100)); ring.setPixelColor((at + 1) % N, share(day, 50));
      break;
    }
    case DANCE_RAINBOW:                                // C-50, a milestone: every colour, chasing round once, quickly
      for (int i = 0; i < N; i++) ring.setPixelColor(i, ring.gamma32(ring.ColorHSV((uint16_t)((i + step * 2) * 65536 / N), 255, 140)));
      break;
    case DANCE_BLOOM: {                                // C-50, the goal: the ring opening into full colour, turning
      int lit = min(N, 1 + step * N / max(1, steps - 4));
      for (int i = 0; i < lit; i++)
        ring.setPixelColor((i * 3 + step) % N, ring.gamma32(ring.ColorHSV((uint16_t)((i * 8192 + step * 3000) & 0xffff), 230, 170)));
      break;
    }
    default: {                                         // a sweep: one white light, a trail of the day behind it
      int at = steps ? step * N / steps : 0;
      ring.setPixelColor(at % N, white);
      ring.setPixelColor((at + N - 1) % N, share(day, 60));
      ring.setPixelColor((at + N - 2) % N, share(day, 25));
    }
  }
  ring.show();
  shown = -3;                                          // the next rest frame is redrawn
}

void ledsLoop() {
  uint32_t now = millis(), t = now - effectAt;
  int frame;                                         // what the ring should show, as one number, to skip repeats
  if (sleeping) {
    frame = 0;
    if (frame != shown) fill(0);
  } else if (effect == SPIN && t < SPIN_MS) {
    int step = (int)(t * N / SPIN_MS);
    int at = ((spinFrom + spinDir * CLOCKWISE * step) % N + N) % N;
    frame = 100 + at;
    if (frame != shown) { fill(third(dayRgb)); ring.setPixelColor(at, ring.Color(150, 150, 150)); }
  } else if (effect == FLASH && t < FLASH_MS) {
    frame = 200;
    if (frame != shown) fill(ring.Color(150, 150, 150));
  } else if (effect == DARK && t < DARK_MS) {
    frame = 300;
    if (frame != shown) fill(0);
  } else {
    effect = NONE;
    bool asleep = now - touchedAt > SLEEP_MS;
    frame = asleep ? 0 : 1;
    if (frame != shown) fill(asleep ? 0 : third(dayRgb));
  }
  if (frame != shown) { ring.show(); shown = frame; }
}
