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
#include <Wire.h>
#include "sound.h"
#include "board.h"
#include "leds.h"
#include "../../common/tunes.h"              // C-94: the same notes as every device

static i2s_port_t PORT = I2S_NUM_1;          // C-75: I2S_NUM_0 for the ESP32's own DAC, which only it drives
static const int RATE = 16000;   // C-67: the pins are the board's
static bool ready = false, enabled = true;
static int amplitude = 5000;                 // 0..~16000; the site's volume sets it
static int root = 60 + 12;                   // the day's note, as MIDI (C5 by default)
static uint32_t lastTurn = 0;
static float duty = 0.5f;                    // C-50: a daemon's own voice -- the share of each wave that is high

// C-74: the StickS3's speaker is an ES8311 codec (I2C 0x18) and an amplifier the M5PM1 switches. These are M5Unified's
// own writes for its speaker: reset, the codec clocked from BCLK, the DAC up at 0 dB, its equaliser bypassed.
static void es8311Write(const uint8_t (*regs)[2], int n) {
  for (int i = 0; i < n; i++) { Wire.beginTransmission(0x18); Wire.write(regs[i][0]); Wire.write(regs[i][1]); Wire.endTransmission(); }
}
static void es8311Speaker() {
  static const uint8_t R[][2] = { {0x00, 0x80}, {0x01, 0xB5}, {0x02, 0x18}, {0x0D, 0x01}, {0x12, 0x00}, {0x13, 0x10},
                                  {0x32, 0xBF}, {0x37, 0x08} };
  es8311Write(R, sizeof R / sizeof R[0]);
}
void es8311Mic() {                          // talk.cpp: the same codec, listening (M5Unified's microphone writes)
  static const uint8_t R[][2] = { {0x00, 0x80}, {0x01, 0xBA}, {0x02, 0x18}, {0x0D, 0x01}, {0x0E, 0x02}, {0x14, 0x10},
                                  {0x17, 0xFF}, {0x1C, 0x6A} };
  es8311Write(R, sizeof R / sizeof R[0]);
}

// Every sample goes out through here. C-75: the ESP32's DAC takes unsigned samples, and a pair for each frame: each one
// is offset and doubled, so whichever half of the frame GPIO 25 plays, it plays the sound.
static bool dacStart();
static uint32_t playedAt = 0;
// C-95 (the user, 2026-10-09: on the Fire "the tempo is off -- it goes really quick"): in the ESP32's built-in DAC mode
// the frames go out about 5.53 times faster than the rate asked for -- measured on the Fire with RATETEST down the cable:
// asked 16000, 88,600 a second; 8000, 44,260; 4000, 22,110; below that it stops being in proportion. So the DAC is asked
// for DAC_ASK and really plays DAC_OUT_HZ, and play() holds each 16 kHz sample for its share of those frames.
static const int DAC_ASK = 8000, DAC_OUT_HZ = 44260;
static void play(const int16_t *buf, size_t n) {
  size_t wrote;
  playedAt = millis();
  if (board.dacSpeaker && !dacStart()) return;
  if (!board.dacSpeaker) { i2s_write(PORT, buf, n * sizeof(int16_t), &wrote, portMAX_DELAY); return; }
  // C-95: the DAC plays at DAC_OUT_HZ, not RATE (below), so each sample is held for as many of its frames as it lasts
  static uint16_t pair[512];
  static float pos = 0;                       // where in the samples the next frame falls, carried from call to call
  const float step = (float)RATE / DAC_OUT_HZ;
  int k = 0;
  for (size_t src; (src = (size_t)pos) < n; pos += step) {
    pair[2 * k] = pair[2 * k + 1] = (uint16_t)(buf[src] + 0x8000);
    if (++k == 256) { i2s_write(PORT, pair, sizeof pair, &wrote, portMAX_DELAY); k = 0; }
  }
  pos -= n;
  if (k) i2s_write(PORT, pair, k * 2 * sizeof(uint16_t), &wrote, portMAX_DELAY);
}

#if SOC_I2S_SUPPORTS_DAC
// C-75: the M5GO and Fire's speaker, on the ESP32's own DAC (GPIO 25, its channel 1) -- I2S_NUM_0 drives it. Only while a
// sound plays (2026-10-09: the Fire whined): between, the DAC is let go and GPIO 25 held low, as M5Unified holds it.
static bool dacBegin();
static bool dacOn = false;
static void dacQuiet() { pinMode(25, OUTPUT); digitalWrite(25, LOW); }
static bool dacStart() {
  if (dacOn) return true;
  if (!dacBegin()) return false;
  dacOn = true;
  return true;
}
void soundIdle() {
  if (!dacOn || millis() - playedAt < 400) return;
  i2s_driver_uninstall(PORT);
  dacOn = false;
  dacQuiet();
}
static int dacRate = DAC_ASK;
void soundDacRate(int hz) { if (dacOn) { i2s_driver_uninstall(PORT); dacOn = false; } dacRate = hz; }
static bool dacBegin() {
  PORT = I2S_NUM_0;
  i2s_config_t cfg = {};
  cfg.mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_TX | I2S_MODE_DAC_BUILT_IN);
  cfg.sample_rate = dacRate;
  cfg.bits_per_sample = I2S_BITS_PER_SAMPLE_16BIT;
  cfg.channel_format = I2S_CHANNEL_FMT_RIGHT_LEFT;
  cfg.communication_format = I2S_COMM_FORMAT_STAND_MSB;
  cfg.intr_alloc_flags = ESP_INTR_FLAG_LEVEL1;
  cfg.dma_buf_count = 8; cfg.dma_buf_len = 256;
  cfg.tx_desc_auto_clear = true;
  if (i2s_driver_install(PORT, &cfg, 0, nullptr) != ESP_OK) return false;
  i2s_set_pin(PORT, nullptr);
  i2s_set_dac_mode(I2S_DAC_CHANNEL_RIGHT_EN);
  i2s_zero_dma_buffer(PORT);
  return true;
}
#else
static bool dacStart() { return false; }
void soundDacRate(int) {}
void soundIdle() {}
#endif

void soundBegin() {
  if (board.dacSpeaker) {                      // C-75: started by the first sound, not here
#if SOC_I2S_SUPPORTS_DAC
    dacQuiet();
#endif
    ready = true; return;
  }
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
  pins.mck_io_num = board.i2sMclk >= 0 ? board.i2sMclk : I2S_PIN_NO_CHANGE;
  if (board.i2sMclk >= 0) cfg.mclk_multiple = I2S_MCLK_MULTIPLE_256;
  pins.bck_io_num = board.i2sBclk; pins.ws_io_num = board.i2sLrclk; pins.data_out_num = board.i2sDout; pins.data_in_num = I2S_PIN_NO_CHANGE;
  if (i2s_driver_install(PORT, &cfg, 0, nullptr) != ESP_OK) return;
  if (i2s_set_pin(PORT, &pins) != ESP_OK) { i2s_driver_uninstall(PORT); return; }
  i2s_zero_dma_buffer(PORT);
  if (board.kind == BoardKind::M5StickS3) { es8311Speaker(); pm1Gpio(3, true); }   // C-74: the codec, then its amplifier
  if (board.kind == BoardKind::M5CoreS3) coreS3Speaker(true, RATE);                  // C-75: the AW88298
  ready = true;
}

// C-74, C-75: on the StickS3 the microphone and the speaker share one codec, and on the CoreS3 the speaker and the
// microphones share BCLK and LRCK, so while it listens the speaker's I2S lets go of them (talk.cpp), and takes them back.
void soundPause() {
  if (!ready || !board.sharedClocks()) return;
  if (board.kind == BoardKind::M5StickS3) pm1Gpio(3, false);
  else coreS3Speaker(false, 0);
  i2s_driver_uninstall(PORT);
  ready = false;
}
void soundResume() {
  if (ready || !board.sharedClocks()) return;
  soundBegin();
}

void soundSettings(bool on, int volume) {
  enabled = on;
  amplitude = constrain(volume, 0, 100) * 120;   // 100 is 12000, LilyGO's own test tone level
}

void soundDay(const String &note) { root = dayRoot(note.length() ? note[0] : 'C'); }

static float hz(int midi) { return noteHz(midi); }

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
    play(buf, n);
  }
}

void playNoteSemis(int semis, int ms) { tone(root + semis, ms, 0.7f); }

// C-66: a voice, as 16 kHz samples, at the volume set. It plays even with the board's sounds off: it was asked for.
// C-95: a check from the computer (RATETEST down the cable) -- how long the speaker takes to play two seconds of
// silence at RATE, so a board whose sounds run fast or slow can be measured rather than guessed at
uint32_t soundRateTest() {
  if (!ready) return 0;
  static int16_t zero[256] = {0};
  for (int i = 0; i < 16; i++) play(zero, 256);                 // fill the DMA first, so the timing is steady state
  uint32_t t0 = millis();
  for (int total = RATE * 2; total > 0; total -= 256) play(zero, 256);
  return millis() - t0;
}

void soundPcm(const int16_t *samples, size_t n) {
  if (!ready) return;
  static int16_t buf[256];
  float scale = (amplitude ? amplitude : 40 * 120) / 12000.0f;
  for (size_t done = 0; done < n;) {
    size_t k = min((size_t)256, n - done);
    for (size_t i = 0; i < k; i++) buf[i] = (int16_t)constrain((int)(samples[done + i] * scale), -32768, 32767);
    play(buf, k);
    done += k;
  }
}

static void rest(int ms) {
  if (!ready || !enabled) { delay(ms); return; }
  static int16_t zero[256] = {0};
  for (int total = RATE * ms / 1000; total > 0; total -= 256) {
    play(zero, min(256, total));
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
  const Note *t = TUNE_UPLINK; int dance = DANCE_SWEEP;
  if (!strcmp(type, "FLARE"))           { t = TUNE_FLARE;      dance = DANCE_SPARKLE; }
  else if (!strcmp(type, "WHISPER"))    { t = TUNE_WHISPER;    dance = DANCE_GLIMMER; }
  else if (!strcmp(type, "TOUCHSTONE")) { t = TUNE_TOUCHSTONE; dance = DANCE_PULSE; }
  else if (!strcmp(type, "LONGWAVE"))   { t = TUNE_LONGWAVE;   dance = DANCE_WAVE; }
  play(t, 6, root, dance, 0.8f);
}

// C-68: a routine from the game, played as a game would: a short phrase of its own, GENERATED from its name (so PUSH
// always sounds like PUSH) in the day's pentatonic key, its type choosing the ring's dance and the voice, the ring lit
// the colour of its streak on this daemon. No words: the sound and the light are the routine.
void soundGameRoutine(const String &name, const String &type, uint32_t rgb) {
  static const int DANCES[] = { DANCE_SPARKLE, DANCE_GLIMMER, DANCE_PULSE, DANCE_WAVE, DANCE_SWEEP };
  float was = duty; int d;
  Note tune[6];
  gameTune(tune, name.c_str(), type.c_str(), duty, d);
  int ts = d;
  ledsTint(rgb);
  play(tune, 6, root, DANCES[ts], 0.85f);
  duty = was;
}

// C-13: tending it -- three notes, glad, in the day's key, the ring pulsing with them
void soundCare(int what) { play(TUNE_CARE[constrain(what, 0, 2)], 3, root, DANCE_PULSE, 0.8f); }

// ---- C-50: accomplishment. Each daemon's tunes are its own: GENERATED from its species number and the day of the week
// (the user, 2026-10-04), in a pentatonic scale on the day's note -- so no two notes ever clash -- with a voice (the
// wave's duty) of its own. A step: five notes, rising overall. Undoing it: the same five, reversed. A milestone: seven,
// ending an octave and a fifth up, the ring a quick rainbow (there is more to do). The whole goal: a longer phrase that climbs and
// blooms, the ring swirling into full colour -- things coming to life.
static void voiceOf(int species, int day) { duty = voiceDuty(species, day); }

void soundAccomplish(int kind, int species, int day) {     // 0 a step, 1 a milestone, 2 the whole goal
  Note tune[14];
  int n = accomplishTune(tune, kind, species, day);
  voiceOf(species, day);
  play(tune, n, root, kind == 0 ? DANCE_PULSE : kind == 1 ? DANCE_RAINBOW : DANCE_BLOOM, 0.85f);
  if (kind == 2) { for (int i = 0; i < 8; i++) { ledsDance(DANCE_BLOOM, 12 + i, 20); delay(90); } ledsDance(-1, 0, 0); }
  duty = 0.5f;
}

void soundUndo(int species, int day) {                      // the step's own tune, backwards
  Note tune[5], back[5];
  accomplishTune(tune, 0, species, day);
  for (int i = 0; i < 5; i++) back[i] = tune[4 - i];
  voiceOf(species, day);
  play(back, 5, root, DANCE_PULSE, 0.7f);
  duty = 0.5f;
}

// C-41: the title theme's opening phrase (mus_title.mid, its first track: C#4 held, up to G#4, then F#-D#-F#, onto a
// long F), quickened to a second and a half and an octave up -- in the title's own C#, whatever the day.
void soundWake() { play(TUNE_WAKE, 6, WAKE_BASE, DANCE_SWEEP, 0.8f); }
