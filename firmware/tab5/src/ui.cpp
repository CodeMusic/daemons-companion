// C-77: the control center's screens. Each page is drawn from what the Tab5 keeps (store.h) and drawn again when that
// changes (net.cpp bumps keptChanged); a tap that changes something goes through netSend(), which sends it now or keeps
// it until the companion answers. Every word here is DRAFT.
#include <M5Unified.h>
#include <lvgl.h>
#include <map>
#include <set>
#include <vector>
#include <esp_heap_caps.h>
#include "ui.h"
#include "net.h"
#include "store.h"
#include "sound.h"
#include "display.h"
#include "den.h"
#include "../../common/slots.h"                    // C-157: THE CASINO's table, the handhelds' too
#include <Preferences.h>

// ---- the pages, each in its part (C-157: ui.cpp split by sections, included in order, one translation unit) --
#include "ui/kit.inl"
#include "ui/today.inl"
#include "ui/daemon.inl"
#include "ui/index.inl"
#include "ui/places.inl"
#include "ui/settings.inl"
#include "ui/you.inl"
#include "ui/library.inl"
#include "ui/pages.inl"
// ---- the frame: a status bar and the tabs down the side --------------------------------------------------------------
typedef void (*Draw)(lv_obj_t *);
static const Draw DRAW[] = { drawToday, drawDaemonPage, drawGoals, drawLibraryShelf, drawProfile, drawPlaces, drawSettings };
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
static int artStale = 0;                           // 1: pictures changed (reset when no overlay is open); 2: all, now
void uiLoop() {
  casinoTick60();                                   // C-155
  watchLook();                                      // C-158, C-160: THE HOUSE, a device's own settings
  newsLook();                                       // C-154
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
    bool allArt = net.artTotal && net.artDone == net.artTotal && artWas != (uint32_t)net.artTotal;
    if (allArt) { artWas = net.artTotal; artStale = 2; }      // every picture anew (pairing): now, the overlay with it
    else if (what & K_ART) artStale = artStale ? artStale : 1; // one picture anew (a mood's shade): once no overlay is open
  }
  // the review, 2026-10-18: nothing may still show a picture when its decoded copy is freed -- every page emptied and drawn
  // again first -- and a picture fetched anew is shown, not the one decoded before it
  if (artStale == 2 || (artStale == 1 && !overlay)) {
    artStale = 0;
    closeOverlay();
    for (int i = 0; i < P_COUNT; i++) { lv_obj_clean(pages[i]); drawnAt[i] = 0; }
    resetArt();
  }
  int at = lv_tabview_get_tab_active(tabs);
  netHomeWatch(at == P_PLACES);                        // C-139: HOME is downloaded while it is the page on the screen
  if (!overlay && !drawnAt[at]) redraw(at);
  if (listenLabel) {                                 // C-99: LISTEN, MAKING..., HUSH, and back when the voice ends
    if (netVoice == V_SPEAKING && !soundVoicePlaying()) netHush();
    String now = listenWord(), said = netMessage();
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
    if (at == P_SETTINGS && !overlay) { static String said; if (said != netMessage()) { said = netMessage(); drawnAt[P_SETTINGS] = 0; } }
    if (look == L_AUTO && !overlay) lookAgain();   // C-144: at 8pm and 6am, or once the companion has said the time
    if (at == P_PLACES && !overlay) { static int live = -1; int now = net.home || net.away; if (now != live) { live = now; drawnAt[P_PLACES] = 0; } }   // C-139: KEPT, or not
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
    Serial.print('R'); Serial.print(y); Serial.print(' ');   // numbered: a log line from the network's task can split one,
    Serial.println((const char *)out);                       // and it is asked again (printf would cut a line this long)
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
