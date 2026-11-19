/* SPDX-License-Identifier: GPL-3.0-or-later */
/**
 * @file daemons_ao.c
 * @brief C-424, C-426: the app's Active Object -- the den, the ROUTINES menu, and C-425's READ MY TAG.
 *
 * Four pages, drawn by one state. **The den** comes first (C-426): the Dot's daemon, the day, the next step, and CARE
 * -- DRINK, FEED, TRAIN, SLEEP (WAKE while it sleeps) -- with ROUTINES the row under them. Then the routine types, one
 * type's routines, and a routine running. The pad moves, TOP does or opens, BOTTOM goes back (from the den, home to
 * kodeOS); a tap on a row does what TOP does. The shape is Kode's display_lvgl example's: wait for AO_Display's
 * answer, open kscreen, then build the screen once and change only its words.
 *
 * **The companion** (C-426) is asked on the Active Object's worker, never here: the den's state when the den opens and
 * every thirty seconds, the picture when its artKey changes, and each care. A care is drawn at once (the user's
 * "presume the happy path", C-121) and kept in order until the companion takes it -- in kodeOS's settings, so a reset
 * (which every trip home is) loses none (C-87's outbox). The companion's address is the Dot's own setting, given
 * over the cable: `function name="server" arg="http://HOST:4730"` at the console.
 *
 * READ MY TAG asks AO_Rfid for one EM4100 ID and shows it. That ID is the author's own credential, so it is drawn on the
 * glass and nowhere else: never logged, never kept (keeping is KEEP A TAG's, C-425, decided as the user chose
 * 2026-11-19 and written in CONTEXT.md).
 */
#include "daemons_ao.h"

#include <stdio.h>
#include <string.h>

#include "freertos/FreeRTOS.h"
#include "kode_worker.h"
#include "kscreen.h"

#include "companion.h"
#include "den.h"
#include "routines.h"

#define TAG "daemons"

#define DA_ROWS_MAX     6U      /**< Rows a menu page can show: the five types, and room for one more. */
#define DA_TITLE_DY     (-195)  /**< The title, in pixels from the middle of the glass; positive is down. */
#define DA_ROW0_DY      (-125)  /**< The first row. */
#define DA_ROW_STEP     56      /**< From one row to the next. */
#define DA_TEXT_DY      (-30)   /**< A running routine's words. */
#define DA_SUB_DY       90      /**< ... and the smaller line under them. */
#define DA_HINT_DY      210     /**< The hint at the foot. */
#define DA_ROW_WIDTH    380     /**< A row's width: the glass is 410 wide; its round corners are far above the rows. */
#define DA_TEXT_WIDTH   330     /**< Where a running routine's words wrap. */
#define DA_ROW_PAD      8       /**< Inside a row's highlight. */
#define DA_ROW_RADIUS   12      /**< Its corners. */

#define DA_READ_MS      5000U   /**< READ MY TAG keeps the field up this long. */

#define DA_TICK_MS      12U     /**< The haptic's tick on a move, ms ... */
#define DA_TICK_GAIN    35U     /**< ... and its strength, per cent. */
#define DA_FOUND_MS     60U     /**< The haptic when a tag is read, or a care given. */
#define DA_FOUND_GAIN   70U

#define DA_LED_SHIFT    2U      /**< The LED at a quarter of the colour: a status light, not a torch. */

#define DA_SYNC_MS      30000U  /**< The den's state is asked again this often (the Tab5's: every 30 s). */
#define DA_OUTBOX_MAX   16U     /**< Cares kept while the companion does not answer. */
#define DA_WORKER_STACK 12288U  /**< The worker's stack, in PSRAM: cJSON and HTTP both run on it. */

#define DA_KEY_SERVER   "dmn_server"   /**< kodeOS's settings: the companion's address ... */
#define DA_KEY_OUTBOX   "dmn_outbox"   /**< ... and the cares waiting, one letter each (OUTBOX_LETTERS). */

static const char OUTBOX_LETTERS[CARE_COUNT] = { 'w', 'f', 't', 's', 'k' };   /**< water feed train sleep wake */

/** @brief The pages. */
typedef enum {
    DA_PAGE_DEN = 0,     /**< C-426: the Dot's daemon and CARE; the app opens here. */
    DA_PAGE_TYPES,       /**< ROUTINES: every routine type. */
    DA_PAGE_ROUTINES,    /**< One type's routines. */
    DA_PAGE_RUN          /**< A routine running, and what it found. */
} da_page_t;

/** @brief This Active Object's private signals: posted to itself, never published. */
enum DaemonsSignals {
    DA_TICK_SIG = MAX_SIG,  /**< kscreen's render pass, a one-shot. */
    DA_SYNC_SIG,            /**< Time to ask the companion again: a one-shot. */
    DA_JOB_DONE_SIG,        /**< The worker's job came back. */
    DA_SERVER_SIG           /**< The console gave the companion's address. */
};

/** @brief The Active Object's own state, private to this file. */
typedef struct {
    QActive       super;               /**< The QP/C base; must stay first. */
    kscreen_t     screen;              /**< LVGL on the glass, driven from this Active Object. */
    QTimeEvt      sync;                /**< Asks the companion again. */
    kode_worker_t worker;              /**< Runs companion_job(), which blocks. */
    /* the menu */
    lv_obj_t *    title;               /**< The page's name. */
    lv_obj_t *    rows[DA_ROWS_MAX];   /**< The page's rows; LVGL owns them. */
    lv_obj_t *    text;                /**< A running routine's words. */
    lv_obj_t *    sub;                 /**< The smaller line under them. */
    lv_obj_t *    hint;                /**< Which button does what. */
    da_page_t     page;                /**< The page shown. */
    uint8_t       type;                /**< The routine type chosen. */
    uint8_t       at;                  /**< The cursor: a type on the types page, a routine on the others. */
    uint8_t       shown;               /**< Rows the page shows. */
    bool          reading;             /**< A read window is open and its answer awaited. */
    /* the den */
    den_ui_t      den_ui;              /**< Its objects. */
    den_t         den;                 /**< What the companion last said. */
    bool          den_known;           /**< It has said something since the app started. */
    uint8_t       den_at;              /**< The den's cursor, 0 .. DEN_ITEMS - 1. */
    char          said[96];            /**< What the daemon said back to the last care. */
    char          status[96];          /**< Whether the companion answered. */
    /* the companion */
    char          server[COMPANION_SERVER_MAX];   /**< "" until it is given. */
    char          art_key[40];         /**< The picture held. */
    uint8_t       outbox[DA_OUTBOX_MAX];   /**< Cares waiting, oldest first. */
    uint8_t       kept;                /**< How many. */
    bool          busy;                /**< A job is out. */
    bool          want_state;          /**< The den's state is to be asked. */
    uint16_t      job_seq;             /**< The job awaited. */
} Daemons;

/* The queue and the stack, as Kode's display_lvgl example sizes them: LVGL renders on this stack, and a render pass
 * holds the Active Object about a frame while a burst of touch samples waits in the queue. */
static QEvtPtr     l_queue[KQP_AO_QUEUE_LEN];
static StackType_t l_stack[KQP_AO_STACK_BYTES / sizeof(StackType_t)];

static Daemons l_ao;
QActive * const AO_Daemons = &l_ao.super;

/** The job's argument and answer: it outlives the step that submits it, and is read only on its done event. */
static companion_job_t l_job;

/* The console's `server`: copied here on the console's task, taken on this Active Object's. */
static portMUX_TYPE l_server_lock = portMUX_INITIALIZER_UNLOCKED;
static char         l_server_in[COMPANION_SERVER_MAX];
static const QEvt   SERVER_EVT = QEVT_INITIALIZER(DA_SERVER_SIG);

static QState Daemons_initial(Daemons * const me, void const * const par);
static QState Daemons_running(Daemons * const me, QEvt const * const e);
static QState Daemons_waiting(Daemons * const me, QEvt const * const e);
static QState Daemons_drawing(Daemons * const me, QEvt const * const e);
static void   sync_next(Daemons * const me);

/* ---- What is on the glass ------------------------------------------------- */
/* Only this Active Object's thread calls lv_*, which is why LVGL needs no lock. */

/**
 * @brief One centred label.
 * @param font   One of the fonts the board and sdkconfig.defaults compile in.
 * @param colour Its colour; the screen behind it is black.
 * @param dy     Pixels from the middle of the glass, positive is down.
 * @return The label, which LVGL owns.
 */
static lv_obj_t * label_new(const lv_font_t * font, lv_color_t colour, int32_t dy)
{
    lv_obj_t * const label = lv_label_create(lv_screen_active());

    lv_label_set_text(label, "");
    lv_obj_set_style_text_font(label, font, 0);
    lv_obj_set_style_text_color(label, colour, 0);
    lv_obj_align(label, LV_ALIGN_CENTER, 0, dy);
    return label;
}

/**
 * @brief A routine type's colour.
 * @param type Its index in g_routine_types.
 * @return The colour.
 */
static lv_color_t type_colour(uint8_t type)
{
    return lv_color_hex(g_routine_types[type].colour);
}

/**
 * @brief Light the LED in a colour, dimmed.
 * @param c 0xRRGGBB.
 */
static void led_show(uint32_t c)
{
    /* Posts to AO_LedMgr and returns; a busy owner only leaves the last colour lit. */
    (void)kode_sys_led_set_rgb((uint8_t)(((c >> 16) & 0xFFU) >> DA_LED_SHIFT),
                               (uint8_t)(((c >> 8) & 0xFFU) >> DA_LED_SHIFT),
                               (uint8_t)((c & 0xFFU) >> DA_LED_SHIFT));
}

/**
 * @brief Paint the menu's rows: the cursor's filled in the type's colour, the rest in their colour on black.
 * @param me The Active Object.
 */
static void rows_paint(Daemons const * const me)
{
    uint8_t i;

    for ( i = 0U; i < DA_ROWS_MAX; i++ )
    {
        lv_obj_t * const row = me->rows[i];
        uint8_t colour_of = me->type;

        if ( DA_PAGE_TYPES == me->page )
        {
            colour_of = i;
        }
        if ( i >= me->shown )
        {
            lv_obj_set_hidden(row, true);
        }
        else if ( i == me->at )
        {
            lv_obj_set_hidden(row, false);
            lv_obj_set_style_bg_opa(row, LV_OPA_COVER, 0);
            lv_obj_set_style_bg_color(row, type_colour(colour_of), 0);
            lv_obj_set_style_text_color(row, lv_color_black(), 0);
        }
        else
        {
            lv_obj_set_hidden(row, false);
            lv_obj_set_style_bg_opa(row, LV_OPA_TRANSP, 0);
            lv_obj_set_style_text_color(row, type_colour(colour_of), 0);
        }
    }
}

/**
 * @brief Show the running page's words, or hide them.
 * @param me   The Active Object.
 * @param text The large words; NULL hides both lines.
 * @param sub  The smaller line under them; may be "".
 */
static void words_show(Daemons const * const me, const char * text, const char * sub)
{
    if ( NULL == text )
    {
        lv_obj_set_hidden(me->text, true);
        lv_obj_set_hidden(me->sub, true);
    }
    else
    {
        lv_label_set_text(me->text, text);
        lv_label_set_text(me->sub, sub);
        lv_obj_set_hidden(me->text, false);
        lv_obj_set_hidden(me->sub, false);
    }
}

/**
 * @brief Draw the den from what is known.
 * @param me The Active Object.
 */
static void den_draw(Daemons * const me)
{
    const den_t * den = NULL;

    if ( me->den_known )
    {
        den = &me->den;
    }
    den_ui_draw(&me->den_ui, den, me->den_at, me->said, me->status);
}

/**
 * @brief The status line: whether the companion answered, and what waits.
 * @param me   The Active Object.
 * @param what The companion's part; "" to keep what is there.
 */
static void status_set(Daemons * const me, const char * what)
{
    static char last[64];

    if ( '\0' != what[0] )
    {
        (void)snprintf(last, sizeof(last), "%s", what);
    }
    if ( 0U == me->kept )
    {
        (void)snprintf(me->status, sizeof(me->status), "%s", last);
    }
    else
    {
        (void)snprintf(me->status, sizeof(me->status), "%s   %u KEPT TO SEND", last, (unsigned)me->kept);   /* DRAFT */
    }
}

/**
 * @brief Draw the page in me->page.
 * @param me The Active Object.
 */
static void page_show(Daemons * const me)
{
    routine_type_t const * const t = &g_routine_types[me->type];
    bool const den = (DA_PAGE_DEN == me->page);
    uint8_t i;

    den_ui_show(&me->den_ui, den);
    lv_obj_set_hidden(me->title, den);
    lv_obj_set_hidden(me->hint, den);
    if ( den )
    {
        me->shown = 0U;
        words_show(me, NULL, "");
        den_draw(me);
        if ( me->den_known )
        {
            led_show(me->den.day_colour);
        }
    }
    else if ( DA_PAGE_TYPES == me->page )
    {
        lv_label_set_text(me->title, "ROUTINES");
        lv_obj_set_style_text_color(me->title, lv_color_white(), 0);
        me->shown = g_routine_type_count;
        for ( i = 0U; (i < me->shown) && (i < DA_ROWS_MAX); i++ )
        {
            lv_label_set_text_fmt(me->rows[i], "%s (%s)", g_routine_types[i].name, g_routine_types[i].raw);
        }
        words_show(me, NULL, "");
        lv_label_set_text(me->hint, "TOP: open    BOTTOM: back");
        led_show(g_routine_types[me->at].colour);
    }
    else if ( DA_PAGE_ROUTINES == me->page )
    {
        lv_label_set_text(me->title, t->name);
        lv_obj_set_style_text_color(me->title, type_colour(me->type), 0);
        me->shown = t->count;
        for ( i = 0U; (i < me->shown) && (i < DA_ROWS_MAX); i++ )
        {
            lv_label_set_text(me->rows[i], t->routines[i].name);
        }
        if ( 0U == t->count )
        {
            /* An empty list is fine (docs/PLAN.md 10), with a way back. */
            words_show(me, "Nothing here yet.", "");   /* DRAFT */
            lv_label_set_text(me->hint, "BOTTOM: back");
        }
        else
        {
            words_show(me, NULL, "");
            lv_label_set_text(me->hint, "TOP: run    BOTTOM: back");
        }
        led_show(t->colour);
    }
    else
    {
        lv_label_set_text(me->title, t->routines[me->at].name);
        me->shown = 0U;
        lv_label_set_text(me->hint, "TOP: again    BOTTOM: back");
    }
    if ( me->shown > DA_ROWS_MAX )
    {
        me->shown = DA_ROWS_MAX;
    }
    rows_paint(me);
}

/* ---- The companion (C-426) ------------------------------------------------ */

/**
 * @brief Keep the cares waiting in kodeOS's settings, so a reset loses none. Posts and returns.
 * @param me The Active Object.
 */
static void outbox_keep(Daemons const * const me)
{
    char letters[DA_OUTBOX_MAX + 1U];
    uint8_t i;

    for ( i = 0U; i < me->kept; i++ )
    {
        letters[i] = OUTBOX_LETTERS[me->outbox[i]];
    }
    letters[me->kept] = '\0';
    (void)kode_sys_nvs_set(DA_KEY_OUTBOX, letters);
}

/**
 * @brief Read the companion's address and the cares waiting, kept by an earlier run.
 * @param me The Active Object.
 */
static void kept_load(Daemons * const me)
{
    char v[KODE_SYS_NVS_VALUE_MAX];
    uint8_t i;
    uint8_t c;

    me->server[0] = '\0';
    if ( (KODE_OK == kode_sys_nvs_get(DA_KEY_SERVER, v, sizeof(v))) && (strlen(v) < sizeof(me->server)) )
    {
        (void)strlcpy(me->server, v, sizeof(me->server));
    }
    me->kept = 0U;
    if ( KODE_OK == kode_sys_nvs_get(DA_KEY_OUTBOX, v, sizeof(v)) )
    {
        for ( i = 0U; ('\0' != v[i]) && (me->kept < DA_OUTBOX_MAX); i++ )
        {
            for ( c = 0U; c < (uint8_t)CARE_COUNT; c++ )
            {
                if ( OUTBOX_LETTERS[c] == v[i] )
                {
                    me->outbox[me->kept] = c;
                    me->kept++;
                }
            }
        }
    }
    KLOG_I(TAG, "as %s; %u cares kept to send", companion_device_id(), (unsigned)me->kept);
}

/**
 * @brief Hand the worker one job.
 * @param me   The Active Object.
 * @param kind What it does.
 */
static void job_submit(Daemons * const me, job_kind_t kind)
{
    kode_status_t rc;

    l_job.kind = kind;
    if ( JOB_CARE == kind )
    {
        l_job.care = (care_t)me->outbox[0];
    }
    (void)snprintf(l_job.server, sizeof(l_job.server), "%s", me->server);
    rc = kode_worker_submit(&me->worker, &companion_job, &l_job, (enum_t)DA_JOB_DONE_SIG, &me->job_seq);
    if ( KODE_OK == rc )
    {
        me->busy = true;
    }
    else
    {
        KLOG_W(TAG, "the worker took no job (status %d)", (int)rc);
    }
}

/**
 * @brief Ask the companion for the next thing that waits: a kept care first, then the state, then the picture.
 * @param me The Active Object.
 */
static void sync_next(Daemons * const me)
{
    if ( me->busy )
    {
        return;
    }
    if ( '\0' == me->server[0] )
    {
        status_set(me, "NO COMPANION SET");   /* DRAFT */
        (void)snprintf(me->said, sizeof(me->said), "%s",
                       "Give the Dot the companion's address over its cable (firmware/kodedot/README.md).");   /* DRAFT */
        if ( DA_PAGE_DEN == me->page )
        {
            den_draw(me);
        }
        return;
    }
    if ( me->kept > 0U )
    {
        job_submit(me, JOB_CARE);
    }
    else if ( me->want_state )
    {
        job_submit(me, JOB_STATE);
    }
    else if ( me->den_known && me->den.has_daemon && ('\0' != me->den.art_key[0]) &&
              (0 != strcmp(me->art_key, me->den.art_key)) )
    {
        job_submit(me, JOB_ART);
    }
    else
    {
        /* Nothing waits until the next DA_SYNC_SIG. */
    }
}

/**
 * @brief Why a job came back empty, in the status line's words.
 */
static const char * job_words(uint32_t result)
{
    const char * w = "THE COMPANION CANNOT READ THIS DOT";   /* DRAFT */

    if ( (uint32_t)JOB_NO_NETWORK == result )
    {
        w = "NO NETWORK";   /* DRAFT */
    }
    else if ( (uint32_t)JOB_NO_ANSWER == result )
    {
        w = "THE COMPANION IS NOT ANSWERING";   /* DRAFT */
    }
    else if ( (uint32_t)JOB_REFUSED == result )
    {
        w = "THE COMPANION SAID NO";   /* DRAFT */
    }
    else
    {
        /* JOB_UNREADABLE */
    }
    return w;
}

/**
 * @brief The worker's job came back: take what it brought, then ask for the next thing if it went well.
 * @param me The Active Object.
 * @param d  The done event.
 */
static void job_done(Daemons * const me, KqpWorkerDoneEvt const * const d)
{
    bool const ok = ((uint32_t)JOB_OK == d->value);
    uint8_t i;

    if ( me->job_seq != d->seq )
    {
        return;   /* An answer to an older job is not the one awaited. */
    }
    me->busy = false;
    KLOG_I(TAG, "job %u: result %u, http %u", (unsigned)l_job.kind, (unsigned)d->value, (unsigned)l_job.http);
    if ( JOB_STATE == l_job.kind )
    {
        me->want_state = false;
        if ( ok )
        {
            me->den = l_job.den;
            me->den_known = true;
            status_set(me, "HOME");   /* DRAFT */
        }
    }
    else if ( JOB_ART == l_job.kind )
    {
        if ( ok )
        {
            den_ui_art(&me->den_ui, &l_job.art);
        }
        if ( ok || ((uint32_t)JOB_REFUSED == d->value) || ((uint32_t)JOB_UNREADABLE == d->value) )
        {
            /* Held, or not to be had: asked again only when the artKey changes. */
            (void)snprintf(me->art_key, sizeof(me->art_key), "%s", me->den.art_key);
        }
    }
    else
    {
        /* A care the companion took, or refused for good (a 400 or 403 will never be taken), leaves the outbox. */
        if ( ok || ((uint32_t)JOB_REFUSED == d->value) )
        {
            for ( i = 1U; i < me->kept; i++ )
            {
                me->outbox[i - 1U] = me->outbox[i];
            }
            me->kept--;
            outbox_keep(me);
            me->want_state = true;
            if ( ok )
            {
                (void)snprintf(me->said, sizeof(me->said), "%s", l_job.said);
            }
        }
    }
    if ( ok )
    {
        status_set(me, "HOME");   /* DRAFT */
    }
    else
    {
        status_set(me, job_words(d->value));
    }
    if ( DA_PAGE_DEN == me->page )
    {
        den_draw(me);
    }
    if ( ok )
    {
        sync_next(me);
    }
}

/**
 * @brief A care, given on the den: drawn at once as it will be, kept, then sent.
 * @param me The Active Object.
 * @param c  The care.
 */
static void care_give(Daemons * const me, care_t c)
{
    uint8_t i;

    if ( me->kept >= DA_OUTBOX_MAX )
    {
        /* The oldest goes: sixteen unsent cares is a day away from the companion. */
        for ( i = 1U; i < me->kept; i++ )
        {
            me->outbox[i - 1U] = me->outbox[i];
        }
        me->kept--;
    }
    me->outbox[me->kept] = (uint8_t)c;
    me->kept++;
    outbox_keep(me);

    /* C-121: presume the happy path; the companion's answer, when it comes, replaces this. */
    if ( me->den_known )
    {
        if ( (CARE_FEED == c) && (me->den.fed < 3U) )
        {
            me->den.fed++;
        }
        else if ( (CARE_WATER == c) && (me->den.drank < 3U) )
        {
            me->den.drank++;
        }
        else if ( CARE_TRAIN == c )
        {
            me->den.trained = true;
        }
        else if ( CARE_SLEEP == c )
        {
            me->den.asleep = true;
        }
        else
        {
            me->den.asleep = false;
        }
    }
    me->said[0] = '\0';
    (void)kode_sys_haptic_play_buzz((uint16_t)DA_FOUND_MS, (uint8_t)DA_FOUND_GAIN);
    status_set(me, "");
    den_draw(me);
    sync_next(me);
}

/* ---- What the buttons do -------------------------------------------------- */

/**
 * @brief Open a read window for READ MY TAG; its answer comes back as RFID_OP_RSP_SIG.
 * @param me The Active Object.
 */
static void read_start(Daemons * const me)
{
    if ( me->reading )
    {
        return;
    }
    if ( KODE_OK == kode_sys_rfid_read(&me->super, DA_READ_MS) )
    {
        me->reading = true;
        words_show(me, "Hold your tag\nto the Dot.", "Listening for five seconds.");   /* DRAFT */
    }
    else
    {
        KLOG_W(TAG, "the 125 kHz reader would not take a read");
        words_show(me, "The reader would\nnot start.", "Try again in a moment.");   /* DRAFT */
    }
}

/**
 * @brief AO_Rfid's answer to a read: show the ID, or why there is none. The ID is never logged.
 * @param me The Active Object.
 * @param a  The answer.
 */
static void read_answer(Daemons * const me, kode_sys_rfid_answer_t const * const a)
{
    char id[16];

    if ( a->write )
    {
        return;   /* Nothing here writes yet: COPY TO A BLANK comes with the board (C-425). */
    }
    me->reading = false;
    KLOG_I(TAG, "read answered %u", (unsigned)a->rc);
    if ( DA_PAGE_RUN != me->page )
    {
        return;   /* The page moved on while the field was up; the answer is not shown anywhere. */
    }
    if ( (uint32_t)KODE_OK == a->rc )
    {
        (void)snprintf(id, sizeof(id), "%02X:%02X:%02X:%02X:%02X", (unsigned)a->id[0], (unsigned)a->id[1],
                       (unsigned)a->id[2], (unsigned)a->id[3], (unsigned)a->id[4]);
        words_show(me, id, "EM4100. Shown here only, never kept.");   /* DRAFT */
        (void)kode_sys_haptic_play_buzz((uint16_t)DA_FOUND_MS, (uint8_t)DA_FOUND_GAIN);
    }
    else if ( (uint32_t)KODE_TIMEOUT == a->rc )
    {
        words_show(me, "No tag heard.", "EM4100 tags are read so far; other kinds come later.");   /* DRAFT */
    }
    else
    {
        words_show(me, "The reader\nis busy.", "Try again in a moment.");   /* DRAFT */
    }
}

/**
 * @brief Run a routine.
 * @param me The Active Object.
 * @param id What runs.
 */
static void routine_run(Daemons * const me, routine_id_t id)
{
    switch ( id )
    {
        case ROUTINE_LODESTONE_READ:
        {
            read_start(me);
            break;
        }
        default:
        {
            break;
        }
    }
}

/**
 * @brief Move the cursor one row, round the ends.
 * @param me   The Active Object.
 * @param down true for the next row.
 */
static void cursor_move(Daemons * const me, bool down)
{
    uint8_t * at = &me->at;
    uint8_t n = me->shown;

    if ( DA_PAGE_DEN == me->page )
    {
        at = &me->den_at;
        n = (uint8_t)DEN_ITEMS;
    }
    if ( 0U == n )
    {
        return;
    }
    if ( down )
    {
        *at = (uint8_t)((*at + 1U) % n);
    }
    else
    {
        *at = (uint8_t)((*at + n - 1U) % n);
    }
    (void)kode_sys_haptic_play_buzz((uint16_t)DA_TICK_MS, (uint8_t)DA_TICK_GAIN);
    if ( DA_PAGE_DEN == me->page )
    {
        den_draw(me);
        return;
    }
    if ( DA_PAGE_TYPES == me->page )
    {
        led_show(g_routine_types[me->at].colour);
    }
    rows_paint(me);
}

/**
 * @brief TOP, or a tap on a row: give a care, open a page, run a routine, or run it again.
 * @param me The Active Object.
 */
static void forward(Daemons * const me)
{
    routine_type_t const * const t = &g_routine_types[me->type];

    if ( DA_PAGE_DEN == me->page )
    {
        if ( DEN_ROUTINES == me->den_at )
        {
            me->page = DA_PAGE_TYPES;
            me->at = 0U;
            page_show(me);
        }
        else
        {
            care_give(me, den_care_at(&me->den, me->den_at));
        }
    }
    else if ( DA_PAGE_TYPES == me->page )
    {
        me->type = me->at;
        me->at = 0U;
        me->page = DA_PAGE_ROUTINES;
        page_show(me);
    }
    else if ( DA_PAGE_ROUTINES == me->page )
    {
        if ( me->at < t->count )
        {
            me->page = DA_PAGE_RUN;
            page_show(me);
            routine_run(me, t->routines[me->at].id);
        }
    }
    else
    {
        routine_run(me, t->routines[me->at].id);
    }
}

/**
 * @brief BOTTOM: back a page, or from the den home to kodeOS.
 * @param me The Active Object.
 */
static void back(Daemons * const me)
{
    if ( DA_PAGE_RUN == me->page )
    {
        me->page = DA_PAGE_ROUTINES;   /* me->at is still the routine that ran. */
        page_show(me);
    }
    else if ( DA_PAGE_ROUTINES == me->page )
    {
        me->page = DA_PAGE_TYPES;
        me->at = me->type;
        page_show(me);
    }
    else if ( DA_PAGE_TYPES == me->page )
    {
        me->page = DA_PAGE_DEN;
        page_show(me);
    }
    else
    {
        /* Posts to AO_Boot, which resets the board a moment later, into kodeOS. A care asked before it is kept. */
        KLOG_I(TAG, "home");
        if ( KODE_OK != kode_sys_exit_to_os() )
        {
            KLOG_W(TAG, "AO_Boot is busy; press again");
        }
    }
}

/**
 * @brief A tap on a menu row: LVGL's click, on this Active Object's thread. The row becomes the cursor, then TOP.
 * @param e The click; its user data is the Active Object.
 */
static void row_tap_cb(lv_event_t * e)
{
    Daemons * const me = (Daemons *)lv_event_get_user_data(e);
    void const * const target = lv_event_get_target(e);
    uint8_t i;

    for ( i = 0U; i < me->shown; i++ )
    {
        if ( target == (void const *)me->rows[i] )
        {
            me->at = i;
            rows_paint(me);
            forward(me);
            break;
        }
    }
}

/**
 * @brief A tap on one of the den's rows: it becomes the cursor, then TOP.
 * @param e The click; its user data is the Active Object.
 */
static void den_tap_cb(lv_event_t * e)
{
    Daemons * const me = (Daemons *)lv_event_get_user_data(e);
    void const * const target = lv_event_get_target(e);
    uint8_t i;

    if ( DA_PAGE_DEN != me->page )
    {
        return;
    }
    for ( i = 0U; i < DEN_ITEMS; i++ )
    {
        if ( target == (void const *)me->den_ui.items[i] )
        {
            me->den_at = i;
            forward(me);
            break;
        }
    }
}

/**
 * @brief Build the screen once: the den, then the menu's title, rows, words and hint. Nothing here draws; the next
 *        render pass does.
 * @param me The Active Object.
 */
static void ui_build(Daemons * const me)
{
    lv_obj_t * const scr = lv_screen_active();
    uint8_t i;

    /* Black and opaque: LVGL's theme would otherwise paint the screen, and black is the AMOLED's off. */
    lv_obj_set_style_bg_color(scr, lv_color_black(), 0);
    lv_obj_set_style_bg_opa(scr, LV_OPA_COVER, 0);

    den_ui_build(&me->den_ui, &den_tap_cb, me);
    me->title = label_new(&lv_font_montserrat_28, lv_color_white(), DA_TITLE_DY);
    for ( i = 0U; i < DA_ROWS_MAX; i++ )
    {
        lv_obj_t * const row = label_new(&lv_font_montserrat_28, lv_color_white(),
                                         DA_ROW0_DY + ((int32_t)i * DA_ROW_STEP));

        lv_obj_set_width(row, DA_ROW_WIDTH);
        lv_obj_set_style_pad_all(row, DA_ROW_PAD, 0);
        lv_obj_set_style_radius(row, DA_ROW_RADIUS, 0);
        lv_obj_set_clickable(row, true);
        lv_obj_add_event_cb(row, &row_tap_cb, LV_EVENT_CLICKED, me);
        me->rows[i] = row;
    }
    me->text = label_new(&lv_font_montserrat_28, lv_color_white(), DA_TEXT_DY);
    lv_obj_set_width(me->text, DA_TEXT_WIDTH);
    lv_obj_set_style_text_align(me->text, LV_TEXT_ALIGN_CENTER, 0);
    me->sub = label_new(&lv_font_montserrat_14, lv_palette_main(LV_PALETTE_GREY), DA_SUB_DY);
    lv_obj_set_width(me->sub, DA_TEXT_WIDTH);
    lv_obj_set_style_text_align(me->sub, LV_TEXT_ALIGN_CENTER, 0);
    me->hint = label_new(&lv_font_montserrat_14, lv_palette_main(LV_PALETTE_GREY), DA_HINT_DY);
}

/* ---- The console ------------------------------------------------------------ */
/* `function name="server" arg="http://HOST:4730"` -- run on AO_Console's task: copy, post, return. */

/**
 * @brief Take the companion's address from the console.
 * @param arg The address: http://, at most COMPANION_SERVER_MAX - 1 characters, no trailing slash needed.
 * @return KODE_OK once posted; KODE_DENIED for anything that is not an http:// address.
 */
static kode_status_t run_server(const kode_value_t * arg)
{
    kode_status_t status = KODE_DENIED;

    if ( (NULL != arg) && (NULL != arg->s) && (0 == strncmp(arg->s, "http://", 7U)) &&
         (strlen(arg->s) < COMPANION_SERVER_MAX) )
    {
        taskENTER_CRITICAL(&l_server_lock);
        (void)snprintf(l_server_in, sizeof(l_server_in), "%s", arg->s);
        taskEXIT_CRITICAL(&l_server_lock);
        status = KODE_NO_RESOURCES;
        if ( QACTIVE_POST_X(AO_Daemons, &SERVER_EVT, 1U, (void *)0) )
        {
            status = KODE_OK;
        }
    }
    return status;
}

static const kode_function_t FUNCTIONS[] = {
    { .name = "server", .arg = KODE_TYPE_STRING, .run = run_server,
      .desc = "The companion's address, http://host:4730" },
};

/**
 * @brief The console's address, kept and used at once.
 * @param me The Active Object.
 */
static void server_take(Daemons * const me)
{
    size_t n;

    taskENTER_CRITICAL(&l_server_lock);
    (void)snprintf(me->server, sizeof(me->server), "%s", l_server_in);
    taskEXIT_CRITICAL(&l_server_lock);
    n = strlen(me->server);
    if ( (n > 0U) && ('/' == me->server[n - 1U]) )
    {
        me->server[n - 1U] = '\0';
    }
    (void)kode_sys_nvs_set(DA_KEY_SERVER, me->server);
    KLOG_I(TAG, "the companion is at %s", me->server);
    me->want_state = true;
    me->art_key[0] = '\0';
    me->said[0] = '\0';   /* the hint that asked for this address */
    status_set(me, "LOOKING FOR THE COMPANION");   /* DRAFT */
    if ( DA_PAGE_DEN == me->page )
    {
        den_draw(me);
    }
    sync_next(me);
}

/* ---- The Active Object ---------------------------------------------------- */

void DaemonsAo_ctor(void)
{
    Daemons * const me = &l_ao;

    (void)memset(me, 0, sizeof(*me));
    QActive_ctor(&me->super, Q_STATE_CAST(&Daemons_initial));
    kscreen_ctor(&me->screen, &me->super, (enum_t)DA_TICK_SIG);
    QTimeEvt_ctorX(&me->sync, &me->super, (enum_t)DA_SYNC_SIG, 0U);
    me->page = DA_PAGE_DEN;
    (void)companion_device_id();   /* worked out here, before the worker reads it */
}

void DaemonsAo_start(void)
{
    QActive_setAttr(AO_Daemons, TASK_NAME_ATTR, "daemons");
    /* The level the SDK keeps for a renderer: just above AO_Net, below every owner, so a slow frame can only ever
     * delay itself. */
    QACTIVE_START(AO_Daemons, KODE_PRIO_USER_GUI, l_queue, Q_DIM(l_queue), l_stack, sizeof(l_stack), (void *)0);

    /* After the Active Object has a queue. A refused table is not fatal: the address can still have been kept. */
    if ( KODE_OK != KODE_FUNCTIONS_ADD(FUNCTIONS) )
    {
        KLOG_E(TAG, "the console refused the function table");
    }
}

/**
 * @brief The initial transition: subscribe, start the worker, then ask AO_Display whether the panel is there.
 * @param me  The Active Object.
 * @param par Unused.
 * @return The transition to Daemons_waiting.
 */
static QState Daemons_initial(Daemons * const me, void const * const par)
{
    kode_status_t rc;

    (void)par;

    QActive_subscribe(&me->super, BUTTON_EVT_SIG);
    rc = kode_worker_start(&me->worker, &me->super, "daemons_net", DA_WORKER_STACK, (uint8_t)KODE_PRIO_USER_LOW, 1U);
    if ( KODE_OK != rc )
    {
        KLOG_E(TAG, "the worker did not start (status %d)", (int)rc);
    }
    kscreen_start(&me->screen);
    KLOG_I(TAG, "up");
    return Q_TRAN(&Daemons_waiting);
}

/**
 * @brief The parent of both states: BOTTOM always has a way out, even with no picture.
 * @param me The Active Object.
 * @param e  The event.
 * @return Q_HANDLED() for what it handles, Q_SUPER() otherwise.
 */
static QState Daemons_running(Daemons * const me, QEvt const * const e)
{
    QState status;

    switch ( e->sig )
    {
        case BUTTON_EVT_SIG:
        {
            ButtonEvt const * const be = (ButtonEvt const *)e;

            if ( be->pressed && (KODE_SYS_BUTTON_BOT == (uint32_t)be->id) )
            {
                back(me);
            }
            status = Q_HANDLED();
            break;
        }
        default:
        {
            status = Q_SUPER(&QHsm_top);
            break;
        }
    }
    return status;
}

/**
 * @brief Waiting for AO_Display's answer: LVGL is not started yet.
 * @param me The Active Object.
 * @param e  The event.
 * @return Q_HANDLED(), a transition to Daemons_drawing, or Q_SUPER().
 */
static QState Daemons_waiting(Daemons * const me, QEvt const * const e)
{
    QState status;

    switch ( e->sig )
    {
        case DISPLAY_STATE_SIG:
        {
            if ( KODE_OK == kscreen_open(&me->screen, (DisplayStateEvt const *)e) )
            {
                status = Q_TRAN(&Daemons_drawing);
            }
            else
            {
                /* kscreen has said why. Nothing will be drawn; BOTTOM still goes home. */
                status = Q_HANDLED();
            }
            break;
        }
        default:
        {
            status = Q_SUPER(&Daemons_running);
            break;
        }
    }
    return status;
}

/**
 * @brief Drawing: the screen is built, the render pass ticks, and the companion is asked.
 * @param me The Active Object.
 * @param e  The event.
 * @return Q_HANDLED() for what it handles, Q_SUPER() otherwise.
 */
static QState Daemons_drawing(Daemons * const me, QEvt const * const e)
{
    QState status;

    switch ( e->sig )
    {
        case Q_ENTRY_SIG:
        {
            ui_build(me);
            kept_load(me);
            me->want_state = true;
            status_set(me, "LOOKING FOR THE COMPANION");   /* DRAFT */
            page_show(me);
            sync_next(me);
            QTimeEvt_armX(&me->sync, KQP_TICKS_PER_MS(DA_SYNC_MS), 0U);
            status = Q_HANDLED();
            break;
        }
        /* Always to kscreen_tick(), which re-arms the one-shot: a periodic tick would fill the queue behind a slow
         * frame, and a full queue asserts. */
        case DA_TICK_SIG:
        {
            kscreen_tick(&me->screen);
            status = Q_HANDLED();
            break;
        }
        case DA_SYNC_SIG:
        {
            me->want_state = true;
            sync_next(me);
            QTimeEvt_armX(&me->sync, KQP_TICKS_PER_MS(DA_SYNC_MS), 0U);
            status = Q_HANDLED();
            break;
        }
        case DA_JOB_DONE_SIG:
        {
            job_done(me, Q_EVT_CAST(KqpWorkerDoneEvt));
            status = Q_HANDLED();
            break;
        }
        case DA_SERVER_SIG:
        {
            server_take(me);
            status = Q_HANDLED();
            break;
        }
        case TOUCH_EVT_SIG:
        {
            kscreen_touch(&me->screen, (TouchEvt const *)e);
            status = Q_HANDLED();
            break;
        }
        case DISPLAY_REPAINT_SIG:
        {
            kscreen_repaint(&me->screen);
            status = Q_HANDLED();
            break;
        }
        case RFID_OP_RSP_SIG:
        {
            read_answer(me, (kode_sys_rfid_answer_t const *)e);
            status = Q_HANDLED();
            break;
        }
        case BUTTON_EVT_SIG:
        {
            ButtonEvt const * const be = (ButtonEvt const *)e;
            uint32_t const id = (uint32_t)be->id;

            status = Q_HANDLED();
            if ( !be->pressed )
            {
                /* A release: nothing here acts on one. */
            }
            else if ( (KODE_SYS_BUTTON_UP == id) || ((DA_PAGE_DEN == me->page) && (KODE_SYS_BUTTON_LEFT == id)) )
            {
                cursor_move(me, false);
            }
            else if ( (KODE_SYS_BUTTON_DOWN == id) || ((DA_PAGE_DEN == me->page) && (KODE_SYS_BUTTON_RIGHT == id)) )
            {
                cursor_move(me, true);
            }
            else if ( KODE_SYS_BUTTON_TOP == id )
            {
                forward(me);
            }
            else
            {
                /* BOTTOM, and the pad's left and right off the den, are the parent's. */
                status = Q_SUPER(&Daemons_running);
            }
            break;
        }
        default:
        {
            status = Q_SUPER(&Daemons_running);
            break;
        }
    }
    return status;
}
