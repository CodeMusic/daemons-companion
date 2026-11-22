// C-379: one playback device and miniaudio's own ring for the samples between the game and the speaker.
#define MINIAUDIO_IMPLEMENTATION
#define MA_NO_DECODING
#define MA_NO_ENCODING
#define MA_NO_GENERATION
#define MA_NO_RESOURCE_MANAGER
#define MA_NO_NODE_GRAPH
#define MA_NO_ENGINE
#include "miniaudio.h"

#include "sound.h"

#include <chrono>
#include <mutex>
#include <thread>
#include <vector>

namespace sound {
static ma_device device;
static ma_pcm_rb ring;
static bool running;
static const ma_uint32 RING_FRAMES = RATE / 5;   // a fifth of a second at most between the game and the speaker

static void pull(ma_device *, void *out, const void *, ma_uint32 frames) {
  int16_t *dst = (int16_t *)out;
  while (frames) {
    ma_uint32 n = frames;
    void *src;
    if (ma_pcm_rb_acquire_read(&ring, &n, &src) != MA_SUCCESS || n == 0) break;
    memcpy(dst, src, n * 4);
    ma_pcm_rb_commit_read(&ring, n);
    dst += n * 2;
    frames -= n;
  }
  if (frames) memset(dst, 0, frames * 4);   // the game fell behind: silence, never old sound
}

bool begin() {
  if (ma_pcm_rb_init(ma_format_s16, 2, RING_FRAMES, nullptr, nullptr, &ring) != MA_SUCCESS) return false;
  ma_device_config cfg = ma_device_config_init(ma_device_type_playback);
  cfg.playback.format = ma_format_s16;
  cfg.playback.channels = 2;
  cfg.sampleRate = RATE;
  cfg.dataCallback = pull;
  cfg.periodSizeInFrames = 512;
  if (ma_device_init(nullptr, &cfg, &device) != MA_SUCCESS) { ma_pcm_rb_uninit(&ring); return false; }
  if (ma_device_start(&device) != MA_SUCCESS) { ma_device_uninit(&device); ma_pcm_rb_uninit(&ring); return false; }
  running = true;
  return true;
}

void push(const int16_t *stereo, size_t frames) {
  if (!running) return;
  while (frames) {
    ma_uint32 n = (ma_uint32)frames;
    void *dst;
    if (ma_pcm_rb_acquire_write(&ring, &n, &dst) != MA_SUCCESS || n == 0) return;   // full: this frame's sound is dropped
    memcpy(dst, stereo, n * 4);
    ma_pcm_rb_commit_write(&ring, n);
    stereo += n * 2;
    frames -= n;
  }
}

size_t queued() { return running ? ma_pcm_rb_available_read(&ring) : 0; }
bool on() { return running; }

// C-461: the Kit's voice; a ring-full voice waits for the speaker rather than being dropped (it is not the game's frame)
void pushMono16k(const int16_t *mono, size_t samples) {
  if (!running) return;
  std::vector<int16_t> st;
  st.reserve(samples * 6);
  for (size_t i = 0; i < samples; i++) for (int k = 0; k < 6; k++) st.push_back(mono[i]);
  size_t frames = st.size() / 2, at = 0;
  for (int tries = 0; at < frames && tries < 4000; tries++) {
    ma_uint32 n = (ma_uint32)(frames - at);
    void *dst;
    if (ma_pcm_rb_acquire_write(&ring, &n, &dst) != MA_SUCCESS || n == 0) { std::this_thread::sleep_for(std::chrono::milliseconds(5)); continue; }
    memcpy(dst, st.data() + at * 2, n * 4);
    ma_pcm_rb_commit_write(&ring, n);
    at += n;
  }
}

static ma_device mic;
static bool micOn;
static std::mutex micLock;
static std::vector<int16_t> heard;
static void take(ma_device *, void *, const void *in, ma_uint32 frames) {
  std::lock_guard<std::mutex> g(micLock);
  const int16_t *s = (const int16_t *)in;
  if (heard.size() + frames > 16000 * 15) frames = (ma_uint32)(heard.size() < 16000 * 15 ? 16000 * 15 - heard.size() : 0);
  heard.insert(heard.end(), s, s + frames);
}
bool recordStart() {
  if (micOn) return true;
  { std::lock_guard<std::mutex> g(micLock); heard.clear(); }
  ma_device_config cfg = ma_device_config_init(ma_device_type_capture);
  cfg.capture.format = ma_format_s16;
  cfg.capture.channels = 1;
  cfg.sampleRate = 16000;   // miniaudio converts from whatever the microphone gives
  cfg.dataCallback = take;
  if (ma_device_init(nullptr, &cfg, &mic) != MA_SUCCESS) return false;
  if (ma_device_start(&mic) != MA_SUCCESS) { ma_device_uninit(&mic); return false; }
  micOn = true;
  return true;
}
std::vector<int16_t> recordStop() {
  if (micOn) { ma_device_uninit(&mic); micOn = false; }
  std::lock_guard<std::mutex> g(micLock);
  return std::move(heard);
}
bool recording() { return micOn; }

void end() {
  if (!running) return;
  ma_device_uninit(&device);
  ma_pcm_rb_uninit(&ring);
  running = false;
}
}  // namespace sound
