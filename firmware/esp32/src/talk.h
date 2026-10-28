#pragma once
// C-66: push to talk -- hold the dial (the user, 2026-10-07). The board listens while it is held, sends what it heard to
// the server (POST /api/device/talk, a WAV), and the daemon answers in words on the screen and in the INDEX voice
// through the speaker (GET /api/device/voice/<id>, streamed). C-65: the INDEX entry read aloud the same way.
#include <Arduino.h>

bool talkCan();                 // a microphone this firmware can read (the CC1101's PDM microphone, for now)
void talkHold(uint32_t forMs = 0);   // the dial is held: listen until it is let go (or forMs, for a check from the
                                      // computer: TALK <ms> down the cable), then answer
void talkReadEntry();           // C-65: the carried daemon's INDEX entry, aloud
extern bool talkToGuide;        // C-209: the next talk asked of the GUIDE
extern int talkToSubtle;        // C-229, C-230: the next asked of THE SUBTLE LAYER -- 1 ASK, 2 TWO VOICES, 3 today's answer
void talkShow(const String &heard, const String &answer);   // C-230: words on the TALK screen (today's question)
extern bool talkListening;      // C-213: listening now -- the daemon's ears up on the TALK screen
size_t talkMicRead(int16_t *buf, size_t most, uint32_t waitMs);   // C-212: raw samples, the ear open
void talkWavHeader(uint8_t *h, uint32_t samples);                   // C-212: 16 kHz mono, 16-bit
void talkReadText(const String &text);   // the user, 2026-10-28: any words aloud (a dream); "" the INDEX entry
// C-101: the board's microphones as an ear on the room -- how loud it is now, for the radio's voice (whose sound goes
// from the SI4732 to its amplifier and never through the ESP32)
bool talkEarOpen();
int talkEarLevel();             // the loudness since it was last asked (RMS), or -1 when nothing new was heard
void talkEarClose();
extern String talkHeard, talkAnswer, talkStatus;   // what the TALK screen shows
void talkLoop(uint32_t now);    // C-181: the answer to the talk asked, fetched when it is ready
bool talkWaiting();             // C-181: a talk is out, its answer not yet back
extern int talkPeak, talkRms;                       // the last recording's loudness, for the check from the computer
extern bool talkByCable;                            // the check from the computer: TALK <ms> cable
