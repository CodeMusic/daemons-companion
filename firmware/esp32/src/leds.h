// C-38: the ring of eight lights around the dial.
#pragma once
#include <Arduino.h>

void ledsBegin();
void ledsDay(uint32_t rgb);   // the day's colour; the ring glows it at a third
void ledsSpin(int dir);       // one white light once round: +1 clockwise (a turn right), -1 anticlockwise
void ledsFlash();             // all white, a moment (select)
void ledsDark();              // all out, a moment (back)
void ledsLoop();              // every pass of the loop: animations, and going out when unused
