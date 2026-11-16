// C-379: mGBA 0.10.5's core as libretro's frontend drives it (src/platform/libretro/libretro.c): found from the ROM,
// configured without reading anyone's mGBA settings, the save as a block of memory, the sound through blip_buf.
#include "game/emu.h"

#include <fcntl.h>
#include <cstdarg>
#include <cstdio>
#include <cstdlib>
#include <cstring>

#include <mgba/core/blip_buf.h>
#include <mgba/core/config.h>
#include <mgba/core/core.h>
#include <mgba/core/log.h>
#include <mgba-util/vfs.h>

#include "sound.h"

static void quiet(struct mLogger *, int category, enum mLogLevel level, const char *format, va_list args) {
  if (!(level & (mLOG_FATAL | mLOG_ERROR)) && !getenv("ZERO_MGBA_LOG")) return;
  fprintf(stderr, "mgba: ");
  vfprintf(stderr, format, args);
  fputc('\n', stderr);
}
static struct mLogger logger = { quiet, nullptr };

bool Emu::load(const std::string &romPath, const Bytes &save, std::string &why) {
  unload();
  mLogSetDefaultLogger(&logger);
  VFile *rom = VFileOpen(romPath.c_str(), O_RDONLY);
  if (!rom) { why = "the game's file could not be opened"; return false; }   // DRAFT
  core = mCoreFindVF(rom);
  if (!core || core->platform(core) != mPLATFORM_GBA) {
    if (core) { core->deinit(core); core = nullptr; }
    rom->close(rom);
    why = "that file is not a GBA game";   // DRAFT
    return false;
  }
  mCoreInitConfig(core, nullptr);
  core->init(core);
  core->setVideoBuffer(core, (color_t *)videoBuf, STRIDE);
  core->setAudioBufferSize(core, 2048);
  blip_set_rates(core->getAudioChannel(core, 0), core->frequency(core), sound::RATE);
  blip_set_rates(core->getAudioChannel(core, 1), core->frequency(core), sound::RATE);
  // No BIOS (mGBA's own stands in), the rest as mGBA's defaults -- and never mCoreLoadConfig, which would read the
  // mGBA settings of whoever runs this
  mCoreOptions opts = {};
  opts.useBios = false;
  opts.skipBios = true;
  opts.volume = 0x100;
  opts.sampleRate = sound::RATE;
  mCoreConfigLoadDefaults(&core->config, &opts);
  mCoreLoadForeignConfig(core, &core->config);
  if (!core->loadROM(core, rom)) { why = "mGBA would not take the game"; unload(); return false; }   // DRAFT

  saveMem = (uint8_t *)malloc(SAVE_SIZE);
  memset(saveMem, 0xFF, SAVE_SIZE);   // a flash chip never written reads as 0xFF
  if (!save.empty()) memcpy(saveMem, save.data(), save.size() < SAVE_SIZE ? save.size() : SAVE_SIZE);
  VFile *sv = VFileFromMemory(saveMem, SAVE_SIZE);
  if (!core->loadSave(core, sv)) sv->close(sv);
  core->reset(core);
  frameCount = movedAt = 0;
  lastCrc = keptCrc = crc32(saveMem, SAVE_SIZE);
  return true;
}

void Emu::frame(uint32_t gbaKeys) {
  if (!core) return;
  core->setKeys(core, gbaKeys);
  core->runFrame(core);
  frameCount++;
  blip_t *left = core->getAudioChannel(core, 0), *right = core->getAudioChannel(core, 1);
  int n = blip_samples_avail(left);
  if (n > 4096) n = 4096;
  if (n > 0) {
    blip_read_samples(left, audio, n, 1);
    blip_read_samples(right, audio + 1, n, 1);
    sound::push(audio, (size_t)n);
  }
  // the save: looked at four times a second (a CRC32 of 128 KB is a fraction of a millisecond)
  if (frameCount % 15 == 0) {
    uint32_t c = crc32(saveMem, SAVE_SIZE);
    if (c != lastCrc) { lastCrc = c; movedAt = frameCount; }
  }
}

bool Emu::settledSave(Bytes &out) {
  // the game writes its save across many frames, sector by sector: a second unchanged is a save finished
  if (!core || lastCrc == keptCrc || frameCount - movedAt < 60) return false;
  keptCrc = lastCrc;
  out.assign(saveMem, saveMem + SAVE_SIZE);
  return true;
}

Bytes Emu::save() const { return saveMem ? Bytes(saveMem, saveMem + SAVE_SIZE) : Bytes(); }

void Emu::restore(const Bytes &save) {
  if (!core) return;
  core->savedataRestore(core, save.data(), save.size() < SAVE_SIZE ? save.size() : SAVE_SIZE, true);
  core->reset(core);
  lastCrc = keptCrc = crc32(saveMem, SAVE_SIZE);
}

void Emu::unload() {
  if (core) { core->deinit(core); core = nullptr; }
  if (saveMem) { free(saveMem); saveMem = nullptr; }
}
