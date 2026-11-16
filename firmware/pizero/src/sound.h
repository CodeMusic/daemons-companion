#pragma once
// C-379: the game's sound out of the speaker (or the jack) -- miniaudio, the device's own sound library, on both
// sides; the game pushes its samples a frame at a time and the speaker takes them as it needs.
#include <cstddef>
#include <cstdint>

namespace sound {
constexpr int RATE = 48000;
bool begin();                                       // false: no sound here, and the game plays silent
void push(const int16_t *stereo, size_t frames);    // interleaved left/right; dropped when too far ahead
size_t queued();                                    // frames still waiting for the speaker
bool on();                                          // a speaker was found and is playing
void end();
}
