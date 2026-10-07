// C-40, C-41: the board's sounds. The speaker is I2S on the board's pins (C-67; on the CC1101 BCLK 46, LRCLK 40, DIN 7: LilyGO's
// utilities.h, driven as its own mic-and-speaker test drives it: 16 kHz, 16-bit, the left channel, I2S_NUM_1).
//
// The voice is a square wave with a short rise and fall -- the game's own chip voice, and no clicks. Just enough tones
// to be recognised: the user's rule is that two give enough character.
//
// Every interaction is in the DAY'S KEY: its note (vision 9.21: Sunday C ... Saturday B) in the octave above middle C.
// A routine's tune is that routine's shape in the day's key, so the same routine sounds a little different each day
// and always like itself. The wake jingle is the one thing NOT in the day's key: it is the front door, and the title
// screen is in C# (vision 7.14g, "a semitone above everywhere you will go").
#include <driver/i2s.h>
#include "sound.h"
#include "board.h"
#include "leds.h"

static const i2s_port_t PORT = I2S_NUM_1;
static const int RATE = 16000;   // C-67: the pins are the board's
static bool ready = false, enabled = true;
static int amplitude = 5000;                 // 0..~16000; the site's volume sets it
static int root = 60 + 12;                   // the day's note, as MIDI (C5 by default)
static uint32_t lastTurn = 0;
static float duty = 0.5f;                    // C-50: a daemon's own voice -- the share of each wave that is high

void soundBegin() {
  i2s_config_t cfg = {};
  cfg.mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_TX);
  cfg.sample_rate = RATE;
  cfg.bits_per_sample = I2S_BITS_PER_SAMPLE_16BIT;
  cfg.channel_format = I2S_CHANNEL_FMT_ONLY_LEFT;
  cfg.communication_format = I2S_COMM_FORMAT_STAND_I2S;
  cfg.intr_alloc_flags = ESP_INTR_FLAG_LEVEL1;
  cfg.dma_buf_count = 8;
  cfg.dma_buf_len = 256;
  cfg.tx_desc_auto_clear = true;              // silence, not the last buffer again, when nothing is playing
  i2s_pin_config_t pins = {};
  pins.mck_io_num = I2S_PIN_NO_CHANGE;
  pins.bck_io_num = board.i2sBclk; pins.ws_io_num = board.i2sLrclk; pins.data_out_num = board.i2sDout; pins.data_in_num = I2S_PIN_NO_CHANGE;
  if (i2s_driver_install(PORT, &cfg, 0, nullptr) != ESP_OK) return;
  if (i2s_set_pin(PORT, &pins) != ESP_OK) { i2s_driver_uninstall(PORT); return; }
  i2s_zero_dma_buffer(PORT);
  ready = true;
}

void soundSettings(bool on, int volume) {
  enabled = on;
  amplitude = constrain(volume, 0, 100) * 120;   // 100 is 12000, LilyGO's own test tone level
}

void soundDay(const String &note) {
  static const char *NAMES = "C D EF G A B";   // C=0 D=2 E=4 F=5 G=7 A=9 B=11
  const char *at = strchr(NAMES, note.length() ? note[0] : 'C');
  root = 72 + (at ? (int)(at - NAMES) : 0);
}

static float hz(int midi) { return 440.0f * powf(2.0f, (midi - 69) / 12.0f); }

// One note: a square wave, 4 ms in and 8 ms out, at `level` of the volume (1.0 = the setting itself).
static void tone(int midi, int ms, float level = 1.0f) {
  if (!ready || !enabled || amplitude == 0) return;
  static int16_t buf[256];
  int total = RATE * ms / 1000, rise = RATE * 4 / 1000, fall = RATE * 8 / 1000;
  float period = RATE / hz(midi), phase = 0;
  int amp = (int)(amplitude * level);
  for (int done = 0; done < total;) {
    int n = min(256, total - done);
    for (int i = 0; i < n; i++, done++) {
      float env = done < rise ? (float)done / rise : done > total - fall ? (float)(total - done) / fall : 1.0f;
      buf[i] = (int16_t)((phase < period * duty ? amp : -amp) * env);
      if ((phase += 1) >= period) phase -= period;
    }
    size_t wrote;
    i2s_write(PORT, buf, n * sizeof(int16_t), &wrote, portMAX_DELAY);
  }
}

// C-66: a voice, as 16 kHz samples, at the volume set. It plays even with the board's sounds off: it was asked for.
void soundPcm(const int16_t *samples, size_t n) {
  if (!ready) return;
  static int16_t buf[256];
  float scale = (amplitude ? amplitude : 40 * 120) / 12000.0f;
  for (size_t done = 0; done < n;) {
    size_t k = min((size_t)256, n - done);
    for (size_t i = 0; i < k; i++) buf[i] = (int16_t)constrain((int)(samples[done + i] * scale), -32768, 32767);
    size_t wrote;
    i2s_write(PORT, buf, k * sizeof(int16_t), &wrote, portMAX_DELAY);
    done += k;
  }
}

static void rest(int ms) {
  if (!ready || !enabled) { delay(ms); return; }
  static int16_t zero[256] = {0};
  for (int total = RATE * ms / 1000; total > 0; total -= 256) {
    size_t wrote;
    i2s_write(PORT, zero, min(256, total) * sizeof(int16_t), &wrote, portMAX_DELAY);
  }
}

// The dial turns in detents, often several a second: a pair for each would pile up behind the dial, so a turn
// sounds only when the last one has had time to finish.
void soundTurn(int dir) {
  if (millis() - lastTurn < 90) return;
  lastTurn = millis();
  if (dir > 0) { tone(root, 28, 0.6f); tone(root + 7, 34, 0.6f); }
  else         { tone(root + 7, 28, 0.6f); tone(root, 34, 0.6f); }
}

void soundSelect() { tone(root + 12, 55); }
void soundBack()   { tone(root - 12, 45, 0.7f); }

// ---- a routine's tune: about six notes, its own shape in the day's key, the ring dancing in step --------------------
struct Note { int8_t semis; uint16_t ms; };          // semis from the day's root; 127 is a rest
static const Note FLARE[]      = { {0, 60}, {4, 60}, {7, 60}, {12, 60}, {16, 60}, {19, 140} };   // a flare going up
static const Note WHISPER[]    = { {12, 110}, {7, 110}, {9, 110}, {4, 110}, {7, 110}, {0, 200} }; // said softly, settling
static const Note TOUCHSTONE[] = { {0, 70}, {127, 50}, {0, 70}, {7, 90}, {127, 40}, {12, 160} }; // a knock, and an answer
static const Note LONGWAVE[]   = { {0, 120}, {-5, 120}, {0, 120}, {-5, 120}, {0, 120}, {7, 200} }; // a long slow wave
static const Note UPLINK[]     = { {0, 70}, {7, 70}, {12, 70}, {7, 70}, {14, 70}, {12, 160} };   // looking, finding
static const Note WAKE[]       = { {0, 190}, {7, 330}, {5, 50}, {2, 140}, {5, 190}, {4, 470} };  // the title's opening

static void play(const Note *notes, int n, int base, int dance, float level) {
  for (int i = 0; i < n; i++) {
    ledsDance(dance, i, n);
    if (notes[i].semis == 127) rest(notes[i].ms);
    else tone(base + notes[i].semis, notes[i].ms, level);
  }
  rest(20);
  ledsDance(-1, 0, 0);                               // back to the ring at rest
}

void soundRoutine(const char *type) {
  const Note *t = UPLINK; int dance = DANCE_SWEEP;
  if (!strcmp(type, "FLARE"))           { t = FLARE;      dance = DANCE_SPARKLE; }
  else if (!strcmp(type, "WHISPER"))    { t = WHISPER;    dance = DANCE_GLIMMER; }
  else if (!strcmp(type, "TOUCHSTONE")) { t = TOUCHSTONE; dance = DANCE_PULSE; }
  else if (!strcmp(type, "LONGWAVE"))   { t = LONGWAVE;   dance = DANCE_WAVE; }
  play(t, 6, root, dance, 0.8f);
}

// C-68: a routine from the game, played as a game would: a short phrase of its own, GENERATED from its name (so PUSH
// always sounds like PUSH) in the day's pentatonic key, its type choosing the ring's dance and the voice, the ring lit
// the colour of its streak on this daemon. No words: the sound and the light are the routine.
static const int8_t GAME_PENTA[] = {0, 2, 4, 7, 9, 12, 14, 16, 19};
void soundGameRoutine(const String &name, const String &type, uint32_t rgb) {
  uint32_t s = 2166136261u;
  for (char c : name) s = (s ^ (uint8_t)c) * 16777619u;           // FNV-1a: the name's own seed
  uint32_t ts = 0; for (char c : type) ts = ts * 31 + (uint8_t)c;
  static const int DANCES[] = { DANCE_SPARKLE, DANCE_GLIMMER, DANCE_PULSE, DANCE_WAVE, DANCE_SWEEP };
  float was = duty; static const float DUTIES[] = {0.125f, 0.25f, 0.5f}; duty = DUTIES[ts % 3];
  Note tune[6]; int at = s % 3;
  for (int i = 0; i < 6; i++) {
    s = s * 1103515245u + 12345u;
    bool last = i == 5;
    tune[i].semis = GAME_PENTA[constrain(last ? (int)((s >> 16) % 2) * 3 + 5 : at, 0, 8)];
    tune[i].ms = last ? 220 : 60 + ((s >> 20) % 3) * 25;
    at = constrain(at + (int)((s >> 18) % 4) - 1, 0, 7);           // wandering upward
  }
  ledsTint(rgb);
  play(tune, 6, root, DANCES[ts % 5], 0.85f);
  duty = was;
}

// C-13: tending it -- three notes, glad, in the day's key, the ring pulsing with them
static const Note CARE_TUNES[3][3] = { { {0, 70}, {4, 70}, {7, 150} },      // fed: a full chord, settling
                                       { {7, 60}, {12, 60}, {9, 140} },     // watered: a splash and a sip
                                       { {0, 60}, {7, 60}, {12, 150} } };   // trained: up, and up
void soundCare(int what) { play(CARE_TUNES[constrain(what, 0, 2)], 3, root, DANCE_PULSE, 0.8f); }

// ---- C-50: accomplishment. Each daemon's tunes are its own: GENERATED from its species number and the day of the week
// (the user, 2026-10-04), in a pentatonic scale on the day's note -- so no two notes ever clash -- with a voice (the
// wave's duty) of its own. A step: five notes, rising overall. Undoing it: the same five, reversed. A milestone: seven,
// ending an octave and a fifth up, the ring a quick rainbow (there is more to do). The whole goal: a longer phrase that climbs and
// blooms, the ring swirling into full colour -- things coming to life.
static const int8_t PENTA[] = {0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24};
static uint32_t seedOf(int species, int day, int kind) { return (uint32_t)species * 2654435761u ^ (uint32_t)(day * 97 + kind * 13 + 1); }
static int nextRand(uint32_t &s) { s = s * 1103515245u + 12345u; return (s >> 16) & 0x7fff; }

static int buildTune(Note *out, int n, int species, int day, int kind) {
  uint32_t s = seedOf(species, day, kind);
  int at = nextRand(s) % 3;                                  // start low in the scale
  for (int i = 0; i < n; i++) {
    bool last = i == n - 1;
    if (last) at = kind == 0 ? 5 : kind == 1 ? 8 : 10;   // a step lands on the octave, a milestone higher, the goal highest
    out[i].semis = PENTA[constrain(at, 0, 10)];
    out[i].ms = last ? (kind == 2 ? 360 : 200) : (kind == 2 ? 95 : 80) + (nextRand(s) % 3) * 20;
    at += 1 + nextRand(s) % 2 - (nextRand(s) % 5 == 0 ? 2 : 0);          // mostly up, now and then a step back
  }
  return n;
}

static void voiceOf(int species, int day) {
  static const float DUTIES[] = {0.125f, 0.25f, 0.5f};
  duty = DUTIES[(species + day) % 3];
}

void soundAccomplish(int kind, int species, int day) {     // 0 a step, 1 a milestone, 2 the whole goal
  Note tune[14];
  int n = buildTune(tune, kind == 0 ? 5 : kind == 1 ? 7 : 12, species, day, kind);
  voiceOf(species, day);
  play(tune, n, root, kind == 0 ? DANCE_PULSE : kind == 1 ? DANCE_RAINBOW : DANCE_BLOOM, 0.85f);
  if (kind == 2) { for (int i = 0; i < 8; i++) { ledsDance(DANCE_BLOOM, 12 + i, 20); delay(90); } ledsDance(-1, 0, 0); }
  duty = 0.5f;
}

void soundUndo(int species, int day) {                      // the step's own tune, backwards
  Note tune[5], back[5];
  buildTune(tune, 5, species, day, 0);
  for (int i = 0; i < 5; i++) back[i] = tune[4 - i];
  voiceOf(species, day);
  play(back, 5, root, DANCE_PULSE, 0.7f);
  duty = 0.5f;
}

// C-41: the title theme's opening phrase (mus_title.mid, its first track: C#4 held, up to G#4, then F#-D#-F#, onto a
// long F), quickened to a second and a half and an octave up -- in the title's own C#, whatever the day.
void soundWake() { play(WAKE, 6, 61 + 12, DANCE_SWEEP, 0.8f); }
