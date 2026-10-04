// C-28: the radio ROUTINES (radios.cpp), and the two things they ask of the screen and the keys (main.cpp).
#pragma once
#include <Arduino.h>

String runReadMyTag();       // TOUCHSTONE (NFC)
String runLearnMyRemote();   // FLARE (IR)
String runSendToMyTv();      // FLARE (IR)
String runOpenToMyPhone();   // WHISPER (Bluetooth)

void progress(const String &text);   // says what a routine is waiting for, on the RUN screen
bool giveUp();                       // the side key, pressed while a routine waits
