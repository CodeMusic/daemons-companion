// C-149: THE CASINO -- SLOTS (casino.cpp). C-151: and its table -- who else is at the reels.
#pragma once
#include <Arduino.h>

String runSlots();                       // the routine: until it is left, or left alone a while
bool casinoTakeArt(const char *json);    // PARTYART down the cable, or GET /api/device/art?slot=: a reel's daemon
// C-151: THE TABLE
bool casinoAtTable();                    // this board is at the reels now
// someone heard saying they are at the reels (here) or up from them: via 1 LoRa (with a name), 2 Bluetooth (a species only)
void casinoHeard(uint32_t tag, int species, const String &name, bool here, uint8_t via);
// a broadcast for the table: what 0 a word to everyone, 1 their big win (the act's code), 2 a cheer for our own big win
void casinoCast(const String &name, const String &body, int what);
