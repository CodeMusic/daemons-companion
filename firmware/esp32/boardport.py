"""Where the companion's boards appear on USB, and how to open one (C-75).

The ESP32-S3 boards (the T-Embeds, the watch, the StickS3, the CoreS3) speak USB themselves: /dev/cu.usbmodem*. The
M5GO and the Fire are the original ESP32, behind a USB-serial chip -- a CP2104 (/dev/cu.usbserial*, or SLAB_USBtoUART
with Silicon Labs' driver) or a CH9102 (/dev/cu.wchusbserial*). On those, DTR and RTS are wired to the chip's reset
and boot pins, and opening the port the usual way pulses them and restarts the board -- so they are opened with both
held off. The S3s are opened as they always were.
"""
import glob

import serial

GLOBS = ["/dev/cu.usbmodem*", "/dev/ttyACM*",
         "/dev/cu.usbserial*", "/dev/cu.wchusbserial*", "/dev/cu.SLAB_USBtoUART*", "/dev/ttyUSB*"]


def ports():
    found = sorted({p for g in GLOBS for p in glob.glob(g)})
    # a CH9102 shows twice with the WCH driver -- cu.usbserial-<serial> and cu.wchusbserial<serial> -- one board: the WCH one
    wch = {p.split("wchusbserial", 1)[1] for p in found if "wchusbserial" in p}
    return [p for p in found if not ("usbserial-" in p and p.split("usbserial-", 1)[1] in wch)]


def native(port):
    return "usbmodem" in port or "ttyACM" in port


def open_port(port, timeout=None):
    if native(port):
        return serial.Serial(port, 115200, timeout=timeout)
    s = serial.Serial()
    s.port, s.baudrate, s.timeout = port, 115200, timeout
    s.dtr = False
    s.rts = False
    s.open()
    return s
