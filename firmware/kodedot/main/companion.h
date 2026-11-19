/* SPDX-License-Identifier: GPL-3.0-or-later */
/**
 * @file companion.h
 * @brief C-426: the Dot's side of the companion -- what it reads of the companion, and the one job that reads it.
 *
 * The Dot is a board on the device door (server/src/api.ts DEVICE_DOOR): it names itself with ?device= and asks for
 * /api/device/state (its daemon and the day), /api/device/art (its daemon's picture, 64x64 in sixteen colours) and
 * sends /api/device/interact (a care). No key is needed at home; away, through the relay, comes later.
 *
 * Everything here that touches the network runs on the Active Object's worker, never on the Active Object: a job
 * blocks on Wi-Fi and HTTP, parses the answer into the job's own result, and hands back one status.
 */
#ifndef COMPANION_H_
#define COMPANION_H_

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#include "kode_sys.h"

#ifdef __cplusplus
extern "C" {
#endif

#define COMPANION_SERVER_MAX  96U   /**< Bytes of the companion's address, "http://host:4730", NUL included. */
#define COMPANION_ART_SIDE    64U   /**< A device's picture is 64 x 64 ... */
#define COMPANION_ART_COLOURS 16U   /**< ... in sixteen colours, index 0 the clear one. */
#define COMPANION_ART_BYTES   ((COMPANION_ART_SIDE * COMPANION_ART_SIDE) / 2U)   /**< Two pixels a byte, the left high. */

/** @brief The cares a board may send (server NETWORK_KINDS), in the order the den shows them. */
typedef enum {
    CARE_WATER = 0,   /**< DRINK */
    CARE_FEED,        /**< FEED  */
    CARE_TRAIN,       /**< TRAIN */
    CARE_SLEEP,       /**< SLEEP */
    CARE_WAKE,        /**< WAKE, in SLEEP's place while it sleeps */
    CARE_COUNT
} care_t;

/** @brief What the den shows of /api/device/state; every string cut to fit, never unterminated. */
typedef struct {
    bool     has_daemon;      /**< A daemon is on this Dot. */
    char     nickname[16];    /**< Its name, "PIP". */
    char     name[16];        /**< Its kind, "ROVERCUB". */
    uint8_t  level;
    char     art_key[40];     /**< Changes when its picture would. */
    char     mood[16];        /**< life.word, "calm". */
    uint8_t  fed, fed_due;    /**< life.fed.today / .due */
    uint8_t  drank, drank_due;
    bool     trained;
    bool     asleep;          /**< life.tired == "asleep": WAKE in SLEEP's place. */
    char     day[12];         /**< day.name, "Thursday". */
    uint32_t day_colour;      /**< day.colour, 0xRRGGBB. */
    char     virtue[48];      /**< day.virtue, "Forgiveness over Wrath". */
    char     step[96];        /**< step.text, "" with none. */
} den_t;

/** @brief /api/device/art, decoded. */
typedef struct {
    char     key[40];                          /**< Its artKey. */
    uint16_t palette[COMPANION_ART_COLOURS];   /**< RGB565. */
    uint8_t  pix[COMPANION_ART_BYTES];         /**< Packed, two pixels a byte. */
} den_art_t;

/** @brief What a job does. */
typedef enum {
    JOB_STATE = 0,   /**< GET /api/device/state into den. */
    JOB_ART,         /**< GET /api/device/art into art. */
    JOB_CARE         /**< POST /api/device/interact {kind} ; what it said into said. */
} job_kind_t;

/** @brief Why a job came back without what it went for: the done event's value. */
typedef enum {
    JOB_OK = 0,
    JOB_NO_NETWORK,   /**< No address, and no remembered network answered. */
    JOB_NO_ANSWER,    /**< The companion did not answer. */
    JOB_REFUSED,      /**< It answered, but not 200. */
    JOB_UNREADABLE    /**< It answered 200 with something this cannot read. */
} job_result_t;

/** @brief One job: what it is asked, and what it brings back. Owned by the Active Object, written by the job only. */
typedef struct {
    job_kind_t kind;
    care_t     care;                          /**< JOB_CARE's. */
    char       server[COMPANION_SERVER_MAX];  /**< Copied in when the job is submitted. */
    uint16_t   http;                          /**< The status it was answered with; 0 for none. */
    den_t      den;                           /**< JOB_STATE's answer. */
    den_art_t  art;                           /**< JOB_ART's answer. */
    char       said[96];                      /**< JOB_CARE's: what the daemon said back, "" for nothing. */
} companion_job_t;

/**
 * @brief This Dot's name to the companion: "kode-dot-" and the end of its MAC (C-80's rule).
 * @return The name; the same for the life of the firmware.
 */
const char * companion_device_id(void);

/**
 * @brief The wire word for a care: "water", "feed", "train", "sleep", "wake".
 * @param c The care.
 * @return Its word; "" for none.
 */
const char * companion_care_word(care_t c);

/**
 * @brief Read /api/device/state's answer.
 * @param json The answer.
 * @param out  What the den shows; cleared first.
 * @return true when it was an answer at all (a daemon or none).
 */
bool companion_parse_state(const char * json, den_t * out);

/**
 * @brief Read /api/device/art's answer: 64 x 64, sixteen colours, the pixels in base64.
 * @param json The answer.
 * @param out  The picture.
 * @return true when it was one.
 */
bool companion_parse_art(const char * json, den_art_t * out);

/**
 * @brief The worker's job: blocks on Wi-Fi and HTTP. Never touches the flash.
 * @param arg   The companion_job_t, owned by the Active Object, not read by it until the done event.
 * @param value Out: a job_result_t.
 * @return KODE_OK when it brought back what it went for.
 */
kode_status_t companion_job(void * arg, uint32_t * value);

#ifdef __cplusplus
}
#endif

#endif /* COMPANION_H_ */
