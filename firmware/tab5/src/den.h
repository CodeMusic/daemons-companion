#pragma once
// C-113: the daemon in its den (den.cpp) -- a picture w x h that walks the daemon across its type's place.
#include <lvgl.h>
#include <ArduinoJson.h>

lv_obj_t *denStage(lv_obj_t *parent, JsonObject daemon, int w, int h);
