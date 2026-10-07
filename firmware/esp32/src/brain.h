#pragma once
// C-76: the LLM630 as the handheld's offline brain (docs/LLM630.md). When no server answers, a talk turn goes to it
// instead: its whisper hears the recording, its small model answers as the daemon, its melotts says the answer back as
// 16 kHz samples. StackFlow's JSON, over TCP (port 10001) or the CC1101's back UART header (IO44/43) -- which link is the
// user's question still, so both are here, chosen down the cable: BRAIN tcp <host>[:port] | BRAIN uart | BRAIN off.
#include <Arduino.h>

void brainLoad();                                   // the link chosen, from flash
bool brainSet(const String &how);                   // "tcp host:port", "uart" or "off"; kept in flash
bool brainConfigured();
String brainDescribe();
// One offline turn: the recording (a WAV) in, what was heard and the answer out; the voice is played as it arrives.
bool brainTurn(const uint8_t *wav, size_t bytes, String &heard, String &answer, String &error);
