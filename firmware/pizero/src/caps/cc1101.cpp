// C-444: the CC1101, the least of it -- see cc1101.h.
#include "caps/cc1101.h"

#include <chrono>
#include <cmath>
#include <thread>

namespace cc1101 {
static const uint8_t READ = 0x80, BURST = 0x40;

uint8_t Chip::status(uint8_t reg) {
  uint8_t tx[2] = { (uint8_t)(reg | READ | BURST), 0 }, rx[2] = { 0, 0 };
  return spi && spi->transfer(tx, rx, 2) ? rx[1] : 0xFF;
}
uint8_t Chip::read(uint8_t reg) {
  uint8_t tx[2] = { (uint8_t)(reg | READ), 0 }, rx[2] = { 0, 0 };
  return spi && spi->transfer(tx, rx, 2) ? rx[1] : 0xFF;
}
bool Chip::write(uint8_t reg, uint8_t value) {
  uint8_t tx[2] = { reg, value }, rx[2];
  return spi && spi->transfer(tx, rx, 2);
}
bool Chip::strobe(uint8_t s) {
  uint8_t tx[1] = { s }, rx[1];
  return spi && spi->transfer(tx, rx, 1);
}
bool Chip::reset() {
  if (!strobe(SRES)) return false;
  std::this_thread::sleep_for(std::chrono::milliseconds(2));   // the crystal settles; the chip reads ready again
  return true;
}

bool versionKnown(uint8_t v) {
  for (uint8_t k : { 0x04, 0x14, 0x20, 0x3F, 0x94, 0xBF, 0xFC }) if (v == k) return true;
  return false;
}
bool Chip::known(uint8_t &partnum, uint8_t &version) {
  partnum = status(PARTNUM);
  version = status(VERSION);
  return partnum == 0x00 && versionKnown(version);
}

uint32_t freqWord(double mhz) { return (uint32_t)std::lround(mhz * 65536.0 / 26.0) & 0x3FFFFF; }
double freqOf(uint32_t w) { return w * 26.0 / 65536.0; }

bool Chip::tune(double mhz) {
  uint32_t w = freqWord(mhz);
  return idle() && write(FREQ2, (uint8_t)(w >> 16)) && write(FREQ1, (uint8_t)(w >> 8)) && write(FREQ0, (uint8_t)w) &&
         write(MCSM0, 0x18) &&   // calibrate each time it leaves IDLE for RX (FS_AUTOCAL 1), PO_TIMEOUT 2
         strobe(SCAL) && (std::this_thread::sleep_for(std::chrono::milliseconds(1)), true);
}
bool Chip::idle() { return strobe(SIDLE); }
bool Chip::listen() { return strobe(SRX); }
int Chip::rssiDbm() {
  int r = status(RSSI);
  if (r >= 128) r -= 256;
  return r / 2 - 74;
}

}  // namespace cc1101
