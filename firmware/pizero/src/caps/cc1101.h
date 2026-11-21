#pragma once
// C-444: the CC1101 on the Cap CC1101 + NFC (U219) -- only what finding it, choosing its band and listening need. It
// never transmits here: C-447's roll call adds that, under docs/CAPS.md's limits. Register numbers are TI's (SWRS061).
#include <cstdint>
#include "caps/bus.h"

namespace cc1101 {

constexpr uint8_t IOCFG2 = 0x00, IOCFG0 = 0x02, FREQ2 = 0x0D, FREQ1 = 0x0E, FREQ0 = 0x0F, MCSM0 = 0x18;
constexpr uint8_t PARTNUM = 0x30, VERSION = 0x31, RSSI = 0x34, MARCSTATE = 0x35;   // status registers (read in burst)
constexpr uint8_t SRES = 0x30, SCAL = 0x33, SRX = 0x34, SIDLE = 0x36;               // strobes

struct Chip {
  bus::Spi *spi = nullptr;
  uint8_t status(uint8_t reg);                  // a status register (0x30-0x3D)
  uint8_t read(uint8_t reg);                    // a configuration register
  bool write(uint8_t reg, uint8_t value);
  bool strobe(uint8_t s);
  bool reset();                                 // SRES, and the time it takes
  bool known(uint8_t &partnum, uint8_t &version);   // PARTNUM 0 and a VERSION M5Stack's driver accepts
  bool tune(double mhz);                        // FREQ from the 26 MHz crystal, then calibrated
  bool listen();                                // into RX, to read RSSI
  bool idle();
  int rssiDbm();                                // the signal heard now, in dBm (TI's formula, offset 74)
};

bool versionKnown(uint8_t version);             // 0x04, 0x14, 0x20, 0x3F, 0x94, 0xBF or 0xFC (M5Stack's list)
uint32_t freqWord(double mhz);                  // FREQ2:FREQ1:FREQ0 for that frequency
double freqOf(uint32_t word);

}  // namespace cc1101
