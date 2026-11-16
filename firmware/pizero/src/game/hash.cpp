// C-379: CRC32 (the zlib polynomial, as BPS uses) and SHA-1 (FIPS 180-1), written out so nothing else is needed.
#include "game/hash.h"

#include <cstdio>
#include <cstring>

uint32_t crc32(const uint8_t *data, size_t n) {
  static uint32_t table[256];
  static bool made = false;
  if (!made) {
    for (uint32_t i = 0; i < 256; i++) {
      uint32_t c = i;
      for (int k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320u ^ (c >> 1) : c >> 1;
      table[i] = c;
    }
    made = true;
  }
  uint32_t c = 0xFFFFFFFFu;
  for (size_t i = 0; i < n; i++) c = table[(c ^ data[i]) & 0xFF] ^ (c >> 8);
  return c ^ 0xFFFFFFFFu;
}

static const char B64[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
std::string base64(const Bytes &b) {
  std::string o;
  o.reserve((b.size() + 2) / 3 * 4);
  for (size_t i = 0; i < b.size(); i += 3) {
    uint32_t v = (uint32_t)b[i] << 16 | (i + 1 < b.size() ? (uint32_t)b[i + 1] << 8 : 0) | (i + 2 < b.size() ? b[i + 2] : 0);
    o += B64[v >> 18 & 63];
    o += B64[v >> 12 & 63];
    o += i + 1 < b.size() ? B64[v >> 6 & 63] : '=';
    o += i + 2 < b.size() ? B64[v & 63] : '=';
  }
  return o;
}
bool unbase64(const std::string &s, Bytes &out) {
  int8_t map[256];
  memset(map, -1, sizeof map);
  for (int i = 0; i < 64; i++) map[(uint8_t)B64[i]] = (int8_t)i;
  out.clear();
  uint32_t v = 0;
  int bits = 0;
  for (char c : s) {
    if (c == '=' || c == '\n' || c == '\r') continue;
    if (map[(uint8_t)c] < 0) return false;
    v = v << 6 | (uint32_t)map[(uint8_t)c];
    bits += 6;
    if (bits >= 8) { bits -= 8; out.push_back((uint8_t)(v >> bits)); }
  }
  return true;
}

static inline uint32_t rol(uint32_t v, int s) { return (v << s) | (v >> (32 - s)); }

std::string sha1Hex(const uint8_t *data, size_t n) {
  uint32_t h[5] = { 0x67452301, 0xEFCDAB89, 0x98BADCFE, 0x10325476, 0xC3D2E1F0 };
  auto block = [&](const uint8_t *p) {
    uint32_t w[80];
    for (int i = 0; i < 16; i++) w[i] = (uint32_t)p[i * 4] << 24 | (uint32_t)p[i * 4 + 1] << 16 | (uint32_t)p[i * 4 + 2] << 8 | p[i * 4 + 3];
    for (int i = 16; i < 80; i++) w[i] = rol(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);
    uint32_t a = h[0], b = h[1], c = h[2], d = h[3], e = h[4];
    for (int i = 0; i < 80; i++) {
      uint32_t f, k;
      if (i < 20) { f = (b & c) | (~b & d); k = 0x5A827999; }
      else if (i < 40) { f = b ^ c ^ d; k = 0x6ED9EBA1; }
      else if (i < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8F1BBCDC; }
      else { f = b ^ c ^ d; k = 0xCA62C1D6; }
      uint32_t t = rol(a, 5) + f + e + k + w[i];
      e = d; d = c; c = rol(b, 30); b = a; a = t;
    }
    h[0] += a; h[1] += b; h[2] += c; h[3] += d; h[4] += e;
  };
  size_t whole = n / 64 * 64;
  for (size_t i = 0; i < whole; i += 64) block(data + i);
  uint8_t tail[128] = {};
  size_t rest = n - whole;
  memcpy(tail, data + whole, rest);
  tail[rest] = 0x80;
  size_t len = rest + 1 + 8 <= 64 ? 64 : 128;
  uint64_t bits = (uint64_t)n * 8;
  for (int i = 0; i < 8; i++) tail[len - 1 - i] = (uint8_t)(bits >> (8 * i));
  block(tail);
  if (len == 128) block(tail + 64);
  char out[41];
  for (int i = 0; i < 5; i++) snprintf(out + i * 8, 9, "%08x", h[i]);
  return std::string(out, 40);
}
