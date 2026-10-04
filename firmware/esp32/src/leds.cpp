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
static int spinDir = 1, spinFrom = 0, shown = -2;   // `shown` avoids rewriting the ring when nothing changed

static uint32_t third(uint32_t rgb) {               // a third of the day's colour: 33%
  return ring.Color(((rgb >> 16) & 255) / 3, ((rgb >> 8) & 255) / 3, (rgb & 255) / 3);
}

static void fill(uint32_t c) { for (int i = 0; i < N; i++) ring.setPixelColor(i, c); }

static void touch() { touchedAt = millis(); shown = -2; }

void ledsBegin() { ring.begin(); ring.clear(); ring.show(); touch(); }
void ledsDay(uint32_t rgb) { if (rgb != dayRgb) { dayRgb = rgb; shown = -2; } }

void ledsSpin(int dir) {
  touch();
  if (effect == SPIN && dir == spinDir) return;      // a turn that keeps going lets the light finish its round
  effect = SPIN; spinDir = dir; effectAt = millis();
}
static bool sleeping = false;
void ledsSleep(bool on) { sleeping = on; effect = NONE; touch(); }

void ledsFlash() { touch(); effect = FLASH; effectAt = millis(); }
void ledsDark()  { touch(); effect = DARK;  effectAt = millis(); }

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
