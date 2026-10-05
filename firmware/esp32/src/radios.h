// C-28: the radio ROUTINES (radios.cpp), and the two things they ask of the screen and the keys (main.cpp).
#pragma once
#include <Arduino.h>

String runReadMyTag();       // TOUCHSTONE (NFC)
String runOpenToMyPhone();   // WHISPER (Bluetooth): a word each way with any Bluetooth app
String runPairMyPhone();     // C-55: the companion app pairs, with a code the board shows
String runForgetPhones();

// FLARE (IR), C-51: the daemon learns your remotes -- three buttons each, up to six kept, one chosen
void flareBegin();           // once at start: an older single learned code becomes the first remote
String runTeachRemote();
String runPower();
String runVolumeUp();
String runVolumeDown();
int flareCount();
int flareActive();
String flareName(int r);
void flareSetActive(int r);
String flareRemove(int r);
String flareAdd(const String &name, const String protocol[3], const uint64_t value[3], const uint16_t bits[3], const uint16_t repeat[3]);
String flareRemotesJson();
// C-34: one code from the site's search
String runFlareCode(const String &protocol, uint64_t value, uint16_t bits, uint16_t repeat, bool keep);

void progress(const String &text);   // says what a routine is waiting for, on the RUN screen
bool giveUp();                       // the top button, pressed while a routine waits
String daemonName();                 // the daemon on the board, whose routines these are (C-51)
