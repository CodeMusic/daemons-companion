#include <Arduino.h>
#include <Wire.h>
#include "battery.h"

// C-63. Registers from TI's datasheets (and LilyGO's own examples for this board): the gauge's StateOfCharge (0x2C,
// percent) and Voltage (0x08, mV), little-endian words; the charger's REG0B -- VBUS_STAT in bits 7-5, CHRG_STAT in
// bits 4-3 (0 not charging, 1 pre-charge, 2 fast charge, 3 done), PG_STAT (power good) in bit 2.
static const uint8_t GAUGE = 0x55, CHARGER = 0x6B;
static const int PIN_SDA = 8, PIN_SCL = 18;
static bool wireUp = false;

void batteryWire() {
  if (wireUp) return;
  Wire.begin(PIN_SDA, PIN_SCL);
  wireUp = true;
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
