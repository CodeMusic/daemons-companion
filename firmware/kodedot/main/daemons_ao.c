/* SPDX-License-Identifier: GPL-3.0-or-later */
/**
 * @file daemons_ao.c
 * @brief C-424: the app's Active Object -- the ROUTINES menu on the glass, and C-425's READ MY TAG.
 *
 * Three pages, drawn by one state: the routine types, one type's routines, and a routine running. The D-pad's up and
 * down move, TOP opens or runs, BOTTOM goes back (from the types, home to kodeOS); a tap on a row does what TOP does.
 * Each move ticks the haptic and lights the LED in the type's colour. The shape is Kode's display_lvgl example's: wait
 * for AO_Display's answer, open kscreen, then build the screen once and change only its words.
 *
 * READ MY TAG asks AO_Rfid for one EM4100 ID and shows it. That ID is the author's own credential, so it is drawn on the
 * glass and nowhere else: never logged, never kept (keeping is KEEP A TAG's, C-425, decided as the user chose
 * 2026-11-19 and written in CONTEXT.md).
 */
#include "daemons_ao.h"

#include <stdio.h>

#include "kscreen.h"
#include "routines.h"

#define TAG "daemons"

#define DA_ROWS_MAX     6U      /**< Rows a page can show: the five types, and room for one more. */
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
#define DA_FOUND_MS     60U     /**< The haptic when a tag is read. */
#define DA_FOUND_GAIN   70U

#define DA_LED_SHIFT    2U      /**< The LED at a quarter of the type's colour: a status light, not a torch. */

/** @brief The pages. */
typedef enum {
    DA_PAGE_TYPES = 0,   /**< ROUTINES: every routine type. */
    DA_PAGE_ROUTINES,    /**< One type's routines. */
    DA_PAGE_RUN          /**< A routine running, and what it found. */
} da_page_t;

/** @brief This Active Object's private signals: posted to itself, never published. */
enum DaemonsSignals {
    DA_TICK_SIG = MAX_SIG   /**< kscreen's render pass, a one-shot. */
};

/** @brief The Active Object's own state, private to this file. */
typedef struct {
    QActive    super;               /**< The QP/C base; must stay first. */
    kscreen_t  screen;              /**< LVGL on the glass, driven from this Active Object. */
    lv_obj_t * title;               /**< The page's name. */
    lv_obj_t * rows[DA_ROWS_MAX];   /**< The page's rows; LVGL owns them. */
    lv_obj_t * text;                /**< A running routine's words. */
    lv_obj_t * sub;                 /**< The smaller line under them. */
    lv_obj_t * hint;                /**< Which button does what. */
    da_page_t  page;                /**< The page shown. */
    uint8_t    type;                /**< The routine type chosen. */
    uint8_t    at;                  /**< The cursor: a type on the types page, a routine on the others. */
    uint8_t    shown;               /**< Rows the page shows. */
    bool       reading;             /**< A read window is open and its answer awaited. */
} Daemons;

/* The queue and the stack, as Kode's display_lvgl example sizes them: LVGL renders on this stack, and a render pass
 * holds the Active Object about a frame while a burst of touch samples waits in the queue. */
static QEvtPtr     l_queue[KQP_AO_QUEUE_LEN];
static StackType_t l_stack[KQP_AO_STACK_BYTES / sizeof(StackType_t)];

static Daemons l_ao;
QActive * const AO_Daemons = &l_ao.super;

static QState Daemons_initial(Daemons * const me, void const * const par);
static QState Daemons_running(Daemons * const me, QEvt const * const e);
static QState Daemons_waiting(Daemons * const me, QEvt const * const e);
static QState Daemons_drawing(Daemons * const me, QEvt const * const e);

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
 * @brief Light the LED in the type under the cursor's colour, dimmed.
 * @param type Its index in g_routine_types.
 */
static void led_show(uint8_t type)
{
    uint32_t const c = g_routine_types[type].colour;

    /* Posts to AO_LedMgr and returns; a busy owner only leaves the last colour lit. */
    (void)kode_sys_led_set_rgb((uint8_t)(((c >> 16) & 0xFFU) >> DA_LED_SHIFT),
                               (uint8_t)(((c >> 8) & 0xFFU) >> DA_LED_SHIFT),
                               (uint8_t)((c & 0xFFU) >> DA_LED_SHIFT));
}

/**
 * @brief Paint the rows: the cursor's filled in the type's colour, the rest in their colour on black.
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
 * @brief Draw the page in me->page: its title, rows, words and hint.
 * @param me The Active Object.
 */
static void page_show(Daemons * const me)
{
    routine_type_t const * const t = &g_routine_types[me->type];
    uint8_t i;

    if ( DA_PAGE_TYPES == me->page )
    {
        lv_label_set_text(me->title, "ROUTINES");
        lv_obj_set_style_text_color(me->title, lv_color_white(), 0);
        me->shown = g_routine_type_count;
        for ( i = 0U; (i < me->shown) && (i < DA_ROWS_MAX); i++ )
        {
            lv_label_set_text_fmt(me->rows[i], "%s (%s)", g_routine_types[i].name, g_routine_types[i].raw);
        }
        words_show(me, NULL, "");
        lv_label_set_text(me->hint, "TOP: open    BOTTOM: home");
        led_show(me->at);
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
        led_show(me->type);
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
    if ( 0U == me->shown )
    {
        return;
    }
    if ( down )
    {
        me->at = (uint8_t)((me->at + 1U) % me->shown);
    }
    else
    {
        me->at = (uint8_t)((me->at + me->shown - 1U) % me->shown);
    }
    if ( DA_PAGE_TYPES == me->page )
    {
        led_show(me->at);
    }
    (void)kode_sys_haptic_play_buzz((uint16_t)DA_TICK_MS, (uint8_t)DA_TICK_GAIN);
    rows_paint(me);
}

/**
 * @brief TOP, or a tap on a row: open a type, run a routine, or run it again.
 * @param me The Active Object.
 */
static void forward(Daemons * const me)
{
    routine_type_t const * const t = &g_routine_types[me->type];

    if ( DA_PAGE_TYPES == me->page )
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
 * @brief BOTTOM: back a page, or from the types home to kodeOS.
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
    else
    {
        /* Posts to AO_Boot, which resets the board a moment later, into kodeOS. */
        KLOG_I(TAG, "home");
        if ( KODE_OK != kode_sys_exit_to_os() )
        {
            KLOG_W(TAG, "AO_Boot is busy; press again");
        }
    }
}

/**
 * @brief A tap on a row: LVGL's click, on this Active Object's thread. The row becomes the cursor, then TOP.
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
 * @brief Build the screen once: the title, the rows, the words and the hint. Nothing here draws; the next render
 *        pass does.
 * @param me The Active Object.
 */
static void ui_build(Daemons * const me)
{
    lv_obj_t * const scr = lv_screen_active();
    uint8_t i;

    /* Black and opaque: LVGL's theme would otherwise paint the screen, and black is the AMOLED's off. */
    lv_obj_set_style_bg_color(scr, lv_color_black(), 0);
    lv_obj_set_style_bg_opa(scr, LV_OPA_COVER, 0);

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

/* ---- The Active Object ---------------------------------------------------- */

void DaemonsAo_ctor(void)
{
    Daemons * const me = &l_ao;
    uint8_t i;

    QActive_ctor(&me->super, Q_STATE_CAST(&Daemons_initial));
    kscreen_ctor(&me->screen, &me->super, (enum_t)DA_TICK_SIG);
    me->title = NULL;
    for ( i = 0U; i < DA_ROWS_MAX; i++ )
    {
        me->rows[i] = NULL;
    }
    me->text = NULL;
    me->sub = NULL;
    me->hint = NULL;
    me->page = DA_PAGE_TYPES;
    me->type = 0U;
    me->at = 0U;
    me->shown = 0U;
    me->reading = false;
}

void DaemonsAo_start(void)
{
    QActive_setAttr(AO_Daemons, TASK_NAME_ATTR, "daemons");
    /* The level the SDK keeps for a renderer: just above AO_Net, below every owner, so a slow frame can only ever
     * delay itself. */
    QACTIVE_START(AO_Daemons, KODE_PRIO_USER_GUI, l_queue, Q_DIM(l_queue), l_stack, sizeof(l_stack), (void *)0);
}

/**
 * @brief The initial transition: subscribe, then ask AO_Display whether the panel is there.
 * @param me  The Active Object.
 * @param par Unused.
 * @return The transition to Daemons_waiting.
 */
static QState Daemons_initial(Daemons * const me, void const * const par)
{
    (void)par;

    QActive_subscribe(&me->super, BUTTON_EVT_SIG);
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
 * @brief Drawing: the screen is built and the render pass ticks.
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
            page_show(me);
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

            status = Q_HANDLED();
            if ( !be->pressed )
            {
                /* A release: nothing here acts on one. */
            }
            else if ( KODE_SYS_BUTTON_UP == (uint32_t)be->id )
            {
                cursor_move(me, false);
            }
            else if ( KODE_SYS_BUTTON_DOWN == (uint32_t)be->id )
            {
                cursor_move(me, true);
            }
            else if ( KODE_SYS_BUTTON_TOP == (uint32_t)be->id )
            {
                forward(me);
            }
            else
            {
                /* BOTTOM, and the pad's left and right, are the parent's. */
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
