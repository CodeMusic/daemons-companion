/* SPDX-License-Identifier: GPL-3.0-or-later */
/**
 * @file den.c
 * @brief C-426: the den on the glass.
 *
 * The words are the other boards' (DRINK FEED TRAIN SLEEP, WAKE while it sleeps: firmware/esp32/src/ui.cpp,
 * firmware/tab5/src/ui/daemon.inl); the new ones are DRAFT.
 */
#include "den.h"

#include <ctype.h>
#include <stdio.h>
#include <string.h>

#include "esp_heap_caps.h"

#define DEN_DAY_DY       (-228)   /**< Pixels from the middle of the glass; positive is down. */
#define DEN_PIC_DY       (-112)
#define DEN_NAME_DY      12
#define DEN_MOOD_DY      42
#define DEN_STEP_DY      72
#define DEN_SAID_DY      104
#define DEN_CARE_DY      148
#define DEN_ROUTINES_DY  194
#define DEN_STATUS_DY    232
#define DEN_CARE_STEP    96       /**< From one care row to the next, across. */
#define DEN_CARE_WIDTH   90
#define DEN_ROUTINES_W   200
#define DEN_TEXT_WIDTH   350
#define DEN_PIC_SCALE    768U     /**< Three times: LVGL's 256 is one. */

static const char * const CARE_WORDS[CARE_COUNT] = { "DRINK", "FEED", "TRAIN", "SLEEP", "WAKE" };

/**
 * @brief One centred label.
 */
static lv_obj_t * label_new(const lv_font_t * font, lv_color_t colour, int32_t dx, int32_t dy)
{
    lv_obj_t * const label = lv_label_create(lv_screen_active());

    lv_label_set_text(label, "");
    lv_obj_set_style_text_font(label, font, 0);
    lv_obj_set_style_text_color(label, colour, 0);
    lv_obj_set_style_text_align(label, LV_TEXT_ALIGN_CENTER, 0);
    lv_obj_align(label, LV_ALIGN_CENTER, dx, dy);
    return label;
}

void den_ui_build(den_ui_t * ui, lv_event_cb_t tap, void * user)
{
    uint8_t i;

    (void)memset(ui, 0, sizeof(*ui));
    ui->day = label_new(&lv_font_montserrat_14, lv_color_white(), 0, DEN_DAY_DY);
    ui->pic = lv_image_create(lv_screen_active());
    lv_obj_align(ui->pic, LV_ALIGN_CENTER, 0, DEN_PIC_DY);
    lv_image_set_scale(ui->pic, DEN_PIC_SCALE);
    lv_image_set_antialias(ui->pic, false);   /* a pixel stays a pixel */
    ui->name = label_new(&lv_font_montserrat_28, lv_color_white(), 0, DEN_NAME_DY);
    ui->mood = label_new(&lv_font_montserrat_14, lv_palette_main(LV_PALETTE_GREY), 0, DEN_MOOD_DY);
    ui->step = label_new(&lv_font_montserrat_14, lv_color_white(), 0, DEN_STEP_DY);
    lv_obj_set_width(ui->step, DEN_TEXT_WIDTH);
    ui->said = label_new(&lv_font_montserrat_14, lv_color_white(), 0, DEN_SAID_DY);
    lv_obj_set_width(ui->said, DEN_TEXT_WIDTH);
    for ( i = 0U; i < DEN_ITEMS; i++ )
    {
        lv_obj_t * row;

        if ( DEN_ROUTINES == i )
        {
            row = label_new(&lv_font_montserrat_14, lv_color_white(), 0, DEN_ROUTINES_DY);
            lv_obj_set_width(row, DEN_ROUTINES_W);
        }
        else
        {
            row = label_new(&lv_font_montserrat_14, lv_color_white(),
                            ((int32_t)i * DEN_CARE_STEP) - ((3 * DEN_CARE_STEP) / 2), DEN_CARE_DY);
            lv_obj_set_width(row, DEN_CARE_WIDTH);
        }
        lv_obj_set_style_pad_ver(row, 8, 0);
        lv_obj_set_style_radius(row, 10, 0);
        lv_obj_set_style_border_width(row, 1, 0);
        lv_obj_set_clickable(row, true);
        lv_obj_add_event_cb(row, tap, LV_EVENT_CLICKED, user);
        ui->items[i] = row;
    }
    ui->status = label_new(&lv_font_montserrat_14, lv_palette_main(LV_PALETTE_GREY), 0, DEN_STATUS_DY);

    /* The picture: 64 x 64 ARGB8888 in PSRAM, drawn by LVGL at three times. */
    ui->argb = (uint32_t *)heap_caps_calloc(COMPANION_ART_SIDE * COMPANION_ART_SIDE, sizeof(uint32_t),
                                            MALLOC_CAP_SPIRAM);
    ui->dsc.header.magic = LV_IMAGE_HEADER_MAGIC;
    ui->dsc.header.cf = LV_COLOR_FORMAT_ARGB8888;
    ui->dsc.header.w = COMPANION_ART_SIDE;
    ui->dsc.header.h = COMPANION_ART_SIDE;
    ui->dsc.header.stride = COMPANION_ART_SIDE * sizeof(uint32_t);
    ui->dsc.data_size = COMPANION_ART_SIDE * COMPANION_ART_SIDE * sizeof(uint32_t);
    ui->dsc.data = (const uint8_t *)ui->argb;
    den_ui_show(ui, false);
}

void den_ui_show(den_ui_t * ui, bool on)
{
    lv_obj_t * const all[] = { ui->day, ui->pic, ui->name, ui->mood, ui->step, ui->said, ui->status };
    uint8_t i;

    for ( i = 0U; i < (sizeof(all) / sizeof(all[0])); i++ )
    {
        lv_obj_set_hidden(all[i], !on);
    }
    ui->shown = on;
    for ( i = 0U; i < DEN_ITEMS; i++ )
    {
        lv_obj_set_hidden(ui->items[i], !on);
    }
    if ( on && !ui->has_pic )
    {
        lv_obj_set_hidden(ui->pic, true);
    }
}

care_t den_care_at(const den_t * den, uint8_t at)
{
    care_t c = (care_t)at;

    if ( (CARE_SLEEP == c) && (NULL != den) && den->asleep )
    {
        c = CARE_WAKE;
    }
    return c;
}

/**
 * @brief The cursor's row filled in the day's colour; the others outlined in it.
 */
static void items_paint(den_ui_t * ui, const den_t * den, uint8_t at, lv_color_t day)
{
    uint8_t i;

    for ( i = 0U; i < DEN_ITEMS; i++ )
    {
        lv_obj_t * const row = ui->items[i];

        if ( DEN_ROUTINES == i )
        {
            lv_label_set_text(row, "ROUTINES");
        }
        else
        {
            lv_label_set_text(row, CARE_WORDS[den_care_at(den, i)]);
        }
        lv_obj_set_style_border_color(row, day, 0);
        if ( i == at )
        {
            lv_obj_set_style_bg_opa(row, LV_OPA_COVER, 0);
            lv_obj_set_style_bg_color(row, day, 0);
            lv_obj_set_style_text_color(row, lv_color_white(), 0);
        }
        else
        {
            lv_obj_set_style_bg_opa(row, LV_OPA_TRANSP, 0);
            lv_obj_set_style_text_color(row, lv_color_white(), 0);
        }
    }
}

void den_ui_draw(den_ui_t * ui, const den_t * den, uint8_t at, const char * said, const char * status)
{
    char line[96];
    lv_color_t day = lv_palette_main(LV_PALETTE_GREY);
    size_t i;

    if ( NULL != den )
    {
        day = lv_color_hex(den->day_colour);
        (void)snprintf(line, sizeof(line), "%s", den->day);
        for ( i = 0U; '\0' != line[i]; i++ )
        {
            line[i] = (char)toupper((unsigned char)line[i]);
        }
        lv_label_set_text_fmt(ui->day, "%s   %s", line, den->virtue);
        lv_obj_set_style_text_color(ui->day, lv_color_mix(lv_color_white(), day, 110), 0);   /* the day's, lightened */
    }
    else
    {
        lv_label_set_text(ui->day, "");
    }

    if ( (NULL != den) && den->has_daemon )
    {
        lv_label_set_text_fmt(ui->name, "%s   LV %u", den->nickname, (unsigned)den->level);
        const char * trained = "";

        if ( den->trained )
        {
            trained = "   trained";   /* DRAFT */
        }
        /* Asleep is its mood's word already (life.word), and WAKE stands in SLEEP's place. */
        lv_label_set_text_fmt(ui->mood, "%s   fed %u/%u   drank %u/%u%s", den->mood, (unsigned)den->fed,
                              (unsigned)den->fed_due, (unsigned)den->drank, (unsigned)den->drank_due, trained);
    }
    else if ( NULL != den )
    {
        lv_label_set_text(ui->name, "No daemon here");   /* DRAFT */
        lv_label_set_text(ui->mood, "Choose one for this Dot in the app's PLACES.");   /* DRAFT */
    }
    else
    {
        lv_label_set_text(ui->name, "...");
        lv_label_set_text(ui->mood, "");
    }
    if ( (NULL != den) && ('\0' != den->step[0]) )
    {
        lv_label_set_text_fmt(ui->step, "NEXT: %s", den->step);   /* DRAFT */
    }
    else
    {
        lv_label_set_text(ui->step, "");
    }
    lv_label_set_text(ui->said, said);
    lv_label_set_text(ui->status, status);
    items_paint(ui, den, at, day);
    for ( i = 0U; i < DEN_ROUTINES; i++ )
    {
        /* No daemon here: nothing to care for, but ROUTINES stays. */
        lv_obj_set_hidden(ui->items[i], (!ui->shown) || ((NULL != den) && (!den->has_daemon)));
    }
}

void den_ui_art(den_ui_t * ui, const den_art_t * art)
{
    uint32_t argb[COMPANION_ART_COLOURS];
    uint32_t i;

    if ( NULL == ui->argb )
    {
        return;
    }
    for ( i = 0U; i < COMPANION_ART_COLOURS; i++ )
    {
        uint16_t const c = art->palette[i];
        uint32_t const r = (uint32_t)((c >> 11) & 0x1FU);
        uint32_t const g = (uint32_t)((c >> 5) & 0x3FU);
        uint32_t const b = (uint32_t)(c & 0x1FU);

        argb[i] = 0xFF000000U | (((r << 3) | (r >> 2)) << 16) | (((g << 2) | (g >> 4)) << 8) | ((b << 3) | (b >> 2));
    }
    argb[0] = 0U;   /* index 0 is the clear one, as on every board */
    for ( i = 0U; i < (COMPANION_ART_SIDE * COMPANION_ART_SIDE); i++ )
    {
        uint8_t const two = art->pix[i >> 1];
        uint8_t idx = (uint8_t)(two >> 4);

        if ( 0U != (i & 1U) )
        {
            idx = (uint8_t)(two & 0x0FU);
        }
        ui->argb[i] = argb[idx];
    }
    /* The pixels change in place; set the source again and mark it to be drawn. */
    lv_image_set_src(ui->pic, &ui->dsc);
    lv_obj_invalidate(ui->pic);
    ui->has_pic = true;
    if ( ui->shown )
    {
        lv_obj_set_hidden(ui->pic, false);
    }
}
