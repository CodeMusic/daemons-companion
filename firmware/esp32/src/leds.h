// C-38: the ring of eight lights around the dial.
#pragma once
#include <Arduino.h>

void ledsBegin();
void ledsDay(uint32_t rgb);   // the day's colour; the ring glows it at a third
void ledsSpin(int dir);       // one white light once round: +1 clockwise (a turn right), -1 anticlockwise
void ledsFlash();             // all white, a moment (select)
void ledsDark();              // all out, a moment (back)
void ledsSleep(bool on);   // C-39: dark until woken, whatever else is asked
// C-40: the ring dancing to a routine's tune, one call a note. kind -1 returns the ring to rest.
enum { DANCE_SPARKLE, DANCE_GLIMMER, DANCE_PULSE, DANCE_WAVE, DANCE_SWEEP, DANCE_RAINBOW, DANCE_BLOOM };   // C-50: the last two celebrate
void ledsDance(int kind, int step, int steps);
void ledsTint(uint32_t rgb);  // C-68: the next dance in this colour, not the day's (until it ends)
void ledsBrightness(int percent);   // C-43: the ring at rest, a share of the day's colour (33 by default)
void ledsVoice(int level);    // C-101: the ring speaking along with a voice, 0..100 now (call it each frame; it fades
                              // back to rest a moment after the last)
void ledsLoop();              // every pass of the loop: animations, and going out when unused
