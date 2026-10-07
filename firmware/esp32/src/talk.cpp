#include <HTTPClient.h>
#include <mbedtls/base64.h>
#include <driver/i2s.h>
#include <es7210.h>
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

// The models write curly quotes, dashes and ellipses the board's fonts do not have: plain ones instead.
static String plain(String s) {
  static const char *FROM[] = { "\xE2\x80\x98", "\xE2\x80\x99", "\xE2\x80\x9C", "\xE2\x80\x9D", "\xE2\x80\x93",
                                "\xE2\x80\x94", "\xE2\x80\xA6", "\xC2\xA0" };
  static const char *TO[] = { "'", "'", "\"", "\"", "-", " - ", "...", " " };
  for (int i = 0; i < 8; i++) s.replace(FROM[i], TO[i]);
  return s;
}

bool talkCan() { return board.mic != Mic::None && board.micData >= 0; }

// C-66: the plain T-Embed and the SI4732 hear through an ES7210 (I2C 0x40), set up as LilyGO's own mic example sets it:
// 16 kHz 16-bit, the ESP32 the I2S master giving the clocks (MCLK x256), two TDM slots, the first two microphones at 0 dB.
static bool es7210On() {
  static bool codecUp = false;
  if (!codecUp) {
    audio_hal_codec_config_t c = {};
    c.adc_input = AUDIO_HAL_ADC_INPUT_ALL; c.codec_mode = AUDIO_HAL_CODEC_MODE_ENCODE;
    c.i2s_iface.mode = AUDIO_HAL_MODE_SLAVE; c.i2s_iface.fmt = AUDIO_HAL_I2S_NORMAL;
    c.i2s_iface.samples = AUDIO_HAL_16K_SAMPLES; c.i2s_iface.bits = AUDIO_HAL_BIT_LENGTH_16BITS;
    uint32_t bad = es7210_adc_init(&Wire, &c);
    bad |= es7210_adc_config_i2s(c.codec_mode, &c.i2s_iface);
    bad |= es7210_adc_set_gain((es7210_input_mics_t)(ES7210_INPUT_MIC1 | ES7210_INPUT_MIC2), (es7210_gain_value_t)GAIN_0DB);
    bad |= es7210_adc_set_gain((es7210_input_mics_t)(ES7210_INPUT_MIC3 | ES7210_INPUT_MIC4), (es7210_gain_value_t)GAIN_37_5DB);
    bad |= es7210_adc_ctrl_state(c.codec_mode, AUDIO_HAL_CTRL_START);
    if (bad) return false;
    codecUp = true;
  }
  i2s_config_t cfg = {};
  cfg.mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX);
  cfg.sample_rate = RATE; cfg.bits_per_sample = I2S_BITS_PER_SAMPLE_16BIT;
  cfg.channel_format = I2S_CHANNEL_FMT_ALL_LEFT; cfg.communication_format = I2S_COMM_FORMAT_STAND_I2S;
  cfg.dma_buf_count = 8; cfg.dma_buf_len = 256;
  cfg.mclk_multiple = I2S_MCLK_MULTIPLE_256; cfg.bits_per_chan = I2S_BITS_PER_CHAN_16BIT;
  cfg.chan_mask = (i2s_channel_t)(I2S_TDM_ACTIVE_CH0 | I2S_TDM_ACTIVE_CH1);
  i2s_pin_config_t pins = {};
  pins.mck_io_num = board.micMclk; pins.bck_io_num = board.micBclk; pins.ws_io_num = board.micClk;
  pins.data_out_num = I2S_PIN_NO_CHANGE; pins.data_in_num = board.micData;
  if (i2s_driver_install(MIC, &cfg, 0, nullptr) != ESP_OK) return false;
  if (i2s_set_pin(MIC, &pins) != ESP_OK) { i2s_driver_uninstall(MIC); return false; }
  i2s_zero_dma_buffer(MIC);
  return true;
}

static bool micOn() {
  if (board.mic == Mic::Es7210) return es7210On();
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
  talkHeard = plain(d["heard"] | ""); talkAnswer = plain(d["answer"] | "");
  const char *err = d["error"] | "";
  talkStatus = strlen(err) ? String(err) : "";
  draw();
  const char *audio = d["audio"] | "";
  if (strlen(audio)) playVoice(audio);
}

// A line from the cable, read directly while a talk turn waits (the loop is not running, so nothing else reads it).
static bool cableLine(String &out, uint32_t waitMs) {
  out = ""; uint32_t until = millis() + waitMs;
  while (millis() < until) {
    while (Serial.available()) {
      char c = Serial.read();
      if (c == '\n') { out.trim(); return true; }
      if (c != '\r' && out.length() < 6000) out += c;
    }
    delay(1);
  }
  return false;
}

// C-66: no Wi-Fi, but the cable's bridge is there (usb_bridge.py): the recording goes down the cable in base64 lines,
// the bridge posts it and answers TALKED {...}, then streams the voice back as PCM lines to play as they come. Frees it.
static void overCable(uint8_t *rec, size_t n) {
  size_t bytes = 44 + n * 2;
  static unsigned char b64[4100];
  Serial.printf("TALKWAV %u\n", (unsigned)bytes);
  for (size_t at = 0; at < bytes; at += 3072) {
    size_t olen = 0;
    mbedtls_base64_encode(b64, sizeof b64, &olen, rec + at, min((size_t)3072, bytes - at));
    b64[olen] = 0;
    Serial.print("TW "); Serial.println((const char *)b64);
  }
  Serial.println("TALKEND"); Serial.flush();
  free(rec);
  String line;
  uint32_t until = millis() + 150000;                                          // a local model's first turn loads it
  while (millis() < until && cableLine(line, 1000)) if (line.startsWith("TALKED ")) break;
  if (!line.startsWith("TALKED ")) { talkStatus = "The cable's bridge did not answer."; screen = TALK; draw(); return; }   // DRAFT
  JsonDocument d;
  deserializeJson(d, line.substring(7));
  talkHeard = plain(d["heard"] | ""); talkAnswer = plain(d["answer"] | ""); talkStatus = d["error"] | "";
  screen = TALK; draw();
  if (!(d["audio"] | false)) { lastInput = millis(); return; }
  static uint8_t pcm[3100];
  bool stopped = false;
  while (cableLine(line, 10000) && line != "PCMEND") {
    if (!line.startsWith("PCM ") || stopped) continue;                          // stopped: let the rest go by
    size_t olen = 0;
    if (!mbedtls_base64_decode(pcm, sizeof pcm, &olen, (const unsigned char *)line.c_str() + 4, line.length() - 4))
      soundPcm((const int16_t *)pcm, olen / 2);
    if (giveUp()) stopped = true;
  }
  lastInput = millis();
}

// C-76: the turn offline, through the LLM630 (brain.cpp). Frees the recording.
static void offline(uint8_t *rec, size_t n) {
  String heard, said, error;
  talkStatus = "Thinking, offline..."; draw();                                 // DRAFT
  bool ok = brainTurn(rec, 44 + n * 2, heard, said, error);
  free(rec);
  talkHeard = plain(heard); talkAnswer = plain(said); talkStatus = ok ? "" : error;
  screen = TALK; draw();
  lastInput = millis();
}

void talkHold(uint32_t forMs) {
  if (!talkCan()) return;
  if (!online() && !usbLive() && !brainConfigured()) { say("TALK NEEDS WI-FI"); return; }   // DRAFT: Wi-Fi, the cable, or the LLM630
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
  if (!online() && usbLive()) { overCable(rec, n); return; }                  // C-66: the cable's bridge carries it
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
