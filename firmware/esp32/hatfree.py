#!/usr/bin/env python3
"""C-148: the M5StickC-Plus came up in the ROM's download mode at every reset -- its Thermal HAT's MLX90640 was holding
SDA low, and SDA is GPIO 0, a strapping pin. This clocks the HAT's SCL (GPIO 26) from the ROM's own loader until SDA
lets go, then starts the firmware. Holding the power button six seconds and pressing it again does the same by hand.

    python3 hatfree.py [PORT]          (PlatformIO's Python has esptool; a bridge holding the port must be stopped first)

Registers from the ESP32's technical reference (the GPIO matrix): GPIO_IN 0x3FF4403C, OUT_W1TS 0x08, OUT_W1TC 0x0C,
ENABLE_W1TS 0x24, ENABLE_W1TC 0x28.
"""
import os, sys, time
sys.path.insert(0, os.path.expanduser("~/.platformio/packages/tool-esptoolpy"))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import esptool  # noqa: E402
import boardport  # noqa: E402

port = sys.argv[1] if len(sys.argv) > 1 else next((p for p in boardport.ports() if "usbserial" in p), None)
if not port:
    sys.exit("hatfree: no USB-serial board found")
G = 0x3FF44000
IN, W1TS, W1TC, EN_S, EN_C = G + 0x3C, G + 0x08, G + 0x0C, G + 0x24, G + 0x28
SCL = 1 << 26
esp = esptool.ESP32ROM(port, 115200)
esp.connect()                                  # into the ROM's loader (where a held SDA leaves it anyway)
v = esp.read_reg(IN)
print("hatfree: %s  SDA (G0) %s, SCL (G26) %s" % (port, "high" if v & 1 else "LOW", "high" if v & SCL else "low"))
if not v & 1:
    esp.write_reg(W1TS, SCL); esp.write_reg(EN_S, SCL)
    for i in range(16):
        esp.write_reg(W1TC, SCL); esp.write_reg(W1TS, SCL)
        if esp.read_reg(IN) & 1:
            print("hatfree: SDA let go after %d clocks" % (i + 1)); break
    esp.write_reg(EN_C, SCL)
    if not esp.read_reg(IN) & 1:
        sys.exit("hatfree: SDA is still held -- hold the power button six seconds, then press it")
esp.hard_reset()                               # the firmware, with G0 high
print("hatfree: started")
