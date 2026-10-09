#pragma once
// C-77: LVGL on the Tab5's screen and touch, through M5GFX (which knows its three panels and two touch chips).
// C-96: either way up -- portrait (the panel's own 720 x 1280, and the faster: nothing is turned on the way out) or
// landscape (1280 x 720), changed while running.
#include <lvgl.h>
void displayBegin(int rotation);   // after M5.begin(); rotation as M5GFX counts it: 0 / 2 portrait, 1 / 3 landscape
void displayRotate(int rotation);  // the screen turned: the caller rebuilds what is on it
int displayRotation();
bool displayPortrait();
