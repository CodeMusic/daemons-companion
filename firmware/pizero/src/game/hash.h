#pragma once
// C-379: the two checks every ROM and patch passes (server/src/game/hash.ts): SHA-1 as patches.json names them, and
// the CRC32 a BPS patch carries.
#include <cstddef>
#include <cstdint>
#include <string>
#include <vector>

using Bytes = std::vector<uint8_t>;

uint32_t crc32(const uint8_t *data, size_t n);
inline uint32_t crc32(const Bytes &b) { return crc32(b.data(), b.size()); }
std::string sha1Hex(const uint8_t *data, size_t n);   // lower-case, 40 characters
std::string base64(const Bytes &b);                    // C-380: a save travels to the hub as base64 in JSON
bool unbase64(const std::string &s, Bytes &out);       // false on anything that is not base64
inline std::string sha1Hex(const Bytes &b) { return sha1Hex(b.data(), b.size()); }
