// C-72: LoRa -- the daemons nearby, further than Bluetooth reaches, a wave or a word between them, and a small mesh
// that passes both on (lora.cpp). The watch and the T-Deck carry an SX1262; an M5 LoRa433 module is an SX1278.
#pragma once
#include <Arduino.h>

void loraBegin();                                          // after the screen: the radio, where this board has one
void loraLoop(uint32_t now, bool on, int species);         // every pass: listening always; a beacon now and then while
                                                           // `on` (MEET OTHERS NEARBY) and a daemon is carried
bool loraReady();
String loraStatus();
String loraDiag();                                         // LORADIAG down the cable: the M5 LoRa433's bus, three ways                                       // "MESH ready 433 nearby 2 ..." for the cable's MESH?

// who was heard lately: by its hourly tag, with the daemon's species and name as its board said them, how many boards
// passed it on (0: heard directly), how loud, and when
struct Nearby { uint32_t tag; int species; String name; int relayed; int rssi; uint32_t at; };
int loraNearby(Nearby *out, int max);                      // the last ten minutes, newest first

// Sending: 1 BEACON (I am here), 2 WAVE, 3 SAY (a word, up to 40 letters), 4 CALL (who is there? every board that
// hears it beacons back). `to` is a tag, or 0 for everyone. False when there is no radio or nothing is carried.
bool loraSend(uint8_t kind, uint32_t to, const String &text);
// C-134: a broadcast, with its own number (the same on every way it goes): 3 SAY to everyone, 5 ACT (the text is the
// act's code), 6 REPLY (the text is the answered broadcast's id, 12 hex digits, a space, and the act's code)
bool loraCast(uint8_t kind, uint16_t id, const String &text);
bool loraTable(bool here);                                 // C-151: 7 TABLE -- at the CASINO's reels, or up from them

// C-123: a message -- typed on the T-Deck's keyboard -- to every board nearby; the last one heard, kept on the screen
// until it is read (loraMessageRead: true if one was showing)
bool loraCanSay();
bool loraSay(const String &text);
int loraTextMax();
bool loraMessage(String &from, String &text);
bool loraMessageRead();
void loraPretendHeard(const String &name, const String &text);   // MESH HEARD down the cable: as if heard, for a check

// For the server (net.cpp): a daemon heard, once per tag per hour (mine: one of our own companions' tags); and each
// wave or word, in or out ("in"/"out", "wave"/"say").
bool loraTakeHeard(int &species, String &tag, int &relayed, bool &mine);
bool loraTakeSaid(String &dir, String &kind, int &species, String &tag, int &relayed, String &text);

String runNearby();                                        // MESH / NEARBY: the list, a wave or a word to one of them
String runCallOut();                                       // MESH / CALL OUT: a call, and who answers in thirty seconds
