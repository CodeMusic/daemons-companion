/* SPDX-License-Identifier: GPL-3.0-or-later */
/**
 * @file routines.h
 * @brief C-424: the Dot's ROUTINES -- its radios in the game's words (docs/PLAN.md 10), as data.
 *
 * The same shape as the handhelds' (firmware/esp32/src/routines.cpp): a routine type is a radio with a game name and
 * its raw name in brackets, and holds a list of routines, which may be empty. The menu is drawn from this table alone.
 */
#ifndef ROUTINES_H_
#define ROUTINES_H_

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

/** @brief What a routine does when it runs; daemons_ao.c answers each. */
typedef enum {
    ROUTINE_LODESTONE_READ = 1   /**< C-425: READ MY TAG -- one EM4100 ID, shown, never kept or logged. */
} routine_id_t;

/** @brief One routine: a row under its type. */
typedef struct {
    const char * name;   /**< What the row says, in capitals; DRAFT. */
    routine_id_t id;     /**< What runs. */
} routine_t;

/** @brief One routine type: a radio, in the game's word and its own. */
typedef struct {
    const char *      name;       /**< The game's word: "LODESTONE". */
    const char *      raw;        /**< The radio's own name, shown in brackets after it: "125 kHz". */
    uint32_t          colour;     /**< 0xRRGGBB: its row's highlight and the LED; DRAFT. */
    const routine_t * routines;   /**< Its routines; NULL while it has none. */
    uint8_t           count;      /**< How many. */
} routine_type_t;

extern const routine_type_t g_routine_types[];   /**< The types, in the menu's order. */
extern const uint8_t        g_routine_type_count; /**< How many. */

#ifdef __cplusplus
}
#endif

#endif /* ROUTINES_H_ */
