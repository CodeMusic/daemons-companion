#pragma once
// C-444: the cap layer (docs/CAPS.md) -- which cap is on the Cardputer Zero's EXT header, what it offers, and the
// CC1101's band. A cap is found by asking its chips, cheapest and safest first, and never written to before it is
// named. It is not hot-swappable: found once at start, again when CAPS is opened. On a computer, --cap stands one in.
#include <string>
#include <vector>

namespace caps {

enum class Kind { None, Unknown, Cc1101Nfc, Lora1262 };
enum class Band { B315, B433, B915 };       // the bands offered in North America (868 never: docs/CAPS.md)
enum class Antenna { None, A315, A433, A868915 };

struct Offer { std::string type, raw, state; };   // "LONGWAVE", "Sub-GHz", "here" / "to come"

struct Found {
  Kind kind = Kind::None;
  bool pretend = false;                     // --cap on a computer
  std::string name;                         // "CC1101 + NFC (U219)"
  std::string detail;                       // "CC1101 version 0x14"
  std::string why;                          // what stopped it, in words, when a step failed
  std::vector<Offer> offers;
};

void pretend(const std::string &kind);      // "cc1101", "lora" or "none": no device asked (a computer, or checks)
const Found &find(bool again = false);      // found once; again asks the chips again
const Found &found();

// The CC1101's band: its antenna switch (RF_SW0 a GPIO, RF_SW1 the chip's own GDO2) and its tuning
const char *bandName(Band b);               // "433"
double bandMhz(Band b);                     // the centre listened on: 315.00, 433.92, 915.00
Band band();
bool setBand(Band b);                       // the switch set, the chip tuned and listening; kept in cap.conf
void switchFor(Band b, int &sw0, int &sw1); // M5Stack's table: 315 = 0 1, 433 = 1 0, 868/915 = 1 1
std::string bandCheck();                    // read back from the chip: RF_SW1 (IOCFG2), FREQ, its state -- for checks
int rssiDbm();                              // what is heard now on the band (pretend: a quiet room with a burst now and then)

Antenna antenna();                          // what the user says is on the cap's connector
void setAntenna(Antenna a);
const char *antennaName(Antenna a);
bool mayTransmit(Band b);                   // the region's rule and the antenna fitted (nothing in this build transmits)

}  // namespace caps
