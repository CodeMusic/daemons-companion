// Part of ui.cpp (C-157): the look (paper, ink, the day's colour), the daemons' pictures, the widgets, the overlays. Included by ui.cpp in order -- not a file of its own: it
// shares ui.cpp's statics and may use anything the parts before it declare.
// ---- the look: paper, ink, and the day's colour (the app's, from /api/today) ------------------------------------------
// C-144: in the light or in the night -- wearLook() sets these from LIGHT, DARK or AUTO (SETTINGS, kept on the Tab5)
static lv_color_t PAPER = lv_color_hex(0xF3F1EA), INK = lv_color_hex(0x1D232B), QUIET = lv_color_hex(0x6B7178);
static lv_color_t CARD = lv_color_white(), BAR = INK, UNLIT = lv_color_hex(0xC9D2C4);
static bool darkNow = false;
static lv_color_t DAY = lv_color_hex(0x315A62);
static uint32_t dayHex = 0x315A62;

// The pages, in the tabs' order; P_COUNT sizes everything that has one entry a page (a new page adds its name, its NEEDS
// and its DRAW below, and the static_asserts say so if one is missed)
// C-156 (the user, 2026-10-18, B of the mockup): TODAY the home page, DAEMON with the INDEX in it, the LIBRARY with the
// NOTEBOOK, SONGBOOK and STREAM, YOU (PROFILE), PLACES (DEVICES and HOME); SETTINGS stays a tab here (no gear in the bar)
enum { P_TODAY, P_DAEMON, P_GOALS, P_LIBRARY, P_YOU, P_PLACES, P_SETTINGS, P_COUNT };
static lv_obj_t *tabs, *pages[P_COUNT], *statusLeft, *statusRight, *overlay = nullptr;
static const char *TAB_NAMES[] = { "TODAY", "DAEMON", "GOALS", "LIBRARY", "YOU", "PLACES", "SETTINGS" };
static_assert(sizeof TAB_NAMES / sizeof *TAB_NAMES == P_COUNT, "a name for every page");
static uint32_t drawnAt[P_COUNT] = { 0 };            // 0: draw the page again
// C-98: what each page shows, so a change to anything else leaves it alone (a rebuilt page flickered)
static const uint32_t NEEDS[] = { K_TODAY | K_STATE | K_PROFILE | K_ART, K_STATE | K_PARTY | K_ART | K_MESSAGE | K_INDEX, K_GOALS,
                                  K_PROFILE, K_PROFILE | K_ART, K_DEVICES | K_HOME, K_NETS | K_MESSAGE | K_TODAY };
static_assert(sizeof NEEDS / sizeof *NEEDS == P_COUNT, "what every page needs");
static int indexPage = 0, goalAt = 0;

// C-144: in the night, words in a colour chosen for the paper -- the day's, a root's -- are lifted towards the ink
// until they read (about 4.5:1 on a card); in the light every colour is as it was chosen
static lv_color_t legible(lv_color_t c) {
  for (int i = 0; darkNow && i < 24 && lv_color_luminance(c) < 140; i++) c = lv_color_mix(INK, c, 32);
  return c;
}

static lv_obj_t *label(lv_obj_t *parent, const String &text, const lv_font_t *font = &lv_font_montserrat_20,
                       lv_color_t colour = INK, int width = -1) {
  lv_obj_t *l = lv_label_create(parent);
  lv_label_set_text(l, text.c_str());
  lv_obj_set_style_text_font(l, font, 0);
  lv_obj_set_style_text_color(l, legible(colour), 0);
  if (width > 0) { lv_obj_set_width(l, width); lv_label_set_long_mode(l, LV_LABEL_LONG_WRAP); }
  return l;
}

static lv_obj_t *column(lv_obj_t *parent, int w = LV_PCT(100), int h = LV_SIZE_CONTENT) {
  lv_obj_t *c = lv_obj_create(parent);
  lv_obj_set_size(c, w, h);
  lv_obj_set_flex_flow(c, LV_FLEX_FLOW_COLUMN);
  lv_obj_set_style_pad_row(c, 10, 0);
  lv_obj_set_style_bg_opa(c, LV_OPA_TRANSP, 0);
  lv_obj_set_style_border_width(c, 0, 0);
  lv_obj_set_style_pad_all(c, 0, 0);
  return c;
}

static lv_obj_t *card(lv_obj_t *parent, int w = LV_PCT(100)) {
  lv_obj_t *c = column(parent, w);
  lv_obj_set_style_bg_opa(c, LV_OPA_COVER, 0);
  lv_obj_set_style_bg_color(c, CARD, 0);
  lv_obj_set_style_border_width(c, 0, 0);
  lv_obj_set_style_border_side(c, LV_BORDER_SIDE_LEFT, 0);
  lv_obj_set_style_border_color(c, DAY, 0);
  lv_obj_set_style_border_width(c, 6, 0);
  lv_obj_set_style_radius(c, 6, 0);
  lv_obj_set_style_pad_all(c, 18, 0);
  return c;
}

typedef void (*Tap)(lv_event_t *);
static lv_obj_t *button(lv_obj_t *parent, const String &text, Tap tap, void *data = nullptr, bool filled = true) {
  lv_obj_t *b = lv_button_create(parent);
  lv_obj_set_style_bg_color(b, filled ? DAY : CARD, 0);
  lv_obj_set_style_border_color(b, DAY, 0);
  lv_obj_set_style_border_width(b, filled ? 0 : 2, 0);
  lv_obj_set_style_shadow_width(b, 0, 0);
  lv_obj_set_style_pad_hor(b, 22, 0); lv_obj_set_style_pad_ver(b, 14, 0);
  lv_obj_t *l = label(b, text, &lv_font_montserrat_20, filled ? lv_color_white() : DAY);
  lv_obj_center(l);
  lv_obj_add_event_cb(b, [](lv_event_t *) { soundSelect(); }, LV_EVENT_CLICKED, nullptr);   // C-94: every tap, as a press
  if (tap) lv_obj_add_event_cb(b, tap, LV_EVENT_CLICKED, data);
  return b;
}

static lv_obj_t *row(lv_obj_t *parent) {
  lv_obj_t *r = column(parent);
  lv_obj_set_flex_flow(r, LV_FLEX_FLOW_ROW_WRAP);
  lv_obj_set_style_pad_column(r, 12, 0);
  lv_obj_set_flex_align(r, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
  return r;
}

// ---- the daemons' pictures: the kept PNGs, decoded by LVGL once each, drawn big without smoothing (they are pixel art)
static std::map<String, lv_image_dsc_t *> art;
static lv_image_dsc_t *artDsc(const String &key) {
  lv_image_dsc_t *dsc = nullptr;
  auto it = art.find(key);
  if (it != art.end()) dsc = it->second;
  else {
    size_t n = 0;
    uint8_t *png = loadArt(key, n);
    if (png) {
      dsc = (lv_image_dsc_t *)heap_caps_calloc(1, sizeof(lv_image_dsc_t), MALLOC_CAP_SPIRAM);
      dsc->header.magic = LV_IMAGE_HEADER_MAGIC;
      dsc->header.cf = LV_COLOR_FORMAT_RAW_ALPHA;
      dsc->data = png; dsc->data_size = n;
      art[key] = dsc;
    }
  }
  return dsc;
}
static lv_obj_t *picture(lv_obj_t *parent, const String &key, int scale) {
  lv_image_dsc_t *dsc = artDsc(key);
  lv_obj_t *box = lv_obj_create(parent);
  lv_obj_set_size(box, 64 * scale / 256 + 8, 64 * scale / 256 + 8);
  lv_obj_set_style_bg_opa(box, LV_OPA_TRANSP, 0); lv_obj_set_style_border_width(box, 0, 0); lv_obj_set_style_pad_all(box, 0, 0);
  lv_obj_remove_flag(box, LV_OBJ_FLAG_SCROLLABLE);
  lv_obj_remove_flag(box, LV_OBJ_FLAG_CLICKABLE);   // C-99: a tap on the picture is a tap on what holds it (an INDEX cell)
  if (dsc) {
    if (darkNow && key.startsWith("mark")) {        // C-144: the badges (16 px) are drawn for the paper -- in the night,
      lv_obj_t *chip = lv_obj_create(box);          // each sits on a chip of it
      int32_t side = 16 * scale / 256 + 8;
      lv_obj_set_size(chip, side, side);
      lv_obj_set_style_bg_color(chip, lv_color_hex(0xECE9DF), 0); lv_obj_set_style_bg_opa(chip, LV_OPA_COVER, 0);
      lv_obj_set_style_border_width(chip, 0, 0); lv_obj_set_style_radius(chip, 6, 0);
      lv_obj_remove_flag(chip, LV_OBJ_FLAG_SCROLLABLE); lv_obj_remove_flag(chip, LV_OBJ_FLAG_CLICKABLE);
      lv_obj_center(chip);
    }
    lv_obj_t *img = lv_image_create(box);
    lv_image_set_src(img, dsc);
    lv_image_set_antialias(img, false);
    lv_image_set_scale(img, scale);
    lv_obj_center(img);
  } else {
    lv_obj_t *q = label(box, "?", &lv_font_montserrat_40, QUIET);
    lv_obj_center(q);
  }
  return box;
}

static void resetArt() {                          // the pictures were downloaded again: decode them afresh
  for (auto &kv : art) { lv_image_cache_drop(kv.second); heap_caps_free((void *)kv.second->data); heap_caps_free(kv.second); }
  art.clear();
}

// ---- overlays: an entry, a keyboard ------------------------------------------------------------------------------------
static lv_obj_t *listenLabel = nullptr, *voiceSaid = nullptr;   // C-99: an entry's LISTEN, while its overlay is open
static String voiceSaidWas;                        // what the network said when it opened: only what it says after shows
static void showWords(const String &head, const String &body, const String &foot);
static void (*overlayClosing)() = nullptr;          // C-155: an overlay that says goodbye as it closes (the CASINO's seat)
static void closeOverlay(lv_event_t * = nullptr) {
  if (!overlay) return;
  if (overlayClosing) { void (*f)() = overlayClosing; overlayClosing = nullptr; f(); }
  lv_obj_delete(overlay); overlay = nullptr;
  if (listenLabel) { listenLabel = voiceSaid = nullptr; netHush(); }   // closing an entry stops its voice
}
static lv_obj_t *openOverlay() {
  closeOverlay();
  overlay = lv_obj_create(lv_layer_top());
  lv_obj_set_size(overlay, LV_PCT(100), LV_PCT(100));
  lv_obj_set_style_bg_color(overlay, PAPER, 0);
  lv_obj_set_style_bg_opa(overlay, LV_OPA_COVER, 0);
  lv_obj_set_style_border_width(overlay, 0, 0);
  lv_obj_set_style_pad_all(overlay, 30, 0);
  lv_obj_set_flex_flow(overlay, LV_FLEX_FLOW_COLUMN);
  lv_obj_set_style_pad_row(overlay, 14, 0);
  return overlay;
}

// C-158, C-160: an overlay drawn from an answer the network watches while it is open (net.h netWatch) -- THE HOUSE, a
// device's own settings -- drawn again each time the answer changes, or when a tap on it asks (watchAgain)
typedef void (*WatchDraw)(lv_obj_t *box, JsonDocument &d);
static WatchDraw watchDraw = nullptr;
static lv_obj_t *watchBox = nullptr;
static uint32_t watchSeen = 0;
static bool watchForce = false;
static void watchClosing() { netWatch(""); watchDraw = nullptr; watchBox = nullptr; }
static void watchLook() {                            // from uiLoop -- never inside a tap on what it empties
  if (!watchDraw || !watchBox || (!watchForce && watchSeen == watchRev)) return;
  watchSeen = watchRev; watchForce = false;
  String b = netWatched();
  if (!b.length()) return;
  JsonDocument d = newDoc();
  if (deserializeJson(d, b)) return;
  lv_obj_clean(watchBox);
  watchDraw(watchBox, d);
}
static void watchAgain() { watchForce = true; }     // drawn again on the next pass
static void openWatched(const String &title, const String &path, WatchDraw draw) {
  lv_obj_t *o = openOverlay();
  overlayClosing = watchClosing;
  button(o, "CLOSE", closeOverlay, nullptr, false);
  label(o, title, &lv_font_montserrat_28, DAY, LV_PCT(100));
  watchBox = column(o);
  label(watchBox, net.wifi && net.paired ? "Asking the companion..."                       // DRAFT
                 : "This is asked of the companion as you look, so it shows once the Tab5 reaches it.", &lv_font_montserrat_20, QUIET, LV_PCT(100));
  watchDraw = draw; watchSeen = watchRev;
  netWatch(path);
}

// A text field and the on-screen keyboard; `done` gets the text when READY is pressed.
typedef void (*Typed)(const String &);
static Typed typedDone = nullptr;
static lv_obj_t *typedArea = nullptr;
static void keyboardEvent(lv_event_t *e) {
  lv_event_code_t code = lv_event_get_code(e);
  if (code == LV_EVENT_READY && typedDone && typedArea) { String t = lv_textarea_get_text(typedArea); Typed d = typedDone; closeOverlay(); d(t); }
  else if (code == LV_EVENT_CANCEL) closeOverlay();
}
static void askText(const String &title, const String &initial, bool secret, bool digits, Typed done) {
  lv_obj_t *o = openOverlay();
  label(o, title, &lv_font_montserrat_28, INK);
  typedArea = lv_textarea_create(o);
  lv_textarea_set_one_line(typedArea, true);
  lv_textarea_set_password_mode(typedArea, secret);
  lv_textarea_set_text(typedArea, initial.c_str());
  lv_obj_set_width(typedArea, LV_PCT(100));
  lv_obj_set_style_text_font(typedArea, &lv_font_montserrat_28, 0);
  typedDone = done;
  lv_obj_t *kb = lv_keyboard_create(o);
  lv_obj_set_size(kb, LV_PCT(100), 380);
  if (digits) lv_keyboard_set_mode(kb, LV_KEYBOARD_MODE_NUMBER);
  lv_keyboard_set_textarea(kb, typedArea);
  lv_obj_add_event_cb(kb, keyboardEvent, LV_EVENT_ALL, nullptr);
}

