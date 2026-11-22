#pragma once
// C-379: the game's sound out of the speaker (or the jack) -- miniaudio, the device's own sound library, on both
// sides; the game pushes its samples a frame at a time and the speaker takes them as it needs.
#include <cstddef>
#include <cstdint>
#include <vector>

namespace sound {
constexpr int RATE = 48000;
bool begin();                                       // false: no sound here, and the game plays silent
void push(const int16_t *stereo, size_t frames);    // interleaved left/right; dropped when too far ahead
size_t queued();                                    // frames still waiting for the speaker
bool on();                                          // a speaker was found and is playing
void end();

// C-461: a voice from the Kit (melotts: 16 kHz mono), played through the same ring -- each sample three times, both sides
void pushMono16k(const int16_t *mono, size_t samples);
// C-461: the microphone, 16 kHz mono, for TALK's hold to talk (a device of its own, opened only while held)
bool recordStart();
std::vector<int16_t> recordStop();                  // what was heard since recordStart (at most 15 s)
bool recording();
}
