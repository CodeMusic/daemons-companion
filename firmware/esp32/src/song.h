// C-479: TRAIN sung on the board -- the notes as it knows them, then the error carried back (song.cpp)
#pragma once
#include <Arduino.h>

bool trainSongTake(const char *json);        // the companion's "song" (ownsong.ts boardSong): begin singing it
bool trainSongActive();                      // singing, or the groups still flying back
void trainSongLoop(uint32_t now);            // every pass of the loop: the next note when its time comes
void trainSongDraw(int cx, int cy, int side);   // over the daemon: its middle, and its picture's size
