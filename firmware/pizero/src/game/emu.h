#pragma once
// C-379: the game, on mGBA's core (the one EmulatorJS runs in the app and the playground, so a save moves between them
// unchanged). The save memory is ours, not a file mGBA writes: the program writes the game's .sav itself once the game's
// save has settled, and sends it to the hub (C-380) -- the one rule kept: never written while the game is writing it.
#include <cstdint>
#include <string>
#include "game/hash.h"

struct mCore;

class Emu {
 public:
  static constexpr int W = 240, H = 160, STRIDE = 256;
  static constexpr size_t SAVE_SIZE = 0x20000;   // FireRed's flash, 128 KB

  bool load(const std::string &romPath, const Bytes &save, std::string &why);
  bool loaded() const { return core != nullptr; }
  void frame(uint32_t gbaKeys);                  // one frame: the picture into video(), the sound to the speaker
  const uint32_t *video() const { return videoBuf; }   // W x H in rows of STRIDE; red in the low byte
  bool settledSave(Bytes &out);                  // true once each time the game's save changes and then holds still
  Bytes save() const;                            // the save memory as it is now
  void restore(const Bytes &save);               // a save put in, and the game started again from it (CONTINUE)
  void unload();
  uint64_t frames() const { return frameCount; }
  ~Emu() { unload(); }

 private:
  mCore *core = nullptr;
  uint32_t videoBuf[STRIDE * H] = {};
  uint8_t *saveMem = nullptr;
  uint64_t frameCount = 0, movedAt = 0;
  uint32_t lastCrc = 0, keptCrc = 0;
  int16_t audio[4096 * 2];
};
