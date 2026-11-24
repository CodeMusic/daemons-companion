// C-444: the CC1101, the least of it -- see cc1101.h.
#include "caps/cc1101.h"

#include <chrono>
#include <cmath>
#include <cstring>
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
bool Chip::listen() {   // into RX, and waits out the calibration on the way (MARCSTATE 0x0D is RX), at most 5 ms
  if (!strobe(SRX)) return false;
  for (int i = 0; i < 50; i++) {
    if ((status(MARCSTATE) & 0x1F) == 0x0D) return true;
    std::this_thread::sleep_for(std::chrono::microseconds(100));
  }
  return false;
}
int dbmOfRssi(uint8_t raw) {
  int r = raw;
  if (r >= 128) r -= 256;
  return r / 2 - 74;
}
int Chip::rssiDbm() { return dbmOfRssi(status(RSSI)); }

// ---- C-447: packets ----
bool Chip::packetMode(uint8_t length, uint8_t sync1, uint8_t sync0) {
  // TI's SmartRF settings for 38.4 kbaud GFSK, 20.6 kHz deviation, 100 kHz RX filter, at a 26 MHz crystal
  static const uint8_t regs[][2] = {
    { 0x02, 0x06 },   // IOCFG0: GDO0 high on sync, low at the packet's end (read by polling here, not wired)
    { 0x03, 0x47 },   // FIFOTHR
    { 0x07, 0x04 },   // PKTCTRL1: RSSI and LQI appended, no address check
    { 0x08, 0x04 },   // PKTCTRL0: fixed length, CRC on, no whitening
    { 0x0A, 0x00 },   // CHANNR
    { 0x0B, 0x06 }, { 0x0C, 0x00 },             // FSCTRL1, FSCTRL0
    { 0x10, 0xCA }, { 0x11, 0x83 },             // MDMCFG4, MDMCFG3: 100 kHz filter, 38.4 kbaud
    { 0x12, 0x13 },   // MDMCFG2: GFSK, 30 of 32 sync bits
    { 0x13, 0x22 }, { 0x14, 0xF8 },             // MDMCFG1: 4 preamble bytes; MDMCFG0
    { 0x15, 0x34 },   // DEVIATN: 20.6 kHz
    { 0x17, 0x00 },   // MCSM1: send at once (no clear-channel wait), IDLE after RX and after TX
    { 0x18, 0x18 },   // MCSM0: calibrate leaving IDLE
    { 0x19, 0x16 }, { 0x1A, 0x6C },             // FOCCFG, BSCFG
    { 0x1B, 0x43 }, { 0x1C, 0x40 }, { 0x1D, 0x91 },   // AGCCTRL2..0
    { 0x21, 0x56 }, { 0x22, 0x10 },             // FREND1; FREND0: PATABLE[0] only
    { 0x23, 0xE9 }, { 0x24, 0x2A }, { 0x25, 0x00 }, { 0x26, 0x1F },   // FSCAL3..0
    { 0x2C, 0x81 }, { 0x2D, 0x35 }, { 0x2E, 0x09 },   // TEST2..0
  };
  if (!idle()) return false;
  for (auto &r : regs) if (!write(r[0], r[1])) return false;
  return write(0x04, sync1) && write(0x05, sync0) && write(0x06, length) && strobe(SFRX) && strobe(SFTX);
}

bool Chip::setPower(int dbm, double mhz) {
  // TI's PATABLE steps (DN013), dBm -> value, for 433 and for 915; the nearest at or below what is asked
  static const int steps[] = { 0, -10, -15, -20, -30 };
  static const uint8_t at433[] = { 0x60, 0x34, 0x1D, 0x0E, 0x12 }, at915[] = { 0x8E, 0x27, 0x1C, 0x0D, 0x03 };
  const uint8_t *t = mhz > 600 ? at915 : at433;
  int i = 0;
  while (i < 4 && steps[i] > dbm) i++;
  return write(PATABLE, t[i]);
}

bool Chip::send(const uint8_t *bytes, int n, int timeoutMs) {
  if (!idle() || !strobe(SFTX)) return false;
  uint8_t tx[65], rx[65];
  if (n > 64) return false;
  tx[0] = FIFO | BURST;
  memcpy(tx + 1, bytes, n);
  if (!spi || !spi->transfer(tx, rx, n + 1) || !strobe(STX)) return false;
  auto until = std::chrono::steady_clock::now() + std::chrono::milliseconds(timeoutMs);
  std::this_thread::sleep_for(std::chrono::milliseconds(2));
  while (std::chrono::steady_clock::now() < until) {   // TX, then IDLE (MCSM1) once the packet is out
    if ((status(MARCSTATE) & 0x1F) == 0x01) return true;
    std::this_thread::sleep_for(std::chrono::microseconds(300));
  }
  idle();
  return false;
}

int Chip::receive(uint8_t *bytes, int n, int &rssi, bool &crcOk) {
  uint8_t a = status(RXBYTES), b = status(RXBYTES);   // read twice: the errata's advice for a FIFO count
  while (a != b) { a = b; b = status(RXBYTES); }
  if (a & 0x80) { idle(); strobe(SFRX); listen(); return 0; }   // overflow: nothing to trust
  if ((a & 0x7F) < n + 2) {
    if ((status(MARCSTATE) & 0x1F) == 0x01) listen();   // a packet that failed its CRC is dropped (autoflush off: back to RX)
    return 0;
  }
  uint8_t tx[66] = {}, rx[66] = {};
  if (n > 64) return 0;
  tx[0] = FIFO | READ | BURST;
  if (!spi || !spi->transfer(tx, rx, n + 3)) return 0;
  memcpy(bytes, rx + 1, n);
  rssi = dbmOfRssi(rx[n + 1]);
  crcOk = (rx[n + 2] & 0x80) != 0;
  idle();
  strobe(SFRX);
  listen();
  return n;
}

}  // namespace cc1101
