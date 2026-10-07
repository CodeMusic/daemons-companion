#pragma once
// C-63: the battery, read from the T-Embed CC1101's own chips -- the BQ27220 fuel gauge (0x55) for the charge and the
// BQ25896 charger (0x6B) for whether it is charging -- on the board's I2C bus (SDA 8, SCL 18), the one the NFC uses.
struct Battery {
  bool present = false;    // the gauge answered
  int percent = -1;        // state of charge, 0..100
  int mv = 0;              // the cell's voltage
  bool charging = false;   // pre-charge or fast charge
  bool full = false;       // charge done, still on USB
  bool usb = false;        // power is coming in
};
void batteryWire();              // start the shared I2C bus once (the NFC uses it too)
bool batteryRead(Battery &b);    // false when the gauge did not answer
