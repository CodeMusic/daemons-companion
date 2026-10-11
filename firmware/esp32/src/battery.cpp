#include <Arduino.h>
#include <Wire.h>
#include "battery.h"
#include "board.h"
#include "watch.h"
#if CONFIG_IDF_TARGET_ESP32S3
#include "soc/usb_serial_jtag_reg.h"
#endif

// C-104: is a computer on the USB cable? The S3's own USB counts the host's start-of-frame packets, one a millisecond,
// only while a host is there (HWCDC's own test is not one on this core). A wall charger sends none, so it reads false.
static bool usbHost() {
#if CONFIG_IDF_TARGET_ESP32S3 && ARDUINO_USB_MODE
  uint32_t a = REG_READ(USB_SERIAL_JTAG_FRAM_NUM_REG) & USB_SERIAL_JTAG_SOF_FRAME_INDEX;
  delay(3);
  return (REG_READ(USB_SERIAL_JTAG_FRAM_NUM_REG) & USB_SERIAL_JTAG_SOF_FRAME_INDEX) != a;
#else
  return false;
#endif
}

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

#if BOARD_TDISPLAY_PRO
// C-105: the T-Display-S3 Pro's SY6970 charger (0x6A), set up as LilyGO's PMU_Example sets it -- but charging at 192 mA,
// under the 200 mA LilyGO recommends for its 470 mAh cell (the chip's own default is far more), to 4.352 V, the cell's
// full. Its ADC reads the cell; with USB plugged in that reading is the charger's, not the cell's (LilyGO's note), so
// the percent is rough on the cable and true off it.
#define XPOWERS_CHIP_SY6970
#include <XPowersLib.h>
static PowersSY6970 charger;
static bool sy6970Read(Battery &b) {
  static int up = -1;
  if (up < 0) {
    up = charger.init(Wire, board.sda, board.scl, SY6970_SLAVE_ADDRESS) ? 1 : 0;
    if (up) {
      charger.setInputCurrentLimit(1000);
      charger.setChargeTargetVoltage(4352);
      charger.setPrechargeCurr(64);
      charger.setChargerConstantCurr(192);
      charger.enableMeasure();
    }
  }
  if (!up) { b.present = false; return false; }
  int mv = charger.getBattVoltage();
  b.usb = charger.isVbusIn();
  b.charging = charger.isCharging();
  b.full = charger.isChargeDone();
  b.present = mv > 2500;
  b.mv = mv; b.percent = b.full ? 100 : percentFromMv(mv);
  return b.present;
}
#else
static bool sy6970Read(Battery &b) { b.present = false; return false; }
#endif

bool batteryRead(Battery &b) {
  if (board.power == Power::ChargerSY6970) return sy6970Read(b);
  if (board.power == Power::AdcDivider) {
    int mv = analogReadMilliVolts(board.battAdc) * 2;
    b.present = mv > 2500;                       // nothing there reads near zero (USB power, no cell)
    b.mv = mv; b.percent = percentFromMv(mv);
    // C-104: the divider reads the cell, which its charger holds at or under 4.2 V -- the old "above 4.3 V means USB"
    // never came true, so these boards never said they were plugged in. A computer is found by its USB frames; a wall
    // charger only by a cell above 4.3 V, as before. While it charges, the voltage (and so the percent) reads high.
    // The T-Deck's divider reads the SUPPLY while USB is in (4.6 V seen), not the cell: then the cell cannot be read at
    // all, so it says charging and keeps the last charge read on the cell (100 if none yet this start).
    static int lastCellPct = -1;
    b.usb = usbHost() || mv > 4300;
    if (mv > 4300) { b.percent = lastCellPct >= 0 ? lastCellPct : 100; b.charging = true; b.full = false; }
    else { lastCellPct = b.percent; b.charging = b.usb && mv < 4150; b.full = b.usb && mv >= 4150; }
    return b.present;
  }
  if (board.power == Power::PmuAXP2101) return watchBattery(b);              // C-71: the watch's PMU (watch.cpp)
  if (board.power == Power::PmuM5PM1) {          // C-74: the StickS3's M5PM1 -- the cell's mV (0x22) and USB's (0x24)
    uint8_t w[2];
    if (!readBytes(0x6E, 0x22, w, 2)) { b.present = false; return false; }
    int mv = w[0] | (w[1] << 8);
    int vin = readBytes(0x6E, 0x24, w, 2) ? (w[0] | (w[1] << 8)) : 0;
    b.present = mv > 2600 && mv < 4450;          // M5Unified's own test: no cell reads low, or a USB sawtooth above a cell
    b.mv = mv; b.percent = percentFromMv(mv);
    b.usb = vin > 4300; b.charging = b.usb && mv < 4150; b.full = b.usb && mv >= 4150;
    return b.present;
  }
  if (board.power == Power::PmuIP5306) {         // C-75: the M5GO and Fire's IP5306 (0x75), read as M5Unified reads it
    uint8_t r78, r70, r71;
    if (!readBytes(0x75, 0x78, &r78, 1)) { b.present = false; return false; }
    switch (r78 >> 4) {                          // it knows the charge only in quarters
      case 0x00: b.percent = 100; break; case 0x08: b.percent = 75; break;
      case 0x0C: b.percent = 50; break;  case 0x0E: b.percent = 25; break; default: b.percent = 10;
    }   // C-104: below a quarter it cannot say how far -- 10 warns, where 0 put a board still running on its cell to
        // sleep at a quarter (the 5% rule); the IP5306 switches itself off when the cell is truly empty
    b.present = true; b.mv = 0;                  // no voltage from it: the server keeps none (0 is null there)
    bool supply = readBytes(0x75, 0x70, &r70, 1) && (r70 & 0x08);           // charging on, and a supply present
    bool full = supply && readBytes(0x75, 0x71, &r71, 1) && (r71 & 0x08);
    b.usb = supply; b.charging = supply && !full; b.full = full;
    return true;
  }
  if (board.power != Power::GaugeBQ27220) { b.present = false; return false; }
  batteryWire();
  uint8_t w[2];
  if (!readBytes(GAUGE, 0x2C, w, 2)) { b.present = false; return false; }
  int soc = w[0] | (w[1] << 8);
  if (!readBytes(GAUGE, 0x08, w, 2)) { b.present = false; return false; }
  b.present = true;
  b.percent = soc > 100 ? 100 : soc;
  b.mv = w[0] | (w[1] << 8);
  // C-104: a gauge that has never learnt its cell says what it likes -- the CC1101's said 5% at 4038 mV. When it is
  // more than 40 points from what the voltage says, the voltage is believed (rough, and high while charging).
  int byMv = percentFromMv(b.mv);
  if (b.mv > 2500 && abs(byMv - b.percent) > 40) b.percent = byMv;
  uint8_t st;
  if (readBytes(CHARGER, 0x0B, &st, 1)) {
    int chrg = (st >> 3) & 3;
    b.charging = chrg == 1 || chrg == 2;
    b.full = chrg == 3;
    b.usb = ((st >> 5) & 7) != 0 || (st & 0x04);
  }
  return true;
}
