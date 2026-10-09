// C-77: LVGL for the Tab5 -- only what the control center uses. Memory from the C library (PSRAM on the Tab5: 32 MB).
#ifndef LV_CONF_H
#define LV_CONF_H
#include <stdint.h>

#define LV_COLOR_DEPTH 16
#define LV_USE_STDLIB_MALLOC    LV_STDLIB_CLIB
#define LV_USE_STDLIB_STRING    LV_STDLIB_CLIB
#define LV_USE_STDLIB_SPRINTF   LV_STDLIB_CLIB
#define LV_DEF_REFR_PERIOD 16
#define LV_DPI_DEF 200
#define LV_USE_OS LV_OS_NONE
#define LV_USE_LOG 0
#define LV_USE_ASSERT_NULL 1
#define LV_USE_ASSERT_MALLOC 1

// the fonts: body, headings, the clock
#define LV_FONT_MONTSERRAT_16 1
#define LV_FONT_MONTSERRAT_20 1
#define LV_FONT_MONTSERRAT_28 1
#define LV_FONT_MONTSERRAT_40 1
#define LV_FONT_MONTSERRAT_48 1
#define LV_FONT_DEFAULT &lv_font_montserrat_20

// widgets
#define LV_USE_LABEL 1
#define LV_USE_BUTTON 1
#define LV_USE_LIST 1
#define LV_USE_TABVIEW 1
#define LV_USE_KEYBOARD 1
#define LV_USE_TEXTAREA 1
#define LV_USE_IMAGE 1
#define LV_USE_SPINNER 1
#define LV_USE_ARC 1
#define LV_USE_MSGBOX 1
#define LV_USE_DROPDOWN 1
#define LV_USE_SWITCH 1
#define LV_USE_BAR 1
#define LV_USE_FLEX 1
#define LV_USE_GRID 1

// the daemons' art comes as PNG (the server's /art/ routes)
#define LV_USE_LODEPNG 1

#define LV_USE_THEME_DEFAULT 1
#define LV_THEME_DEFAULT_DARK 0
#endif
