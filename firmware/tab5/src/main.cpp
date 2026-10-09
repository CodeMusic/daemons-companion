// C-77: the M5Stack Tab5 -- the companion's control center (docs/TAB5.md): the app's screens, and a device of its own,
// with everything kept on it. The screens run here; the network on its own task (net.cpp).
#include <M5Unified.h>
#include <lvgl.h>
#include "display.h"
#include "store.h"
#include "net.h"
#include "ui.h"
#include "sound.h"

void setup() {
  Serial.begin(115200);
  auto cfg = M5.config();
  M5.begin(cfg);
  if (!storeBegin()) Serial.println("tab5: the store did not start");
  displayBegin(uiStartRotation());             // C-96: portrait, unless set otherwise
  uiBegin();
  soundBegin();                                // C-94: the same sounds as every device
  soundWake();
  netBegin();
  Serial.printf("tab5: ready, %s\n", deviceId().c_str());
}

void loop() {
  M5.update();
  uiLoop();
  lv_timer_handler();
  static uint32_t helloAt = 0;                 // C-80: its name down the cable, as the handhelds say it
  if (millis() - helloAt > 3000) { helloAt = millis(); Serial.println("HELLO daemons-companion m5-tab5 3 " + deviceId()); }
  delay(5);
}
