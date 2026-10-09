// C-94: the Tab5 plays the companion's tunes (firmware/common/tunes.h) as the handhelds do: a square voice of the same
// duty, the same notes, the same day's key -- through M5Unified's speaker, one tune at a time, on a task of its own.
#include <M5Unified.h>
#include "sound.h"
#include "store.h"
#include "../../common/tunes.h"

struct Tune { Note notes[14]; uint8_t n; uint8_t base; float level; float duty; };
static QueueHandle_t queue;
static volatile bool enabled = true;
static volatile int volume = 60;            // 0..100, the site's setting
static volatile int root = 72;              // the day's note, as MIDI
static int species = 0, day = 0;            // the carried daemon, and the day (Sunday 0), for a step's tune

static void wave(float duty, uint8_t *out) {      // one cycle of a square wave, eight samples
  int high = duty <= 0.125f ? 1 : duty <= 0.25f ? 2 : 4;
  for (int i = 0; i < 8; i++) out[i] = i < high ? 255 : 0;
}

static void player(void *) {
  Tune t;
  for (;;) {
    if (xQueueReceive(queue, &t, portMAX_DELAY) != pdTRUE) continue;
    if (!enabled || volume == 0) continue;
    uint8_t w[8]; wave(t.duty, w);
    M5.Speaker.setVolume((uint8_t)(volume * 2 * t.level));
    for (int i = 0; i < t.n; i++) {
      if (t.notes[i].semis != 127) M5.Speaker.tone(noteHz(t.base + t.notes[i].semis), t.notes[i].ms, 0, true, w, 8);
      vTaskDelay(pdMS_TO_TICKS(t.notes[i].ms));
    }
    M5.Speaker.stop(0);
  }
}

static void send(const Note *notes, int n, int base, float level, float duty = 0.5f) {
  if (!queue) return;
  Tune t; t.n = n > 14 ? 14 : n; t.base = base; t.level = level; t.duty = duty;
  for (int i = 0; i < t.n; i++) t.notes[i] = notes[i];
  xQueueSend(queue, &t, 0);                    // a full queue drops the sound, never the tap
}

void soundBegin() {
  M5.Speaker.begin();
  queue = xQueueCreate(4, sizeof(Tune));
  xTaskCreatePinnedToCore(player, "sound", 4096, nullptr, 2, nullptr, 1);
  soundFromState();
}

void soundFromState() {
  JsonDocument s = newDoc();
  if (!kept("state", s)) return;
  enabled = s["settings"]["sound"] | true;
  volume = constrain((int)(s["settings"]["volume"] | 60), 0, 100);
  const char *note = s["day"]["note"] | "C";
  root = dayRoot(note[0]);
  static const char *D[] = { "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday" };
  String name = s["day"]["name"] | "";
  for (int i = 0; i < 7; i++) if (name == D[i]) day = i;
  species = s["daemon"]["species"] | 0;
}

void soundWake()   { send(TUNE_WAKE, 6, WAKE_BASE, 0.8f); }
void soundSelect() { send(TUNE_SELECT, 1, root, 1.0f); }
void soundBack()   { send(TUNE_BACK, 1, root, 0.7f); }
void soundStep(bool undone) {
  Note tune[5], back[5];
  accomplishTune(tune, 0, species, day);
  if (undone) for (int i = 0; i < 5; i++) back[i] = tune[4 - i];
  send(undone ? back : tune, 5, root, undone ? 0.7f : 0.85f, voiceDuty(species, day));
}
