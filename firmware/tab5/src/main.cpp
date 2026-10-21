// C-77: the M5Stack Tab5 -- the companion's control center (docs/TAB5.md): the app's screens, and a device of its own,
// with everything kept on it. The screens run here; the network on its own task (net.cpp).
#include <M5Unified.h>
#include <lvgl.h>
#include <esp_heap_caps.h>
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
  static String line;                          // SHOT, GO, TAP and SCROLL from the computer (ui.h)
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\n') { line.trim(); if (line.length()) uiCommand(line); line = ""; }
    else if (line.length() < 64) line += c;
  }
  uiLoop();
  lv_timer_handler();
  static uint32_t helloAt = 0;                 // C-80: its name down the cable, as the handhelds say it
  if (millis() - helloAt > 3000) { helloAt = millis(); Serial.println("HELLO daemons-companion m5-tab5 3 " + deviceId()); }
  static uint32_t memAt = 0;                   // C-177: internal RAM down the cable, so running low shows before it aborts
  if (millis() - memAt > 30000) {
    memAt = millis();
    Serial.printf("MEM internal %u free, %u least, %u largest; psram %u free\n", heap_caps_get_free_size(MALLOC_CAP_INTERNAL),
                  heap_caps_get_minimum_free_size(MALLOC_CAP_INTERNAL), heap_caps_get_largest_free_block(MALLOC_CAP_INTERNAL),
                  heap_caps_get_free_size(MALLOC_CAP_SPIRAM));
  }
  delay(5);
}
