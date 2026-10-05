// C-55: the phone as the board's bridge, over Bluetooth -- the same lines the USB cable carries (STATE, TICK, CMD,
// RESULT ...), so away from home the companion app does what usb_bridge.py does at the desk. Paired once with a code
// the board shows (iOS asks for it), and after that only a paired phone can read or write the link.
#pragma once
#include <Arduino.h>

void linkBegin();                    // once at start: Bluetooth on, the link's service and WHISPER's, advertising
void linkLoop(uint32_t now);         // drops a stranger who never paired; advertises while no phone is here
bool linkPhoneHere();                // a paired phone is connected and listening
void linkSend(const String &line);   // one line to the phone, in pieces the radio can carry
bool linkTake(String &line);         // the next whole line the phone sent, if there is one

uint32_t linkPairStart();            // pairing: the six-digit code to show, good until linkPairStop
void linkPairStop();
bool linkPairedNow();                // a phone paired while the code was showing (asked once)
int linkBonds();                     // how many phones are paired
void linkForget();                   // forget every paired phone

// C-28's WHISPER test: the Nordic UART service, open to any general Bluetooth app (nRF Connect, LightBlue)
bool whisperHere();
void whisperSay(const String &word);
String whisperHeard();
void whisperClear();
void whisperDrop();
