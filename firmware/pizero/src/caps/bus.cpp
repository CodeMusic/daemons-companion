// C-444: spidev, GPIO (the character device's v2 interface) and I2C, by ioctl -- see bus.h.
#include "caps/bus.h"

#include <cerrno>
#include <cstring>
#include <fstream>

#ifdef __linux__
#include <fcntl.h>
#include <linux/gpio.h>
#include <linux/i2c-dev.h>
#include <linux/spi/spidev.h>
#include <sys/ioctl.h>
#include <unistd.h>
#endif

namespace bus {
static std::string err;
std::string lastError() { return err; }
static bool fail(const std::string &what) {
  err = what + (errno ? std::string(": ") + strerror(errno) : std::string());
  return false;
}

#ifdef __linux__
bool Spi::open(const std::string &path, uint8_t mode, uint32_t speed) {
  close();
  errno = 0;
  fd = ::open(path.c_str(), O_RDWR | O_CLOEXEC);
  if (fd < 0) return fail(path);
  uint8_t bits = 8;
  if (ioctl(fd, SPI_IOC_WR_MODE, &mode) < 0 || ioctl(fd, SPI_IOC_WR_BITS_PER_WORD, &bits) < 0 ||
      ioctl(fd, SPI_IOC_WR_MAX_SPEED_HZ, &speed) < 0) { fail(path + " settings"); close(); return false; }
  hz = speed;
  return true;
}
bool Spi::transfer(const uint8_t *tx, uint8_t *rx, size_t n) {
  if (fd < 0) return fail("spi not open");
  spi_ioc_transfer t;
  memset(&t, 0, sizeof t);
  t.tx_buf = (uintptr_t)tx;
  t.rx_buf = (uintptr_t)rx;
  t.len = (uint32_t)n;
  t.speed_hz = hz;
  t.bits_per_word = 8;
  errno = 0;
  if (ioctl(fd, SPI_IOC_MESSAGE(1), &t) < 0) return fail("spi transfer");
  return true;
}
void Spi::close() { if (fd >= 0) ::close(fd); fd = -1; }

bool Lines::request(const std::string &chip, const std::vector<unsigned> &outs, const std::vector<int> &values, const char *who) {
  close();
  errno = 0;
  int c = ::open(chip.c_str(), O_RDWR | O_CLOEXEC);
  if (c < 0) return fail(chip);
  gpio_v2_line_request r;
  memset(&r, 0, sizeof r);
  for (size_t i = 0; i < outs.size() && i < GPIO_V2_LINES_MAX; i++) r.offsets[i] = outs[i];
  r.num_lines = (uint32_t)outs.size();
  r.config.flags = GPIO_V2_LINE_FLAG_OUTPUT;
  r.config.num_attrs = 1;   // the starting values, so a line is never driven the wrong way for an instant
  r.config.attrs[0].attr.id = GPIO_V2_LINE_ATTR_ID_OUTPUT_VALUES;
  for (size_t i = 0; i < outs.size(); i++) {
    r.config.attrs[0].mask |= 1ull << i;
    if (i < values.size() && values[i]) r.config.attrs[0].attr.values |= 1ull << i;
  }
  strncpy(r.consumer, who, sizeof r.consumer - 1);
  int rc = ioctl(c, GPIO_V2_GET_LINE_IOCTL, &r);
  ::close(c);
  if (rc < 0) return fail(chip + " lines");
  fd = r.fd;
  offsets = outs;
  return true;
}
bool Lines::set(unsigned offset, int value) {
  for (size_t i = 0; i < offsets.size(); i++) {
    if (offsets[i] != offset) continue;
    gpio_v2_line_values v;
    memset(&v, 0, sizeof v);
    v.mask = 1ull << i;
    v.bits = value ? 1ull << i : 0;
    errno = 0;
    if (ioctl(fd, GPIO_V2_LINE_SET_VALUES_IOCTL, &v) < 0) return fail("gpio set");
    return true;
  }
  errno = 0;
  return fail("gpio " + std::to_string(offset) + " not held");
}
void Lines::close() { if (fd >= 0) ::close(fd); fd = -1; offsets.clear(); }

bool i2cHere(const std::string &dev, uint8_t addr) {
  errno = 0;
  int fd = ::open(dev.c_str(), O_RDWR | O_CLOEXEC);
  if (fd < 0) return fail(dev);
  uint8_t b = 0;
  i2c_msg m{ addr, I2C_M_RD, 1, &b };
  i2c_rdwr_ioctl_data d{ &m, 1 };
  bool here = ioctl(fd, I2C_RDWR, &d) == 1;
  ::close(fd);
  return here;
}
#else
bool Spi::open(const std::string &path, uint8_t, uint32_t) { errno = 0; return fail(path + ": no SPI on this side"); }
bool Spi::transfer(const uint8_t *, uint8_t *, size_t) { errno = 0; return fail("no SPI on this side"); }
void Spi::close() { fd = -1; }
bool Lines::request(const std::string &chip, const std::vector<unsigned> &, const std::vector<int> &, const char *) { errno = 0; return fail(chip + ": no GPIO on this side"); }
bool Lines::set(unsigned, int) { errno = 0; return fail("no GPIO on this side"); }
void Lines::close() { fd = -1; offsets.clear(); }
bool i2cHere(const std::string &, uint8_t) { return false; }
#endif

bool sysfsRead(const std::string &path, std::string &out) {
  std::ifstream f(path);
  if (!f) return false;
  std::getline(f, out);
  return true;
}
bool sysfsWrite(const std::string &path, const std::string &value) {
  errno = 0;
  std::ofstream f(path);
  if (!f) return fail(path);
  f << value << "\n";
  f.flush();
  if (!f) return fail(path);
  return true;
}

}  // namespace bus
