#pragma once
// The things a daemon can do for every other daemon -- written by firmware/common/acts.py (do not edit by hand).
struct Act { const char *code, *label, *seen, *reply; };
static const Act ACTS[] = {
  { "WAVE", "WAVE", "waves to everyone", "waves back" },
  { "BOW", "BOW", "bows", "bows in return" },
  { "HUM", "HUM A TUNE", "hums a tune", "hums along" },
  { "DANCE", "DANCE", "dances", "dances too" },
  { "BERRY", "SHARE A BERRY", "shares a berry", "takes it, and is glad" },
  { "GLOW", "GLOW", "glows", "glows back" },
  { "CALL", "CALL OUT", "calls out to every daemon", "answers the call" },
  { "REST", "SETTLE TO REST", "settles down to rest", "curls up nearby" },
  { "CHEER", "CHEER", "cheers", "cheers with it" },
  { "PLAY", "INVITE TO PLAY", "wants to play", "joins in" },
};
static const int ACT_N = 10;
