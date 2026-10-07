#include <HTTPClient.h>
#include <driver/i2s.h>
#include "app.h"
#include "talk.h"
#include "brain.h"
#include "leds.h"
#include "sound.h"

// The CC1101's microphone is PDM (DATA 42, CLK 39), read as LilyGO's own mic test reads it: I2S_NUM_0 (the S3 decodes
// PDM only there), 16 kHz, 16-bit, one channel. The speaker is I2S_NUM_1 (sound.cpp), so both can be up at once.
static const i2s_port_t MIC = I2S_NUM_0;
static const int RATE = 16000, MOST_S = 8;            // eight seconds is plenty to say a thing to a daemon
String talkHeard, talkAnswer, talkStatus;

bool talkCan() { return board.mic == Mic::Pdm && board.micData >= 0; }

static bool micOn() {
  i2s_config_t cfg = {};
  cfg.mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX | I2S_MODE_PDM);
  cfg.sample_rate = RATE;
  cfg.bits_per_sample = I2S_BITS_PER_SAMPLE_16BIT;
  cfg.channel_format = I2S_CHANNEL_FMT_ONLY_LEFT;
  cfg.communication_format = I2S_COMM_FORMAT_STAND_I2S;
  cfg.dma_buf_count = 8; cfg.dma_buf_len = 256;
  i2s_pin_config_t pins = {};
  pins.mck_io_num = I2S_PIN_NO_CHANGE; pins.bck_io_num = I2S_PIN_NO_CHANGE;
  pins.ws_io_num = board.micClk; pins.data_out_num = I2S_PIN_NO_CHANGE; pins.data_in_num = board.micData;
  if (i2s_driver_install(MIC, &cfg, 0, nullptr) != ESP_OK) return false;
  if (i2s_set_pin(MIC, &pins) != ESP_OK) { i2s_driver_uninstall(MIC); return false; }
  i2s_zero_dma_buffer(MIC);
  return true;
}

static void wavHeader(uint8_t *h, uint32_t samples) {
  uint32_t bytes = samples * 2;
  memcpy(h, "RIFF", 4); uint32_t v = 36 + bytes; memcpy(h + 4, &v, 4); memcpy(h + 8, "WAVEfmt ", 8);
  v = 16; memcpy(h + 16, &v, 4); uint16_t s = 1; memcpy(h + 20, &s, 2); memcpy(h + 22, &s, 2);
  v = RATE; memcpy(h + 24, &v, 4); v = RATE * 2; memcpy(h + 28, &v, 4); s = 2; memcpy(h + 32, &s, 2);
  s = 16; memcpy(h + 34, &s, 2); memcpy(h + 36, "data", 4); memcpy(h + 40, &bytes, 4);
}

// The answer's voice, streamed from the server into the speaker a little at a time.
static void playVoice(const String &path) {
  HTTPClient h;
  h.setTimeout(15000);
  h.begin(serverUrl + path);
  if (h.GET() != 200) { h.end(); return; }
  WiFiClient *in = h.getStreamPtr();
  int left = h.getSize();
  static int16_t buf[512];
  uint32_t quietSince = millis();
  while (left != 0 && millis() - quietSince < 4000) {
    int got = in->readBytes((uint8_t *)buf, min((int)sizeof buf, left > 0 ? left : (int)sizeof buf));
    if (got <= 0) continue;
    quietSince = millis();
    if (left > 0) left -= got;
    soundPcm(buf, got / 2);
    if (giveUp()) break;                              // the top button stops it
  }
  h.end();
}

// What the server said: show the words, then play the voice.
static void answer(int code, const String &body) {
  JsonDocument d;
  if (code != 200 || deserializeJson(d, body)) {
    talkStatus = "The server did not answer."; talkAnswer = ""; draw(); return;   // DRAFT
  }
  talkHeard = d["heard"] | ""; talkAnswer = d["answer"] | "";
  const char *err = d["error"] | "";
  talkStatus = strlen(err) ? String(err) : "";
  draw();
  const char *audio = d["audio"] | "";
  if (strlen(audio)) playVoice(audio);
}

// C-76: the turn offline, through the LLM630 (brain.cpp). Frees the recording.
static void offline(uint8_t *rec, size_t n) {
  String heard, said, error;
  talkStatus = "Thinking, offline..."; draw();                                 // DRAFT
  bool ok = brainTurn(rec, 44 + n * 2, heard, said, error);
  free(rec);
  talkHeard = heard; talkAnswer = said; talkStatus = ok ? "" : error;
  screen = TALK; draw();
  lastInput = millis();
}

void talkHold(uint32_t forMs) {
  if (!talkCan()) return;
  if (!online() && !brainConfigured()) { say("TALK NEEDS WI-FI"); return; }   // DRAFT -- the cable carries lines, not voices
  const size_t most = RATE * MOST_S;
  uint8_t *rec = (uint8_t *)ps_malloc(44 + most * 2);
  if (!rec || !micOn()) { free(rec); say("NO MICROPHONE"); return; }          // DRAFT
  screen = TALK; talkHeard = talkAnswer = ""; talkStatus = "Listening..."; draw();   // DRAFT
  ledsTint(0xFFFFFF);
  int16_t *pcm = (int16_t *)(rec + 44);
  size_t n = 0; int step = 0;
  uint32_t t0 = millis();
  auto held = [&]() { return forMs ? millis() - t0 < forMs : board.touch ? watchTouchDown() : !digitalRead(board.encKey); };
  while (held() && n < most) {                                               // until the dial is let go
    size_t got = 0;
    i2s_read(MIC, pcm + n, min((size_t)512, most - n) * 2, &got, 100 / portTICK_PERIOD_MS);
    n += got / 2;
    if ((n / 2000) != (size_t)step) { step = n / 2000; ledsDance(DANCE_GLIMMER, step, 0); }
  }
  ledsDance(-1, 0, 0);
  i2s_driver_uninstall(MIC);
  while (!forMs && (board.touch ? watchTouchDown() : !digitalRead(board.encKey))) delay(5);   // a long talk ran out: wait for the let-go
  lastInput = millis();
  if (n < RATE / 3) { free(rec); screen = HOME; say("Hold the dial to talk"); return; }   // DRAFT -- a tap, not a talk
  wavHeader(rec, n);
  talkStatus = "Thinking..."; draw();                                         // DRAFT
  if (!online()) { offline(rec, n); return; }                                 // C-76: no network -- the LLM630, if there is one
  HTTPClient h;
  h.setTimeout(120000);                                                       // a local model's first turn loads it
  h.begin(serverUrl + "/api/device/talk");
  h.addHeader("x-device", deviceId());
  h.addHeader("content-type", "audio/wav");
  int code = h.POST(rec, 44 + n * 2);
  String body = code == 200 ? h.getString() : "";
  h.end();
  if (code != 200 && brainConfigured()) { offline(rec, n); return; }        // the server did not answer: the LLM630
  free(rec);
  answer(code, body);
  lastInput = millis();
}

void talkReadEntry() {
  if (!online()) { say("NEEDS WI-FI"); return; }                               // DRAFT
  screen = TALK; talkHeard = ""; talkAnswer = st.daemon.entry; talkStatus = "Reading..."; draw();   // DRAFT
  HTTPClient h;
  h.setTimeout(90000);
  h.begin(serverUrl + "/api/device/speak");
  h.addHeader("x-device", deviceId());
  h.addHeader("content-type", "application/json");
  int code = h.POST("{}");
  String body = code == 200 ? h.getString() : "";
  h.end();
  answer(code, body);
  lastInput = millis();
}
