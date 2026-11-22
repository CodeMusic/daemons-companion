// C-479 (the user, 2026-11-22, of the phone and the site: "train now is where the daemon tries to play its song but
// based on its exp it only gets some notes right ... after attempting his song (with correct colours) music notes come
// from him ... if some of it was wrong u would see the green binary 'back propagation' code flow back into him"):
// TRAIN on a board, as C-418 made it in the app. The companion sends the lesson as the board sings it (server/src/
// ownsong.ts boardSong): each note as it was sung -- right, or one of its static's candidates -- its length, and its
// pitch's colour; then the groups carried back, one for each note the lesson moved. The board plays the notes on its
// instrument from the loop (nothing waits), each rising from the daemon in its colour, a wrong one shaken; then the
// groups fly back into it in green. Every word DRAFT.
#include <ArduinoJson.h>
#include "app.h"
#include "display.h"
#include "sound.h"
#include "song.h"

struct Sung { uint8_t midi; uint16_t ms; bool right; uint32_t rgb; };
static const int MAX_NOTES = 48, MAX_BITS = 16, RISES = 14;
static Sung notes[MAX_NOTES];
static String bits[MAX_BITS];
static int count = 0, bitCount = 0, playing = -1;
static uint32_t nextAt = 0, backAt = 0, endAt = 0;
static int learnedPct = -1;                            // the part known after the lesson, said once it is sung
struct Rise { uint32_t at; uint32_t rgb; bool right; int8_t dx; };
static Rise rises[RISES];
static int riseNext = 0;
static const uint32_t RISE_MS = 1500, BACK_EACH_MS = 170, BACK_MS = 1300, BACKPROP_GREEN = 0x52F77B;

bool trainSongTake(const char *json) {
  JsonDocument d;
  if (deserializeJson(d, json)) return false;
  JsonArrayConst n = d["notes"];
  if (n.isNull() || !n.size()) return false;
  count = 0;
  for (JsonArrayConst a : n) {
    if (count >= MAX_NOTES) break;
    notes[count++] = { (uint8_t)constrain((int)(a[0] | 60), 24, 108), (uint16_t)constrain((int)(a[1] | 300), 60, 2000),
                       (a[2] | 0) == 1, (uint32_t)(a[3] | 0x888888) };
  }
  bitCount = 0;
  for (JsonVariantConst b : d["bits"].as<JsonArrayConst>()) if (bitCount < MAX_BITS) bits[bitCount++] = (const char *)(b | "");
  learnedPct = (d["counted"] | false) ? (int)roundf(100 * (float)(d["after"] | 0.0f)) : -1;
  for (Rise &r : rises) r.at = 0;
  riseNext = 0; playing = 0; nextAt = millis() + 300; backAt = endAt = 0;   // after the care's own tune has begun
  dirty = true;
  return true;
}

bool trainSongActive() { return playing >= 0 || (endAt && millis() < endAt); }

void trainSongLoop(uint32_t now) {
  if (playing >= 0 && (int32_t)(now - nextAt) >= 0) {
    if (playing < count) {
      const Sung &s = notes[playing++];
      soundInstrumentStart(s.midi, s.ms * 9 / 10);
      rises[riseNext] = { now, s.rgb, s.right, (int8_t)((int)(esp_random() % 41) - 20) };
      riseNext = (riseNext + 1) % RISES;
      nextAt = now + s.ms;
    } else {
      soundInstrumentRelease();
      playing = -1; backAt = now + 250;
      endAt = backAt + (bitCount ? BACK_MS + BACK_EACH_MS * (bitCount - 1) : 0) + RISE_MS;
      if (learnedPct >= 0) say("Its song: " + String(learnedPct) + "%");      // DRAFT
    }
  }
  if (trainSongActive()) dirty = true;
}

static uint16_t c565(uint32_t rgb) { return canvas.color565((rgb >> 16) & 255, (rgb >> 8) & 255, rgb & 255); }

// over the daemon, its middle at cx, cy and its picture `side` across
void trainSongDraw(int cx, int cy, int side) {
  if (!trainSongActive()) return;
  uint32_t t = millis();
  // the notes it sang, rising from it in the colour of each pitch -- a wrong one shaking as it goes
  for (const Rise &r : rises) {
    if (!r.at || t - r.at > RISE_MS) continue;
    float k = (t - r.at) / (float)RISE_MS;
    int x = cx + r.dx + (int)(10 * sinf(k * 6.0f)) + (r.right ? 0 : ((t / 60) % 2 ? 2 : -2));
    int y = cy - side / 3 - (int)(k * side * 0.9f);
    uint16_t c = c565(r.rgb);
    canvas.fillEllipse(x, y, 5, 4, c);                     // the head
    canvas.drawFastVLine(x + 4, y - 14, 14, c);            // the stem
    canvas.drawLine(x + 4, y - 14, x + 9, y - 9, c);       // the flag
    if (!r.right) { canvas.drawPixel(x - 7, y - 3, c); canvas.drawPixel(x + 8, y + 2, c); canvas.drawPixel(x - 4, y + 6, c); }   // its static
  }
  // the error carried back: each group from the edge of the screen into the daemon, one after another, in green
  if (backAt && bitCount && (int32_t)(t - backAt) >= 0) {
    canvas.setTextFont(1); canvas.setTextDatum(MC_DATUM); canvas.setTextColor(c565(BACKPROP_GREEN));
    int r0 = max(W, H) / 2;
    for (int i = 0; i < bitCount; i++) {
      int32_t e = (int32_t)(t - backAt) - i * (int32_t)BACK_EACH_MS;
      if (e < 0 || e > (int32_t)BACK_MS) continue;
      float k = e / (float)BACK_MS, a = i * 2.39996f;     // each from its own side, round the circle
      float rr = r0 * (1 - k) + 6 * k;
      canvas.drawString(bits[i], cx + (int)(rr * cosf(a)), cy + (int)(rr * sinf(a)));
    }
  }
}
