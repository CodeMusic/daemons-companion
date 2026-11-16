// C-379: byuu's BPS1, as DAEMONS' tools/bps.py writes it: "BPS1", the source, target and metadata sizes as varints, the
// metadata, then actions -- each a varint of (length-1)<<2 | kind: 0 SourceRead (the source at the same offset), 1
// TargetRead (literal bytes follow), 2 SourceCopy and 3 TargetCopy (from a signed relative offset) -- and last the
// CRC32s of the source, the target and the patch. All three are checked (server/src/game/bps.ts).
#include "game/bps.h"

#include <cstring>

Bytes applyBps(const Bytes &source, const Bytes &patch) {
  if (patch.size() < 4 + 12 || memcmp(patch.data(), "BPS1", 4) != 0) throw PatchError("not a BPS patch");
  const size_t end = patch.size() - 12;
  auto word = [&](size_t at) {
    return (uint32_t)patch[at] | (uint32_t)patch[at + 1] << 8 | (uint32_t)patch[at + 2] << 16 | (uint32_t)patch[at + 3] << 24;
  };
  const uint32_t sourceCrc = word(end), targetCrc = word(end + 4), patchCrc = word(end + 8);
  if (crc32(patch.data(), end + 8) != patchCrc) throw PatchError("the patch is damaged (its own check does not match)");
  if (crc32(source) != sourceCrc) throw PatchError("this is not the ROM the patch was made for");
  size_t at = 4;
  auto varint = [&]() -> uint64_t {
    uint64_t n = 0, shift = 1;
    for (;;) {
      if (at >= end) throw PatchError("the patch ends too soon");
      uint8_t b = patch[at++];
      n += (b & 0x7f) * shift;
      if (b & 0x80) break;
      shift <<= 7;
      n += shift;
    }
    return n;
  };
  const uint64_t sourceSize = varint(), targetSize = varint(), metaSize = varint();
  if (sourceSize != source.size()) throw PatchError("this ROM is not the size the patch expects");
  if (targetSize > (64u << 20)) throw PatchError("the patch makes something far larger than a GBA ROM");
  at += metaSize;
  Bytes target(targetSize);
  uint64_t out = 0;
  int64_t sourceRel = 0, targetRel = 0;
  while (at < end) {
    const uint64_t d = varint(), kind = d & 3, len = (d >> 2) + 1;
    if (out + len > targetSize) throw PatchError("the patch writes past the end");
    if (kind == 0) {
      if (out + len > source.size()) throw PatchError("the patch reads past the ROM");
      memcpy(&target[out], &source[out], len); out += len;
    } else if (kind == 1) {
      if (at + len > end) throw PatchError("the patch ends too soon");
      memcpy(&target[out], &patch[at], len); at += len; out += len;
    } else {
      const uint64_t o = varint();
      const int64_t delta = (o & 1 ? -1 : 1) * (int64_t)(o >> 1);
      if (kind == 2) {
        sourceRel += delta;
        if (sourceRel < 0 || (uint64_t)sourceRel + len > source.size()) throw PatchError("the patch reads past the ROM");
        memcpy(&target[out], &source[sourceRel], len); sourceRel += len; out += len;
      } else {
        targetRel += delta;
        if (targetRel < 0 || (uint64_t)targetRel >= out) throw PatchError("the patch copies from where nothing is yet");
        for (uint64_t i = 0; i < len; i++) target[out++] = target[targetRel++];   // may overlap: byte by byte
      }
    }
  }
  if (out != targetSize) throw PatchError("the patch did not fill the ROM");
  if (crc32(target) != targetCrc) throw PatchError("the patched ROM does not check out");
  return target;
}
