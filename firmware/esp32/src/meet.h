// C-15: meeting others nearby, over Bluetooth -- the board's half (see meet.cpp).
#pragma once
#include <Arduino.h>

// Every pass of the loop: the beacon on while `on` and a daemon is carried (its species), off otherwise; a short
// listen every few minutes.
void meetLoop(uint32_t now, bool on, int species);
String meetOwnPeer();                                      // this board's tag now, eight hex digits ("" when off)
uint32_t meetTag();                                        // the same tag raw (0 when off) -- C-72: LoRa frames carry it too
bool meetIsOurs(const String &tag);                        // one of our own companions' tags (the phone's, another board's)
void meetSetOurs(const String &peersCsv);                  // our other companions' tags (the phone's), from the state
bool meetTakeListen(String &line);                         // once per listen: "LISTEN <started> <devices> <beacons>"
bool meetTakeHeard(int &species, String &peer, bool &ours);   // a companion heard, once per tag per hour (ours: our phone)

// C-134: BROADCASTS over Bluetooth. A broadcast goes out as up to eight pieces, each one 128-bit service UUID
// (dae1....-....: the one form an iPhone may advertise, as the beacon is), rotated in the scan response for a while;
// between the four-second listens a light listen runs all the time, so a piece is caught. broadcast.cpp makes and reads
// the pieces; here they are only sent and caught.
void meetCastSend(const uint8_t (*pieces)[16], int n, uint32_t forMs);   // the beacon comes back when it is done
bool meetCastTake(uint8_t piece[16]);                      // a piece heard (each piece more than once: broadcast.cpp keeps it once)
void meetCastLoop(uint32_t now);                           // every pass: the light listen, and the pieces turning
