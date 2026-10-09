// C-77: the M5Stack Tab5 -- the companion's control center (docs/TAB5.md). Bring-up: the board, LVGL on its screen and
// touch, one label. The screens come next.
#include <M5Unified.h>
#include <lvgl.h>

static lv_display_t *disp;
static lv_indev_t *touch;

static void flush(lv_display_t *d, const lv_area_t *a, uint8_t *px) {
  int w = a->x2 - a->x1 + 1, h = a->y2 - a->y1 + 1;
  M5.Display.pushImage(a->x1, a->y1, w, h, (const uint16_t *)px);
  lv_display_flush_ready(d);
}

static void readTouch(lv_indev_t *, lv_indev_data_t *data) {
  auto t = M5.Touch.getDetail();
  data->state = t.isPressed() ? LV_INDEV_STATE_PRESSED : LV_INDEV_STATE_RELEASED;
  data->point.x = t.x; data->point.y = t.y;
}

void setup() {
  auto cfg = M5.config();
  M5.begin(cfg);
  M5.Display.setRotation(1);                       // landscape: 1280 x 720
  M5.Display.setSwapBytes(true);
  lv_init();
  lv_tick_set_cb([]() -> uint32_t { return millis(); });
  int w = M5.Display.width(), h = M5.Display.height();
  disp = lv_display_create(w, h);
  size_t lines = 80, bytes = w * lines * 2;
  void *buf = heap_caps_malloc(bytes, MALLOC_CAP_SPIRAM);
  lv_display_set_buffers(disp, buf, nullptr, bytes, LV_DISPLAY_RENDER_MODE_PARTIAL);
  lv_display_set_flush_cb(disp, flush);
  touch = lv_indev_create();
  lv_indev_set_type(touch, LV_INDEV_TYPE_POINTER);
  lv_indev_set_read_cb(touch, readTouch);
  lv_obj_t *l = lv_label_create(lv_screen_active());
  lv_label_set_text(l, "DAEMONS companion -- Tab5");
  lv_obj_center(l);
}

void loop() {
  M5.update();
  lv_timer_handler();
  delay(5);
}
