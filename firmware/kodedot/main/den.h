/* SPDX-License-Identifier: GPL-3.0-or-later */
/**
 * @file den.h
 * @brief C-426: the den on the glass -- the Dot's daemon, the day, the next step, and CARE.
 *
 * Built once beside the ROUTINES menu's objects and shown or hidden with it. Only the Active Object's thread calls
 * these, as it does every lv_* call.
 */
#ifndef DEN_H_
#define DEN_H_

#include <stdbool.h>
#include <stdint.h>

#include "lvgl.h"

#include "companion.h"

#ifdef __cplusplus
extern "C" {
#endif

/** @brief The den's rows under the picture: DRINK, FEED, TRAIN, SLEEP (or WAKE), and ROUTINES. */
#define DEN_ITEMS       5U
#define DEN_ROUTINES    4U   /**< The row that opens the ROUTINES menu. */

/** @brief The den's objects; LVGL owns them, this keeps where they are. */
typedef struct {
    lv_obj_t *     day;                  /**< THURSDAY  Forgiveness over Wrath */
    lv_obj_t *     pic;                  /**< The daemon, three times its size. */
    lv_obj_t *     name;                 /**< PIP  LV 9 */
    lv_obj_t *     mood;                 /**< calm   fed 0/2   drank 0/2 */
    lv_obj_t *     step;                 /**< NEXT: the step */
    lv_obj_t *     said;                 /**< What it said back, or why nothing came. */
    lv_obj_t *     items[DEN_ITEMS];     /**< The care rows and ROUTINES. */
    lv_obj_t *     status;               /**< Whether the companion answered, and what waits to be sent. */
    lv_image_dsc_t dsc;                  /**< The picture, in ARGB8888 ... */
    uint32_t *     argb;                 /**< ... in PSRAM. */
    bool           has_pic;              /**< A picture has come. */
    bool           shown;                /**< The den is the page on the glass. */
} den_ui_t;

/**
 * @brief Make the den's objects on the active screen, hidden.
 * @param ui   Its objects.
 * @param tap  Called with @p user when a row is tapped; the row is lv_event_get_target().
 * @param user Handed to @p tap.
 */
void den_ui_build(den_ui_t * ui, lv_event_cb_t tap, void * user);

/**
 * @brief Show or hide every object of the den.
 */
void den_ui_show(den_ui_t * ui, bool on);

/**
 * @brief Draw what is known: the day, the daemon and its care, the cursor, and the lines under them.
 * @param ui     Its objects.
 * @param den    What the companion last said; NULL before it has said anything.
 * @param at     The row under the cursor, 0 .. DEN_ITEMS - 1.
 * @param said   What the daemon said back, or why nothing came; "" for nothing.
 * @param status The foot's line.
 */
void den_ui_draw(den_ui_t * ui, const den_t * den, uint8_t at, const char * said, const char * status);

/**
 * @brief Take a new picture: index 0 clear, the rest from the palette.
 */
void den_ui_art(den_ui_t * ui, const den_art_t * art);

/**
 * @brief The care a row stands for (SLEEP's row is WAKE while it sleeps).
 * @param den What is known; NULL counts as awake.
 * @param at  The row, 0 .. DEN_ROUTINES - 1.
 * @return The care.
 */
care_t den_care_at(const den_t * den, uint8_t at);

#ifdef __cplusplus
}
#endif

#endif /* DEN_H_ */
