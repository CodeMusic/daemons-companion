// C-119: the daemon's expression on a board -- drawn from the description the server sends (server/src/expressions.ts):
// the body's colours in a shade, the eyes patched, the pose's rest, a mark above the head. No rule of its own: what to
// show is decided once, on the server (or a phone hosting alone), for every host.
#pragma once
#include <Arduino.h>
#include <ArduinoJson.h>

struct Patch { uint8_t x, y, w, h; uint16_t colour; };          // a rectangle of the 64x64 sprite, one colour
struct Expression {
  String name = "awake";
  float sat = 1, val = 1, mix = 0; uint8_t tint[3] = { 0, 0, 0 };   // the shade of colours 1..10
  int dy = 0; float squash = 1, bob = 1; bool still = false, shake = false;   // the pose
  bool marked = false; uint8_t ink[8] = {}, white[8] = {}; uint16_t markColour = 0;   // the mark: two 8x8 bit planes
  Patch patch[16]; int patches = 0;                                // the eyes
};
extern Expression expression;
// C-207 (server/src/thrive.ts): how the week has gone -- a glow behind it (0..100), a star a goal finished this week, a
// moon the morning after a vivid night. Drawn as told, like the expression.
struct Thrive { int glow = 0, stars = 0; bool moon = false; };
extern Thrive thrive;
void takeThrive(JsonVariant t);
void drawGlow(int cx, int cy, int r, uint16_t day);     // the halo, behind the daemon
void drawThriveMarks(int x, int y, int side);           // the stars and the moon, beside it (x, y: where the sprite is)

void takeExpression(JsonVariant e);                    // the state's daemon.expression; none: awake
void drawSprite(int x, int y, int scale, bool mirrored);   // the art, in the expression (ui.cpp's drawArt)
void drawMark(int x, int y, int scale, bool mirrored, int minY = 0);   // above its head, at the back (x, y: where the sprite is), never above minY
