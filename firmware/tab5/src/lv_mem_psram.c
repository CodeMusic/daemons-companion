// C-177: LVGL's memory, from PSRAM. With the C library's malloc LVGL took internal RAM for everything below 16 KB --
// every object, label and style, which is nearly all it allocates -- and a page of a few hundred objects (PLACES) left
// too little for the next file opened: newlib aborted creating its lock (seen 2026-10-21 on the serial log, core 1).
// The Tab5 has 32 MB of PSRAM; the screen's objects belong there.
#include <lvgl.h>
#include <esp_heap_caps.h>

#if LV_USE_STDLIB_MALLOC == LV_STDLIB_CUSTOM
void lv_mem_init(void) {}
void lv_mem_deinit(void) {}
lv_mem_pool_t lv_mem_add_pool(void *mem, size_t bytes) { LV_UNUSED(mem); LV_UNUSED(bytes); return NULL; }
void lv_mem_remove_pool(lv_mem_pool_t pool) { LV_UNUSED(pool); }
void *lv_malloc_core(size_t size) { return heap_caps_malloc(size, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT); }
void *lv_realloc_core(void *p, size_t size) { return heap_caps_realloc(p, size, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT); }
void lv_free_core(void *p) { heap_caps_free(p); }
void lv_mem_monitor_core(lv_mem_monitor_t *mon) { LV_UNUSED(mon); }
lv_result_t lv_mem_test_core(void) { return LV_RESULT_OK; }
#endif
