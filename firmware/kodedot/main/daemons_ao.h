/* SPDX-License-Identifier: GPL-3.0-or-later */
/**
 * @file daemons_ao.h
 * @brief C-424: the app's Active Object -- the screen, the buttons, and the routines it runs.
 */
#ifndef DAEMONS_AO_H_
#define DAEMONS_AO_H_

#include "kode_sys.h"

#ifdef __cplusplus
extern "C" {
#endif

extern QActive * const AO_Daemons;   /**< The one instance, opaque outside daemons_ao.c. */

/**
 * @brief Construct the Active Object; call it after kode_init() and before DaemonsAo_start().
 */
void DaemonsAo_ctor(void);

/**
 * @brief Give the Active Object its task, queue and stack, and start it.
 */
void DaemonsAo_start(void);

#ifdef __cplusplus
}
#endif

#endif /* DAEMONS_AO_H_ */
