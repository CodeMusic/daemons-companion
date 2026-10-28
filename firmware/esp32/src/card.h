#pragma once
// C-199: the Ultra's microSD card (card.cpp) -- what is kept on it, under /daemons. Every other board has none.
#include <Arduino.h>

bool cardReady();                                         // mounted (tried when first asked; no card: asked again a minute on)
bool cardWrite(const String &name, const String &body);   // a file under /daemons, written whole
String cardRead(const String &name);                      // "" when it is not there (or no card)
String cardStatus();                                      // SD? down the cable
#include <vector>
bool cardWriteBytes(const String &name, const uint8_t *data, size_t n);   // C-212: a recording, written whole
uint8_t *cardReadBytes(const String &name, size_t &n);   // malloc'd (free it), or nullptr
bool cardRemove(const String &name);
std::vector<String> cardList(const String &dir);          // the names in a folder under /daemons, sorted
// C-199: one stream at a time -- a voice kept as it plays, or played back from the card
bool cardStreamBegin(const String &name);                 // written as it comes; kept only if ended with keep
void cardStreamWrite(const uint8_t *data, size_t n);
void cardStreamEnd(bool keep);
bool cardStreamOpen(const String &name);                  // read back
size_t cardStreamRead(uint8_t *buf, size_t n);
void cardStreamClose();
bool cardHas(const String &name);
bool cardAppendLine(const String &name, const String &line);   // C-199: a line onto the end of a file (what waits to be sent)
