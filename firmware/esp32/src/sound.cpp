// C-40, C-41: the board's sounds. The speaker is I2S on the board's pins (C-67; on the CC1101 BCLK 46, LRCLK 40, DIN 7: LilyGO's
// utilities.h, driven as its own mic-and-speaker test drives it: 16 kHz, 16-bit, the left channel, I2S_NUM_1).
//
// The voice is a square wave with a short rise and fall -- the game's own chip voice, and no clicks. Just enough tones
// to be recognised: the user's rule is that two give enough character. C-164 (DAEMONS T-425): on a board with an I2S
// speaker every tune is played instead on the save's own instrument -- DAEMONS' harp for CONTENT, its flute for CONTEXT
// (firmware/common/instruments.h), the same notes as the phone, the site and the Tab5 play them on it. The M5GO and
// Fire's DAC and the Dial's and StickC-Plus's buzzers keep the square wave.
//
// Every interaction is in the DAY'S KEY: its note (vision 9.21: Sunday C ... Saturday B) in the octave above middle C.
// A routine's tune is that routine's shape in the day's key, so the same routine sounds a little different each day
// and always like itself. The wake jingle is the one thing NOT in the day's key: it is the front door, and the title
// screen is in C# (vision 7.14g, "a semitone above everywhere you will go").
#include <driver/i2s.h>
#include <Wire.h>
#include <freertos/FreeRTOS.h>
#include <freertos/queue.h>
#include <freertos/semphr.h>
#include <freertos/task.h>
#include <Preferences.h>
#include <esp_timer.h>
#include "sound.h"
#include "board.h"
#include "leds.h"
#include "../../common/tunes.h"              // C-94: the same notes as every device
// C-164: the instrument's samples (about 160 KB of flash) only in the builds whose boards have an I2S speaker
#if defined(BOARD_M5CORE) || defined(BOARD_STICKC_PLUS) || defined(BOARD_DIAL) || defined(BOARD_TDISPLAY_PRO) || defined(BOARD_TDISPLAY_AMOLED)
#define SAMPLED 0
#else
#define SAMPLED 1
#include "../../common/instruments.h"         // DAEMONS' own harp and flute
#endif

static i2s_port_t PORT = I2S_NUM_1;          // C-75: I2S_NUM_0 for the ESP32's own DAC, which only it drives
static const int RATE = 16000;   // C-67: the pins are the board's
static bool ready = false, enabled = true;
static int amplitude = 5000;                 // 0..~16000; the site's volume sets it
static int root = 60 + 12;                   // the day's note, as MIDI (C5 by default)
static uint32_t lastTurn = 0;
static float duty = 0.5f;                    // C-50: a daemon's own voice -- the share of each wave that is high

// C-121 (the user, 2026-10-15: "the 3 buttons should make a noise and immediate visual feedback"): a care's tune and the
// wake jingle play from a task of their own, so the screen is drawn and the buttons heard while they sound -- they took
// a second or three, and nothing moved until they ended. Any other sound ends them first (the next press's click, a turn
// of the dial), and a new one replaces the one playing. The task never touches the ring: it says which step of the
// dance is next, and the loop (soundLoop) shows it, as it alone drives the LEDs.
struct Tune { const Note *notes; int n; int base; int dance; float level; uint32_t gen; };
static QueueHandle_t tunes = nullptr;
static TaskHandle_t tuneTask = nullptr;
static SemaphoreHandle_t voice = nullptr;    // held by the task while it plays: the loop's sounds wait for it to end
static volatile uint32_t stopGen = 0;        // moved on by the loop (only): a tune from an older one stops
static uint32_t playingGen = 0;              // the task's own: the tune it is playing
static volatile bool tunePlaying = false;
static bool inTune() { return tuneTask && xTaskGetCurrentTaskHandle() == tuneTask; }
static bool stopped() { return inTune() && playingGen != stopGen; }
static void quiet() {                        // the loop is about to sound: the tune playing or waiting ends first
  if (!tuneTask || inTune()) return;
  stopGen++;
  xTaskNotifyGive(tuneTask);                 // C-164: a tune's last notes ringing out stop at once (ringOut)
  if (tunePlaying && xSemaphoreTake(voice, pdMS_TO_TICKS(80)) == pdTRUE) xSemaphoreGive(voice);
}
static portMUX_TYPE danceMux = portMUX_INITIALIZER_UNLOCKED;
static volatile int danceKind = -1, danceStep = 0, danceSteps = 0;
static volatile uint32_t danceSeq = 0;
static void dance(int kind, int step, int steps) {
  if (!inTune()) { ledsDance(kind, step, steps); return; }
  portENTER_CRITICAL(&danceMux); danceKind = kind; danceStep = step; danceSteps = steps; danceSeq++; portEXIT_CRITICAL(&danceMux);
}

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
static const int BUZZER_CH = 2;               // C-102: the Dial's buzzer, on LEDC (M5GFX has 7 for the backlight)
static int64_t queuedUntil = 0;              // C-164: when the speaker will have played everything it has been given (us)
static void play(const int16_t *buf, size_t n) {
  if (board.buzzer >= 0) return;               // C-102: a buzzer plays notes (tone()), never samples
  size_t wrote;
  playedAt = millis();
  if (board.dacSpeaker && !dacStart()) return;
  if (!board.dacSpeaker) {
    i2s_write(PORT, buf, n * sizeof(int16_t), &wrote, portMAX_DELAY);
    queuedUntil = max(queuedUntil, esp_timer_get_time()) + (int64_t)n * 1000000 / RATE;
    return;
  }
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

static void ringHere();                      // C-164: what still rings, on a board without the tune task (soundIdle)
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
  ringHere();
  if (!dacOn || millis() - playedAt < 400) return;
  if (voice && xSemaphoreTake(voice, 0) != pdTRUE) return;     // C-121: a tune is playing from its task
  i2s_driver_uninstall(PORT);
  dacOn = false;
  dacQuiet();
  if (voice) xSemaphoreGive(voice);
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
  // C-121: 8 KB of DMA while it plays -- 4 KB on a board without PSRAM (the M5GO), whose tunes play in the loop and so
  // never need the extra time the buffers give a tune playing from its task while the screen is drawn
  cfg.dma_buf_count = psramFound() ? 8 : 4; cfg.dma_buf_len = 256;
  cfg.tx_desc_auto_clear = true;
  if (i2s_driver_install(PORT, &cfg, 0, nullptr) != ESP_OK) return false;
  i2s_set_pin(PORT, nullptr);
  i2s_set_dac_mode(I2S_DAC_CHANNEL_RIGHT_EN);
  i2s_zero_dma_buffer(PORT);
  return true;
}
bool soundQuiet() { return !dacOn; }       // C-121: the DAC let go, its DMA given back (net.cpp sends only then, without PSRAM)
#else
static bool dacStart() { return false; }
void soundDacRate(int) {}
void soundIdle() { ringHere(); }
bool soundQuiet() { return true; }
#endif

// ---- C-164: the instrument. Each note is a voice: the sample played faster or slower to its pitch (from the instrument's
// root), looped while it is held if it loops (the flute) or played out if not (the harp), under its attack, decay and
// sustain, then its release -- which rings on under the next note, as app/instrument.ts and the Tab5 render it. The
// voices are mixed as they play, a block at a time, so nothing is held in memory but where each one is; and since a note
// rings on after it ends, what rings after a tune is played out by the tune's task (ringOut), never more than a little
// ahead of the speaker, so the next press is heard at once and mixed into whatever is still sounding.
#if SAMPLED
struct Voice { const Instrument *ins; float pos, step, level, gain, invRel; int32_t i, held, rel; bool on; };
static Voice voices[6];
static int instrument = 0;                    // INSTRUMENTS[], by the save's edition (soundEdition): the harp until told
// at a level the square wave played at, the flute about as loud as it (by its RMS), the harp -- a pluck, dying away --
// a little under half; and above 24000 a sum of voices is bent toward the most a sample can be, never clipped
static const float SAMPLE_GAIN = 2.4f / 32768;
static int16_t soft(float x) {
  const float K = 24000, room = 32767 - K;
  float m = fabsf(x);
  if (m > K) m = K + room * tanhf((m - K) / room);
  return (int16_t)lroundf(x < 0 ? -m : m);
}
static bool sampled() { return board.buzzer < 0 && !board.dacSpeaker; }
static bool sounding() { for (const Voice &v : voices) if (v.on) return true; return false; }
static void voicesOff() { for (Voice &v : voices) v.on = false; }
static void voiceStart(int midi, int32_t held, float level) {
  const Instrument &ins = INSTRUMENTS[instrument];
  Voice *pick = nullptr;
  for (Voice &w : voices) {
    if (w.on && w.i < w.held) w.held = w.i;   // anything still held is let go: a tune cut short rings out under this
    if (!w.on) { if (!pick || pick->on) pick = &w; }
    else if (!pick || (pick->on && w.i - w.held > pick->i - pick->held)) pick = &w;   // else the one furthest gone
  }
  int32_t rel = max(1, (int)ins.releaseMs * RATE / 1000);
  *pick = { &ins, 0, powf(2.0f, (midi - ins.root) / 12.0f) * ins.rate / RATE, 0, amplitude * level * SAMPLE_GAIN,
            1.0f / rel, 0, held, rel, true };
}
static void mix(int16_t *out, int n) {        // the next n samples of every voice sounding (n <= 256)
  static float acc[256];
  for (int k = 0; k < n; k++) acc[k] = 0;
  for (Voice &v : voices) {
    if (!v.on) continue;
    const Instrument &ins = *v.ins;
    bool loops = ins.loopStart >= 0 && ins.loopEnd > ins.loopStart + 1 && (uint32_t)ins.loopEnd <= ins.n;
    float end = loops ? (float)ins.loopEnd : (float)(ins.n - 1);
    int32_t att = max(1, (int)ins.attackMs * RATE / 1000), dec = max(1, (int)ins.decayMs * RATE / 1000);
    for (int k = 0; k < n; k++) {
      if (v.pos >= end) { if (!loops) { v.on = false; break; } v.pos -= ins.loopEnd - ins.loopStart; }
      if (v.i >= v.held + v.rel) { v.on = false; break; }
      uint32_t j = (uint32_t)v.pos; float f = v.pos - j;
      float a = ins.pcm[j], b = ins.pcm[j + 1 < ins.n ? j + 1 : ins.n - 1];
      if (v.i < v.held) v.level = v.i < att ? (float)v.i / att : v.i < att + dec ? 1 - (1 - ins.sustain) * ((float)(v.i - att) / dec) : ins.sustain;
      float env = v.i < v.held ? v.level : v.level * (1 - (v.i - v.held) * v.invRel);
      acc[k] += (a + (b - a) * f) * env * v.gain;
      v.pos += v.step; v.i++;
    }
  }
  for (int k = 0; k < n; k++) out[k] = soft(acc[k]);
}
// what still rings, given the speaker until it holds `ahead` us -- false once nothing does. If the speaker ran dry first
// (the loop was busy), what was ringing has already been cut off, and is not taken up again after the silence.
static bool ringSome(int64_t ahead) {
  static int16_t buf[128];
  if (sounding() && queuedUntil < esp_timer_get_time() - 5000) voicesOff();
  while (sounding() && queuedUntil - esp_timer_get_time() < ahead) { mix(buf, 128); play(buf, 128); }
  return sounding();
}
#endif
static void ringHere() {
#if SAMPLED
  if (!tuneTask && ready && enabled) ringSome(100000);   // a tenth of a second ahead: the loop comes round at least that often
#endif
}

static void play(const Note *notes, int n, int base, int dance, float level);
// C-164: the task's -- what still rings, played out to its end a little ahead of the speaker, unless another sound is
// asked for, which takes the voices on as they are
static void ringOut() {
#if SAMPLED
  while (!stopped() && ready && enabled && ringSome(40000)) ulTaskNotifyTake(pdTRUE, pdMS_TO_TICKS(4));
  if (!enabled) voicesOff();
#endif
}
static void tuneLoop(void *) {
  Tune t;
  for (;;) {
    if (xQueueReceive(tunes, &t, portMAX_DELAY) != pdTRUE || t.gen != stopGen) continue;   // ended before it began
    xSemaphoreTake(voice, portMAX_DELAY);
    playingGen = t.gen; tunePlaying = true;
    if (t.n) play(t.notes, t.n, t.base, t.dance, t.level);
    ringOut();                                 // C-164: what still rings after it (or after the loop's last sound)
    tunePlaying = false;
    xSemaphoreGive(voice);
  }
}
static void tuneTaskBegin() {
  // not on a board without PSRAM: on the M5GO its stack and the outbox's left too little heap to read a picture
  // (net.cpp, reportBegin) -- there the tunes play where they are asked for, after the care is drawn
  if (tuneTask || !psramFound()) return;
  voice = xSemaphoreCreateMutex();
  tunes = xQueueCreate(1, sizeof(Tune));
  // above the loop's priority, so the speaker is fed while the screen is drawn; without it, tunes play as they did
  // its samples are static (tone()'s buffer), so its stack is small
  if (!voice || !tunes || xTaskCreate(tuneLoop, "tune", 3072, nullptr, 2, &tuneTask) != pdPASS) tuneTask = nullptr;
}
// a tune from the task -- or, if it could not be made, played here as before
static void tuneLater(const Note *notes, int n, int base, int dance, float level) {
  if (!tuneTask) { play(notes, n, base, dance, level); return; }
  Tune t = { notes, n, base, dance, level, ++stopGen };          // the one playing, if any, ends
  xQueueOverwrite(tunes, &t);
}
// C-164: the loop's sound has been played; what still rings of it, the task rings out (without it, soundIdle does)
static void ringLater() {
#if SAMPLED
  if (inTune() || !sounding()) return;
  if (!tuneTask) { ringSome(100000); return; }   // the first tenth of a second now, in case the loop is slow to come round
  Tune t = { nullptr, 0, 0, -1, 0, ++stopGen };
  xQueueOverwrite(tunes, &t);
#endif
}
// C-164: the voices, the loop's while it sounds -- the task has let them go (quiet()), and this waits until it has
static bool own() {
#if SAMPLED
  return voice && !inTune() && xSemaphoreTake(voice, pdMS_TO_TICKS(150)) == pdTRUE;
#else
  return false;
#endif
}

void soundBegin() {
  tuneTaskBegin();
#if SAMPLED
  static bool kept = false;                    // C-164: the last save's instrument, so the jingle at power-up is on it
  if (!kept) {
    kept = true;
    Preferences p; p.begin("sound", true); String ed = p.getString("edition", "CONTENT"); p.end();
    for (int i = 0; i < INSTRUMENT_N; i++) if (ed == INSTRUMENTS[i].edition) instrument = i;
  }
#endif
  if (board.buzzer >= 0) {                     // C-102: the Dial's passive buzzer -- each note a square wave from LEDC
    ledcSetup(BUZZER_CH, 2000, 10);
    ledcAttachPin(board.buzzer, BUZZER_CH);
    ledcWrite(BUZZER_CH, 0);
    ready = true; return;
  }
  if (!board.dacSpeaker && board.i2sDout < 0) return;   // no speaker -- or the Fire's given to its LoRa433's reset (board.cpp)
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
  if (board.kind == BoardKind::CardputerAdv) es8311Speaker();                     // C-136: the same codec, the same writes
  if (board.kind == BoardKind::M5CoreS3) coreS3Speaker(true, RATE);                  // C-75: the AW88298
  ready = true;
}

// C-74, C-75: on the StickS3 the microphone and the speaker share one codec, and on the CoreS3 the speaker and the
// microphones share BCLK and LRCK, so while it listens the speaker's I2S lets go of them (talk.cpp), and takes them back.
void soundPause() {
  if (!ready || !board.sharedClocks()) return;
  quiet();
#if SAMPLED
  voicesOff();
#endif
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

// C-164: the save's edition chooses the instrument -- the harp for CONTENT, the flute for CONTEXT -- kept for the next start
void soundEdition(const String &edition) {
#if SAMPLED
  for (int i = 0; i < INSTRUMENT_N; i++) {
    if (edition != INSTRUMENTS[i].edition || i == instrument) continue;
    instrument = i;
    Preferences p; p.begin("sound", false); p.putString("edition", edition); p.end();
  }
#endif
}

static float hz(int midi) { return noteHz(midi); }

// the chip's own voice, a square wave 4 ms in and 8 ms out, added into buf a block at a time
struct Square { float period, phase; int amp, total, rise, fall, done; };
static void squareAdd(Square &q, int16_t *buf, int n) {
  for (int i = 0; i < n; i++, q.done++) {
    float env = q.done < q.rise ? (float)q.done / q.rise : q.done > q.total - q.fall ? (float)(q.total - q.done) / q.fall : 1.0f;
    int v = buf[i] + (int)((q.phase < q.period * duty ? q.amp : -q.amp) * env);
    buf[i] = (int16_t)max(-32767, min(32767, v));
    if ((q.phase += 1) >= q.period) q.phase -= q.period;
  }
}

// One note: a square wave, 4 ms in and 8 ms out, at `level` of the volume (1.0 = the setting itself) -- or, C-164, a
// voice of the save's instrument. `chip`: the square wave even where the instrument plays, over what it still rings --
// the CASINO's reel ticks and coins (the user, 2026-10-19: "Click sounds good if the other sounds are still the flute
// instrument": at 5 and 14 ms they were over before the flute's 80 ms attack let them be heard).
static void tone(int midi, int ms, float level = 1.0f, bool chip = false) {
  if (!ready || !enabled || amplitude == 0) return;
  quiet();
  if (board.buzzer >= 0) {                     // C-102: the note itself, its loudness the share of each wave that is high
    ledcWriteTone(BUZZER_CH, (uint32_t)hz(midi));
    ledcWrite(BUZZER_CH, (uint32_t)(512 * duty * 2 * min(1.0f, amplitude * level / 12000.0f)));
    for (int left = ms; left > 0 && !stopped(); left -= 10) delay(min(10, left));
    ledcWrite(BUZZER_CH, 0);
    return;
  }
  static int16_t buf[256];
  int total = RATE * ms / 1000, rise = RATE * 4 / 1000, fall = RATE * 8 / 1000;
  Square q = { RATE / hz(midi), 0, (int)(amplitude * level), total, rise, fall, 0 };
#if SAMPLED
  if (sampled()) {                             // C-164: a voice of the instrument (or the click), mixed with what still rings
    bool took = own();
    if (!chip) voiceStart(midi, total, level);
    for (int done = 0; done < total && !stopped(); done += 256) {
      int n = min(256, total - done);
      mix(buf, n);
      if (chip) squareAdd(q, buf, n);
      play(buf, n);
    }
    if (took) xSemaphoreGive(voice);
    return;
  }
#endif
  for (int done = 0; done < total && !stopped();) {
    int n = min(256, total - done);
    for (int i = 0; i < n; i++) buf[i] = 0;
    squareAdd(q, buf, n);
    done += n;
    play(buf, n);
  }
}

void playNoteSemis(int semis, int ms) { tone(root + semis, ms, 0.7f); ringLater(); }
void soundInstrumentNote(int midi, int ms) { tone(midi, ms, 0.7f); ringLater(); }   // C-164, for T-426's PLAY

// C-66: a voice, as 16 kHz samples, at the volume set. It plays even with the board's sounds off: it was asked for.
// C-95: a check from the computer (RATETEST down the cable) -- how long the speaker takes to play two seconds of
// silence at RATE, so a board whose sounds run fast or slow can be measured rather than guessed at
uint32_t soundRateTest() {
  if (!ready) return 0;
  quiet();
#if SAMPLED
  voicesOff();
#endif
  static int16_t zero[256] = {0};
  for (int i = 0; i < 16; i++) play(zero, 256);                 // fill the DMA first, so the timing is steady state
  uint32_t t0 = millis();
  for (int total = RATE * 2; total > 0; total -= 256) play(zero, 256);
  return millis() - t0;
}

void soundPcm(const int16_t *samples, size_t n) {
  if (!ready) return;
  quiet();
#if SAMPLED
  voicesOff();                                 // C-164: a voice is heard alone
#endif
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
  quiet();
  if (!ready || !enabled || board.buzzer >= 0) { for (int left = ms; left > 0 && !stopped(); left -= 10) delay(min(10, left)); return; }
  static int16_t zero[256] = {0};
#if SAMPLED
  static int16_t buf[256];
  bool ring = sampled() && sounding();         // C-164: what still rings goes on through it
#endif
  for (int total = RATE * ms / 1000; total > 0 && !stopped(); total -= 256) {
#if SAMPLED
    if (ring) { mix(buf, min(256, total)); play(buf, min(256, total)); continue; }
#endif
    play(zero, min(256, total));
  }
}

// The dial turns in detents, often several a second: a pair for each would pile up behind the dial, so a turn
// sounds only when the last one has had time to finish.
// The interactions' notes are common/tunes.h's (C-94), as every device's are; only how loud is this board's.
static void notes(const Note *t, int n, float level) { for (int i = 0; i < n; i++) tone(root + t[i].semis, t[i].ms, level); ringLater(); }
void soundTurn(int dir) {
  if (millis() - lastTurn < 90) return;
  lastTurn = millis();
  notes(dir > 0 ? TUNE_TURN_UP : TUNE_TURN_DOWN, 2, 0.6f);
}

void soundSelect() { notes(TUNE_SELECT, 1, 1.0f); }
void soundBack()   { notes(TUNE_BACK, 1, 0.7f); }

// ---- a routine's tune: about six notes, its own shape in the day's key, the ring dancing in step --------------------

static void play(const Note *notes, int n, int base, int kind, float level) {
  for (int i = 0; i < n && !stopped(); i++) {
    dance(kind, i, n);
    if (notes[i].semis == 127) rest(notes[i].ms);
    else tone(base + notes[i].semis, notes[i].ms, level);
  }
  rest(20);
  dance(-1, 0, 0);                                   // back to the ring at rest
  ringLater();                                       // C-164: from the loop, what still rings is the task's to ring out
}

void soundRoutine(const char *type) {
  const Note *t = TUNE_UPLINK; int dance = DANCE_SWEEP;
  if (!strcmp(type, "FLARE"))           { t = TUNE_FLARE;      dance = DANCE_SPARKLE; }
  else if (!strcmp(type, "WHISPER"))    { t = TUNE_WHISPER;    dance = DANCE_GLIMMER; }
  else if (!strcmp(type, "TOUCHSTONE")) { t = TUNE_TOUCHSTONE; dance = DANCE_PULSE; }
  else if (!strcmp(type, "LONGWAVE"))   { t = TUNE_LONGWAVE;   dance = DANCE_WAVE; }
  else if (!strcmp(type, "GLOW"))       { t = TUNE_GLOW;       dance = DANCE_PULSE; }   // C-148
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
void soundCare(int what) { const CareTune &t = TUNE_CARE[constrain(what, 0, 3)]; tuneLater(t.notes, t.n, root, DANCE_PULSE, 0.8f); }   // C-114; C-121: from its task

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
void soundWake() { tuneLater(TUNE_WAKE, 6, WAKE_BASE, DANCE_SWEEP, 0.8f); }   // C-121: from its task

// C-121: a press, heard the moment it lands -- one short tick in the day's key, before anything it does
void soundTap() { tone(root + 12, 16, 0.5f); ringLater(); }

// C-121: every pass of the loop -- the step of the dance the tune's task asked for, and the DAC let go when it is quiet
void soundLoop() {
  static uint32_t shown = 0;
  int kind, step, steps; uint32_t seq;
  portENTER_CRITICAL(&danceMux); seq = danceSeq; kind = danceKind; step = danceStep; steps = danceSteps; portEXIT_CRITICAL(&danceMux);
  if (seq != shown) { shown = seq; ledsDance(kind, step, steps); }
  soundIdle();
}

// ---- C-149: THE CASINO -- a reel ticking past, stopping (each reel a fifth up), the coins counted in, and the result:
// a loss softly, a win in the day's key, the jackpot's fanfare -- and on a holiday's big win, the holiday's own phrase.
// The ticks and stops play here and are short; a result's phrase plays from the tune task where there is one, so the
// reels and the lights go on moving under it (without PSRAM, the M5GO, it plays here and the screen waits for it).
void soundReelTick() {
  static uint32_t at = 0;
  if (millis() - at < 70) return;
  at = millis();
  tone(root + 24, 5, 0.3f, true);              // a click, on every speaker (C-164's instrument plays the rest)
  ringLater();
}
void soundReelStop(int reel) { tone(root - 12 + 7 * reel, 34, 0.9f); ringLater(); }
void soundCoin(int i) { tone(root + 19 + (i % 3) * 5, 14, 0.45f, true); ringLater(); }   // a click too
void soundSlots(int what, const String &look) {   // 0 the lever, 1 a loss, 2 a small win, 3 a big one, 4 the jackpot, 5 a cheer (C-151)
  if (what == 0) { play(TUNE_SLOTS_PULL, 3, root, -1, 0.8f); return; }
  if (what == 5) { tuneLater(TUNE_SLOTS_CHEER, 6, root, DANCE_SPARKLE, 0.8f); return; }
  if (what == 1) { play(TUNE_SLOTS_LOSE, 2, root, -1, 0.5f); return; }
  if (what == 2) { tuneLater(TUNE_SLOTS_WIN, 4, root, DANCE_PULSE, 0.85f); return; }
  if (what >= 3 && look == "pumpkins") { tuneLater(TUNE_SLOTS_SPOOKY, 6, root, DANCE_SPARKLE, 0.9f); return; }
  if (what >= 3 && look == "presents") { tuneLater(TUNE_SLOTS_JINGLE, 11, root, DANCE_SPARKLE, 0.9f); return; }
  if (what >= 3 && look == "fireworks") { tuneLater(TUNE_SLOTS_FIREWORK, 10, root, DANCE_RAINBOW, 0.9f); return; }
  if (what >= 3 && look == "hearts") { tuneLater(TUNE_SLOTS_SWEET, 5, root, DANCE_GLIMMER, 0.85f); return; }
  if (what == 3) tuneLater(TUNE_SLOTS_BIG, 8, root, DANCE_RAINBOW, 0.9f);
  else tuneLater(TUNE_SLOTS_JACKPOT, 13, root, DANCE_BLOOM, 1.0f);
}
