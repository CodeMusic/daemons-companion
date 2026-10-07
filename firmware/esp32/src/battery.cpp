#include <Arduino.h>
#include <Wire.h>
#include "battery.h"
#include "board.h"

// C-63. Registers from TI's datasheets (and LilyGO's own examples for this board): the gauge's StateOfCharge (0x2C,
// percent) and Voltage (0x08, mV), little-endian words; the charger's REG0B -- VBUS_STAT in bits 7-5, CHRG_STAT in
// bits 4-3 (0 not charging, 1 pre-charge, 2 fast charge, 3 done), PG_STAT (power good) in bit 2.
static const uint8_t GAUGE = 0x55, CHARGER = 0x6B;
static bool wireUp = false;

void batteryWire() {                  // C-67: boardBegin() has the bus up already; this keeps the NFC's old call working
  if (wireUp) return;
  Wire.begin(board.sda, board.scl);
  wireUp = true;
}

// C-67: a board with only a voltage divider (the plain T-Embed, the SI4732: IO4, halved): the charge from a LiPo's
// resting voltage. Rough -- a cell under load reads low -- but it moves the right way and warns in time.
static int percentFromMv(int mv) {
  static const int V[] = { 3300, 3600, 3700, 3750, 3800, 3850, 3900, 4000, 4100, 4200 };
  static const int P[] = {    0,    5,   12,   20,   32,   45,   58,   75,   90,  100 };
  if (mv <= V[0]) return 0;
  for (int i = 1; i < 10; i++)
    if (mv <= V[i]) return P[i - 1] + (P[i] - P[i - 1]) * (mv - V[i - 1]) / (V[i] - V[i - 1]);
  return 100;
}

static bool readBytes(uint8_t addr, uint8_t reg, uint8_t *out, uint8_t n) {
  Wire.beginTransmission(addr);
  Wire.write(reg);
  if (Wire.endTransmission(false) != 0) return false;
  if (Wire.requestFrom(addr, n) != n) return false;
  for (uint8_t i = 0; i < n; i++) out[i] = Wire.read();
  return true;
}

bool batteryRead(Battery &b) {
  if (board.power == Power::AdcDivider) {
    int mv = analogReadMilliVolts(board.battAdc) * 2;
    b.present = mv > 2500;                       // nothing there reads near zero (USB power, no cell)
    b.mv = mv; b.percent = percentFromMv(mv);
    b.usb = mv > 4300; b.charging = b.usb && mv < 4400; b.full = false;   // a cell on the charger reads above 4.2 V
    return b.present;
  }
  if (board.power != Power::GaugeBQ27220) { b.present = false; return false; }   // the watch's PMU: its own build
  batteryWire();
  uint8_t w[2];
  if (!readBytes(GAUGE, 0x2C, w, 2)) { b.present = false; return false; }
  int soc = w[0] | (w[1] << 8);
  if (!readBytes(GAUGE, 0x08, w, 2)) { b.present = false; return false; }
  b.present = true;
  b.percent = soc > 100 ? 100 : soc;
  b.mv = w[0] | (w[1] << 8);
  uint8_t st;
  if (readBytes(CHARGER, 0x0B, &st, 1)) {
    int chrg = (st >> 3) & 3;
    b.charging = chrg == 1 || chrg == 2;
    b.full = chrg == 3;
    b.usb = ((st >> 5) & 7) != 0 || (st & 0x04);
  }
  return true;
}
