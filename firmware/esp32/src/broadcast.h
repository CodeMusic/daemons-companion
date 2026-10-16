// C-134: BROADCASTS -- a word, or a thing a daemon does (an act), sent to every daemon at once, and their answers.
// Each goes every way this board has: LoRa (lora.cpp, far and with no network), Bluetooth (meet.cpp, to boards nearby)
// and the companion (net.cpp, every linked device); it is shown once however many ways it arrives, by its id -- the
// sender's hourly tag and its own number. Every daemon that receives an act answers it once; an answer is never
// answered. The server's half is server/src/broadcast.ts; the acts are firmware/common/acts.h.
#pragma once
#include <Arduino.h>
#include <ArduinoJson.h>

enum : uint8_t { CAST_SAY = 1, CAST_ACT = 2, CAST_REPLY = 3 };
enum : uint8_t { VIA_LORA = 1, VIA_BLE = 2, VIA_NET = 4 };

// Send one, as the daemon this board hosts (false when it hosts none). `body` is the word, or the act's code.
bool castSend(uint8_t kind, const String &body, uint32_t replyFrom = 0, uint16_t replyId = 0);
// One arriving, however it came. Shown, kept, told to the companion, and an act answered -- once per id.
void castIn(uint32_t from, uint16_t id, uint8_t kind, int species, const String &name, const String &body,
            uint32_t replyFrom, uint16_t replyId, uint8_t via);
void castLoop(uint32_t now);                         // every pass: Bluetooth's pieces, answers due
void castFromState(JsonArrayConst casts);            // the companion's last ten minutes (the state's `casts`)
bool castTakeReport(String &json);                   // what to tell the companion: POST /api/device/broadcast
String castLast();                                   // the latest one in words, for a corner of the screen ("" for none)
String castStatus();                                 // CASTS? down the cable: what came, each with how (L B N) and whether ours

String runToEveryone();                              // the routine: an act (or a typed word) to every daemon
String runWhatCame();                                // the routine: the last broadcasts and answers, in words
