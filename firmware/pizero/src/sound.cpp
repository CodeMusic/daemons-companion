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

void end() {
  if (!running) return;
  ma_device_uninit(&device);
  ma_pcm_rb_uninit(&ring);
  running = false;
}
}  // namespace sound
