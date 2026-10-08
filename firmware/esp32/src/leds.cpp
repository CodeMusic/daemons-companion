// C-38: the ring of lights (C-67: whichever the board has -- board.cpp).
// At rest it glows the day's colour at a third. Unused for a minute it goes out, and anything done on the board brings
// it back. A turn of the dial runs one white light once round the ring; select flashes it white; back darkens it.
#include <Adafruit_NeoPixel.h>
#include <Adafruit_DotStar.h>
#include "leds.h"
#include "board.h"

#ifdef BOARD_M5CORE
#include <esp32-hal-spi.h>
// C-75: the M5GO base's ten SK6812s, sent by the SPI bus rather than Adafruit's RMT driver, whose 1.5 KB of instruction
// RAM the original ESP32 does not have to spare. Each of the light's bits is four of SPI's at 3.2 MHz: 1000 a nought
// (0.31 us high), 1100 a one (0.63 us) -- inside the SK6812's timing. Only the data pin is attached: SPI's own default
// clock pin on this bus would be GPIO 14, the screen's chip select.
struct SpiPixels {
  spi_t *bus = nullptr; uint32_t px[16] = {}; int n, pin;
  SpiPixels(int count, int dataPin, int) : n(min(count, 16)), pin(dataPin) {}
  void begin() { bus = spiStartBus(HSPI, spiFrequencyToClockDiv(3200000), SPI_MODE0, SPI_MSBFIRST); if (bus) spiAttachMOSI(bus, pin); }
  void setPixelColor(int i, uint32_t c) { if (i >= 0 && i < n) px[i] = c; }
  void clear() { memset(px, 0, sizeof px); }
  void show() {
    if (!bus) return;
    uint8_t out[16 * 12]; int k = 0;
    for (int i = 0; i < n; i++) {
      uint32_t grb = ((px[i] >> 8) & 0xFF) << 16 | ((px[i] >> 16) & 0xFF) << 8 | (px[i] & 0xFF);   // the light wants G, R, B
      for (int b = 22; b >= 0; b -= 2)
        out[k++] = ((grb >> (b + 1)) & 1 ? 0xC0 : 0x80) | ((grb >> b) & 1 ? 0x0C : 0x08);
    }
    spiWriteNL(bus, out, k);
  }
};
using NeoDriver = SpiPixels;
#else
using NeoDriver = Adafruit_NeoPixel;
#endif

// C-67: the ring is the board's -- eight WS2812s on the CC1101, seven APA102s on the plain T-Embed and the SI4732, none
// on the watch, ten on the M5GO base (C-75). One small facade over the drivers (they share an interface), so nothing
// below changes.
struct Ring {
  NeoDriver *neo = nullptr; Adafruit_DotStar *dot = nullptr;
  void begin() {
    if (board.lights == Lights::WS2812) { neo = new NeoDriver(board.ledCount, board.ledData, NEO_GRB + NEO_KHZ800); neo->begin(); }
    if (board.lights == Lights::APA102) { dot = new Adafruit_DotStar(board.ledCount, board.ledData, board.ledClk, DOTSTAR_BGR); dot->begin(); }
  }
  void setPixelColor(int i, uint32_t c) { if (neo) neo->setPixelColor(i, c); if (dot) dot->setPixelColor(i, c); }
  void show() { if (neo) neo->show(); if (dot) dot->show(); }
  void clear() { if (neo) neo->clear(); if (dot) dot->clear(); }
  static uint32_t Color(uint8_t r, uint8_t g, uint8_t b) { return Adafruit_NeoPixel::Color(r, g, b); }
  static uint32_t ColorHSV(uint16_t h, uint8_t s, uint8_t v) { return Adafruit_NeoPixel::ColorHSV(h, s, v); }
  static uint32_t gamma32(uint32_t c) { return Adafruit_NeoPixel::gamma32(c); }
};

static int N = 8;
static const uint32_t SLEEP_MS = 60000, SPIN_MS = 360, FLASH_MS = 140, DARK_MS = 220;
// If the light runs the wrong way round on the board, flip this: which way the LEDs are numbered around the ring.
static const int CLOCKWISE = 1;

static Ring ring;
static uint32_t dayRgb = 0x4060FF, touchedAt = 0, effectAt = 0, tint = 0;
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

void ledsBegin() { N = max(1, board.ledCount); ring.begin(); ring.clear(); ring.show(); touch(); }
void ledsTint(uint32_t rgb) { tint = rgb; }
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
  if (kind < 0) { effect = NONE; shown = -2; tint = 0; ledsLoop(); return; }
  uint32_t day = tint ? tint : dayRgb, dim = share(dayRgb, 12), white = ring.Color(170, 170, 170);
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
