#pragma once
// C-77: LVGL on the Tab5's screen and touch, through M5GFX (which knows its three panels and two touch chips).
#include <lvgl.h>
void displayBegin();        // after M5.begin(): landscape, 1280 x 720
