#include <memory>
#include <HTTPClient.h>
#include <mbedtls/base64.h>
#include <driver/i2s.h>
#include <es7210.h>
#include "app.h"
#include "talk.h"
#include "link.h"
#include "brain.h"
#include "leds.h"
#include "sound.h"

// The CC1101's microphone is PDM (DATA 42, CLK 39), read as LilyGO's own mic test reads it: I2S_NUM_0 (the S3 decodes
// PDM only there), 16 kHz, 16-bit, one channel. The speaker is I2S_NUM_1 (sound.cpp), so both can be up at once.
static const i2s_port_t MIC = I2S_NUM_0;
static const int RATE = 16000, MOST_S = 8;            // eight seconds is plenty to say a thing to a daemon
String talkHeard, talkAnswer, talkStatus;
int talkPeak = 0, talkRms = 0;
bool talkByCable = false;

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
  cfg.mclk_multiple = I2S_MCLK_MULTIPLE_256;
#if SOC_I2S_SUPPORTS_TDM                       // the S3's; C-75: the original ESP32 (the M5GO, the Fire) has none
  cfg.bits_per_chan = I2S_BITS_PER_CHAN_16BIT;
  cfg.chan_mask = (i2s_channel_t)(I2S_TDM_ACTIVE_CH0 | I2S_TDM_ACTIVE_CH1);
#endif
  i2s_pin_config_t pins = {};
  pins.mck_io_num = board.micMclk; pins.bck_io_num = board.micBclk; pins.ws_io_num = board.micClk;
  pins.data_out_num = I2S_PIN_NO_CHANGE; pins.data_in_num = board.micData;
  if (i2s_driver_install(MIC, &cfg, 0, nullptr) != ESP_OK) return false;
  if (i2s_set_pin(MIC, &pins) != ESP_OK) { i2s_driver_uninstall(MIC); return false; }
  i2s_zero_dma_buffer(MIC);
  return true;
}

// C-74: the StickS3's ES8311 -- the speaker's codec, listening: the speaker lets go of the clocks, the codec is set to
// record (M5Unified's writes), and the ESP32 is the master on MCLK 18, BCLK 17, LRCK 15, reading DIN 16.
// C-75: the CoreS3's ES7210 the same way, on the speaker's BCLK 34 and LRCK 33 with its own MCLK 0, reading DIN 14.
static bool sharedMicOn() {
  soundPause();
  if (board.mic == Mic::Es8311) es8311Mic(); else coreS3Mic();
  i2s_config_t cfg = {};
  cfg.mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX);
  cfg.sample_rate = RATE; cfg.bits_per_sample = I2S_BITS_PER_SAMPLE_16BIT;
  cfg.channel_format = I2S_CHANNEL_FMT_ONLY_LEFT; cfg.communication_format = I2S_COMM_FORMAT_STAND_I2S;
  cfg.dma_buf_count = 8; cfg.dma_buf_len = 256; cfg.mclk_multiple = I2S_MCLK_MULTIPLE_256;
  i2s_pin_config_t pins = {};
  pins.mck_io_num = board.micMclk >= 0 ? board.micMclk : board.i2sMclk; pins.bck_io_num = board.i2sBclk; pins.ws_io_num = board.i2sLrclk;
  pins.data_out_num = I2S_PIN_NO_CHANGE; pins.data_in_num = board.micData;
  if (i2s_driver_install(MIC, &cfg, 0, nullptr) != ESP_OK) { soundResume(); return false; }
  if (i2s_set_pin(MIC, &pins) != ESP_OK) { i2s_driver_uninstall(MIC); soundResume(); return false; }
  i2s_zero_dma_buffer(MIC);
  return true;
}

// C-75: memory for a recording -- PSRAM where there is some; on the M5GO, which has none, the ordinary heap.
static void *bigAlloc(size_t n) {
  void *p = psramFound() ? ps_malloc(n) : nullptr;
  return p ? p : malloc(n);
}

static bool micOn() {
  if (board.mic == Mic::Analog) { analogReadResolution(12); analogSetPinAttenuation(board.micData, ADC_11db); return true; }   // C-75
  if (board.mic == Mic::Es7210) return es7210On();
  if (board.sharedClocks()) return sharedMicOn();
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
  std::unique_ptr<unsigned char, void (*)(void *)> b64Held((unsigned char *)malloc(4100), free);   // C-97: borrowed while in use, not kept
  unsigned char *b64 = b64Held.get();
  if (!b64) { free(rec); talkStatus = "Not enough memory to send it."; screen = TALK; draw(); return; }   // DRAFT
  Serial.printf("TALKWAV %u\n", (unsigned)bytes);
  for (size_t at = 0; at < bytes; at += 3072) {
    size_t olen = 0;
    mbedtls_base64_encode(b64, 4100, &olen, rec + at, min((size_t)3072, bytes - at));
    b64[olen] = 0;
    Serial.print("TW "); Serial.println((const char *)b64);
  }
  Serial.println("TALKEND"); Serial.flush();
  free(rec);
  String line;
  uint32_t until = millis() + 150000;                                          // a local model's first turn loads it
  while (millis() < until) if (cableLine(line, 1000) && line.startsWith("TALKED ")) break;   // a quiet second is not an end
  if (!line.startsWith("TALKED ")) { talkStatus = "The cable's bridge did not answer."; screen = TALK; draw(); return; }   // DRAFT
  JsonDocument d;
  deserializeJson(d, line.substring(7));
  talkHeard = plain(d["heard"] | ""); talkAnswer = plain(d["answer"] | ""); talkStatus = d["error"] | "";
  screen = TALK; draw();
  if (!(d["audio"] | false)) { lastInput = millis(); return; }
  b64Held.reset();                                                               // C-97: given back before the voice
  std::unique_ptr<uint8_t, void (*)(void *)> pcmHeld((uint8_t *)malloc(3100), free);   // C-97: borrowed while in use, not kept
  uint8_t *pcm = pcmHeld.get();
  if (!pcm) { lastInput = millis(); return; }
  bool stopped = false;
  while (cableLine(line, 10000) && line != "PCMEND") {
    if (!line.startsWith("PCM ") || stopped) continue;                          // stopped: let the rest go by
    size_t olen = 0;
    if (!mbedtls_base64_decode(pcm, 3100, &olen, (const unsigned char *)line.c_str() + 4, line.length() - 4))
      soundPcm((const int16_t *)pcm, olen / 2);
    if (giveUp()) stopped = true;
  }
  lastInput = millis();
}

// G.711 mu-law: a 16-bit sample in eight bits, as telephones have always sent speech. Sun's reference g711.c, checked
// against Python's audioop.lin2ulaw over all 65,536 values (2026-10-07: identical).
static uint8_t mulaw(int16_t pcm) {
  static const int SEG[8] = { 0x3F, 0x7F, 0xFF, 0x1FF, 0x3FF, 0x7FF, 0xFFF, 0x1FFF };
  int v = pcm >> 2, mask = 0xFF;
  if (v < 0) { v = -v; mask = 0x7F; }
  if (v > 8159) v = 8159;
  v += 0x21;
  int seg = 0;
  while (seg < 8 && v > SEG[seg]) seg++;
  if (seg >= 8) return 0x7F ^ mask;
  return ((seg << 4) | ((v >> (seg + 1)) & 0xF)) ^ mask;
}

// C-82: away from Wi-Fi and the cable, the phone is the way out. Bluetooth is slow, so the recording goes as 8 kHz
// mu-law (a quarter of the size: three seconds are 24 KB), in the cable's lines; the phone posts it, answers TALKED with
// the words, and says the answer in the INDEX voice on its own speaker. Frees the recording.
static void overPhone(uint8_t *rec, size_t n) {
  const int16_t *pcm = (const int16_t *)(rec + 44);
  size_t m = n / 2;                                            // 16 kHz -> 8 kHz: each pair averaged
  uint8_t *wav = (uint8_t *)bigAlloc(44 + m);
  if (!wav) { free(rec); talkStatus = "Out of memory."; screen = TALK; draw(); return; }   // DRAFT
  for (size_t i = 0; i < m; i++) wav[44 + i] = mulaw((int16_t)(((int)pcm[2 * i] + pcm[2 * i + 1]) / 2));
  free(rec);
  uint32_t v; uint16_t s;                                      // the header: format 7 (mu-law), one channel, 8 kHz
  memcpy(wav, "RIFF", 4); v = 36 + m; memcpy(wav + 4, &v, 4); memcpy(wav + 8, "WAVEfmt ", 8);
  v = 16; memcpy(wav + 16, &v, 4); s = 7; memcpy(wav + 20, &s, 2); s = 1; memcpy(wav + 22, &s, 2);
  v = 8000; memcpy(wav + 24, &v, 4); memcpy(wav + 28, &v, 4); s = 1; memcpy(wav + 32, &s, 2); s = 8; memcpy(wav + 34, &s, 2);
  memcpy(wav + 36, "data", 4); v = m; memcpy(wav + 40, &v, 4);
  size_t bytes = 44 + m;
  std::unique_ptr<unsigned char, void (*)(void *)> b64Held((unsigned char *)malloc(4100), free);   // C-97: borrowed while in use, not kept
  unsigned char *b64 = b64Held.get();
  if (!b64) { free(wav); talkStatus = "Not enough memory to send it."; screen = TALK; draw(); return; }   // DRAFT
  linkSend("TALKWAV " + String((unsigned)bytes));
  for (size_t at = 0; at < bytes && linkPhoneHere(); at += 3072) {
    size_t olen = 0;
    mbedtls_base64_encode(b64, 4100, &olen, wav + at, min((size_t)3072, bytes - at));
    b64[olen] = 0;
    linkSend("TW " + String((const char *)b64));
  }
  linkSend("TALKEND");
  free(wav);
  String line;
  uint32_t until = millis() + 150000;
  bool got = false;
  while (millis() < until && linkPhoneHere() && !got) {
    while (linkTake(line)) if (line.startsWith("TALKED ")) { got = true; break; }
    if (!got) delay(20);
  }
  screen = TALK;
  if (!got) { talkStatus = "The phone did not answer."; draw(); return; }                   // DRAFT
  JsonDocument d;
  deserializeJson(d, line.substring(7));
  talkHeard = plain(d["heard"] | ""); talkAnswer = plain(d["answer"] | ""); talkStatus = d["error"] | "";
  draw();
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
  // C-82: talk sends a recording and streams a voice back, which the relay (JSON only) does not carry: home, or a bridge
  if (!atHome() && !usbLive() && !linkPhoneHere() && !brainConfigured()) { say(online() ? "TALK NEEDS HOME OR PHONE" : "TALK NEEDS WI-FI"); return; }   // DRAFT
  // C-75: eight seconds where there is PSRAM; on the M5GO as much as the heap will give, down to two
  size_t most = RATE * MOST_S;
  uint8_t *rec = (uint8_t *)bigAlloc(44 + most * 2);
  while (!rec && most > RATE * 2) { most -= RATE; rec = (uint8_t *)malloc(44 + most * 2); }
  if (!rec || !micOn()) { free(rec); say("NO MICROPHONE"); return; }          // DRAFT
  screen = TALK; talkHeard = talkAnswer = ""; talkStatus = "Listening..."; draw();   // DRAFT
  ledsTint(0xFFFFFF);
  int16_t *pcm = (int16_t *)(rec + 44);
  size_t n = 0; int step = 0;
  uint32_t t0 = millis();
  auto held = [&]() { return forMs ? millis() - t0 < forMs : board.touch ? watchTouchDown() : !digitalRead(board.encKey); };
  int32_t mean = 2048 << 8;                                                    // C-75: the analog mic's resting level, learnt
  uint32_t next = micros();
  while (held() && n < most) {                                               // until the dial is let go
    if (board.mic == Mic::Analog) {                                          // C-75: the M5GO base's, 16 kHz by the clock
      for (size_t k = 0; k < 256 && n < most; k++, n++) {
        while ((int32_t)(micros() - next) < 0) {}
        next += 1000000 / RATE;
        int v = analogRead(board.micData);
        mean += ((v << 8) - mean) >> 10;                                     // a slow average: the DC the mic sits on
        pcm[n] = (int16_t)constrain((v - (mean >> 8)) * 16, -32768, 32767);
      }
    } else {
      size_t got = 0;
      i2s_read(MIC, pcm + n, min((size_t)512, most - n) * 2, &got, 100 / portTICK_PERIOD_MS);
      n += got / 2;
    }
    if ((n / 2000) != (size_t)step) { step = n / 2000; ledsDance(DANCE_GLIMMER, step, 0); }
  }
  ledsDance(-1, 0, 0);
  if (board.mic != Mic::Analog) i2s_driver_uninstall(MIC);
  soundResume();                                                              // C-74, C-75: the shared speaker back
  while (!forMs && (board.touch ? watchTouchDown() : !digitalRead(board.encKey))) delay(5);   // a long talk ran out: wait for the let-go
  lastInput = millis();
  { long long sq = 0; int peak = 0;                                           // how loud it was, for the check
    for (size_t i = 0; i < n; i++) { int v = abs((int)pcm[i]); peak = max(peak, v); sq += (long long)v * v; }
    talkPeak = peak; talkRms = n ? (int)sqrt((double)sq / n) : 0; }
  if (n < RATE / 3) { free(rec); screen = HOME; say("Hold the dial to talk"); return; }   // DRAFT -- a tap, not a talk
  wavHeader(rec, n);
  talkStatus = "Thinking..."; draw();                                         // DRAFT
  if ((!atHome() || talkByCable) && usbLive()) { overCable(rec, n); return; } // C-66: the cable's bridge carries it
  if (!atHome() && linkPhoneHere() && !brainConfigured()) { overPhone(rec, n); return; }   // C-82: the phone carries it
  if (!atHome()) { offline(rec, n); return; }                                 // C-76: no network -- the LLM630, if there is one
  HTTPClient h;
  h.setTimeout(65535);           // a local model's first turn loads it. HTTPClient's timeout is 16 bits: 120000 was 54 s
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
  if (!atHome()) { say(online() ? "NEEDS HOME" : "NEEDS WI-FI"); return; }      // DRAFT -- C-82: a voice is not JSON
  screen = TALK; talkHeard = ""; talkAnswer = st.daemon.entry; talkStatus = "Reading..."; draw();   // DRAFT
  HTTPClient h;
  h.setTimeout(65535);           // the most HTTPClient holds (16 bits): 90000 was 24 s, with the INDEX voice taking ~15
  h.begin(serverUrl + "/api/device/speak");
  h.addHeader("x-device", deviceId());
  h.addHeader("content-type", "application/json");
  int code = h.POST("{}");
  String body = code == 200 ? h.getString() : "";
  h.end();
  answer(code, body);
  lastInput = millis();
}
