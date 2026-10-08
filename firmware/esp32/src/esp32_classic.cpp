// C-75: what the ORIGINAL ESP32 (the M5GO, the Fire) needs and the S3s do not. Its instruction RAM is smaller, and this
// SDK puts libc's time functions there whenever PSRAM is on; with Wi-Fi, Bluetooth, I2S and the lights the firmware
// overflowed it by 4.8 KB. strptime alone is 2.2 KB of it, and only HTTPClient's cookie jar calls it -- which returns
// before that unless a jar is set, and none ever is. So on this chip strptime is this stub, in flash.
#include <sdkconfig.h>
#if CONFIG_IDF_TARGET_ESP32
#include <time.h>
extern "C" char *strptime(const char *, const char *, struct tm *) { return nullptr; }
#endif
