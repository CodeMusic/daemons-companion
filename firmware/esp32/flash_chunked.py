#!/usr/bin/env python3
"""C-102: flash a built firmware in short pieces -- for the M5Stack Dial.

    python3 flash_chunked.py ENV PORT        (after `pio run -e ENV`)

While a board is being flashed its own firmware is not running, so the Dial's power hold (GPIO 46) is let go, and
one Dial was found (2026-10-10) to switch itself off about nine seconds into any flashing session -- a write or a read,
wherever in the flash: every whole upload broke off at 60-70%, short reads anywhere passed, and the same cable and
port flashed another board. A new connection starts the clock again, so the firmware goes up in pieces of 256 KB,
each its own esptool session of about three seconds, each verified, a piece retried if the board was mid-restart.
"""
import os, subprocess, sys, time

env, port = sys.argv[1], sys.argv[2]
here = os.path.dirname(os.path.abspath(__file__))
build = os.path.join(here, ".pio", "build", env)
pio = os.path.expanduser("~/.platformio")
esptool = [os.path.join(pio, "penv", "bin", "python"), os.path.join(pio, "packages", "tool-esptoolpy", "esptool.py"),
           "--chip", "esp32s3", "--baud", "921600"]
boot_app0 = os.path.join(pio, "packages", "framework-arduinoespressif32", "tools", "partitions", "boot_app0.bin")
CHUNK = 0x40000

pieces = [(0x0, open(os.path.join(build, "bootloader.bin"), "rb").read()),
          (0x8000, open(os.path.join(build, "partitions.bin"), "rb").read()),
          (0xE000, open(boot_app0, "rb").read())]
app = open(os.path.join(build, "firmware.bin"), "rb").read()
pieces += [(0x10000 + off, app[off:off + CHUNK]) for off in range(0, len(app), CHUNK)]
tmp = os.path.join(build, "chunk.bin")

def current_port():                       # the port can come back under another name after a restart
    if os.path.exists(port): return port
    found = sorted(p for p in os.listdir("/dev") if p.startswith("cu.usbmodem"))
    return "/dev/" + found[0] if found else port

for at, data in pieces:
    open(tmp, "wb").write(data)
    for attempt in range(4):
        r = subprocess.run(esptool + ["--port", current_port(), "--after", "no_reset", "write_flash", "-z", hex(at), tmp],
                           capture_output=True, text=True)
        if r.returncode == 0 and "Hash of data verified" in r.stdout:
            print("flash_chunked: %s ok (%d bytes)" % (hex(at), len(data)), flush=True)
            break
        time.sleep(2)
    else:
        sys.exit("flash_chunked: gave up at %s -- is the board still plugged in?" % hex(at))
    time.sleep(0.5)
subprocess.run(esptool + ["--port", current_port(), "--after", "hard_reset", "chip_id"], capture_output=True)
print("flash_chunked: done; the board restarts", flush=True)
