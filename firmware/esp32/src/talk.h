#pragma once
// C-66: push to talk -- hold the dial (the user, 2026-10-07). The board listens while it is held, sends what it heard to
// the server (POST /api/device/talk, a WAV), and the daemon answers in words on the screen and in the INDEX voice
// through the speaker (GET /api/device/voice/<id>, streamed). C-65: the INDEX entry read aloud the same way.
#include <Arduino.h>

bool talkCan();                 // a microphone this firmware can read (the CC1101's PDM microphone, for now)
void talkHold(uint32_t forMs = 0);   // the dial is held: listen until it is let go (or forMs, for a check from the
                                      // computer: TALK <ms> down the cable), then answer
void talkReadEntry();           // C-65: the carried daemon's INDEX entry, aloud
extern String talkHeard, talkAnswer, talkStatus;   // what the TALK screen shows
