#include <M5Unified.h>
#include <esp_heap_caps.h>
#include "display.h"

static void flush(lv_display_t *d, const lv_area_t *a, uint8_t *px) {
  M5.Display.pushImage(a->x1, a->y1, a->x2 - a->x1 + 1, a->y2 - a->y1 + 1, (const uint16_t *)px);
  lv_display_flush_ready(d);
}

static void readTouch(lv_indev_t *, lv_indev_data_t *data) {
  auto t = M5.Touch.getDetail();
  data->state = t.isPressed() ? LV_INDEV_STATE_PRESSED : LV_INDEV_STATE_RELEASED;
  data->point.x = t.x; data->point.y = t.y;
}

static lv_display_t *disp = nullptr;
static int rot = 0;
int displayRotation() { return rot; }
bool displayPortrait() { return (rot & 1) == 0; }
void displayRotate(int r) {
  rot = r & 3;
  M5.Display.setRotation(rot);
  if (disp) lv_display_set_resolution(disp, M5.Display.width(), M5.Display.height());
}

void displayBegin(int rotation) {
  displayRotate(rotation);
  M5.Display.setSwapBytes(true);                   // LVGL's RGB565 as the panel takes it
  lv_init();
  lv_tick_set_cb([]() -> uint32_t { return millis(); });
  int w = M5.Display.width(), h = M5.Display.height();
  disp = lv_display_create(w, h);
  size_t bytes = 1280 * 120 * 2;                   // a band of the screen at a time, two of them, in PSRAM -- as wide
                                                   // as the screen is either way up
  void *a = heap_caps_malloc(bytes, MALLOC_CAP_SPIRAM), *b = heap_caps_malloc(bytes, MALLOC_CAP_SPIRAM);
  lv_display_set_buffers(disp, a, b, bytes, LV_DISPLAY_RENDER_MODE_PARTIAL);
  lv_display_set_flush_cb(disp, flush);
  lv_indev_t *touch = lv_indev_create();
  lv_indev_set_type(touch, LV_INDEV_TYPE_POINTER);
  lv_indev_set_read_cb(touch, readTouch);
}
