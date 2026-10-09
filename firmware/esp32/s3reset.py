"""Start an ESP32-S3's app when an upload over its own USB has left it waiting in download mode (C-89).

PlatformIO's esptool (4.5.1) resets the S3 after an upload by toggling RTS, and over the S3's own USB (USB-Serial-JTAG)
that can leave the chip in download mode with its "force download boot" flag set: the board looks unflashed, because it
is not running anything (seen on the CoreS3, 2026-10-09). esptool 5 clears that flag and resets with the RTC watchdog
instead (esptool/targets/esp32s3.py, watchdog_reset and hard_reset; espressif/arduino-esp32 issue #6762). This does the
same with 4.5.1's own loader -- the same registers, the same values.

    python s3reset.py /dev/cu.usbmodem101
"""
import os
import sys
import time

# PlatformIO keeps esptool as a package of its own, not in its Python's site-packages
sys.path.insert(0, os.path.expanduser("~/.platformio/packages/tool-esptoolpy"))
import esptool  # noqa: E402

RTCCNTL = 0x60008000
WDTCONFIG0, WDTCONFIG1, WDTWPROTECT, WDT_WKEY = RTCCNTL + 0x98, RTCCNTL + 0x9C, RTCCNTL + 0xB0, 0x50D83AA1
OPTION1, FORCE_DOWNLOAD_BOOT = 0x6000812C, 0x1


def main(port):
    esp = esptool.cmds.detect_chip(port, 115200, "no_reset")
    if esp.CHIP_NAME != "ESP32-S3":
        print("s3reset: %s is an %s, not an S3 -- nothing done" % (port, esp.CHIP_NAME))
        return 1
    esp.write_reg(OPTION1, 0, FORCE_DOWNLOAD_BOOT)                     # no longer forced into download mode
    esp.write_reg(WDTWPROTECT, WDT_WKEY)                               # unlock
    esp.write_reg(WDTCONFIG1, 2000)                                    # the watchdog's timeout
    esp.write_reg(WDTCONFIG0, (1 << 31) | (5 << 28) | (1 << 8) | 2)   # on: a system reset when it fires
    esp.write_reg(WDTWPROTECT, 0)                                      # lock
    time.sleep(0.5)
    print("s3reset: %s restarted by its watchdog" % port)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1]) if len(sys.argv) > 1 else "s3reset: name the port")
