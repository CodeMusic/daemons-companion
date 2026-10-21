// Part of ui.cpp (C-157): SETTINGS' pieces: Wi-Fi and pairing, which way up, LIGHT/DARK/AUTO. Included by ui.cpp in order -- not a file of its own: it
// shares ui.cpp's statics and may use anything the parts before it declare.
// ---- SETTINGS: Wi-Fi, pairing, what is kept ---------------------------------------------------------------------------
static String pickedSsid, pairServer, shownNetworks[16];   // shownNetworks: the scan as SETTINGS drew it
static void joinWith(const String &pass) { netJoin(pickedSsid, pass); }
static void tapNetwork(lv_event_t *e) {
  pickedSsid = shownNetworks[(int)(long)lv_event_get_user_data(e)];
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
static void tapSyncNow(lv_event_t *) { netDownloadAll(); }

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

