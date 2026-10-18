// C-77: the control center's screens. Each page is drawn from what the Tab5 keeps (store.h) and drawn again when that
// changes (net.cpp bumps keptChanged); a tap that changes something goes through netSend(), which sends it now or keeps
// it until the companion answers. Every word here is DRAFT.
#include <M5Unified.h>
#include <lvgl.h>
#include <map>
#include <vector>
#include <esp_heap_caps.h>
#include "ui.h"
#include "net.h"
#include "store.h"
#include "sound.h"
#include "display.h"
#include "den.h"
#include <Preferences.h>

// ---- the look: paper, ink, and the day's colour (the app's, from /api/today) ------------------------------------------
// C-144: in the light or in the night -- wearLook() sets these from LIGHT, DARK or AUTO (SETTINGS, kept on the Tab5)
static lv_color_t PAPER = lv_color_hex(0xF3F1EA), INK = lv_color_hex(0x1D232B), QUIET = lv_color_hex(0x6B7178);
static lv_color_t CARD = lv_color_white(), BAR = INK, UNLIT = lv_color_hex(0xC9D2C4);
static bool darkNow = false;
static lv_color_t DAY = lv_color_hex(0x315A62);
static uint32_t dayHex = 0x315A62;

// The pages, in the tabs' order; P_COUNT sizes everything that has one entry a page (a new page adds its name, its NEEDS
// and its DRAW below, and the static_asserts say so if one is missed)
enum { P_TODAY, P_GOALS, P_DAEMON, P_INDEX, P_DEVICES, P_HOME, P_PROFILE, P_SCHOOL, P_SETTINGS, P_COUNT };   // C-131 PROFILE, C-137 SCHOOL, C-139 HOME
static lv_obj_t *tabs, *pages[P_COUNT], *statusLeft, *statusRight, *overlay = nullptr;
static const char *TAB_NAMES[] = { "TODAY", "GOALS", "DAEMON", "INDEX", "DEVICES", "HOME", "PROFILE", "LIBRARY", "SETTINGS" };
static_assert(sizeof TAB_NAMES / sizeof *TAB_NAMES == P_COUNT, "a name for every page");
static uint32_t drawnAt[P_COUNT] = { 0 };            // 0: draw the page again
// C-98: what each page shows, so a change to anything else leaves it alone (a rebuilt page flickered)
static const uint32_t NEEDS[] = { K_TODAY, K_GOALS, K_STATE | K_PARTY | K_ART | K_MESSAGE, K_INDEX | K_ART, K_DEVICES, K_HOME,
                                  K_PROFILE | K_ART, K_PROFILE, K_NETS | K_MESSAGE | K_TODAY };
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
static void closeOverlay(lv_event_t * = nullptr) {
  if (!overlay) return;
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

// ---- TODAY ------------------------------------------------------------------------------------------------------------
static void tapDone(lv_event_t *e) {
  long id = (long)lv_event_get_user_data(e);
  soundStep(false);                                      // C-94: the step's own tune, as on the handhelds
  netSend("POST", "/api/steps/" + String(id) + "/done", "{}");
}

static void drawToday(lv_obj_t *p) {
  JsonDocument t = newDoc();
  if (!kept("today", t)) { label(p, "Nothing kept yet. Join a network and pair in SETTINGS.", &lv_font_montserrat_28, QUIET, LV_PCT(100)); return; }
  JsonObject day = t["day"];
  label(p, String((const char *)(day["theme"] | "")).length() ? String((const char *)day["theme"]) : String((const char *)(day["day"] | "")),
        &lv_font_montserrat_48, DAY);
  label(p, String((const char *)(day["day"] | "")) + "  " + (const char *)(t["date"] | ""), &lv_font_montserrat_20, QUIET);
  label(p, day["cue"] | "", &lv_font_montserrat_28, INK);
  label(p, String((const char *)(day["chakra"] | "")) + "  -  " + (const char *)(day["note"] | "") + "  -  " + (const char *)(t["season"] | ""),
        &lv_font_montserrat_20, QUIET);
  lv_obj_t *c = card(p);
  JsonObject next = t["next"];
  if (next.isNull() || next["step"].isNull()) {
    label(c, "Nothing to do yet. Set a goal on GOALS.", &lv_font_montserrat_28, INK, LV_PCT(100));
    return;
  }
  label(c, String((const char *)(next["goal"] | "")) + "  >  " + (const char *)(next["milestone"]["title"] | "") +
           "  (" + String((int)(next["milestone"]["at"] | 0)) + " of " + String((int)(next["milestone"]["of"] | 0)) + ")",
        &lv_font_montserrat_20, QUIET, LV_PCT(100));
  label(c, next["step"]["text"] | "", &lv_font_montserrat_40, INK, LV_PCT(100));
  button(c, "DONE", tapDone, (void *)(long)(next["step"]["id"] | 0));
}

// ---- GOALS ------------------------------------------------------------------------------------------------------------
static void tapGoal(lv_event_t *e) { goalAt = (int)(long)lv_event_get_user_data(e); drawnAt[P_GOALS] = 0; }
static void tapStep(lv_event_t *e) {
  long v = (long)lv_event_get_user_data(e);              // the step's id, negative when it is done (a tap undoes it)
  soundStep(v < 0);                                      // C-94
  netSend("POST", "/api/steps/" + String(labs(v)) + (v < 0 ? "/undo" : "/done"), "{}");
}
static void newGoal(const String &title) {
  if (!title.length()) return;
  JsonDocument d; d["title"] = title; d["breakdown"] = true;
  String body; serializeJson(d, body);
  netSend("POST", "/api/goals", body);
}
static void tapNewGoal(lv_event_t *) { askText("A new goal -- the companion breaks it into steps", "", false, false, newGoal); }

static void drawGoals(lv_obj_t *p) {
  JsonDocument g = newDoc();
  lv_obj_t *top = row(p);
  button(top, "+ NEW GOAL", tapNewGoal);
  if (!kept("goals", g) || !g.as<JsonArray>().size()) { label(p, "No goals yet.", &lv_font_montserrat_28, QUIET); return; }
  JsonArray goals = g.as<JsonArray>();
  if (goalAt >= (int)goals.size()) goalAt = 0;
  lv_obj_t *names = row(p);
  int i = 0;
  for (JsonObject goal : goals) { button(names, goal["title"] | "", tapGoal, (void *)(long)i, i == goalAt); i++; }
  JsonObject goal = goals[goalAt];
  for (JsonObject sub : goal["subitems"].as<JsonArray>()) {
    lv_obj_t *c = card(p);
    label(c, sub["title"] | "", &lv_font_montserrat_28, (sub["done"] | false) ? QUIET : INK);
    for (JsonObject st : sub["steps"].as<JsonArray>()) {
      bool done = st["done"] | false;
      long id = st["id"] | 0;
      lv_obj_t *b = button(c, String(done ? LV_SYMBOL_OK "  " : "      ") + (const char *)(st["text"] | ""), tapStep, (void *)(done ? -id : id), false);
      lv_obj_set_width(b, LV_PCT(100));
      if (done) lv_obj_set_style_opa(b, LV_OPA_60, 0);
    }
  }
}

// ---- DAEMON -----------------------------------------------------------------------------------------------------------
static void tapSyncGame(lv_event_t *) { netGameSync(); }

// C-118: the care, as the app and the boards have it -- answered at once, then sent (kept if nothing answers, C-87)
static const char *CARE_KIND[] = { "feed", "water", "train", "sleep", "wake" }, *CARE_SAID[] = { "Eaten.", "Drank.", "Trained.", "Asleep.", "Awake." };   // DRAFT
static String careSaid;
static void tapCare(lv_event_t *e) {
  int k = (int)(long)lv_event_get_user_data(e);
  careSaid = CARE_SAID[k];
  // C-121 (the user, 2026-10-15: "presume the happy path show the screen feedback and then send to the server"): the
  // kept state takes the care at once -- asleep or awake, the day's meal or drink counted -- so the page is drawn as it
  // will be (WAKE, or DRINK FEED TRAIN SLEEP) before the companion answers; its answer, when it comes, replaces it
  JsonDocument st = newDoc();
  if (kept("state", st) && !st["daemon"].isNull()) {
    JsonObject life = st["daemon"]["life"];
    if (life.isNull()) life = st["daemon"]["life"].to<JsonObject>();
    String tired = (const char *)(life["tired"] | "awake");
    life["tired"] = String(k == 3 ? "asleep" : k == 4 || tired == "asleep" ? "awake" : tired.c_str());
    if (k == 0) life["fed"]["today"] = min(3, (int)(life["fed"]["today"] | 0) + 1);
    if (k == 1) life["watered"]["today"] = min(3, (int)(life["watered"]["today"] | 0) + 1);
    String json; serializeJson(st, json);
    keep("state", json);
  }
  drawnAt[P_DAEMON] = 0;
  if (k == 4) soundWake(); else soundCare(k);
  netSend("POST", String("/api/daemon/") + CARE_KIND[k], "{}");
}

// ---- NEARBY (C-134, broadcasts; the hub is server/src/broadcast.ts): what the daemons have said or done -- typed, or an
// interaction from the shared list -- by LoRa, Bluetooth or the companion, each once; an act from another daemon can be
// answered, once. Sent through netSend, so it is kept until the companion answers. Words from the hub's own lines.
static String castLine(JsonObject c, JsonDocument &acts) {
  String name = c["name"] | "", kind = c["kind"] | "";
  if (kind == "say") return name + ": " + (const char *)(c["text"] | "");
  for (const char *list : { "acts", "casino" })              // C-151: the CASINO's JACKPOT and BIGWIN too
    for (JsonObject a : acts[list].as<JsonArray>())
      if (String((const char *)(a["code"] | "")) == String((const char *)(c["act"] | "")))
        return name + " " + (const char *)(kind == "reply" ? (a["reply"] | "") : (a["seen"] | ""));
  return name;
}
static void sentSay(const String &text) {
  if (!text.length()) return;
  JsonDocument d; d["kind"] = "say"; d["text"] = text.substring(0, 40);
  String body; serializeJson(d, body);
  netSend("POST", "/api/broadcast", body);
}
static void tapSay(lv_event_t *) { askText("Say something to every daemon nearby (40 letters)", "", false, false, sentSay); }
static void tapAct(lv_event_t *e) {
  JsonDocument acts = newDoc();
  if (!kept("acts", acts)) return;
  JsonDocument d; d["kind"] = "act"; d["act"] = acts["acts"][(int)(long)lv_event_get_user_data(e)]["code"];
  String body; serializeJson(d, body);
  netSend("POST", "/api/broadcast", body);
}
static void tapAnswer(lv_event_t *e) {
  JsonDocument b = newDoc();
  if (!kept("broadcasts", b)) return;
  JsonObject c = b["items"][(int)(long)lv_event_get_user_data(e)];
  JsonDocument d; d["kind"] = "reply"; d["act"] = c["act"]; d["replyTo"] = c["id"];
  String body; serializeJson(d, body);
  netSend("POST", "/api/broadcast", body);
}
static void drawNearby(lv_obj_t *parent) {
  JsonDocument b = newDoc(), acts = newDoc();
  bool haveActs = kept("acts", acts);
  lv_obj_t *c = card(parent);
  label(c, "NEARBY", &lv_font_montserrat_20, QUIET);
  JsonArray items = kept("broadcasts", b) ? b["items"].as<JsonArray>() : JsonArray();
  if (!items.size()) label(c, "Nothing said yet.", &lv_font_montserrat_20, QUIET);
  int from = items.size() > 6 ? items.size() - 6 : 0;
  for (int i = from; i < (int)items.size(); i++) {
    JsonObject it = items[i];
    lv_obj_t *r = row(c);
    label(r, castLine(it, acts), &lv_font_montserrat_20, (it["mine"] | false) ? QUIET : INK, LV_PCT(70));
    bool answered = false;                              // an act from another daemon, not yet answered here, may be answered
    for (JsonObject o : items) if (String((const char *)(o["replyTo"] | "")) == String((const char *)(it["id"] | "")) && (o["mine"] | false)) answered = true;
    if (String((const char *)(it["kind"] | "")) == "act" && !(it["mine"] | false) && !answered) button(r, "ANSWER", tapAnswer, (void *)(long)i, false);
  }
  lv_obj_t *s = row(c);
  button(s, "SAY...", tapSay);
  if (haveActs) { int k = 0; for (JsonObject a : acts["acts"].as<JsonArray>()) button(s, a["label"] | "", tapAct, (void *)(long)k++, false); }
}

static void drawDaemon(lv_obj_t *p) {
  lv_obj_set_flex_flow(p, LV_FLEX_FLOW_ROW_WRAP);          // C-96: side by side in landscape, one above the other in portrait
  lv_obj_set_style_pad_column(p, 16, 0);
  int half = displayPortrait() ? LV_PCT(100) : LV_PCT(48);
  lv_obj_t *left = column(p, half), *right = column(p, half);
  JsonDocument st = newDoc();
  JsonObject d;
  if (kept("state", st)) d = st["daemon"];
  if (!d.isNull()) {
    lv_obj_t *c = card(left);
    denStage(c, d, displayPortrait() ? 640 : 540, displayPortrait() ? 380 : 340);   // C-113: in its den, walking it
    // C-118: how it is, plainly -- asleep said large -- and its care: DRINK FEED TRAIN SLEEP, SLEEP lit at bedtime, WAKE asleep
    String tired = (const char *)(d["life"]["tired"] | "awake");
    if (tired == "asleep") label(c, "ASLEEP", &lv_font_montserrat_40, DAY);                        // DRAFT
    else label(c, d["life"]["word"] | "", &lv_font_montserrat_28, DAY);
    lv_obj_t *keys = row(c);
    if (tired == "asleep") button(keys, "WAKE", tapCare, (void *)4L);
    else {
      button(keys, "DRINK", tapCare, (void *)1L, false); button(keys, "FEED", tapCare, (void *)0L, false);
      button(keys, "TRAIN", tapCare, (void *)2L, false); button(keys, "SLEEP", tapCare, (void *)3L, tired == "drowsy");
    }
    if (careSaid.length()) label(c, careSaid, &lv_font_montserrat_20, QUIET);
    label(c, d["nickname"] | "", &lv_font_montserrat_40, INK);
    label(c, "Lv. " + String((int)(d["level"] | 0)) + "   " + (const char *)(d["category"] | ""), &lv_font_montserrat_20, QUIET);
    String types; for (JsonVariant t : d["types"].as<JsonArray>()) types += (types.length() ? " / " : "") + String((const char *)t);
    label(c, types, &lv_font_montserrat_20, DAY);
    label(c, d["entry"] | "", &lv_font_montserrat_20, INK, LV_PCT(100));
  } else {
    label(left, "This Tab5 hosts no daemon. SEND one from the party in the game, SYNC, and choose it on DEVICES.",
          &lv_font_montserrat_28, QUIET, LV_PCT(100));
  }
  JsonDocument party = newDoc();
  label(right, "THE PARTY", &lv_font_montserrat_20, QUIET);
  if (kept("party", party)) {
    for (JsonObject m : party["party"].as<JsonArray>()) {
      lv_obj_t *r = row(right);
      picture(r, "p" + String((int)(m["slot"] | 0)), 256);
      String name = (const char *)(m["nickname"] | ""); if (!name.length()) name = (const char *)(m["name"] | "");
      label(r, name + "   Lv. " + String((int)(m["level"] | 0)) + ((m["away"] | false) ? "   (away)" : ""), &lv_font_montserrat_20, INK);
    }
  }
  button(right, "SYNC WITH THE GAME", tapSyncGame);
  label(right, "Close the game first: SYNC writes the save.", &lv_font_montserrat_16, QUIET, LV_PCT(100));
  if (net.message.length()) label(right, net.message, &lv_font_montserrat_20, DAY, LV_PCT(100));
  drawNearby(right);
}

// ---- INDEX ------------------------------------------------------------------------------------------------------------
static const int PER_PAGE = 18;
static void tapIndexPage(lv_event_t *e) { indexPage += (int)(long)lv_event_get_user_data(e); drawnAt[P_INDEX] = 0; }

static int listening = 0;                          // the species LISTEN reads
static const char *listenWord() { return netVoice == V_MAKING ? "MAKING THE VOICE...  STOP" : netVoice == V_SPEAKING ? "HUSH" : LV_SYMBOL_VOLUME_MAX "  LISTEN"; }   // DRAFT
static void tapListen(lv_event_t *) { if (netVoice == V_QUIET) netSpeak(listening); else netHush(); }

static void tapEntry(lv_event_t *e) {
  int at = (int)(long)lv_event_get_user_data(e);
  JsonDocument ix = newDoc();
  if (!kept("index", ix)) return;
  JsonObject en = ix["entries"][at];
  lv_obj_t *o = openOverlay();
  lv_obj_set_flex_flow(o, displayPortrait() ? LV_FLEX_FLOW_COLUMN : LV_FLEX_FLOW_ROW);   // C-96
  lv_obj_t *left = column(o, displayPortrait() ? LV_PCT(100) : 420), *right = column(o, displayPortrait() ? LV_PCT(100) : 700);
  picture(left, "s" + String((int)(en["species"] | 0)), 256 * 6);
  label(right, "No. " + String((int)(en["national"] | 0)) + "   " + (const char *)(en["name"] | ""), &lv_font_montserrat_40, INK);
  String types; for (JsonVariant t : en["types"].as<JsonArray>()) types += (types.length() ? " / " : "") + String((const char *)t);
  label(right, String((const char *)(en["category"] | "")) + "   " + types, &lv_font_montserrat_20, DAY);
  String text = en["entry"] | ""; text.replace("\n", " ");
  label(right, text, &lv_font_montserrat_28, INK, LV_PCT(100));
  JsonArray native = en["native"].as<JsonArray>();   // T-407: NATIVE, as the game's area page says it
  if (native.size()) {
    String lines; for (JsonVariant n : native) lines += (lines.length() ? "\n" : "") + String((const char *)n);
    label(right, "NATIVE", &lv_font_montserrat_16, DAY);
    label(right, lines, &lv_font_montserrat_20, INK, LV_PCT(100));
  }
  lv_obj_t *r = row(right);                          // C-99: read aloud, in the INDEX voice, as the phone's LISTEN
  listening = en["species"] | 0;
  netHush(); voiceSaidWas = net.message;
  lv_obj_t *b = button(r, listenWord(), tapListen);
  listenLabel = lv_obj_get_child(b, 0);
  button(r, "CLOSE", closeOverlay, nullptr, false);
  voiceSaid = label(right, "", &lv_font_montserrat_20, DAY, LV_PCT(100));
}

static void drawIndex(lv_obj_t *p) {
  JsonDocument ix = newDoc();
  if (!kept("index", ix)) { label(p, "The INDEX downloads once the Tab5 is paired.", &lv_font_montserrat_28, QUIET); return; }
  JsonArray entries = ix["entries"];
  int pages = max(1, ((int)entries.size() + PER_PAGE - 1) / PER_PAGE);
  indexPage = (indexPage % pages + pages) % pages;
  lv_obj_t *top = row(p);
  label(top, "Seen " + String((int)(ix["seen"] | 0)) + "   Bound " + String((int)(ix["bound"] | 0)), &lv_font_montserrat_20, QUIET);
  button(top, LV_SYMBOL_LEFT, tapIndexPage, (void *)-1L, false);
  label(top, String(indexPage + 1) + " / " + String(pages), &lv_font_montserrat_20, INK);
  button(top, LV_SYMBOL_RIGHT, tapIndexPage, (void *)1L, false);
  if (net.artTotal && net.artDone < net.artTotal) label(top, "pictures " + String(net.artDone) + " / " + String(net.artTotal), &lv_font_montserrat_16, QUIET);
  lv_obj_t *grid = row(p);
  for (int i = indexPage * PER_PAGE; i < min((int)entries.size(), (indexPage + 1) * PER_PAGE); i++) {
    JsonObject en = entries[i];
    bool seen = en["seen"] | false;
    lv_obj_t *cell = column(grid, 165);
    lv_obj_set_style_bg_opa(cell, LV_OPA_COVER, 0);
    lv_obj_set_style_bg_color(cell, CARD, 0);
    lv_obj_set_style_radius(cell, 6, 0);
    lv_obj_set_style_pad_all(cell, 8, 0);
    lv_obj_set_flex_align(cell, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
    if (seen) picture(cell, "s" + String((int)(en["species"] | 0)), 256 * 2);
    else label(cell, "?", &lv_font_montserrat_48, QUIET);
    label(cell, String((int)(en["national"] | 0)) + " " + (seen ? (const char *)(en["name"] | "") : "-----"), &lv_font_montserrat_16, INK);
    if (seen) { lv_obj_add_flag(cell, LV_OBJ_FLAG_CLICKABLE); lv_obj_add_event_cb(cell, tapEntry, LV_EVENT_CLICKED, (void *)(long)i); }
  }
}

// ---- DEVICES ----------------------------------------------------------------------------------------------------------
struct Carry { String id; long long personality; };
static Carry carries[64]; static int carryN = 0;
static void tapCarry(lv_event_t *e) {
  Carry &c = carries[(int)(long)lv_event_get_user_data(e)];
  String body = "{\"id\":\"" + c.id + "\",\"personality\":" + (c.personality < 0 ? String("null") : String((long long)c.personality)) + "}";
  netSend("POST", "/api/devices/carry", body);
}
// C-130: each device as it looks (firmware/common/device_sprites.py writes the list), and the maker it is listed under
#include "../../common/device_sprites.h"
static const DeviceLook *lookFor(const String &kind) {
  String k = kind;
  for (int i = 0; i < DEVICE_ALIAS_N; i++) if (k == DEVICE_ALIASES[i][0]) k = DEVICE_ALIASES[i][1];
  const DeviceLook *best = nullptr; size_t bestLen = 0;
  for (int i = 0; i < DEVICE_LOOK_N; i++) {
    size_t n = strlen(DEVICE_LOOKS[i].kind);
    if (k == DEVICE_LOOKS[i].kind) return &DEVICE_LOOKS[i];
    if (k.startsWith(DEVICE_LOOKS[i].kind) && n > bestLen) { best = &DEVICE_LOOKS[i]; bestLen = n; }
  }
  return best;
}
static String makerOf(const String &kind) { const DeviceLook *l = lookFor(kind); return l ? l->maker : "Other"; }
// The sprite, `px` pixels square: each shape a rounded rectangle on the 32x32 grid (the list keeps them in tenths)
static void deviceSprite(lv_obj_t *parent, const String &kind, int px, bool dim) {
  lv_obj_t *box = lv_obj_create(parent);
  lv_obj_remove_style_all(box);
  lv_obj_set_size(box, px, px);
  lv_obj_clear_flag(box, LV_OBJ_FLAG_SCROLLABLE);
  if (dim) lv_obj_set_style_opa(box, LV_OPA_70, 0);
  const DeviceLook *l = lookFor(kind);
  static const DeviceShape PLAIN[] = { {40, 80, 240, 160, 20, 0x5A5D63}, {70, 110, 180, 100, 10, 0x46A8E0} };
  const DeviceShape *sh = l ? l->shapes : PLAIN; int n = l ? l->n : 2;
  for (int i = 0; i < n; i++) {
    lv_obj_t *o = lv_obj_create(box);
    lv_obj_remove_style_all(o);
    lv_obj_set_pos(o, sh[i].x * px / 320, sh[i].y * px / 320);
    lv_obj_set_size(o, max(1, sh[i].w * px / 320), max(1, sh[i].h * px / 320));
    lv_obj_set_style_radius(o, sh[i].r * px / 320, 0);
    lv_obj_set_style_bg_opa(o, LV_OPA_COVER, 0);
    lv_obj_set_style_bg_color(o, lv_color_hex(sh[i].c), 0);
  }
}

static String kindName(const String &kind) {
  if (const DeviceLook *l = lookFor(kind)) return l->name;
  if (kind == "t-embed-cc1101") return "T-Embed CC1101"; if (kind == "t-embed") return "T-Embed"; if (kind == "t-embed-si4732") return "T-Embed SI4732";
  if (kind == "t-watch-s3") return "T-Watch S3"; if (kind == "m5-sticks3") return "M5StickS3"; if (kind == "m5-cores3") return "M5Stack CoreS3";
  if (kind == "m5-fire") return "M5Stack Fire"; if (kind == "m5go") return "M5GO"; if (kind == "m5-tab5") return "M5Stack Tab5"; if (kind == "m5-dial") return "M5Stack Dial";
  return kind;
}

static void drawDevices(lv_obj_t *p) {
  JsonDocument dv = newDoc();
  if (!kept("devices", dv)) { label(p, "Your devices show here once the Tab5 is paired.", &lv_font_montserrat_28, QUIET); return; }
  label(p, "Each device hosts a daemon of its own. SEND them from the party in the game, SYNC, and choose here which goes where.",
        &lv_font_montserrat_20, QUIET, LV_PCT(100));
  carryN = 0;
  JsonArray away = dv["away"];
  // C-130: under each maker's name, and beside each device a picture of it
  static const char *const OTHER = "Other";
  for (int m = 0; m <= DEVICE_MAKER_N; m++) {
  String maker = m < DEVICE_MAKER_N ? DEVICE_MAKERS[m] : OTHER;
  bool headed = false;
  for (JsonObject d : dv["devices"].as<JsonArray>()) {
    if (makerOf(d["kind"] | "") != maker) continue;
    if (!headed) { headed = true; String head = maker; head.toUpperCase(); label(p, head, &lv_font_montserrat_20, QUIET); }
    lv_obj_t *outer = card(p);
    lv_obj_set_flex_flow(outer, LV_FLEX_FLOW_ROW);
    lv_obj_set_style_pad_column(outer, 20, 0);
    deviceSprite(outer, d["kind"] | "", 96, !(d["here"] | false));
    lv_obj_t *c = column(outer, LV_SIZE_CONTENT);
    lv_obj_set_flex_grow(c, 1);
    String id = d["id"] | "";
    label(c, kindName(d["kind"] | "") + (id == deviceId() ? "  (this one)" : "") + ((d["here"] | false) ? "" : "  (away)"), &lv_font_montserrat_28, INK);
    String said = String((d["here"] | false) ? "here, by " : "last heard ") + ((d["here"] | false) ? (const char *)(d["via"] | "") : (const char *)(d["lastSeen"] | ""));
    if (!d["battery"].isNull()) said += "   battery " + String((int)(d["battery"]["percent"] | 0)) + "%";
    label(c, said + "   " + id, &lv_font_montserrat_16, QUIET);
    JsonObject has = d["daemon"];
    label(c, has.isNull() ? "Hosts no daemon" : "Hosts " + String((const char *)(has["nickname"] | "")) + ", Lv. " + String((int)(has["level"] | 0)),
          &lv_font_montserrat_20, INK);
    lv_obj_t *r = row(c);
    long long mine = has.isNull() ? -1 : (long long)(has["personality"] | 0LL);
    for (JsonObject a : away) {
      if (carryN >= 63) break;
      long long pers = a["personality"] | 0LL;
      carries[carryN] = { id, pers };
      button(r, a["nickname"] | "", tapCarry, (void *)(long)carryN++, pers == mine);
    }
    if (away.size() && carryN < 64) { carries[carryN] = { id, -1 }; button(r, "None", tapCarry, (void *)(long)carryN++, mine < 0); }
  }
  }
}

// ---- HOME (C-139): Home Assistant, through the companion (server/src/home.ts) -- the home's name, each room a heading as
// DEVICES heads each maker, and each thing a card: its name, how it is, and what can be done to it (the server says which;
// a lock is shown, never opened). A tap answers at once (C-121): the kept view takes what it will most likely do and is
// drawn again, the thing marked "..." until the companion answers -- then it is sent NOW, never kept for later
// (netHomeAct, not netSend: a kettle started hours late is wrong). One that does not go is put back and says so on its
// card. Every word here is DRAFT.
struct HomeTap { String id, action; };
static std::vector<HomeTap> homeTaps;              // what each button on the page does, by its place here
static const int HOME_MOST = 96;                   // things drawn at most (a few objects each); the site shows the rest

static void foresee(JsonObject th, const String &action) {
  String kind = th["kind"] | "", state = th["state"] | "";
  if (action == "toggle" || action == "on" || action == "off") {
    bool now = action == "toggle" ? !(th["on"] | false) : action == "on";
    th["on"] = now; th["state"] = now ? "on" : "off";
    if (!now && kind == "light") th["detail"] = nullptr;          // its brightness goes with it
  } else if (action == "open" || action == "close") { th["state"] = action == "open" ? "opening" : "closing"; th["on"] = action == "open"; }
  else if (action == "play_pause") { bool playing = state == "playing"; th["state"] = playing ? "paused" : "playing"; th["on"] = !playing; }
}

static void tapHome(lv_event_t *e) {
  int i = (int)(long)lv_event_get_user_data(e);
  if (i < 0 || i >= (int)homeTaps.size()) return;
  HomeTap t = homeTaps[i];
  String before;
  JsonDocument h = newDoc();
  if (kept("home", h)) {
    for (JsonObject room : h["rooms"].as<JsonArray>())
      for (JsonObject th : room["things"].as<JsonArray>()) {
        if (t.id != (const char *)(th["id"] | "")) continue;
        th.remove("busy"); th.remove("failed"); th.remove("said");
        serializeJson(th, before);                   // put back if it does not go
        foresee(th, t.action);
        th["busy"] = true;
      }
    String json; serializeJson(h, json);
    keep("home", json);
  }
  drawnAt[P_HOME] = 0;
  netHomeAct(t.id, t.action, before);
}

static void homeButton(lv_obj_t *parent, const String &text, const String &id, const char *action, bool filled, int width = -1) {
  homeTaps.push_back({ id, action });
  lv_obj_t *b = button(parent, text, tapHome, (void *)(long)(homeTaps.size() - 1), filled);
  if (width > 0) lv_obj_set_width(b, width);
}

static void drawThing(lv_obj_t *p, JsonObject th) {
  String id = th["id"] | "", kind = th["kind"] | "", state = th["state"] | "";
  bool on = th["on"] | false;
  auto can = [&](const char *a) { for (JsonVariant c : th["can"].as<JsonArray>()) if (c.as<String>() == a) return true; return false; };
  lv_obj_t *c = card(p);
  lv_obj_set_flex_flow(c, LV_FLEX_FLOW_ROW);
  lv_obj_set_style_pad_column(c, 16, 0);
  lv_obj_set_flex_align(c, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
  lv_obj_t *words = column(c, LV_SIZE_CONTENT);
  lv_obj_set_flex_grow(words, 1);
  lv_obj_set_style_pad_row(words, 4, 0);
  label(words, th["name"] | "", &lv_font_montserrat_28, INK, LV_PCT(100));
  // how it is: its state where no button already says it, and its detail (80%, 21 C to 22 C, what is playing)
  bool says = state == "unavailable" || state == "unknown" || kind == "cover" || kind == "media_player" || kind == "climate" || kind == "lock";
  String line = says ? state : String(""), detail = th["detail"] | "";
  if (detail.length()) line += (line.length() ? "  -  " : "") + detail;
  if (th["busy"] | false) line += line.length() ? "   ..." : "...";
  if (line.length()) label(words, line, &lv_font_montserrat_20, QUIET, LV_PCT(100));
  if (th["failed"].is<const char *>()) label(words, th["failed"].as<const char *>(), &lv_font_montserrat_20, DAY, LV_PCT(100));
  else if (th["said"].is<const char *>()) label(words, th["said"].as<const char *>(), &lv_font_montserrat_20, QUIET);
  lv_obj_t *keys = row(c);
  lv_obj_set_width(keys, LV_SIZE_CONTENT);
  lv_obj_set_flex_flow(keys, LV_FLEX_FLOW_ROW);
  if (can("toggle")) homeButton(keys, on ? "ON" : "OFF", id, "toggle", on, 120);
  if (can("open")) homeButton(keys, "OPEN", id, "open", state == "open" || state == "opening");
  if (can("close")) homeButton(keys, "CLOSE", id, "close", state == "closed" || state == "closing");
  if (can("stop")) homeButton(keys, "STOP", id, "stop", false);
  if (can("run")) homeButton(keys, "RUN", id, "run", kind == "script" && on);
  if (can("play_pause")) homeButton(keys, state == "playing" ? LV_SYMBOL_PAUSE : LV_SYMBOL_PLAY, id, "play_pause", state == "playing");
  if (can("next")) homeButton(keys, LV_SYMBOL_NEXT, id, "next", false);
  if (can("cooler")) homeButton(keys, LV_SYMBOL_MINUS, id, "cooler", false);
  if (can("warmer")) homeButton(keys, LV_SYMBOL_PLUS, id, "warmer", false);
}

static void sentHomeAsk(const String &text) { if (text.length()) { netHomeAsk(text); drawnAt[P_HOME] = 0; } }
static void tapHomeAsk(lv_event_t *) { askText("Ask the home -- Home Assistant's assistant answers", "", false, false, sentHomeAsk); }

static void drawHome(lv_obj_t *p) {
  homeTaps.clear();
  JsonDocument h = newDoc();
  if (!kept("home", h)) {
    label(p, net.paired ? "HOME is Home Assistant, through the companion. Asking it now..." : "HOME shows here once the Tab5 is paired (SETTINGS).",
          &lv_font_montserrat_28, QUIET, LV_PCT(100));
    return;
  }
  String name = h["home"] | "";
  label(p, name.length() ? name : String("HOME"), &lv_font_montserrat_40, DAY, LV_PCT(100));
  bool ok = h["ok"] | false;
  JsonArray rooms = h["rooms"].as<JsonArray>();
  if (!ok) {                                       // not set up, or not answering: what went wrong, the rooms last seen below
    lv_obj_t *c = card(p);
    label(c, h["error"] | "Home Assistant did not answer.", &lv_font_montserrat_28, INK, LV_PCT(100));
    if (rooms.size()) label(c, "Below, as it was last seen.", &lv_font_montserrat_20, QUIET);
  } else if (!net.home && !net.away)
    label(p, "KEPT: as it was last seen. A tap goes only when the companion answers.", &lv_font_montserrat_20, QUIET, LV_PCT(100));
  String asked, answer;                            // asked in words, and the answer
  netHomeHeard(asked, answer);
  if (ok) button(p, "ASK...", tapHomeAsk);
  if (asked.length()) {
    lv_obj_t *c = card(p);
    label(c, "You asked: " + asked, &lv_font_montserrat_20, QUIET, LV_PCT(100));
    label(c, answer.length() ? answer : String("..."), &lv_font_montserrat_28, INK, LV_PCT(100));
  }
  int shown = 0, all = 0;
  for (JsonObject room : rooms) {
    JsonArray things = room["things"].as<JsonArray>();
    all += things.size();
    if (shown >= HOME_MOST || !things.size()) continue;
    String head = room["name"] | ""; head.toUpperCase();
    label(p, head, &lv_font_montserrat_20, QUIET);
    for (JsonObject th : things) { if (shown >= HOME_MOST) break; drawThing(p, th); shown++; }
  }
  if (all > shown) label(p, "And " + String(all - shown) + " more: the site shows the whole home.", &lv_font_montserrat_20, QUIET, LV_PCT(100));
  if (ok && !all) label(p, "Home Assistant has nothing HOME shows yet: its lights, switches, fans, covers, scenes, scripts, media, climate and locks.",
                        &lv_font_montserrat_20, QUIET, LV_PCT(100));
}

// ---- SETTINGS: Wi-Fi, pairing, what is kept ---------------------------------------------------------------------------
static String pickedSsid, pairServer;
static void joinWith(const String &pass) { netJoin(pickedSsid, pass); }
static void tapNetwork(lv_event_t *e) {
  pickedSsid = netNetworks[(int)(long)lv_event_get_user_data(e)];
  askText("The password for " + pickedSsid, "", true, false, joinWith);
}
static void tapScan(lv_event_t *) { netScan(); }
static void pairWithCode(const String &code) { netPair(pairServer, code); }
static void pairServerTyped(const String &s) {
  pairServer = s;
  askText("The code on the site (SETTINGS, PAIR A PHONE, Show a code)", "", false, true, pairWithCode);
}
static void tapPair(lv_event_t *) {
  askText("The companion's address on this network (the site shows it beside the code)", serverAddress(), false, false, pairServerTyped);
}
static void tapSyncNow(lv_event_t *) { netSyncNow(); }

// ---- C-96: which way up. AUTO follows the Tab5's motion sensor (once it has held a new way up for a moment); PORTRAIT
// and LANDSCAPE stay put. Kept on the Tab5. Portrait is the panel's own way up, so it is also the quicker to draw.
enum Orient { O_AUTO, O_PORTRAIT, O_LANDSCAPE };
static int orient = O_PORTRAIT;
static const char *ORIENT_NAMES[] = { "AUTO", "PORTRAIT", "LANDSCAPE" };
static void loadOrient() { Preferences p; p.begin("tab5ui", true); orient = p.getUChar("orient", O_PORTRAIT); p.end(); if (orient > 2) orient = O_PORTRAIT; }
static void saveOrient() { Preferences p; p.begin("tab5ui", false); p.putUChar("orient", orient); p.end(); }
int uiStartRotation() { loadOrient(); return orient == O_LANDSCAPE ? 1 : 0; }

// The way up the sensor says, or -1 when it cannot tell (lying flat, or between two). Which sign is which way is the
// Tab5's own and was set without one in hand: if AUTO turns the screen upside down, these four are what to swap.
static int sensedRotation() {
  if (!M5.Imu.isEnabled()) return -1;
  float ax, ay, az;
  if (!M5.Imu.getAccel(&ax, &ay, &az)) return -1;
  if (fabsf(az) > 0.8f) return -1;                                 // flat on a table: leave it as it is
  if (fabsf(ay) > fabsf(ax) + 0.3f) return ay < 0 ? 0 : 2;        // held upright: portrait
  if (fabsf(ax) > fabsf(ay) + 0.3f) return ax > 0 ? 1 : 3;        // on its side: landscape
  return -1;
}

static void buildFrame();
static void turnTo(int r) {                                        // the whole frame, built again the new way up
  if (r == displayRotation()) return;
  int at = tabs ? lv_tabview_get_tab_active(tabs) : 0;
  closeOverlay();
  lv_obj_clean(lv_screen_active());
  displayRotate(r);
  buildFrame();
  lv_tabview_set_active(tabs, at, LV_ANIM_OFF);
}
static void tapOrient(lv_event_t *e) {
  orient = (int)(long)lv_event_get_user_data(e); saveOrient();
  if (orient == O_PORTRAIT) turnTo(0); else if (orient == O_LANDSCAPE) turnTo(1);
  else { int r = sensedRotation(); if (r >= 0) turnTo(r); }
  drawnAt[P_SETTINGS] = 0;
}

// ---- C-144 (the user, 2026-10-16): LIGHT, DARK or AUTO. The Tab5 has no light or dark of its own to follow, so AUTO --
// the default -- is dark through the daemon's night, 8pm to 6am where the companion is (server/src/life.ts NIGHT_FROM
// and MORNING), by the clock its state carries; light until it has said the time. Kept on the Tab5, as the way up is.
enum Look { L_AUTO, L_LIGHT, L_DARK };
static int look = L_AUTO;
static const char *LOOK_NAMES[] = { "AUTO", "LIGHT", "DARK" };
static void loadLook() { Preferences p; p.begin("tab5ui", true); look = p.getUChar("look", L_AUTO); p.end(); if (look > 2) look = L_AUTO; }
static void saveLook() { Preferences p; p.begin("tab5ui", false); p.putUChar("look", look); p.end(); }
static bool wantDark() {
  if (look != L_AUTO) return look == L_DARK;
  struct tm t;
  return localTime(t) && (t.tm_hour >= 20 || t.tm_hour < 6);
}
static void wearLook(bool dark) {
  darkNow = dark;
  PAPER = lv_color_hex(dark ? 0x15171B : 0xF3F1EA); CARD = dark ? lv_color_hex(0x1F2227) : lv_color_white();
  INK = lv_color_hex(dark ? 0xECEAE3 : 0x1D232B); QUIET = lv_color_hex(dark ? 0x9AA0A8 : 0x6B7178);
  BAR = lv_color_hex(dark ? 0x0C0D10 : 0x1D232B); UNLIT = lv_color_hex(dark ? 0x454C47 : 0xC9D2C4);
  // LVGL's own pieces -- the keyboard, the text fields -- in the same light (its theme as the display made it)
  lv_display_t *d = lv_display_get_default();
  lv_display_set_theme(d, lv_theme_default_init(d, lv_palette_main(LV_PALETTE_BLUE), lv_palette_main(LV_PALETTE_RED), dark, LV_FONT_DEFAULT));
}
static void lookAgain() {                                          // the whole frame, built again in the other light
  bool dark = wantDark();
  if (dark == darkNow) return;
  int at = tabs ? lv_tabview_get_tab_active(tabs) : 0;
  closeOverlay();
  lv_obj_clean(lv_screen_active());
  wearLook(dark);
  buildFrame();
  lv_tabview_set_active(tabs, at, LV_ANIM_OFF);
}
static void tapLook(lv_event_t *e) {
  look = (int)(long)lv_event_get_user_data(e); saveLook();
  lookAgain();
  drawnAt[P_SETTINGS] = 0;
}

// ---- PROFILE (C-131): as the app's -- the player as the game draws them, the save's facts, the MARKS (the trainer card's
// badges) and ROOTS (each understanding's colour), each opening its words, and the NOTEBOOK by section, a page a tap.
// Everything comes from what the Tab5 keeps: profile, marks, notebook (net.cpp), and the pictures (fetchProfileArt).
static String reflowed(String t) {                // the game wraps lines to its box; a page here re-flows them
  t.replace("\n\n", "\x01"); t.replace("\n", " "); t.replace("\x01", "\n\n");
  return t;
}
static void showWords(const String &head, const String &body, const String &foot) {
  lv_obj_t *o = openOverlay();
  button(o, "BACK", closeOverlay, nullptr, false);
  label(o, head, &lv_font_montserrat_28, DAY, LV_PCT(100));
  label(o, body, &lv_font_montserrat_20, INK, LV_PCT(100));
  if (foot.length()) label(o, foot, &lv_font_montserrat_20, QUIET, LV_PCT(100));
}
// C-140 (the user, 2026-10-16): a MARK or a ROOT opened reads as a small page -- its own heading (a MARK's in ink beside its
// badge, a ROOT's in its own colour), the lesson's first line leading and the rest as points, then a small heading over
// each part of the pair as it is earned: the leader afterwards, the union PLUGIN, the insight.
static lv_obj_t *subHead(lv_obj_t *o, const String &t) { return label(o, t, &lv_font_montserrat_16, QUIET); }
static void points(lv_obj_t *o, const std::vector<String> &lines) {
  for (const String &l : lines) label(o, "-   " + l, &lv_font_montserrat_20, INK, LV_PCT(100));
}
static std::vector<String> paragraphs(JsonArray parts) {   // a lesson's scripts, re-flowed, a paragraph each
  std::vector<String> out;
  for (JsonVariant part : parts) {
    String t = reflowed(part.as<String>()) + "\n\n";
    int a = 0, b;
    while ((b = t.indexOf("\n\n", a)) >= 0) { String p = t.substring(a, b); p.trim(); if (p.length()) out.push_back(p); a = b + 2; }
  }
  return out;
}
static int rootOfMark(JsonDocument &m, int n) {           // the understanding a MARK pairs with (wisdom.root_flag)
  int f = m["marks"][n]["wisdom"]["root_flag"] | -1, k = 0;
  for (JsonObject u : m["understandings"].as<JsonArray>()) { if ((int)(u["flag"] | -2) == f) return k; k++; }
  return -1;
}
static void quote(lv_obj_t *o, const String &t) {
  lv_obj_t *q = label(o, t, &lv_font_montserrat_20, DAY, LV_PCT(100));
  lv_obj_set_style_border_side(q, LV_BORDER_SIDE_LEFT, 0); lv_obj_set_style_border_width(q, 4, 0);
  lv_obj_set_style_border_color(q, DAY, 0); lv_obj_set_style_pad_left(q, 12, 0);
}
static void tapMark(lv_event_t *e) {
  int i = (int)(long)lv_event_get_user_data(e);
  JsonDocument pr = newDoc(), m = newDoc();
  if (!kept("profile", pr) || !kept("marks", m)) return;
  lv_obj_t *o = openOverlay();
  button(o, "BACK", closeOverlay, nullptr, false);
  if (!(pr["marks"][i] | false)) { label(o, "MARK " + String(i + 1) + "  --  not yet earned.", &lv_font_montserrat_28, QUIET); return; }
  JsonObject mk = m["marks"][i];
  String title = mk["title"] | ""; title.toUpperCase();
  lv_obj_t *head = row(o);
  picture(head, "mark" + String(i + 1), 512);             // the badge, small
  label(head, title, &lv_font_montserrat_28, INK);
  std::vector<String> ps = paragraphs(mk["lesson"].as<JsonArray>());
  if (ps.size()) {                                         // its own name dropped: the heading says it
    String first = ps[0], up = first; up.toUpperCase();
    if (up.startsWith(title + ".")) { first = first.substring(title.length() + 1); first.trim(); }
    if (first.length()) label(o, first, &lv_font_montserrat_28, INK, LV_PCT(100));
    points(o, std::vector<String>(ps.begin() + 1, ps.end()));
  }
  label(o, "From the BENCHMARK in " + String((const char *)(mk["found"] | "")) + ".", &lv_font_montserrat_20, DAY, LV_PCT(100));
  JsonObject w = mk["wisdom"], got = pr["wisdom"][i];
  if (w.isNull() || got.isNull()) return;
  int r = rootOfMark(m, i);
  String leader = w["leader"] | "";
  subHead(o, (got["root"] | false) && r >= 0 ? leader + ", WITH " + String((const char *)(m["understandings"][r]["name"] | ""))
                                             : leader + ", AFTERWARDS");
  String said;
  for (JsonVariant l : ((got["root"] | false) ? w["with"] : w["without"]).as<JsonArray>()) said += l.as<String>() + " ";
  label(o, said, &lv_font_montserrat_20, INK, LV_PCT(100));
  if (got["given"] | false) {
    subHead(o, "UNION PLUGIN");
    label(o, String((const char *)(w["union_plugin"] | "")) + "  -  " + (const char *)(w["union_routine"] | ""), &lv_font_montserrat_20, INK);
    std::vector<String> ex; for (JsonVariant l : w["explain"].as<JsonArray>()) ex.push_back(l.as<String>());
    points(o, ex);
  }
  if (got["insight"] | false) {
    subHead(o, "INSIGHT  -  " + String((const char *)(w["virtue"] | "")));
    quote(o, w["insight"] | "");
  }
}
static void tapRoot(lv_event_t *e) {
  int i = (int)(long)lv_event_get_user_data(e);
  JsonDocument pr = newDoc(), m = newDoc();
  if (!kept("profile", pr) || !kept("marks", m)) return;
  lv_obj_t *o = openOverlay();
  button(o, "BACK", closeOverlay, nullptr, false);
  if (!(pr["roots"][i] | false)) { label(o, "Not yet.", &lv_font_montserrat_28, QUIET); return; }
  JsonObject u = m["understandings"][i];
  JsonArray rgb = u["rgb"].as<JsonArray>();
  lv_color_t col = rgb.size() == 3 ? lv_color_make(rgb[0] | 90, rgb[1] | 107, rgb[2] | 140) : DAY;
  label(o, u["name"] | "", &lv_font_montserrat_40, col);  // in its own colour
  std::vector<String> ps = paragraphs(u["lesson"].as<JsonArray>());   // T-405: read as a MARK's lesson is (C-140)
  if (ps.empty()) label(o, "Its lesson is still being written.", &lv_font_montserrat_20, QUIET, LV_PCT(100));
  else {
    String first = ps[0], up = first, name = u["name"] | ""; up.toUpperCase(); name.toUpperCase();
    if (up.startsWith(name + ".")) { first = first.substring(name.length() + 1); first.trim(); }
    size_t next = 1;
    if (!first.length() && ps.size() > 1) first = ps[next++];   // a box that was only its name: the next one leads
    if (first.length()) label(o, first, &lv_font_montserrat_28, INK, LV_PCT(100));
    points(o, std::vector<String>(ps.begin() + next, ps.end()));
  }
  label(o, "Arrived at: " + String((const char *)(u["found"] | "")) + ".", &lv_font_montserrat_20, DAY, LV_PCT(100));
  int n = -1;
  for (int k = 0; k < (int)m["marks"].size(); k++) if (rootOfMark(m, k) == i) n = k;
  if (n < 0 || !(pr["marks"][n] | false)) return;
  subHead(o, "PAIRED WITH");
  lv_obj_t *pm = row(o);
  picture(pm, "mark" + String(n + 1), 512);
  String t = m["marks"][n]["title"] | ""; t.toUpperCase();
  label(pm, t, &lv_font_montserrat_20, INK);
  if (pr["wisdom"][n]["insight"] | false) {
    subHead(o, "INSIGHT  -  " + String((const char *)(m["marks"][n]["wisdom"]["virtue"] | "")));
    quote(o, m["marks"][n]["wisdom"]["insight"] | "");
  }
}
// The game's QR codes, here as the code itself: the Tab5 has no browser, so a page that ends on one (a NOTEBOOK page's song
// or post, the GUIDE's last chapter) shows it large enough to scan with a phone (the user, 2026-10-16)
static void qrFor(lv_obj_t *parent, const String &url, lv_color_t dark, lv_color_t light) {
  if (!url.length()) return;
  bool song = url.indexOf("soundcloud.com") >= 0 || url.indexOf("youtu") >= 0 || url.indexOf("spotify.com") >= 0 || url.indexOf("bandcamp.com") >= 0;
  label(parent, song ? "Scan with your phone to listen." : "Scan with your phone to read.", &lv_font_montserrat_20, QUIET, LV_PCT(100));   // DRAFT
  lv_obj_t *q = lv_qrcode_create(parent);
  lv_qrcode_set_size(q, 360);
  lv_qrcode_set_dark_color(q, dark);
  lv_qrcode_set_light_color(q, light);
  lv_qrcode_update(q, url.c_str(), url.length());
  lv_obj_set_style_border_color(q, light, 0);       // the quiet zone a phone needs around it
  lv_obj_set_style_border_width(q, 16, 0);
}
// T-417: a SONGBOOK page's motif, as the game draws it -- the key's note in the key's colour, then the heads on a treble
// staff, each coloured by its pitch class (the twelve key colours, exported in notebook.json), a sharp or flat beside it.
// E4 on the bottom line, a step a line or a space, ledger lines where needed. Absolute positions in a box of its own.
static int staffStep(const String &n, int &pc, char &acc) {
  static const char *L = "CDEFGAB"; static const int PCS[] = { 0, 2, 4, 5, 7, 9, 11 };
  if (n.length() < 2) return 99;
  const char *at = strchr(L, n[0]); if (!at) return 99;
  int i = at - L, k = 1; acc = 0;
  if (n[1] == '#' || n[1] == 'b') { acc = n[1]; k = 2; }
  pc = (PCS[i] + (acc == '#' ? 1 : acc == 'b' ? 11 : 0)) % 12;
  return n.substring(k).toInt() * 7 + i - (4 * 7 + 2);
}
static lv_color_t keyColour(JsonArray colours, int pc) {
  const char *h = colours[pc] | "";
  return strlen(h) == 7 ? lv_color_hex(strtol(h + 1, nullptr, 16)) : INK;
}
static void songStaff(lv_obj_t *parent, const String &key, JsonArray notes, JsonArray colours, const char *outline = "") {
  int kpc; char kacc; staffStep(key + "4", kpc, kacc);
  lv_obj_t *kr = row(parent);
  lv_obj_t *dot = lv_obj_create(kr); lv_obj_set_size(dot, 24, 24); lv_obj_set_style_radius(dot, 12, 0);
  lv_obj_set_style_bg_color(dot, keyColour(colours, kpc), 0); lv_obj_set_style_border_width(dot, 0, 0);
  label(kr, "IN " + key, &lv_font_montserrat_20, QUIET);
  const int GAP = 20, HEAD = 24, COL = 52, LEFT = 30;
  int lo = 0, hi = 8, n = 0; std::vector<int> st, pcs; std::vector<char> accs;
  for (JsonVariant v : notes) { int pc; char a; int s = staffStep(v.as<String>(), pc, a); if (s == 99) continue;
    st.push_back(s); pcs.push_back(pc); accs.push_back(a); lo = min(lo, s); hi = max(hi, s); n++; }
  auto yOf = [&](int s) { return (hi - s) * (GAP / 2) + HEAD / 2; };
  lv_obj_t *box = lv_obj_create(parent);
  lv_obj_set_size(box, LEFT + n * COL + 16, yOf(lo) + HEAD);
  lv_obj_set_style_bg_opa(box, LV_OPA_TRANSP, 0); lv_obj_set_style_border_width(box, 0, 0); lv_obj_set_style_pad_all(box, 0, 0);
  lv_obj_remove_flag(box, LV_OBJ_FLAG_SCROLLABLE);
  auto line = [&](int x, int w, int s) { lv_obj_t *l = lv_obj_create(box); lv_obj_set_size(l, w, 2); lv_obj_set_pos(l, x, yOf(s));
    lv_obj_set_style_bg_color(l, QUIET, 0); lv_obj_set_style_border_width(l, 0, 0); lv_obj_set_style_radius(l, 0, 0); };
  for (int s = 0; s <= 8; s += 2) line(0, LEFT + n * COL + 16, s);
  for (int i = 0; i < n; i++) {
    int x = LEFT + i * COL;
    for (int s = -2; s >= st[i]; s -= 2) line(x - 8, HEAD + 16, s);
    for (int s = 10; s <= st[i]; s += 2) line(x - 8, HEAD + 16, s);
    if (accs[i]) { lv_obj_t *a = label(box, accs[i] == '#' ? "#" : "b", &lv_font_montserrat_20, QUIET); lv_obj_set_pos(a, x - 20, yOf(st[i]) - 14); }
    lv_obj_t *h = lv_obj_create(box); lv_obj_set_size(h, HEAD + 4, HEAD - 2); lv_obj_set_pos(h, x, yOf(st[i]) - HEAD / 2 + 1);
    lv_obj_set_style_radius(h, LV_RADIUS_CIRCLE, 0); lv_obj_set_style_bg_color(h, keyColour(colours, pcs[i]), 0);
    lv_obj_set_style_border_color(h, strlen(outline) == 7 ? lv_color_hex(strtol(outline + 1, nullptr, 16)) : lv_color_hex(0x1D2026), 0);
    lv_obj_set_style_border_width(h, 2, 0);
  }
}
static void tapPage(lv_event_t *e) {
  long v = (long)lv_event_get_user_data(e);
  JsonDocument nb = newDoc();
  if (!kept("notebook", nb)) return;
  JsonObject pg = nb["sections"][(int)(v >> 8)]["pages"][(int)(v & 0xFF)];
  String text = !pg["text"].isNull() ? reflowed(pg["text"].as<String>())
               : String(pg["kind"] | "") == "song" ? String("The game draws its notes in the key you played it in.")   // T-417, DRAFT
               : String("Written by the game from your save each time you open it there.");
  String place = pg["place"] | "";
  bool staff = String(pg["kind"] | "") == "song" && pg["notes"].as<JsonArray>().size();
  showWords(pg["title"] | "", staff ? String(pg["about"] | "") : text, place.length() ? "Found in " + place + "." : String(""));
  if (overlay && staff) songStaff(overlay, pg["key"] | "", pg["notes"].as<JsonArray>(), nb["keyColours"].as<JsonArray>(), nb["outline"] | "");
  if (overlay) qrFor(overlay, pg["link"] | "", lv_color_black(), lv_color_white());
}
// C-127 on the Tab5: a region as the game's region map draws it, cropped to its cells, a cell a place, lit when the save
// has visited it -- a place with no flag (a route) when it touches a lit one -- and ??? until the REVIEW BOARD. Each row is
// drawn as runs of one colour, so a map is a few dozen rectangles, not hundreds.
static void regionMap(lv_obj_t *parent, JsonObject region, JsonObject pr, int cell) {
  bool open = region["hidden_until"].isNull() || (pr["gameClear"] | false);
  std::map<String, bool> visited;
  for (JsonVariant v : pr["visited"].as<JsonArray>()) visited[v.as<String>()] = true;
  JsonObject secs = region["sections"];
  auto flagged = [&](const String &m) { return !secs[m].isNull() && !secs[m]["visited_flag"].isNull(); };
  lv_obj_t *col = column(parent, LV_SIZE_CONTENT);
  lv_obj_set_flex_align(col, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
  lv_obj_t *maps = row(col);
  for (JsonObject map : region["maps"].as<JsonArray>()) {
    JsonArray grid = map["grid"];
    int H = grid.size(), W = H ? grid[0].size() : 0, x0 = W, y0 = H, x1 = -1, y1 = -1;
    std::map<String, bool> lit;
    for (int y = 0; y < H; y++) for (int x = 0; x < W; x++) {
      String m = grid[y][x].as<String>();
      if (m == "MAPSEC_NONE") continue;
      x0 = min(x0, x); y0 = min(y0, y); x1 = max(x1, x); y1 = max(y1, y);
      if (open && flagged(m) && visited.count(m)) lit[m] = true;
    }
    if (x1 < 0) continue;
    if (open) for (int y = 0; y < H; y++) for (int x = 0; x < W; x++) {      // a route lights when it touches a lit town
      String m = grid[y][x].as<String>();
      if (m == "MAPSEC_NONE" || lit.count(m) || flagged(m)) continue;
      const int d[4][2] = { { 0, 1 }, { 1, 0 }, { 0, -1 }, { -1, 0 } };
      for (auto &k : d) {
        int nx = x + k[0], ny = y + k[1];
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        String n = grid[ny][nx].as<String>();
        if (lit.count(n) && flagged(n)) { lit[m] = true; break; }
      }
    }
    lv_obj_t *box = lv_obj_create(maps);
    lv_obj_set_size(box, (x1 - x0 + 1) * cell, (y1 - y0 + 1) * cell);
    lv_obj_set_style_bg_opa(box, LV_OPA_TRANSP, 0); lv_obj_set_style_border_width(box, 0, 0); lv_obj_set_style_pad_all(box, 0, 0);
    lv_obj_remove_flag(box, LV_OBJ_FLAG_SCROLLABLE);
    for (int y = y0; y <= y1; y++) {
      int x = x0;
      while (x <= x1) {
        String m = grid[y][x].as<String>();
        if (m == "MAPSEC_NONE") { x++; continue; }
        bool on = lit.count(m) > 0;
        int run = x;
        while (run <= x1) { String r = grid[y][run].as<String>(); if (r == "MAPSEC_NONE" || (lit.count(r) > 0) != on) break; run++; }
        lv_obj_t *r = lv_obj_create(box);
        lv_obj_set_pos(r, (x - x0) * cell, (y - y0) * cell);
        lv_obj_set_size(r, (run - x) * cell - 1, cell - 1);
        lv_obj_set_style_radius(r, 0, 0); lv_obj_set_style_border_width(r, 0, 0); lv_obj_set_style_pad_all(r, 0, 0);
        lv_obj_set_style_bg_color(r, on ? DAY : UNLIT, 0);
        lv_obj_remove_flag(r, LV_OBJ_FLAG_CLICKABLE);
        x = run;
      }
    }
  }
  label(col, open ? String((const char *)(region["name"] | "")) : String("???"), &lv_font_montserrat_20, QUIET);
}

static void tapEvents(lv_event_t *);
static void drawProfile(lv_obj_t *p) {
  JsonDocument pr = newDoc();
  if (!kept("profile", pr) || pr["name"].isNull()) { label(p, "Nothing kept yet: the PROFILE comes from your save, after a SYNC.", &lv_font_montserrat_28, QUIET, LV_PCT(100)); return; }
  bool instinct = String((const char *)(pr["choice"] | "REASON")) == "INSTINCT";
  String who = instinct ? "instinct" : "reason";
  lv_obj_t *c = card(p);
  lv_obj_t *top = row(c);
  picture(top, "player_" + who, 768);             // the trainer card's picture, 3x
  picture(top, "player_" + who + "_walk", 768);   // and as they walk
  lv_obj_t *id = column(top, LV_SIZE_CONTENT);
  label(id, pr["name"] | "", &lv_font_montserrat_48, INK);
  char no[8]; snprintf(no, sizeof no, "%05d", (int)(pr["trainerId"] | 0));
  label(id, String((const char *)(pr["edition"] | "")) + "  -  ID No. " + no, &lv_font_montserrat_20, QUIET);
  String rival = pr["rival"] | "";
  label(id, String((const char *)(pr["choice"] | "")) + (rival.length() ? "  -  rival " + rival : String("")), &lv_font_montserrat_20, INK);
  if (!pr["savedIn"].isNull()) label(id, "Last saved in " + String((const char *)(pr["savedIn"]["place"] | "")), &lv_font_montserrat_20, QUIET);
  JsonDocument rg = newDoc();                       // C-127: the two regions, filling in as they are explored
  if (kept("regions", rg)) for (JsonObject r : rg["regions"].as<JsonArray>())
    regionMap(top, r, pr.as<JsonObject>(), r["maps"].size() > 1 ? 6 : 10);
  lv_obj_t *f = card(p);
  JsonObject t = pr["playTime"];
  char pt[16]; snprintf(pt, sizeof pt, "%d:%02d", (int)(t["hours"] | 0), (int)(t["minutes"] | 0));
  String shoes = pr["shoes"].isNull() ? String("not yet") : String((const char *)pr["shoes"]) + "'s";
  label(f, String("PLAY TIME  ") + pt + "      MONEY  " + String((long)(pr["money"] | 0)) + "      SHOES  " + shoes, &lv_font_montserrat_20, INK, LV_PCT(100));
  String at;                                                 // C-151: the boards at the reels now, each by its daemon (DRAFT)
  for (JsonObject t : pr["casino"]["table"].as<JsonArray>()) at += (at.length() ? ", " : "") + String((const char *)(t["name"] | ""));
  if (at.length()) label(f, "At the CASINO now: " + at + ".", &lv_font_montserrat_20, QUIET, LV_PCT(100));
  long won = pr["casino"]["pending"] | 0L, spins = pr["casino"]["spins"] | 0L;   // C-149: the CASINO's, at the next SYNC (DRAFT)
  if (won || spins) label(f, String("The CASINO: ") + (won > 0 ? "+" + String(won) : won < 0 ? String(won) : String("even")) + " over " +
                             String(spins) + (spins == 1 ? " spin" : " spins") + ", into your save at the next SYNC (then " +
                             String((long)(pr["casino"]["balance"] | 0L)) + ").", &lv_font_montserrat_20, QUIET, LV_PCT(100));
  JsonObject ix = pr["index"];
  label(f, (ix["held"] | false) ? "INDEX  " + String((int)(ix["bound"] | 0)) + " bound - " + String((int)(ix["seen"] | 0)) + " seen" : String("INDEX  not yet held"),
        &lv_font_montserrat_20, INK);
  label(f, String("DIPLOMA  ") + ((pr["diploma"] | false) ? "earned" : "not yet") + "      OPUS  " + ((pr["opus"] | false) ? "carried" : "not carried"),
        &lv_font_montserrat_20, INK);
  // MARKS: the badges, faint until earned; a tap opens the lesson
  label(f, "MARKS  (tap one)", &lv_font_montserrat_20, QUIET);
  lv_obj_t *mr = row(f);
  JsonArray marks = pr["marks"].as<JsonArray>();
  for (int i = 0; i < 8; i++) {
    lv_obj_t *b = lv_button_create(mr);
    lv_obj_set_style_bg_opa(b, LV_OPA_TRANSP, 0); lv_obj_set_style_shadow_width(b, 0, 0); lv_obj_set_style_pad_all(b, 2, 0);
    lv_obj_t *img = picture(b, "mark" + String(i + 1), 1024);   // 16 px, 4x
    lv_obj_set_style_opa(img, (marks[i] | false) ? LV_OPA_COVER : LV_OPA_20, 0);
    lv_obj_add_event_cb(b, [](lv_event_t *) { soundSelect(); }, LV_EVENT_CLICKED, nullptr);
    lv_obj_add_event_cb(b, tapMark, LV_EVENT_CLICKED, (void *)(long)i);
  }
  // ROOTS: each understanding in its own colour, filled when held -- never a count
  JsonDocument m = newDoc(); bool haveMarks = kept("marks", m);
  label(f, "ROOTS", &lv_font_montserrat_20, QUIET);
  lv_obj_t *rr = row(f);
  JsonArray roots = pr["roots"].as<JsonArray>();
  for (int i = 0; i < (int)roots.size(); i++) {
    JsonArray rgb = haveMarks ? m["understandings"][i]["rgb"].as<JsonArray>() : JsonArray();
    lv_color_t col = rgb.size() == 3 ? lv_color_make(rgb[0] | 90, rgb[1] | 107, rgb[2] | 140) : DAY;
    lv_obj_t *dot = lv_button_create(rr);
    lv_obj_set_size(dot, 44, 44);
    lv_obj_set_style_radius(dot, LV_RADIUS_CIRCLE, 0);
    lv_obj_set_style_shadow_width(dot, 0, 0);
    lv_obj_set_style_border_width(dot, 4, 0); lv_obj_set_style_border_color(dot, col, 0);
    bool held = roots[i] | false;
    lv_obj_set_style_bg_color(dot, col, 0); lv_obj_set_style_bg_opa(dot, held ? LV_OPA_COVER : LV_OPA_TRANSP, 0);
    lv_obj_set_style_opa(dot, held ? LV_OPA_COVER : LV_OPA_50, 0);
    lv_obj_add_event_cb(dot, [](lv_event_t *) { soundSelect(); }, LV_EVENT_CLICKED, nullptr);
    lv_obj_add_event_cb(dot, tapRoot, LV_EVENT_CLICKED, (void *)(long)i);
  }
  // C-132: the groves found, each its universe; C-128: GAME EVENTS, behind a button (forty-odd rows)
  JsonDocument gv = newDoc();
  JsonArray found = pr["groves"].as<JsonArray>();
  if (found.size() && kept("groves", gv)) {
    lv_obj_t *g = card(p);
    label(g, "GROVES  -  beyond them all, " + String((const char *)(gv["nexus"] | "")), &lv_font_montserrat_20, QUIET, LV_PCT(100));
    for (JsonObject gr : gv["groves"].as<JsonArray>()) {
      bool mine = false;
      for (JsonVariant f2 : found) if (f2.as<String>() == String((const char *)(gr["grove"] | ""))) mine = true;
      if (!mine) continue;
      String sign = gr["sign"] | ""; sign.replace("\n", " ");
      label(g, gr["universe"] | "", &lv_font_montserrat_28, DAY);
      label(g, sign, &lv_font_montserrat_20, INK, LV_PCT(100));
    }
  }
  button(p, "GAME EVENTS", tapEvents, nullptr, false);
  // the NOTEBOOK: the game's sections, a page a tap; a page not yet opened in the game is marked
  lv_obj_t *n = card(p);
  label(n, "NOTEBOOK", &lv_font_montserrat_20, QUIET);
  JsonDocument nb = newDoc();
  if (!kept("notebook", nb) || !(nb["held"] | false)) { label(n, "Not carried yet.", &lv_font_montserrat_20, INK); return; }
  JsonArray secs = nb["sections"].as<JsonArray>();
  if (!secs.size()) { label(n, "Nothing filed in it yet.", &lv_font_montserrat_20, INK); return; }
  for (int s = 0; s < (int)secs.size(); s++) {
    label(n, secs[s]["name"] | "", &lv_font_montserrat_20, DAY);
    lv_obj_t *pr2 = row(n);
    JsonArray pages = secs[s]["pages"].as<JsonArray>();
    for (int k = 0; k < (int)pages.size() && k < 256; k++)
      button(pr2, String((pages[k]["unread"] | false) ? "* " : "") + (const char *)(pages[k]["title"] | ""), tapPage, (void *)(long)((s << 8) | k), false);
  }
}

// C-128 on the Tab5: GAME EVENTS in an overlay, by section -- + held and named, a row not yet held only "Still to come."
static void tapEvents(lv_event_t *) {
  JsonDocument pg = newDoc();
  if (!kept("progress", pg)) return;
  lv_obj_t *o = openOverlay();
  button(o, "BACK", closeOverlay, nullptr, false);
  label(o, "GAME EVENTS", &lv_font_montserrat_28, DAY);
  String sec;
  for (JsonObject e : pg["events"].as<JsonArray>()) {
    if (sec != String((const char *)(e["section"] | ""))) { sec = e["section"] | ""; label(o, sec, &lv_font_montserrat_20, QUIET); }
    if (e["held"].isNull()) label(o, "?  " + String((const char *)(e["name"] | "")), &lv_font_montserrat_20, QUIET, LV_PCT(100));
    else if (e["held"] | false) label(o, "+  " + String((const char *)(e["name"] | "")), &lv_font_montserrat_20, INK, LV_PCT(100));
    else label(o, ".  Still to come.", &lv_font_montserrat_20, QUIET, LV_PCT(100));
  }
}

// ---- SCHOOL (C-137, the app's C-129): the DIPLOMA, each floor's syllabus and board once stood on, and the paper to sit
// again -- marked here, never the save.
static void tapFloor(lv_event_t *e) {
  int i = (int)(long)lv_event_get_user_data(e);
  JsonDocument sc = newDoc();
  if (!kept("school", sc)) return;
  JsonObject f = sc["floors"][i];
  String body = reflowed(f["syllabus"].as<String>());
  for (JsonObject b : f["board"].as<JsonArray>()) body += "\n\n" + String((const char *)(b["topic"] | "")) + ":  " + reflowed(b["text"].as<String>());
  showWords(String((const char *)(f["floor"] | "")) + "  " + (const char *)(f["subject"] | ""), body, "");
}
static int paperAt = -1;
static std::vector<int> paperPicks;
static String letterFor(JsonDocument &sc, int mark) {
  for (JsonObject g : sc["grades"].as<JsonArray>()) if (mark >= (int)(g["from"] | 0)) return g["letter"] | "";
  return "";
}
static void showQuestion();
static void tapChoice(lv_event_t *e) { paperPicks.push_back((int)(long)lv_event_get_user_data(e)); paperAt++; showQuestion(); }
static void tapSit(lv_event_t *) { paperAt = 0; paperPicks.clear(); showQuestion(); }
static void showQuestion() {
  JsonDocument sc = newDoc();
  if (!kept("school", sc)) return;
  std::vector<JsonObject> qs; std::vector<String> secs;
  for (JsonObject s : sc["paper"].as<JsonArray>()) for (JsonObject q : s["questions"].as<JsonArray>()) { qs.push_back(q); secs.push_back(s["section"] | ""); }
  lv_obj_t *o = openOverlay();
  if (paperAt >= (int)qs.size()) {                    // marked
    int right = 0;
    for (int i = 0; i < (int)qs.size(); i++) if (paperPicks[i] == (int)(qs[i]["answer"] | -1)) right++;
    int mark = (right * 100 + (int)qs.size() / 2) / (int)qs.size();
    button(o, "BACK", closeOverlay, nullptr, false);
    label(o, String(mark) + "  " + letterFor(sc, mark), &lv_font_montserrat_48, DAY);
    label(o, mark >= (int)(sc["pass_mark"] | 80) ? "A pass." : "Not a pass, this time.", &lv_font_montserrat_28, INK);
    for (int i = 0; i < (int)qs.size(); i++) if (paperPicks[i] != (int)(qs[i]["answer"] | -1))
      label(o, secs[i] + ":  " + (const char *)(qs[i]["text"] | "") + "  --  " + (const char *)(qs[i]["choices"][(int)(qs[i]["answer"] | 0)] | ""),
            &lv_font_montserrat_20, QUIET, LV_PCT(100));
    button(o, "SIT IT AGAIN", tapSit);
    return;
  }
  JsonObject q = qs[paperAt];
  label(o, secs[paperAt] + "  -  " + String(paperAt + 1) + " of " + String((int)qs.size()), &lv_font_montserrat_20, QUIET);
  label(o, q["text"] | "", &lv_font_montserrat_28, INK, LV_PCT(100));
  int k = 0;
  for (JsonVariant c : q["choices"].as<JsonArray>()) {
    lv_obj_t *b = button(o, String("ABCD"[k]) + "   " + c.as<String>(), tapChoice, (void *)(long)k, false);
    lv_obj_set_width(b, LV_PCT(100));
    k++;
  }
  button(o, "STOP", closeOverlay, nullptr, false);
}
// C-145: THE LIBRARY -- CALLOW SCHOOL, and THE PROGRAMMER'S GUIDE TO THE HUMAN MIND once the save holds it: its 8-bit cover
// (the book cut out of the game's 240x160 screen, x 54..185, at whole pixels) and its CONTENTS, a chapter a tap, read on
// the book's own charcoal pages with BACK, CONTENTS and NEXT. Nothing of the GUIDE shows before it is found (T-297).
static lv_color_t BOOK_BOARDS = lv_color_hex(0x161618), BOOK_PAGE = lv_color_hex(0x282A2E), BOOK_EDGE = lv_color_hex(0x3E4046),
                  BOOK_INK = lv_color_hex(0xE6EAEE), BOOK_FAINT = lv_color_hex(0x78808A), BOOK_CYAN = lv_color_hex(0x00C8FF);
static lv_obj_t *guideCover(lv_obj_t *parent, int k) {
  lv_obj_t *box = lv_obj_create(parent);
  lv_obj_set_size(box, 132 * k, 160 * k);
  lv_obj_set_style_bg_color(box, BOOK_BOARDS, 0); lv_obj_set_style_border_width(box, 0, 0); lv_obj_set_style_pad_all(box, 0, 0);
  lv_obj_set_style_radius(box, 0, 0);
  lv_obj_remove_flag(box, LV_OBJ_FLAG_SCROLLABLE); lv_obj_remove_flag(box, LV_OBJ_FLAG_CLICKABLE);
  if (lv_image_dsc_t *dsc = artDsc("guide_cover_named")) {
    lv_obj_t *img = lv_image_create(box);
    lv_image_set_src(img, dsc);
    lv_image_set_antialias(img, false);
    lv_image_set_pivot(img, 0, 0);
    lv_image_set_scale(img, 256 * k);
    lv_obj_set_pos(img, -54 * k, 0);
  }
  return box;
}
static int guideAt = -1;                           // the chapter open, counted through every part; -1 the CONTENTS
static void showGuide();
static void tapGuideAt(lv_event_t *e) { guideAt = (int)(long)lv_event_get_user_data(e); showGuide(); }
static lv_obj_t *bookLink(lv_obj_t *parent, const String &text, int to, bool on = true) {
  lv_obj_t *b = lv_button_create(parent);
  lv_obj_set_style_bg_opa(b, LV_OPA_TRANSP, 0); lv_obj_set_style_shadow_width(b, 0, 0); lv_obj_set_style_pad_all(b, 10, 0);
  lv_obj_t *t = lv_label_create(b);
  lv_label_set_text(t, text.c_str());
  lv_obj_set_style_text_font(t, &lv_font_montserrat_20, 0);
  lv_obj_set_style_text_color(t, on ? BOOK_CYAN : BOOK_EDGE, 0);
  if (on) lv_obj_add_event_cb(b, tapGuideAt, LV_EVENT_CLICKED, (void *)(long)to);
  return b;
}
static void showGuide() {
  JsonDocument g = newDoc();
  if (!kept("guide", g) || !(g["held"] | false)) return;
  JsonObject sec, ent; int total = 0;
  for (JsonObject s : g["sections"].as<JsonArray>())
    for (JsonObject e : s["entries"].as<JsonArray>()) { if (total == guideAt) { sec = s; ent = e; } total++; }
  lv_obj_t *o = openOverlay();
  lv_obj_set_style_bg_color(o, BOOK_BOARDS, 0);
  button(o, "CLOSE", closeOverlay, nullptr, false);
  lv_obj_t *pg = column(o, LV_PCT(100));
  lv_obj_set_style_bg_color(pg, BOOK_PAGE, 0); lv_obj_set_style_bg_opa(pg, LV_OPA_COVER, 0);
  lv_obj_set_style_border_color(pg, BOOK_EDGE, 0); lv_obj_set_style_border_width(pg, 1, 0);
  lv_obj_set_style_pad_all(pg, 24, 0); lv_obj_set_style_pad_row(pg, 14, 0);
  if (ent.isNull()) {                              // the cover, then CONTENTS
    guideAt = -1;
    lv_obj_move_to_index(guideCover(o, 3), 1);
    label(pg, "CONTENTS", &lv_font_montserrat_20, BOOK_CYAN);
    int n = 0;
    for (JsonObject s : g["sections"].as<JsonArray>()) {
      label(pg, s["label"] | "", &lv_font_montserrat_16, BOOK_FAINT);
      label(pg, s["heading"] | "", &lv_font_montserrat_28, BOOK_INK, LV_PCT(100));
      for (JsonObject e : s["entries"].as<JsonArray>()) bookLink(pg, String((const char *)(e["short"] | "")) + "   >", n++);
    }
    return;
  }
  String lab = sec["label"] | "", head = sec["heading"] | ""; head.toUpperCase();
  label(pg, lab == head ? lab : lab + "  -  " + head, &lv_font_montserrat_16, BOOK_FAINT, LV_PCT(100));
  label(pg, ent["title"] | "", &lv_font_montserrat_40, BOOK_INK, LV_PCT(100));
  for (JsonVariant para : ent["paragraphs"].as<JsonArray>()) label(pg, para.as<String>(), &lv_font_montserrat_28, BOOK_INK, LV_PCT(100));
  qrFor(pg, ent["link"] | "", BOOK_PAGE, BOOK_INK);   // the book ends on its code, light on the dark page, as in the game
  lv_obj_t *nav = row(pg);
  bookLink(nav, "< BACK", guideAt - 1, guideAt > 0);
  bookLink(nav, "CONTENTS", -1);
  bookLink(nav, "NEXT >", guideAt + 1, guideAt < total - 1);
  label(pg, String(guideAt + 1) + " / " + String(total), &lv_font_montserrat_16, BOOK_FAINT);
}

static void drawLibrary(lv_obj_t *p) {
  JsonDocument gd = newDoc();
  if (kept("guide", gd) && (gd["held"] | false)) {
    lv_obj_t *gc = card(p);
    lv_obj_t *r = row(gc);
    guideCover(r, 1);
    lv_obj_t *t = column(r, 460);
    label(t, "THE GUIDE", &lv_font_montserrat_20, QUIET);
    label(t, gd["title"] | "", &lv_font_montserrat_28, INK, LV_PCT(100));
    button(t, "READ", tapGuideAt, (void *)(long)-1);
  }
  JsonDocument pg = newDoc(), sc = newDoc(), pr = newDoc();
  if (!kept("progress", pg) || !kept("school", sc)) { label(p, "Nothing kept yet: CALLOW SCHOOL comes from your save, after a SYNC.", &lv_font_montserrat_28, QUIET, LV_PCT(100)); return; }
  kept("profile", pr);
  JsonObject s = pg["school"];
  lv_obj_t *c = card(p);
  label(c, "CALLOW SCHOOL", &lv_font_montserrat_20, QUIET);
  if (s["diploma"] | false) {
    label(c, "DIPLOMA", &lv_font_montserrat_28, DAY);
    label(c, "This is to certify that " + String((const char *)(pr["name"] | "you")) + " sat the paper, all seven parts, and passed it.",
          &lv_font_montserrat_20, INK, LV_PCT(100));
    if (!s["best"].isNull()) label(c, "MARK " + String((int)(s["best"] | 0)) + "  " + String((const char *)(s["grade"] | "")), &lv_font_montserrat_28, INK);
  } else if ((int)(s["attempts"] | 0) > 0) {
    label(c, "The paper sat " + String((int)(s["attempts"] | 0)) + " time(s); best " + String((int)(s["best"] | 0)) + ". " +
             String((int)(s["passMark"] | 80)) + " passes.", &lv_font_montserrat_20, INK, LV_PCT(100));
  } else label(c, "No DIPLOMA yet.", &lv_font_montserrat_20, INK);
  lv_obj_t *f = card(p);
  label(f, (s["textbook"] | false) ? "THE TEXTBOOK" : "THE FLOORS", &lv_font_montserrat_20, QUIET);
  lv_obj_t *fr = row(f);
  JsonArray floors = sc["floors"].as<JsonArray>();
  for (int i = 0; i < (int)floors.size(); i++) {
    String name = String((const char *)(floors[i]["floor"] | "")) + "  " + (const char *)(floors[i]["subject"] | "");
    if (s["floors"][i] | false) button(fr, name, tapFloor, (void *)(long)i, false);
    else label(fr, name + "  (not yet)", &lv_font_montserrat_20, QUIET);
  }
  lv_obj_t *pc = card(p);
  label(pc, "THE PAPER, TO SIT AGAIN  -  marked here; your save is never touched.", &lv_font_montserrat_20, QUIET, LV_PCT(100));
  button(pc, "SIT THE PAPER", tapSit);
}

static void drawSettings(lv_obj_t *p) {
  lv_obj_t *o = card(p);                           // C-96
  label(o, "THIS SCREEN", &lv_font_montserrat_20, QUIET);
  lv_obj_t *ro = row(o);
  for (int i = 0; i < 3; i++) button(ro, ORIENT_NAMES[i], tapOrient, (void *)(long)i, i == orient);
  label(o, orient == O_AUTO ? (M5.Imu.isEnabled() ? "Turns with the Tab5." : "This Tab5's motion sensor did not answer, so AUTO stays as it is.")
                            : "Stays this way up.", &lv_font_montserrat_16, QUIET, LV_PCT(100));
  lv_obj_t *lr = row(o);                           // C-144
  for (int i = 0; i < 3; i++) button(lr, LOOK_NAMES[i], tapLook, (void *)(long)i, i == look);
  label(o, look == L_AUTO ? "Dark through the daemon's night, 8pm to 6am, by the companion's clock."   // DRAFT
                          : look == L_DARK ? "Stays dark." : "Stays light.", &lv_font_montserrat_16, QUIET, LV_PCT(100));
  lv_obj_t *w = card(p);
  label(w, "WI-FI", &lv_font_montserrat_20, QUIET);
  label(w, net.wifi ? "Joined " + net.network : "Not on a network", &lv_font_montserrat_28, INK);
  button(w, "LOOK FOR NETWORKS", tapScan, nullptr, false);
  lv_obj_t *r = row(w);
  for (int i = 0; i < netNetworkCount; i++) button(r, netNetworks[i], tapNetwork, (void *)(long)i, false);
  lv_obj_t *c = card(p);
  label(c, "THE COMPANION", &lv_font_montserrat_20, QUIET);
  label(c, net.paired ? "Paired with " + serverAddress() : "Not paired yet", &lv_font_montserrat_28, INK);
  label(c, relayAddress().length() ? "Away from home, through " + relayAddress() : "No relay yet: it reaches the companion only at home.",
        &lv_font_montserrat_16, QUIET, LV_PCT(100));
  button(c, net.paired ? "PAIR AGAIN" : "PAIR THIS TAB5", tapPair);
  lv_obj_t *k = card(p);
  label(k, "KEPT ON THIS TAB5", &lv_font_montserrat_20, QUIET);
  String at = keptAt();
  label(k, at.length() ? "Everything, as of " + at : "Nothing yet", &lv_font_montserrat_20, INK);
  int waiting = outboxCount();
  if (waiting) label(k, String(waiting) + " change" + (waiting == 1 ? "" : "s") + " waiting to be sent", &lv_font_montserrat_20, DAY);
  button(k, "DOWNLOAD EVERYTHING AGAIN", tapSyncNow, nullptr, false);
  label(k, "This Tab5 is " + deviceId() + ", build " + COMPANION_BUILD, &lv_font_montserrat_16, QUIET);   // C-91
  if (net.message.length()) label(p, net.message, &lv_font_montserrat_28, DAY, LV_PCT(100));
}

// ---- the frame: a status bar and the tabs down the side --------------------------------------------------------------
typedef void (*Draw)(lv_obj_t *);
static const Draw DRAW[] = { drawToday, drawGoals, drawDaemon, drawIndex, drawDevices, drawHome, drawProfile, drawLibrary, drawSettings };
static_assert(sizeof DRAW / sizeof *DRAW == P_COUNT, "a way to draw every page");

static void takeDayColour() {
  // C-90: the colour every device wears -- the palette the user chose, in this Tab5's own state -- else the site's
  JsonDocument t = newDoc();
  const char *hex = nullptr;
  JsonDocument st = newDoc();
  if (kept("state", st)) hex = st["day"]["menu"] | (const char *)nullptr;
  if (!hex) { if (!kept("today", t)) return; hex = t["day"]["colour"] | "#315A62"; }
  uint32_t v = strtoul(hex + 1, nullptr, 16);
  if (v == dayHex) return;
  dayHex = v; DAY = lv_color_hex(v);
  lv_obj_t *bar = lv_tabview_get_tab_bar(tabs);
  lv_obj_set_style_bg_color(bar, DAY, 0);
  for (int i = 0; i < P_COUNT; i++) drawnAt[i] = 0;
}

static void redraw(int i) {
  int32_t y = lv_obj_get_scroll_y(pages[i]);       // C-96: drawn again where it was, not back at the top
  lv_obj_clean(pages[i]);
  lv_obj_set_flex_flow(pages[i], LV_FLEX_FLOW_COLUMN);
  DRAW[i](pages[i]);
  if (y > 0) { lv_obj_update_layout(pages[i]); lv_obj_scroll_to_y(pages[i], y, LV_ANIM_OFF); }
  drawnAt[i] = 1;                                  // drawn; 0 means "draw me"
}

static void tabChanged(lv_event_t *) { drawnAt[lv_tabview_get_tab_active(tabs)] = 0; soundSelect(); }   // C-94

void uiBegin() { loadLook(); wearLook(wantDark()); buildFrame(); }   // C-144: in its light from the first frame

static String barLeft, barRight;                   // C-96: what the status bar says, so it is set only when it changes
static void buildFrame() {
  barLeft = barRight = "";
  for (int i = 0; i < P_COUNT; i++) drawnAt[i] = 0;
  lv_obj_t *scr = lv_screen_active();
  lv_obj_set_style_bg_color(scr, PAPER, 0);
  lv_obj_t *bar = lv_obj_create(scr);
  lv_obj_set_size(bar, LV_PCT(100), 48);
  lv_obj_set_style_bg_color(bar, BAR, 0);
  lv_obj_set_style_radius(bar, 0, 0); lv_obj_set_style_border_width(bar, 0, 0);
  lv_obj_set_style_pad_hor(bar, 18, 0); lv_obj_set_style_pad_ver(bar, 0, 0);
  lv_obj_remove_flag(bar, LV_OBJ_FLAG_SCROLLABLE);
  statusLeft = label(bar, "DAEMONS  companion", &lv_font_montserrat_20, lv_color_white());
  lv_obj_align(statusLeft, LV_ALIGN_LEFT_MID, 0, 0);
  statusRight = label(bar, "", &lv_font_montserrat_20, lv_color_white());
  lv_obj_align(statusRight, LV_ALIGN_RIGHT_MID, 0, 0);
  tabs = lv_tabview_create(scr);
  bool portrait = displayPortrait();               // C-96: the tabs along the foot in portrait, down the side in landscape
  lv_tabview_set_tab_bar_position(tabs, portrait ? LV_DIR_BOTTOM : LV_DIR_LEFT);
  lv_tabview_set_tab_bar_size(tabs, portrait ? 84 : 190);
  lv_obj_set_size(tabs, LV_PCT(100), M5.Display.height() - 48);
  lv_obj_align(tabs, LV_ALIGN_BOTTOM_MID, 0, 0);
  lv_obj_set_style_bg_color(tabs, PAPER, 0);
  lv_obj_t *tb = lv_tabview_get_tab_bar(tabs);
  lv_obj_set_style_bg_color(tb, DAY, 0);
  lv_obj_set_style_text_color(tb, lv_color_white(), 0);
  // in portrait each name has a ninth of the width: a name that would touch its edges takes the whole bar down a size
  const lv_font_t *tabFont = portrait ? &lv_font_montserrat_16 : &lv_font_montserrat_20;
  if (portrait) {
    int32_t room = M5.Display.width() / P_COUNT - 8;
    for (int i = 0; i < P_COUNT; i++) {
      lv_point_t sz; lv_text_get_size(&sz, TAB_NAMES[i], tabFont, 0, 0, LV_COORD_MAX, LV_TEXT_FLAG_NONE);
      if (sz.x > room) { tabFont = &lv_font_montserrat_14; break; }
    }
  }
  lv_obj_set_style_text_font(tb, tabFont, 0);
  for (int i = 0; i < P_COUNT; i++) {
    pages[i] = lv_tabview_add_tab(tabs, TAB_NAMES[i]);
    lv_obj_set_style_pad_all(pages[i], 24, 0);
    lv_obj_set_style_pad_row(pages[i], 14, 0);
  }
  for (uint32_t i = 0; i < lv_obj_get_child_count(tb); i++)   // the theme's button padding would take the room back
    lv_obj_set_style_pad_hor(lv_obj_get_child(tb, i), 2, 0);
  lv_obj_add_event_cb(tabs, tabChanged, LV_EVENT_VALUE_CHANGED, nullptr);
  dayHex = 0; takeDayColour();
}

static String todayLine;
void uiLoop() {
  static uint32_t imuAt = 0, heldSince = 0; static int heldWay = -1;   // C-96: AUTO, once a new way up has held 0.8 s
  if (orient == O_AUTO && !overlay && millis() - imuAt > 150) {
    imuAt = millis();
    M5.Imu.update();
    int r = sensedRotation();
    if (r != heldWay) { heldWay = r; heldSince = millis(); }
    else if (r >= 0 && r != displayRotation() && millis() - heldSince > 800) turnTo(r);
  }
  static uint32_t seenChange = 0, barAt = 0, artWas = 0;
  if (seenChange != keptChanged) {
    seenChange = keptChanged;
    uint32_t what = keptMask.exchange(0);
    for (int i = 0; i < P_COUNT; i++) if (what & NEEDS[i]) drawnAt[i] = 0;
    takeDayColour();
    JsonDocument t = newDoc();
    todayLine = kept("today", t) ? "     " + String((const char *)(t["day"]["day"] | "")) + "  -  " + (const char *)(t["day"]["cue"] | "") : "";
    soundFromState();                                    // C-94: the volume and the day's key, as the state says
    if (net.artTotal && net.artDone == net.artTotal && artWas != (uint32_t)net.artTotal) { artWas = net.artTotal; resetArt(); }
  }
  int at = lv_tabview_get_tab_active(tabs);
  netHomeWatch(at == P_HOME);                        // C-139: HOME is downloaded while it is the page on the screen
  if (!overlay && !drawnAt[at]) redraw(at);
  if (listenLabel) {                                 // C-99: LISTEN, MAKING..., HUSH, and back when the voice ends
    if (netVoice == V_SPEAKING && !soundVoicePlaying()) netHush();
    String now = listenWord(), said = net.message;
    if (strcmp(lv_label_get_text(listenLabel), now.c_str())) lv_label_set_text(listenLabel, now.c_str());
    if (said != voiceSaidWas) { voiceSaidWas = said; lv_label_set_text(voiceSaid, said.c_str()); }
  }
  if (millis() - barAt > 1000) {
    barAt = millis();
    String left = "DAEMONS  companion" + todayLine;   // read when what is kept changes, not from flash every second
    if (left != barLeft) { barLeft = left; lv_label_set_text(statusLeft, left.c_str()); }
    String right = net.syncing ? "syncing...   " : "";
    int waiting = outboxCount();
    if (waiting) right += String(waiting) + " waiting   ";
    right += !net.wifi ? "NO WI-FI" : !net.paired ? "NOT PAIRED" : net.home ? "HOME" : net.away ? "AWAY" : "KEPT";
    int bat = M5.Power.getBatteryLevel();
    if (bat >= 0) right += "   " + String(bat) + "%";
    if (right != barRight) { barRight = right; lv_label_set_text(statusRight, right.c_str()); }
    if (at == P_SETTINGS && !overlay) { static String said; if (said != net.message) { said = net.message; drawnAt[P_SETTINGS] = 0; } }
    if (look == L_AUTO && !overlay) lookAgain();   // C-144: at 8pm and 6am, or once the companion has said the time
    if (at == P_HOME && !overlay) { static int live = -1; int now = net.home || net.away; if (now != live) { live = now; drawnAt[P_HOME] = 0; } }   // C-139: KEPT, or not
  }
}

// ---- checking a screen from the computer (ui.h): what the handhelds answer, so a Tab5 page can be seen without a camera
#include <mbedtls/base64.h>
static void shotOut() {
  lv_refr_now(nullptr);                            // what it shows now, not before the line that asked
  int w = M5.Display.width(), h = M5.Display.height();
  Serial.printf("SHOT %d %d 16\n", w, h);
  static uint16_t px[1280];
  static uint8_t bytes[1280 * 2];
  static unsigned char out[1280 * 2 * 4 / 3 + 8];
  for (int y = 0; y < h; y++) {
    M5.Display.readRect(0, y, w, 1, px);
    for (int x = 0; x < w; x++) { bytes[2 * x] = px[x] >> 8; bytes[2 * x + 1] = px[x] & 0xFF; }
    size_t n = 0;
    mbedtls_base64_encode(out, sizeof out, &n, bytes, w * 2);
    out[n] = 0;
    Serial.println((const char *)out);
  }
  Serial.println("SHOT END");
}
void uiCommand(const String &line) {
  if (line == "SHOT") { shotOut(); return; }
  if (line.startsWith("GO ")) {
    String want = line.substring(3); want.trim(); want.toUpperCase();
    for (int i = 0; i < P_COUNT; i++)
      if (want == TAB_NAMES[i]) { closeOverlay(); lv_tabview_set_active(tabs, i, LV_ANIM_OFF); lv_obj_send_event(tabs, LV_EVENT_VALUE_CHANGED, nullptr); Serial.println("GO " + want); return; }
    Serial.println("GO? " + want);
    return;
  }
  if (line.startsWith("TAP ")) {
    int sp = line.indexOf(' ', 4);
    lv_point_t p = { (int32_t)line.substring(4, sp).toInt(), (int32_t)line.substring(sp + 1).toInt() };
    lv_obj_t *o = overlay ? lv_indev_search_obj(overlay, &p) : nullptr;
    if (!o) o = lv_indev_search_obj(lv_screen_active(), &p);
    while (o && !lv_obj_has_flag(o, LV_OBJ_FLAG_CLICKABLE)) o = lv_obj_get_parent(o);
    if (!o) { Serial.println("TAP nothing"); return; }
    lv_obj_send_event(o, LV_EVENT_PRESSED, nullptr);
    lv_obj_send_event(o, LV_EVENT_RELEASED, nullptr);
    lv_obj_send_event(o, LV_EVENT_CLICKED, nullptr);
    Serial.printf("TAP %d %d\n", (int)p.x, (int)p.y);
    return;
  }
  if (line.startsWith("SCROLL ")) {
    lv_obj_t *o = overlay ? overlay : pages[lv_tabview_get_tab_active(tabs)];
    lv_obj_scroll_by(o, 0, -line.substring(7).toInt(), LV_ANIM_OFF);
    Serial.println("SCROLL");
    return;
  }
}
