/* SPDX-License-Identifier: GPL-3.0-or-later */
/**
 * @file app_main.c
 * @brief C-424: DAEMONS on the Kode Dot -- bring kodeOS's system up, then start the app's one Active Object.
 */
#include "kode_sys.h"

#include "daemons_ao.h"

/* The name on the launcher's pill, and its groups from the catalog's categories.txt. */
KODE_APP_MANIFEST("DAEMONS", "games,wireless");

/**
 * @brief ESP-IDF's entry point.
 */
void app_main(void)
{
    /* First, always: nothing may post to an Active Object before its queue exists. */
    kode_init();

    DaemonsAo_ctor();
    DaemonsAo_start();
}
