// C-26: copy this file to secrets.h (beside it; secrets.h is never committed) and fill it in on your own machine.
// Without a secrets.h the companion still works over its USB cable (usb_bridge.py), just not over Wi-Fi.
#pragma once

#define COMPANION_WIFI_SSID     "your network's name"
#define COMPANION_WIFI_PASSWORD "your network's password"

// The companion server on your computer, as the device can reach it: the computer's address on your network, and the
// server started with "host": "0.0.0.0" in server/config.json.
#define COMPANION_SERVER        "http://192.168.1.10:4730"
