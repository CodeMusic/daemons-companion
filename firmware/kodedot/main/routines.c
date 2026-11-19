/* SPDX-License-Identifier: GPL-3.0-or-later */
/**
 * @file routines.c
 * @brief C-424: the Dot's routine types and their routines.
 *
 * The names are the user's (2026-10-04: FLARE, WHISPER, TOUCHSTONE, UPLINK; 2026-11-19: LODESTONE, DRAFT). Every
 * routine runs on the author's own gear only (CONTEXT.md). A type with nothing wired yet opens on an empty list, as on
 * the handhelds: FLARE, TOUCHSTONE and WHISPER wait for the board (C-427), UPLINK for the den's sync (C-426).
 */
#include "routines.h"

#include <stddef.h>

/** C-425: LODESTONE, the 125 kHz tags. KEEP A TAG, MY TAGS and COPY TO A BLANK follow on the board. */
static const routine_t LODESTONE_ROUTINES[] = {
    { "READ MY TAG", ROUTINE_LODESTONE_READ }
};

const routine_type_t g_routine_types[] = {
    { "FLARE",      "IR",        0xFF7A45U, NULL,               0U },
    { "WHISPER",    "Bluetooth", 0x7FB4FFU, NULL,               0U },
    { "TOUCHSTONE", "NFC",       0xC6A6FFU, NULL,               0U },
    { "LODESTONE",  "125 kHz",   0xD9944EU, LODESTONE_ROUTINES, 1U },
    { "UPLINK",     "Wi-Fi",     0x6FE0A0U, NULL,               0U }
};

const uint8_t g_routine_type_count = (uint8_t)(sizeof(g_routine_types) / sizeof(g_routine_types[0]));
