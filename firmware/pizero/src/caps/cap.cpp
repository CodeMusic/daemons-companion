// C-444: the cap layer -- see cap.h and docs/CAPS.md. The Zero's wiring is M5Stack's (their cap apps and the
// cardputerzero-v5 overlay, MIT): the cap's SPI is /dev/spidev0.1, its lines on /dev/gpiochip0; GPIO26 is the CC1101
// cap's POWER_EN (and the LoRa cap's RESET, held high = running); GPIO14 is the CC1101 cap's RF_SW0 (and the GPS
// variant's UART, so it is driven only once a CC1101 has answered); the LoRa cap's antenna switch answers at I2C 0x43.
#include "caps/cap.h"

#include <chrono>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <memory>
#include <thread>

#include "board.h"
#include "caps/bus.h"
#include "caps/cc1101.h"
#include "paths.h"

namespace caps {
namespace {
const char *SPI_DEV = "/dev/spidev0.1", *GPIO_CHIP = "/dev/gpiochip0", *I2C_DEV = "/dev/i2c-1";
const char *LEDS = "/sys/class/leds/";
const unsigned POWER_EN = 26, RF_SW0 = 14;

std::string pretendKind;   // "" asks the device
bool asked = false;
Found now;
bus::Spi spi;
bus::Lines powerLine, switchLine;
cc1101::Chip chip;
Band chosen = Band::B433;
Antenna fitted = Antenna::None;
bool confRead = false;
bool chipReady = false;   // a CC1101 answered and was reset: the band can be set on it

void readConf() {
  if (confRead) return;
  confRead = true;
  std::string t;
  if (!readText(inConfig("cap.conf"), t)) return;
  size_t at = 0;
  while (at < t.size()) {
    size_t nl = t.find('\n', at);
    std::string line = t.substr(at, nl == std::string::npos ? std::string::npos : nl - at);
    at = nl == std::string::npos ? t.size() : nl + 1;
    size_t eq = line.find('=');
    if (eq == std::string::npos) continue;
    auto trim = [](std::string s) { while (!s.empty() && isspace((unsigned char)s.back())) s.pop_back(); while (!s.empty() && isspace((unsigned char)s[0])) s.erase(0, 1); return s; };
    std::string k = trim(line.substr(0, eq)), v = trim(line.substr(eq + 1));
    if (k == "band") chosen = v == "315" ? Band::B315 : v == "915" ? Band::B915 : Band::B433;
    if (k == "antenna") fitted = v == "315" ? Antenna::A315 : v == "433" ? Antenna::A433 : v == "868/915" ? Antenna::A868915 : Antenna::None;
  }
}
void writeConf() {
  std::string a = fitted == Antenna::A315 ? "315" : fitted == Antenna::A433 ? "433" : fitted == Antenna::A868915 ? "868/915" : "none";
  writeTextAtomic(inConfig("cap.conf"), std::string("# C-444: the cap's band and the antenna on it (docs/CAPS.md)\nband = ") +
                                        bandName(chosen) + "\nantenna = " + a + "\n");
}

// The cap's power, as M5Stack's apps put it on: the header's two shared lines to the cap (not USB), its 5 V, POWER_EN
std::string powerOn() {
  std::string note, v;
  bool woke = false;   // anything switched on just now: the cap needs a moment before its chips answer
  if (bus::sysfsRead(std::string(LEDS) + "ext_usb_gpio_fun/brightness", v) && v != "0" && (woke = true) &&
      !bus::sysfsWrite(std::string(LEDS) + "ext_usb_gpio_fun/brightness", "0"))
    note += "the header's lines are with USB (" + bus::lastError() + "); ";
  if (bus::sysfsRead(std::string(LEDS) + "ext_5v_out/brightness", v) && v == "0" && (woke = true) &&
      !bus::sysfsWrite(std::string(LEDS) + "ext_5v_out/brightness", "1"))
    note += "the cap's 5 V is off (" + bus::lastError() + "); ";
  if (powerLine.fd < 0) {
    woke = true;
    if (!powerLine.request(GPIO_CHIP, { POWER_EN }, { 1 }, "daemons-cap")) note += "POWER_EN not held (" + bus::lastError() + "); ";
  }
  // seen on the device 2026-11-21: asked at once after its 5 V came on, the CC1101 read as no cap at all
  if (woke) std::this_thread::sleep_for(std::chrono::milliseconds(60));
  return note;
}

void offersFor(Found &f) {
  f.offers.clear();
  if (f.kind == Kind::Cc1101Nfc) {
    f.offers.push_back({ "LONGWAVE", "Sub-GHz", "listening" });                 // DRAFT
    f.offers.push_back({ "LONGWAVE ROLL CALL", "Sub-GHz", "R: open" });          // DRAFT (C-447)
    f.offers.push_back({ "TOUCHSTONE", "NFC", "to come" });                     // DRAFT (C-445)
  } else if (f.kind == Kind::Lora1262) {
    f.offers.push_back({ "MESH", "LoRa", "to come" });                          // DRAFT (C-446)
  }
}

[[maybe_unused]] void findOnDevice(Found &f) {
  std::string note = powerOn();
  if (bus::i2cHere(I2C_DEV, 0x43)) {   // the LoRa-1262's antenna switch (the ADV's rule too, board.cpp)
    f.kind = Kind::Lora1262;
    f.name = "LoRa-1262";                                                       // DRAFT
    f.detail = "its antenna switch answers at I2C 0x43";                        // DRAFT
    return;
  }
  if (!spi.open(SPI_DEV, 0, 500000)) { f.kind = Kind::None; f.why = note + bus::lastError(); return; }
  chip.spi = &spi;
  uint8_t part = 0xFF, ver = 0xFF;
  if (chip.known(part, ver)) {
    f.kind = Kind::Cc1101Nfc;
    f.name = "CC1101 + NFC (U219)";                                             // DRAFT
    char d[64];
    snprintf(d, sizeof d, "CC1101 version 0x%02X", ver);
    f.detail = d;
    chip.reset();
    chipReady = true;
    int sw0, sw1;
    switchFor(chosen, sw0, sw1);
    if (!switchLine.request(GPIO_CHIP, { RF_SW0 }, { sw0 }, "daemons-cap-rfsw0")) note += "RF_SW0 not held (" + bus::lastError() + "); ";
    if (!setBand(chosen)) note += "its band not set; ";
  } else if ((part == 0x00 && ver == 0x00) || (part == 0xFF && ver == 0xFF)) {
    f.kind = Kind::None;                 // nothing drives the line: no cap
    spi.close();
  } else {
    f.kind = Kind::Unknown;
    f.name = "a cap this build does not know";                                  // DRAFT
    char d[64];
    snprintf(d, sizeof d, "it answered 0x%02X 0x%02X", part, ver);
    f.detail = d;
    spi.close();
  }
  if (!note.empty()) f.why = note.substr(0, note.size() - 2);
}
}  // namespace

void pretend(const std::string &kind) { pretendKind = kind.empty() ? "none" : kind; asked = false; }

const Found &find(bool again) {
  readConf();
  if (asked && !again) return now;
  asked = true;
  Found f;
  chipReady = false;
  switchLine.close();
  spi.close();
  if (!pretendKind.empty()) {
    f.pretend = true;
    if (pretendKind == "cc1101") { f.kind = Kind::Cc1101Nfc; f.name = "CC1101 + NFC (U219)"; f.detail = "pretend: no chip asked"; }   // DRAFT
    else if (pretendKind == "lora") { f.kind = Kind::Lora1262; f.name = "LoRa-1262"; f.detail = "pretend: no chip asked"; }           // DRAFT
    else f.kind = Kind::None;
  } else {
#if ZERO_DEVICE
    // C-514: the header's chips are asked only on a board that has the header -- its POWER_EN, GPIO26, is the Game
    // HAT's A, the GamePi20's START and the uConsole AIO's LoRa DIO1, and must never be driven there
    if (board::CAP_HEADER) findOnDevice(f);
    else f.kind = Kind::None;
#else
    f.kind = Kind::None;
    f.why = "a computer has no cap header (--cap cc1101 stands one in)";        // DRAFT
#endif
  }
  offersFor(f);
  if (!f.pretend && board::RADIOS) board::builtInRadios(f);   // C-514: what the board carries itself (receive only here)
  now = f;
  return now;
}
const Found &found() { return asked ? now : find(); }

const char *bandName(Band b) { return b == Band::B315 ? "315" : b == Band::B915 ? "915" : "433"; }
double bandMhz(Band b) { return b == Band::B315 ? 315.0 : b == Band::B915 ? 915.0 : 433.92; }
Band band() { readConf(); return chosen; }
void switchFor(Band b, int &sw0, int &sw1) {
  if (b == Band::B315) { sw0 = 0; sw1 = 1; }
  else if (b == Band::B433) { sw0 = 1; sw1 = 0; }
  else { sw0 = 1; sw1 = 1; }
}

bool setBand(Band b) {
  readConf();
  chosen = b;
  writeConf();
  if (!chipReady) return true;   // pretend, or no CC1101: the choice is kept for when one is fitted
  int sw0, sw1;
  switchFor(b, sw0, sw1);
  bool ok = switchLine.fd < 0 || switchLine.set(RF_SW0, sw0);
  ok = chip.idle() && chip.write(cc1101::IOCFG2, sw1 ? 0x6F : 0x2F) && ok;   // RF_SW1 is GDO2: driven high (0x6F) or low (0x2F)
  ok = chip.tune(bandMhz(b)) && chip.listen() && ok;
  return ok;
}

std::string bandCheck() {
  int sw0, sw1;
  switchFor(chosen, sw0, sw1);
  char b[200];
  if (!chipReady) {
    snprintf(b, sizeof b, "%s MHz: RF_SW0 %d, RF_SW1 %d (no CC1101 to read back)", bandName(chosen), sw0, sw1);
    return b;
  }
  uint8_t io2 = chip.read(cc1101::IOCFG2);
  uint32_t w = (uint32_t)chip.read(cc1101::FREQ2) << 16 | (uint32_t)chip.read(cc1101::FREQ1) << 8 | chip.read(cc1101::FREQ0);
  snprintf(b, sizeof b, "%s MHz: RF_SW0 %d (GPIO14 %s), RF_SW1 %d (IOCFG2 0x%02X), tuned %.3f MHz, state 0x%02X", bandName(chosen),
           sw0, switchLine.fd >= 0 ? "held" : "NOT held", io2 == 0x6F ? 1 : io2 == 0x2F ? 0 : -1, io2, cc1101::freqOf(w),
           chip.status(cc1101::MARCSTATE) & 0x1F);
  return b;
}

int rssiDbm() {
  if (now.pretend) {
    using namespace std::chrono;
    double t = duration<double>(steady_clock::now().time_since_epoch()).count();
    int burst = fmod(t, 7.0) < 0.4 ? 40 : 0;
    return -104 + (int)(3 * sin(t * 3.1)) + burst;
  }
  if (!chipReady) return -127;
  return chip.rssiDbm();
}

cc1101::Chip *radio() { return chipReady && !now.pretend ? &chip : nullptr; }

Antenna antenna() { readConf(); return fitted; }
void setAntenna(Antenna a) { readConf(); fitted = a; writeConf(); }
const char *antennaName(Antenna a) {
  return a == Antenna::A315 ? "315 MHz" : a == Antenna::A433 ? "433 MHz" : a == Antenna::A868915 ? "868/915 MHz" : "NONE";   // DRAFT
}
bool mayTransmit(Band b) {
  readConf();
  if (b == Band::B315) return false;                                   // North America: left to the gadgets there
  if (b == Band::B433) return fitted == Antenna::A433;
  return fitted == Antenna::A868915;                                   // 902-928 MHz only; 868 is never offered
}

}  // namespace caps
