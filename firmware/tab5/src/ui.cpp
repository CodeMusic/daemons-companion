// C-77: the control center's screens. Each page is drawn from what the Tab5 keeps (store.h) and drawn again when that
// changes (net.cpp bumps keptChanged); a tap that changes something goes through netSend(), which sends it now or keeps
// it until the companion answers. Every word here is DRAFT.
#include <M5Unified.h>
#include <lvgl.h>
#include <map>
#include <esp_heap_caps.h>
#include "ui.h"
#include "net.h"
#include "store.h"

// ---- the look: paper, ink, and the day's colour (the app's, from /api/today) ------------------------------------------
static lv_color_t PAPER = lv_color_hex(0xF3F1EA), INK = lv_color_hex(0x1D232B), QUIET = lv_color_hex(0x6B7178);
static lv_color_t DAY = lv_color_hex(0x315A62);
static uint32_t dayHex = 0x315A62;

static lv_obj_t *tabs, *pages[6], *statusLeft, *statusRight, *overlay = nullptr;
enum { P_TODAY, P_GOALS, P_DAEMON, P_INDEX, P_DEVICES, P_SETTINGS };
static const char *TAB_NAMES[] = { "TODAY", "GOALS", "DAEMON", "INDEX", "DEVICES", "SETTINGS" };
static uint32_t drawnAt[6] = { 0 };                  // the keptChanged each page was last drawn at
static int indexPage = 0, goalAt = 0;

static lv_obj_t *label(lv_obj_t *parent, const String &text, const lv_font_t *font = &lv_font_montserrat_20,
                       lv_color_t colour = INK, int width = -1) {
  lv_obj_t *l = lv_label_create(parent);
  lv_label_set_text(l, text.c_str());
  lv_obj_set_style_text_font(l, font, 0);
  lv_obj_set_style_text_color(l, colour, 0);
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
  lv_obj_set_style_bg_color(c, lv_color_white(), 0);
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
  lv_obj_set_style_bg_color(b, filled ? DAY : lv_color_white(), 0);
  lv_obj_set_style_border_color(b, DAY, 0);
  lv_obj_set_style_border_width(b, filled ? 0 : 2, 0);
  lv_obj_set_style_shadow_width(b, 0, 0);
  lv_obj_set_style_pad_hor(b, 22, 0); lv_obj_set_style_pad_ver(b, 14, 0);
  lv_obj_t *l = label(b, text, &lv_font_montserrat_20, filled ? lv_color_white() : DAY);
  lv_obj_center(l);
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
static lv_obj_t *picture(lv_obj_t *parent, const String &key, int scale) {
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
  lv_obj_t *box = lv_obj_create(parent);
  lv_obj_set_size(box, 64 * scale / 256 + 8, 64 * scale / 256 + 8);
  lv_obj_set_style_bg_opa(box, LV_OPA_TRANSP, 0); lv_obj_set_style_border_width(box, 0, 0); lv_obj_set_style_pad_all(box, 0, 0);
  lv_obj_remove_flag(box, LV_OBJ_FLAG_SCROLLABLE);
  if (dsc) {
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
static void closeOverlay(lv_event_t * = nullptr) { if (overlay) { lv_obj_delete(overlay); overlay = nullptr; } }
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
  netSend("POST", "/api/steps/" + String(id) + "/done", "{}");
}

static void drawToday(lv_obj_t *p) {
  JsonDocument t = newDoc();
  if (!kept("today", t)) { label(p, "Nothing kept yet. Join a network and pair in SETTINGS.", &lv_font_montserrat_28, QUIET, 900); return; }
  JsonObject day = t["day"];
  label(p, String((const char *)(day["theme"] | "")).length() ? String((const char *)day["theme"]) : String((const char *)(day["day"] | "")),
        &lv_font_montserrat_48, DAY);
  label(p, String((const char *)(day["day"] | "")) + "  " + (const char *)(t["date"] | ""), &lv_font_montserrat_20, QUIET);
  label(p, day["cue"] | "", &lv_font_montserrat_28, INK);
  label(p, String((const char *)(day["chakra"] | "")) + "  -  " + (const char *)(day["note"] | "") + "  -  " + (const char *)(t["season"] | ""),
        &lv_font_montserrat_20, QUIET);
  lv_obj_t *c = card(p, 900);
  JsonObject next = t["next"];
  if (next.isNull() || next["step"].isNull()) {
    label(c, "Nothing to do yet. Set a goal on GOALS.", &lv_font_montserrat_28, INK, 840);
    return;
  }
  label(c, String((const char *)(next["goal"] | "")) + "  >  " + (const char *)(next["milestone"]["title"] | "") +
           "  (" + String((int)(next["milestone"]["at"] | 0)) + " of " + String((int)(next["milestone"]["of"] | 0)) + ")",
        &lv_font_montserrat_20, QUIET, 840);
  label(c, next["step"]["text"] | "", &lv_font_montserrat_40, INK, 840);
  button(c, "DONE", tapDone, (void *)(long)(next["step"]["id"] | 0));
}

// ---- GOALS ------------------------------------------------------------------------------------------------------------
static void tapGoal(lv_event_t *e) { goalAt = (int)(long)lv_event_get_user_data(e); drawnAt[P_GOALS] = 0; }
static void tapStep(lv_event_t *e) {
  long v = (long)lv_event_get_user_data(e);              // the step's id, negative when it is done (a tap undoes it)
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
    lv_obj_t *c = card(p, 1000);
    label(c, sub["title"] | "", &lv_font_montserrat_28, (sub["done"] | false) ? QUIET : INK);
    for (JsonObject st : sub["steps"].as<JsonArray>()) {
      bool done = st["done"] | false;
      long id = st["id"] | 0;
      lv_obj_t *b = button(c, String(done ? LV_SYMBOL_OK "  " : "      ") + (const char *)(st["text"] | ""), tapStep, (void *)(done ? -id : id), false);
      lv_obj_set_width(b, 940);
      if (done) lv_obj_set_style_opa(b, LV_OPA_60, 0);
    }
  }
}

// ---- DAEMON -----------------------------------------------------------------------------------------------------------
static void tapSyncGame(lv_event_t *) { netGameSync(); }

static void drawDaemon(lv_obj_t *p) {
  lv_obj_set_flex_flow(p, LV_FLEX_FLOW_ROW);
  lv_obj_t *left = column(p, 520), *right = column(p, 520);
  JsonDocument st = newDoc();
  JsonObject d;
  if (kept("state", st)) d = st["daemon"];
  if (!d.isNull()) {
    lv_obj_t *c = card(left, 500);
    picture(c, "p" + String((int)(d["slot"] | 0)), 256 * 5);
    label(c, d["nickname"] | "", &lv_font_montserrat_40, INK);
    label(c, "Lv. " + String((int)(d["level"] | 0)) + "   " + (const char *)(d["category"] | ""), &lv_font_montserrat_20, QUIET);
    String types; for (JsonVariant t : d["types"].as<JsonArray>()) types += (types.length() ? " / " : "") + String((const char *)t);
    label(c, types, &lv_font_montserrat_20, DAY);
    label(c, d["entry"] | "", &lv_font_montserrat_20, INK, 460);
  } else {
    label(left, "This Tab5 carries no daemon. SEND one from the party in the game, SYNC, and choose it on DEVICES.",
          &lv_font_montserrat_28, QUIET, 500);
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
  label(right, "Close the game first: SYNC writes the save.", &lv_font_montserrat_16, QUIET, 500);
  if (net.message.length()) label(right, net.message, &lv_font_montserrat_20, DAY, 500);
}

// ---- INDEX ------------------------------------------------------------------------------------------------------------
static const int PER_PAGE = 18;
static void tapIndexPage(lv_event_t *e) { indexPage += (int)(long)lv_event_get_user_data(e); drawnAt[P_INDEX] = 0; }

static void tapEntry(lv_event_t *e) {
  int at = (int)(long)lv_event_get_user_data(e);
  JsonDocument ix = newDoc();
  if (!kept("index", ix)) return;
  JsonObject en = ix["entries"][at];
  lv_obj_t *o = openOverlay();
  lv_obj_set_flex_flow(o, LV_FLEX_FLOW_ROW);
  lv_obj_t *left = column(o, 420), *right = column(o, 700);
  picture(left, "s" + String((int)(en["species"] | 0)), 256 * 6);
  label(right, "No. " + String((int)(en["national"] | 0)) + "   " + (const char *)(en["name"] | ""), &lv_font_montserrat_40, INK);
  String types; for (JsonVariant t : en["types"].as<JsonArray>()) types += (types.length() ? " / " : "") + String((const char *)t);
  label(right, String((const char *)(en["category"] | "")) + "   " + types, &lv_font_montserrat_20, DAY);
  String text = en["entry"] | ""; text.replace("\n", " ");
  label(right, text, &lv_font_montserrat_28, INK, 680);
  button(right, "CLOSE", closeOverlay, nullptr, false);
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
    lv_obj_set_style_bg_color(cell, lv_color_white(), 0);
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
static String kindName(const String &kind) {
  if (kind == "t-embed-cc1101") return "T-Embed CC1101"; if (kind == "t-embed") return "T-Embed"; if (kind == "t-embed-si4732") return "T-Embed SI4732";
  if (kind == "t-watch-s3") return "T-Watch S3"; if (kind == "m5-sticks3") return "M5StickS3"; if (kind == "m5-cores3") return "M5Stack CoreS3";
  if (kind == "m5-fire") return "M5Stack Fire"; if (kind == "m5go") return "M5GO"; if (kind == "m5-tab5") return "M5Stack Tab5";
  return kind;
}

static void drawDevices(lv_obj_t *p) {
  JsonDocument dv = newDoc();
  if (!kept("devices", dv)) { label(p, "Your devices show here once the Tab5 is paired.", &lv_font_montserrat_28, QUIET); return; }
  label(p, "Each device carries a daemon of its own. SEND them from the party in the game, SYNC, and choose here which goes where.",
        &lv_font_montserrat_20, QUIET, 1000);
  carryN = 0;
  JsonArray away = dv["away"];
  for (JsonObject d : dv["devices"].as<JsonArray>()) {
    lv_obj_t *c = card(p, 1000);
    String id = d["id"] | "";
    label(c, kindName(d["kind"] | "") + (id == deviceId() ? "  (this one)" : "") + ((d["here"] | false) ? "" : "  (away)"), &lv_font_montserrat_28, INK);
    String said = String((d["here"] | false) ? "here, by " : "last heard ") + ((d["here"] | false) ? (const char *)(d["via"] | "") : (const char *)(d["lastSeen"] | ""));
    if (!d["battery"].isNull()) said += "   battery " + String((int)(d["battery"]["percent"] | 0)) + "%";
    label(c, said + "   " + id, &lv_font_montserrat_16, QUIET);
    JsonObject has = d["daemon"];
    label(c, has.isNull() ? "Carries no daemon" : "Carries " + String((const char *)(has["nickname"] | "")) + ", Lv. " + String((int)(has["level"] | 0)),
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

static void drawSettings(lv_obj_t *p) {
  lv_obj_t *w = card(p, 1000);
  label(w, "WI-FI", &lv_font_montserrat_20, QUIET);
  label(w, net.wifi ? "Joined " + net.network : "Not on a network", &lv_font_montserrat_28, INK);
  button(w, "LOOK FOR NETWORKS", tapScan, nullptr, false);
  lv_obj_t *r = row(w);
  for (int i = 0; i < netNetworkCount; i++) button(r, netNetworks[i], tapNetwork, (void *)(long)i, false);
  lv_obj_t *c = card(p, 1000);
  label(c, "THE COMPANION", &lv_font_montserrat_20, QUIET);
  label(c, net.paired ? "Paired with " + serverAddress() : "Not paired yet", &lv_font_montserrat_28, INK);
  label(c, relayAddress().length() ? "Away from home, through " + relayAddress() : "No relay yet: it reaches the companion only at home.",
        &lv_font_montserrat_16, QUIET, 940);
  button(c, net.paired ? "PAIR AGAIN" : "PAIR THIS TAB5", tapPair);
  lv_obj_t *k = card(p, 1000);
  label(k, "KEPT ON THIS TAB5", &lv_font_montserrat_20, QUIET);
  String at = keptAt();
  label(k, at.length() ? "Everything, as of " + at : "Nothing yet", &lv_font_montserrat_20, INK);
  int waiting = outboxCount();
  if (waiting) label(k, String(waiting) + " change" + (waiting == 1 ? "" : "s") + " waiting to be sent", &lv_font_montserrat_20, DAY);
  button(k, "DOWNLOAD EVERYTHING AGAIN", tapSyncNow, nullptr, false);
  label(k, "This Tab5 is " + deviceId(), &lv_font_montserrat_16, QUIET);
  if (net.message.length()) label(p, net.message, &lv_font_montserrat_28, DAY, 1000);
}

// ---- the frame: a status bar and the tabs down the side --------------------------------------------------------------
typedef void (*Draw)(lv_obj_t *);
static const Draw DRAW[] = { drawToday, drawGoals, drawDaemon, drawIndex, drawDevices, drawSettings };

static void takeDayColour() {
  JsonDocument t = newDoc();
  if (!kept("today", t)) return;
  const char *hex = t["day"]["colour"] | "#315A62";
  uint32_t v = strtoul(hex + 1, nullptr, 16);
  if (v == dayHex) return;
  dayHex = v; DAY = lv_color_hex(v);
  lv_obj_t *bar = lv_tabview_get_tab_bar(tabs);
  lv_obj_set_style_bg_color(bar, DAY, 0);
  for (int i = 0; i < 6; i++) drawnAt[i] = 0;
}

static void redraw(int i) {
  lv_obj_clean(pages[i]);
  lv_obj_set_flex_flow(pages[i], LV_FLEX_FLOW_COLUMN);
  DRAW[i](pages[i]);
  drawnAt[i] = keptChanged + 1;                    // +1: never 0, which means "draw me"
}

static void tabChanged(lv_event_t *) { drawnAt[lv_tabview_get_tab_active(tabs)] = 0; }

void uiBegin() {
  lv_obj_t *scr = lv_screen_active();
  lv_obj_set_style_bg_color(scr, PAPER, 0);
  lv_obj_t *bar = lv_obj_create(scr);
  lv_obj_set_size(bar, LV_PCT(100), 48);
  lv_obj_set_style_bg_color(bar, INK, 0);
  lv_obj_set_style_radius(bar, 0, 0); lv_obj_set_style_border_width(bar, 0, 0);
  lv_obj_set_style_pad_hor(bar, 18, 0); lv_obj_set_style_pad_ver(bar, 0, 0);
  lv_obj_remove_flag(bar, LV_OBJ_FLAG_SCROLLABLE);
  statusLeft = label(bar, "DAEMONS  companion", &lv_font_montserrat_20, lv_color_white());
  lv_obj_align(statusLeft, LV_ALIGN_LEFT_MID, 0, 0);
  statusRight = label(bar, "", &lv_font_montserrat_20, lv_color_white());
  lv_obj_align(statusRight, LV_ALIGN_RIGHT_MID, 0, 0);
  tabs = lv_tabview_create(scr);
  lv_tabview_set_tab_bar_position(tabs, LV_DIR_LEFT);
  lv_tabview_set_tab_bar_size(tabs, 190);
  lv_obj_set_size(tabs, LV_PCT(100), M5.Display.height() - 48);
  lv_obj_align(tabs, LV_ALIGN_BOTTOM_MID, 0, 0);
  lv_obj_set_style_bg_color(tabs, PAPER, 0);
  lv_obj_t *tb = lv_tabview_get_tab_bar(tabs);
  lv_obj_set_style_bg_color(tb, DAY, 0);
  lv_obj_set_style_text_color(tb, lv_color_white(), 0);
  lv_obj_set_style_text_font(tb, &lv_font_montserrat_20, 0);
  for (int i = 0; i < 6; i++) {
    pages[i] = lv_tabview_add_tab(tabs, TAB_NAMES[i]);
    lv_obj_set_style_pad_all(pages[i], 24, 0);
    lv_obj_set_style_pad_row(pages[i], 14, 0);
  }
  lv_obj_add_event_cb(tabs, tabChanged, LV_EVENT_VALUE_CHANGED, nullptr);
  takeDayColour();
}

void uiLoop() {
  static uint32_t seenChange = 0, barAt = 0, artWas = 0;
  if (seenChange != keptChanged) {
    seenChange = keptChanged;
    takeDayColour();
    if (net.artTotal && net.artDone == net.artTotal && artWas != (uint32_t)net.artTotal) { artWas = net.artTotal; resetArt(); }
  }
  int at = lv_tabview_get_tab_active(tabs);
  if (!overlay && drawnAt[at] != keptChanged + 1) redraw(at);
  if (millis() - barAt > 1000) {
    barAt = millis();
    JsonDocument t = newDoc();
    String left = "DAEMONS  companion";
    if (kept("today", t)) left += "     " + String((const char *)(t["day"]["day"] | "")) + "  -  " + (const char *)(t["day"]["cue"] | "");
    lv_label_set_text(statusLeft, left.c_str());
    String right = net.syncing ? "syncing...   " : "";
    int waiting = outboxCount();
    if (waiting) right += String(waiting) + " waiting   ";
    right += !net.wifi ? "NO WI-FI" : !net.paired ? "NOT PAIRED" : net.home ? "HOME" : net.away ? "AWAY" : "KEPT";
    int bat = M5.Power.getBatteryLevel();
    if (bat >= 0) right += "   " + String(bat) + "%";
    lv_label_set_text(statusRight, right.c_str());
    if (at == P_SETTINGS && !overlay) { static String said; if (said != net.message) { said = net.message; drawnAt[P_SETTINGS] = 0; } }
  }
}
