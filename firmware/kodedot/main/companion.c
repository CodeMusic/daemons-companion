/* SPDX-License-Identifier: GPL-3.0-or-later */
/**
 * @file companion.c
 * @brief C-426: reading the companion's answers, and the worker's job that asks for them.
 */
#include "companion.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "cJSON.h"
#include "esp_mac.h"
#include "kode.h"

#define TAG "daemons.net"

/* ---- Small readers ---------------------------------------------------------- */

/**
 * @brief Copy a JSON string member, cut to fit; "" when it is missing or not a string.
 */
static void copy_str(const cJSON * obj, const char * name, char * out, size_t cap)
{
    const cJSON * const it = cJSON_GetObjectItemCaseSensitive(obj, name);

    out[0] = '\0';
    if ( cJSON_IsString(it) && (NULL != it->valuestring) )
    {
        (void)snprintf(out, cap, "%s", it->valuestring);
    }
}

/**
 * @brief A JSON number member, clamped to 0..max; 0 when it is missing.
 */
static uint32_t read_num(const cJSON * obj, const char * name, uint32_t max)
{
    const cJSON * const it = cJSON_GetObjectItemCaseSensitive(obj, name);
    uint32_t v = 0U;

    if ( cJSON_IsNumber(it) && (it->valuedouble > 0.0) )
    {
        v = (uint32_t)it->valuedouble;
        if ( v > max )
        {
            v = max;
        }
    }
    return v;
}

/**
 * @brief "#315A62" as 0x315A62; grey when it is not a colour.
 */
static uint32_t read_colour(const cJSON * obj, const char * name)
{
    const cJSON * const it = cJSON_GetObjectItemCaseSensitive(obj, name);
    uint32_t c = 0x808080U;

    if ( cJSON_IsString(it) && (NULL != it->valuestring) && ('#' == it->valuestring[0]) &&
         (7U == strlen(it->valuestring)) )
    {
        c = (uint32_t)strtoul(&it->valuestring[1], NULL, 16);
    }
    return c;
}

/**
 * @brief One base64 character's six bits; 0xFF for padding or anything else.
 */
static uint8_t b64_bits(char ch)
{
    uint8_t v = 0xFFU;

    if ( (ch >= 'A') && (ch <= 'Z') )
    {
        v = (uint8_t)(ch - 'A');
    }
    else if ( (ch >= 'a') && (ch <= 'z') )
    {
        v = (uint8_t)((ch - 'a') + 26);
    }
    else if ( (ch >= '0') && (ch <= '9') )
    {
        v = (uint8_t)((ch - '0') + 52);
    }
    else if ( '+' == ch )
    {
        v = 62U;
    }
    else if ( '/' == ch )
    {
        v = 63U;
    }
    else
    {
        /* '=' and anything else: the end. */
    }
    return v;
}

/**
 * @brief Decode base64 into @p out.
 * @return The bytes written; stops at the first character that is not base64, or when @p out is full.
 */
static size_t b64_decode(const char * in, uint8_t * out, size_t cap)
{
    size_t   n = 0U;
    uint32_t acc = 0U;
    uint8_t  bits = 0U;

    while ( ('\0' != *in) && (n < cap) )
    {
        uint8_t const v = b64_bits(*in);

        if ( 0xFFU == v )
        {
            break;
        }
        acc = (acc << 6) | v;
        bits = (uint8_t)(bits + 6U);
        if ( bits >= 8U )
        {
            bits = (uint8_t)(bits - 8U);
            out[n] = (uint8_t)((acc >> bits) & 0xFFU);
            n++;
        }
        in++;
    }
    return n;
}

/* ---- What the Dot is called, and what it sends ------------------------------ */

const char * companion_device_id(void)
{
    static char id[24];
    uint8_t mac[6];

    if ( '\0' == id[0] )
    {
        if ( ESP_OK != esp_efuse_mac_get_default(mac) )
        {
            (void)memset(mac, 0, sizeof(mac));
        }
        (void)snprintf(id, sizeof(id), "kode-dot-%02x%02x%02x", (unsigned)mac[3], (unsigned)mac[4], (unsigned)mac[5]);
    }
    return id;
}

const char * companion_care_word(care_t c)
{
    static const char * const WORDS[CARE_COUNT] = { "water", "feed", "train", "sleep", "wake" };
    const char * w = "";

    if ( c < CARE_COUNT )
    {
        w = WORDS[c];
    }
    return w;
}

/* ---- The answers ------------------------------------------------------------ */

bool companion_parse_state(const char * json, den_t * out)
{
    cJSON * const root = cJSON_Parse(json);
    bool ok = false;

    (void)memset(out, 0, sizeof(*out));
    out->day_colour = 0x808080U;
    if ( cJSON_IsObject(root) )
    {
        const cJSON * const day = cJSON_GetObjectItemCaseSensitive(root, "day");
        const cJSON * const step = cJSON_GetObjectItemCaseSensitive(root, "step");
        const cJSON * const d = cJSON_GetObjectItemCaseSensitive(root, "daemon");

        ok = true;
        if ( cJSON_IsObject(day) )
        {
            copy_str(day, "name", out->day, sizeof(out->day));
            copy_str(day, "virtue", out->virtue, sizeof(out->virtue));
            out->day_colour = read_colour(day, "colour");
        }
        if ( cJSON_IsObject(step) )
        {
            copy_str(step, "text", out->step, sizeof(out->step));
        }
        if ( cJSON_IsObject(d) )
        {
            const cJSON * const life = cJSON_GetObjectItemCaseSensitive(d, "life");
            char tired[12];

            out->has_daemon = true;
            copy_str(d, "nickname", out->nickname, sizeof(out->nickname));
            copy_str(d, "name", out->name, sizeof(out->name));
            copy_str(d, "artKey", out->art_key, sizeof(out->art_key));
            out->level = (uint8_t)read_num(d, "level", 100U);
            if ( cJSON_IsObject(life) )
            {
                const cJSON * const fed = cJSON_GetObjectItemCaseSensitive(life, "fed");
                const cJSON * const drank = cJSON_GetObjectItemCaseSensitive(life, "watered");
                const cJSON * const trained = cJSON_GetObjectItemCaseSensitive(life, "trained");

                copy_str(life, "word", out->mood, sizeof(out->mood));
                copy_str(life, "tired", tired, sizeof(tired));
                out->asleep = (0 == strcmp(tired, "asleep"));
                out->trained = cJSON_IsTrue(trained);
                if ( cJSON_IsObject(fed) )
                {
                    out->fed = (uint8_t)read_num(fed, "today", 9U);
                    out->fed_due = (uint8_t)read_num(fed, "due", 9U);
                }
                if ( cJSON_IsObject(drank) )
                {
                    out->drank = (uint8_t)read_num(drank, "today", 9U);
                    out->drank_due = (uint8_t)read_num(drank, "due", 9U);
                }
            }
        }
    }
    cJSON_Delete(root);
    return ok;
}

bool companion_parse_art(const char * json, den_art_t * out)
{
    cJSON * const root = cJSON_Parse(json);
    bool ok = false;

    if ( cJSON_IsObject(root) && (COMPANION_ART_SIDE == read_num(root, "w", 1000U)) &&
         (COMPANION_ART_SIDE == read_num(root, "h", 1000U)) )
    {
        const cJSON * const pal = cJSON_GetObjectItemCaseSensitive(root, "palette");
        const cJSON * const pix = cJSON_GetObjectItemCaseSensitive(root, "pixels");
        uint32_t i;

        if ( cJSON_IsArray(pal) && cJSON_IsString(pix) && (NULL != pix->valuestring) )
        {
            for ( i = 0U; i < COMPANION_ART_COLOURS; i++ )
            {
                const cJSON * const c = cJSON_GetArrayItem(pal, (int)i);

                out->palette[i] = 0U;
                if ( cJSON_IsNumber(c) )
                {
                    out->palette[i] = (uint16_t)c->valuedouble;
                }
            }
            copy_str(root, "artKey", out->key, sizeof(out->key));
            ok = (COMPANION_ART_BYTES == b64_decode(pix->valuestring, out->pix, sizeof(out->pix)));
        }
    }
    cJSON_Delete(root);
    return ok;
}

/* ---- The job ---------------------------------------------------------------- */

kode_status_t companion_job(void * arg, uint32_t * value)
{
    companion_job_t * const j = (companion_job_t *)arg;
    static const char * const PATHS[] = { "/api/device/state", "/api/device/art", "/api/device/interact" };
    char url[KODE_HTTP_URL_MAX];
    char body[48];
    const char * answer;
    bool read = false;

    j->http = 0U;
    j->said[0] = '\0';
    *value = (uint32_t)JOB_OK;

    /* An app inherits kodeOS's link; when there is none, the network the C5 remembers. */
    if ( (!kode_wifi_is_connected()) && (!kode_wifi_connect(NULL, NULL)) )
    {
        KLOG_W(TAG, "no network: %s", kode_error());
        *value = (uint32_t)JOB_NO_NETWORK;
        return KODE_TIMEOUT;
    }
    if ( (size_t)snprintf(url, sizeof(url), "%s%s?device=%s", j->server, PATHS[j->kind], companion_device_id())
         >= sizeof(url) )
    {
        *value = (uint32_t)JOB_REFUSED;
        return KODE_DENIED;
    }
    if ( JOB_CARE == j->kind )
    {
        (void)snprintf(body, sizeof(body), "{\"kind\":\"%s\"}", companion_care_word(j->care));
        answer = kode_http_post(url, body);
    }
    else
    {
        answer = kode_http_get(url);
    }
    j->http = kode_http_status();
    if ( 0U == j->http )
    {
        KLOG_W(TAG, "no answer: %s", kode_error());
        *value = (uint32_t)JOB_NO_ANSWER;
        return KODE_TIMEOUT;
    }
    if ( 200U != j->http )
    {
        *value = (uint32_t)JOB_REFUSED;
        return KODE_DENIED;
    }

    if ( JOB_STATE == j->kind )
    {
        read = companion_parse_state(answer, &j->den);
    }
    else if ( JOB_ART == j->kind )
    {
        read = companion_parse_art(answer, &j->art);
    }
    else
    {
        cJSON * const root = cJSON_Parse(answer);

        read = cJSON_IsObject(root);
        if ( read )
        {
            copy_str(root, "said", j->said, sizeof(j->said));
        }
        cJSON_Delete(root);
    }
    if ( !read )
    {
        *value = (uint32_t)JOB_UNREADABLE;
        return KODE_DENIED;
    }
    return KODE_OK;
}
