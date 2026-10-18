// C-94: the Tab5 plays the companion's tunes (firmware/common/tunes.h) as the handhelds do: a square voice of the same
// duty, the same notes, the same day's key -- through M5Unified's speaker, one tune at a time, on a task of its own.
#include <M5Unified.h>
#include <esp_heap_caps.h>
#include "sound.h"
#include "store.h"
#include "../../common/tunes.h"
#include "../../common/instruments.h"            // T-425: DAEMONS' own harp and flute

struct Tune { Note notes[14]; uint8_t n; uint8_t base; float level; float duty; bool sampled; };
static QueueHandle_t queue;
static SemaphoreHandle_t voiceLock;              // C-99: the network task starts a voice, the screen stops it
static volatile bool enabled = true;
static volatile int volume = 60;            // 0..100, the site's setting
static volatile int root = 72;              // the day's note, as MIDI
static int species = 0, day = 0;            // the carried daemon, and the day (Sunday 0), for a step's tune

static void wave(float duty, uint8_t *out) {      // one cycle of a square wave, eight samples
  int high = duty <= 0.125f ? 1 : duty <= 0.25f ? 2 : 4;
  for (int i = 0; i < 8; i++) out[i] = i < high ? 255 : 0;
}

// T-425 (the user, 2026-10-18: "these same tunes on the devices (and tab5 and phone) -- so everything feels in sync"): a
// tune on the save's own instrument -- the harp for CONTENT, the flute for CONTEXT -- rendered as the phone renders it
// (app/instrument.ts): each note the sample played faster or slower to its pitch, looped while held (the flute) or played
// out (the harp), under its attack, decay, sustain and release, the release ringing under the next. The taps' clicks
// stay the square wave.
static volatile int instrumentAt = 0;              // INSTRUMENTS[], by the save's edition (soundFromState)
static const int RATE = 22050;
static int16_t *renderTune(const Tune &t, size_t &count) {
  const Instrument &ins = INSTRUMENTS[instrumentAt];
  size_t total = 0;
  for (int k = 0; k < t.n; k++) total += (size_t)t.notes[k].ms * RATE / 1000;
  size_t rel = (size_t)ins.releaseMs * RATE / 1000, len = total + rel;
  float *mix = (float *)heap_caps_calloc(len, sizeof(float), MALLOC_CAP_SPIRAM);
  if (!mix) return nullptr;
  bool loops = ins.loopStart >= 0 && ins.loopEnd > ins.loopStart + 1 && (uint32_t)ins.loopEnd <= ins.n;
  size_t att = max<size_t>(1, (size_t)ins.attackMs * RATE / 1000), dec = max<size_t>(1, (size_t)ins.decayMs * RATE / 1000);
  size_t start = 0;
  for (int k = 0; k < t.n; k++) {
    size_t held = (size_t)t.notes[k].ms * RATE / 1000;
    if (t.notes[k].semis != 127) {
      float step = powf(2.0f, (t.base + t.notes[k].semis - ins.root) / 12.0f) * ins.rate / RATE, pos = 0, level = 0;
      for (size_t i = 0; i < held + rel && start + i < len; i++) {
        if (pos >= (loops ? ins.loopEnd : ins.n - 1)) { if (!loops) break; pos -= ins.loopEnd - ins.loopStart; }
        uint32_t j = (uint32_t)pos; float f = pos - j;
        float a = ins.pcm[j] / 32768.0f, b = ins.pcm[min<uint32_t>(j + 1, ins.n - 1)] / 32768.0f;
        if (i < held) level = i < att ? (float)i / att : i < att + dec ? 1 - (1 - ins.sustain) * ((float)(i - att) / dec) : ins.sustain;
        float env = i < held ? level : level * (1 - (float)(i - held) / max<size_t>(1, rel));
        mix[start + i] += (a + (b - a) * f) * env;
        pos += step;
      }
    }
    start += held;
  }
  float peak = 0;
  for (size_t i = 0; i < len; i++) peak = max(peak, fabsf(mix[i]));
  float g = peak > 0 ? 0.7f / max(peak, 0.7f) : 0;   // never louder than the sample, never clipped
  int16_t *out = (int16_t *)heap_caps_malloc(len * sizeof(int16_t), MALLOC_CAP_SPIRAM);
  if (out) for (size_t i = 0; i < len; i++) out[i] = (int16_t)lroundf(constrain(mix[i] * g, -1.0f, 1.0f) * 32767);
  heap_caps_free(mix);
  count = len;
  return out;
}

static void player(void *) {
  Tune t;
  for (;;) {
    if (xQueueReceive(queue, &t, portMAX_DELAY) != pdTRUE) continue;
    if (!enabled || volume == 0) continue;
    if (t.sampled) {                               // T-425: on the instrument; played out before the next is taken
      size_t n = 0;
      if (int16_t *pcm = renderTune(t, n)) {
        M5.Speaker.setVolume((uint8_t)(volume * 2 * t.level));
        M5.Speaker.playRaw(pcm, n, RATE, false, 1, 0, true);
        vTaskDelay(pdMS_TO_TICKS(n * 1000 / RATE + 20));
        while (M5.Speaker.isPlaying(0)) vTaskDelay(pdMS_TO_TICKS(10));
        heap_caps_free(pcm);
        continue;
      }
    }
    uint8_t w[8]; wave(t.duty, w);
    M5.Speaker.setVolume((uint8_t)(volume * 2 * t.level));
    for (int i = 0; i < t.n; i++) {
      if (t.notes[i].semis != 127) M5.Speaker.tone(noteHz(t.base + t.notes[i].semis), t.notes[i].ms, 0, true, w, 8);
      vTaskDelay(pdMS_TO_TICKS(t.notes[i].ms));
    }
    M5.Speaker.stop(0);
  }
}

static void send(const Note *notes, int n, int base, float level, float duty = 0.5f, bool sampled = true) {
  if (!queue) return;
  Tune t; t.n = n > 14 ? 14 : n; t.base = base; t.level = level; t.duty = duty; t.sampled = sampled;
  for (int i = 0; i < t.n; i++) t.notes[i] = notes[i];
  xQueueSend(queue, &t, 0);                    // a full queue drops the sound, never the tap
}

// C-156: a SONGBOOK song on the square voice the tunes use, each note its MIDI number for its milliseconds (up to 14)
void soundSong(const int *midi, const int *ms, int n) {
  Note notes[14]; n = n > 14 ? 14 : n;
  for (int i = 0; i < n; i++) notes[i] = { (int8_t)(midi[i] > 126 ? 126 : midi[i]), (uint16_t)ms[i] };
  send(notes, n, 0, 1.0f);
}

void soundBegin() {
  M5.Speaker.begin();
  queue = xQueueCreate(4, sizeof(Tune));
  voiceLock = xSemaphoreCreateMutex();
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
  const char *ed = s["edition"] | "CONTENT";        // T-425: the save's own instrument
  for (int i = 0; i < INSTRUMENT_N; i++) if (!strcmp(INSTRUMENTS[i].edition, ed)) instrumentAt = i;
}

// C-99: on a channel of its own, so the taps' tones still play over it
static const int VOICE_CH = 7;
static int16_t *voicePcm = nullptr;
static void stopLocked() {
  M5.Speaker.stop(VOICE_CH);
  if (voicePcm) { heap_caps_free(voicePcm); voicePcm = nullptr; }
}
void soundVoiceStop() { xSemaphoreTake(voiceLock, portMAX_DELAY); stopLocked(); xSemaphoreGive(voiceLock); }
void soundVoice(int16_t *pcm, size_t samples, int rate) {
  xSemaphoreTake(voiceLock, portMAX_DELAY);
  stopLocked();
  voicePcm = pcm;
  if (enabled && volume > 0) {
    M5.Speaker.setVolume((uint8_t)min(255, volume * 2));
    M5.Speaker.setChannelVolume(VOICE_CH, 255);
    M5.Speaker.playRaw(pcm, samples, rate, false, 1, VOICE_CH, true);
  }
  xSemaphoreGive(voiceLock);
}
bool soundVoicePlaying() { return voicePcm && M5.Speaker.isPlaying(VOICE_CH); }

void soundWake()   { send(TUNE_WAKE, 6, WAKE_BASE, 0.8f); }
void soundSelect() { send(TUNE_SELECT, 1, root, 1.0f, 0.5f, false); }   // a tap's click, the square wave
void soundBack()   { send(TUNE_BACK, 1, root, 0.7f, 0.5f, false); }
void soundCare(int what) { const CareTune &t = TUNE_CARE[constrain(what, 0, 3)]; send(t.notes, t.n, root, 0.85f); }   // C-114, C-118
#define TUNE(t) t, (int)(sizeof t / sizeof *t)
void soundSlots(int what, const String &look) {   // C-158: the boards' rule (firmware/esp32/src/sound.cpp), without the lights
  if (what == 0) send(TUNE(TUNE_SLOTS_PULL), root, 0.8f);
  else if (what == 5) send(TUNE(TUNE_SLOTS_CHEER), root, 0.8f);
  else if (what == 1) send(TUNE(TUNE_SLOTS_LOSE), root, 0.5f);
  else if (what == 2) send(TUNE(TUNE_SLOTS_WIN), root, 0.85f);
  else if (look == "pumpkins") send(TUNE(TUNE_SLOTS_SPOOKY), root, 0.9f);
  else if (look == "presents") send(TUNE(TUNE_SLOTS_JINGLE), root, 0.9f);
  else if (look == "fireworks") send(TUNE(TUNE_SLOTS_FIREWORK), root, 0.9f);
  else if (look == "hearts") send(TUNE(TUNE_SLOTS_SWEET), root, 0.85f);
  else if (what == 3) send(TUNE(TUNE_SLOTS_BIG), root, 0.9f);
  else send(TUNE(TUNE_SLOTS_JACKPOT), root, 1.0f);
}
#undef TUNE
void soundStep(bool undone) {
  Note tune[5], back[5];
  accomplishTune(tune, 0, species, day);
  if (undone) for (int i = 0; i < 5; i++) back[i] = tune[4 - i];
  send(undone ? back : tune, 5, root, undone ? 0.7f : 0.85f, voiceDuty(species, day));
}
