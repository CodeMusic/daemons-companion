#pragma once
// C-444: the cap header's buses as Linux gives them -- spidev, the kernel's GPIO character device (v2) and I2C -- by
// ioctl alone, so nothing has to be installed on the device. On a computer every call answers "not here".
#include <cstdint>
#include <string>
#include <vector>

namespace bus {

// One SPI device, e.g. /dev/spidev0.1; the kernel works its chip select
struct Spi {
  int fd = -1;
  uint32_t hz = 0;
  bool open(const std::string &path, uint8_t mode, uint32_t hz);
  bool transfer(const uint8_t *tx, uint8_t *rx, size_t n);   // full duplex, one chip select around it
  void close();
  ~Spi() { close(); }
};

// Lines of one GPIO chip held as outputs for as long as this lives (a line let go may float)
struct Lines {
  int fd = -1;
  std::vector<unsigned> offsets;
  bool request(const std::string &chip, const std::vector<unsigned> &outs, const std::vector<int> &values, const char *who);
  bool set(unsigned offset, int value);
  void close();
  ~Lines() { close(); }
};

bool i2cHere(const std::string &dev, uint8_t addr);       // something answers at addr (a one-byte read)
bool sysfsRead(const std::string &path, std::string &out);
bool sysfsWrite(const std::string &path, const std::string &value);
std::string lastError();                                  // the last call's failure, in words ("" when none)

}  // namespace bus
