// C-28: the radio ROUTINES (radios.cpp), and the two things they ask of the screen and the keys (main.cpp).
#pragma once
#include <Arduino.h>

String runReadMyTag();       // TOUCHSTONE (NFC)
String runLearnMyRemote();   // FLARE (IR)
String runSendToMyTv();      // FLARE (IR)
String runSonyTvPower();     // FLARE (IR): no remote needed
// C-34: one code from the site's search -- sent, and kept as SEND TO MY TV's code if `keep`
String runFlareCode(const String &protocol, uint64_t value, uint16_t bits, uint16_t repeat, bool keep);
String runOpenToMyPhone();   // WHISPER (Bluetooth)

void progress(const String &text);   // says what a routine is waiting for, on the RUN screen
bool giveUp();                       // the top button, pressed while a routine waits
