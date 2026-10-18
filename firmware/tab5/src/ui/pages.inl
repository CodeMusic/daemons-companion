// Part of ui.cpp (C-157): SETTINGS' page, and the pages as C-156 arranged them: TODAY, DAEMON's segments, PLACES, the LIBRARY's shelf, SONGBOOK, STREAM. Included by ui.cpp in order -- not a file of its own: it
// shares ui.cpp's statics and may use anything the parts before it declare.
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
  label(w, net.wifi ? "Joined " + netNetworkName() : "Not on a network", &lv_font_montserrat_28, INK);
  button(w, "LOOK FOR NETWORKS", tapScan, nullptr, false);
  lv_obj_t *r = row(w);
  int near = netNetworksNear(shownNetworks);         // C-157: a copy, taken under the network task's lock
  for (int i = 0; i < near; i++) button(r, shownNetworks[i], tapNetwork, (void *)(long)i, false);
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
  if (netMessage().length()) label(p, netMessage(), &lv_font_montserrat_28, DAY, LV_PCT(100));
}

// ---- C-156: the pages rearranged ---------------------------------------------------------------------------------------
static void goTab(lv_event_t *e) {
  int i = (int)(long)lv_event_get_user_data(e);
  closeOverlay(); lv_tabview_set_active(tabs, i, LV_ANIM_OFF); lv_obj_send_event(tabs, LV_EVENT_VALUE_CHANGED, nullptr);
}
// TODAY: the day and the one thing, then a glance at each place, each opening it (every word DRAFT)
static void drawToday(lv_obj_t *p) {
  drawTodayDay(p);
  JsonDocument st = newDoc(), pr = newDoc(), nb = newDoc(), b = newDoc(), acts = newDoc();
  if (kept("state", st) && !st["daemon"].isNull()) {
    lv_obj_t *c = card(p), *r = row(c);
    picture(r, "p" + String((int)(st["daemon"]["slot"] | 0)), 384);
    lv_obj_t *t = column(r, 420);
    label(t, "YOUR DAEMON", &lv_font_montserrat_16, QUIET);
    label(t, String((const char *)(st["daemon"]["nickname"] | "")), &lv_font_montserrat_28, INK);
    button(t, "CARE", goTab, (void *)(long)P_DAEMON, false);
  }
  if (kept("broadcasts", b)) {
    kept("acts", acts);
    String line;
    for (JsonObject c : b["items"].as<JsonArray>()) if (!(c["mine"] | false)) line = castLine(c, acts);
    if (line.length()) { lv_obj_t *c = card(p); label(c, "NEARBY", &lv_font_montserrat_16, QUIET); label(c, line, &lv_font_montserrat_28, INK, LV_PCT(100)); }
  }
  if (kept("profile", pr)) {
    lv_obj_t *c = card(p);
    label(c, "YOUR GAME", &lv_font_montserrat_16, QUIET);
    int marks = 0; for (JsonVariant m : pr["marks"].as<JsonArray>()) marks += m.as<bool>() ? 1 : 0;
    String saved = pr["savedIn"].isNull() ? String("Saved") : "Saved in " + String((const char *)(pr["savedIn"]["place"] | ""));
    label(c, saved + "  -  " + String(marks) + " MARKS  -  " + String((long)(pr["money"] | 0L)), &lv_font_montserrat_28, INK, LV_PCT(100));
    long won = pr["casino"]["pending"] | 0L;
    if (won) label(c, "The CASINO: " + String(won > 0 ? "+" : "") + String(won) + " at the next SYNC.", &lv_font_montserrat_20, QUIET, LV_PCT(100));
    button(c, "OPEN", goTab, (void *)(long)P_YOU, false);
  }
  if (kept("notebook", nb)) {
    int unread = 0, songs = 0;
    for (JsonObject sec : nb["sections"].as<JsonArray>())
      for (JsonObject pg : sec["pages"].as<JsonArray>()) { if (pg["unread"] | false) unread++; if (String((const char *)(pg["kind"] | "")) == "song") songs++; }
    if (unread || songs) {
      lv_obj_t *c = card(p);
      label(c, "IN THE LIBRARY", &lv_font_montserrat_16, QUIET);
      String l = unread ? String(unread) + " NOTEBOOK page" + (unread == 1 ? "" : "s") + " not yet read" : String("");
      if (songs) l += String(l.length() ? "  -  " : "") + String(songs) + " song" + (songs == 1 ? "" : "s") + " in the SONGBOOK";
      label(c, l, &lv_font_montserrat_28, INK, LV_PCT(100));
      button(c, "OPEN", goTab, (void *)(long)P_LIBRARY, false);
    }
  }
}
// DAEMON: Yours (its den, care, the party, SYNC, NEARBY), the INDEX, the Routines (THE CASINO)
static int daemonSeg = 0;
static void tapDaemonSeg(lv_event_t *e) { daemonSeg = (int)(long)lv_event_get_user_data(e); drawnAt[P_DAEMON] = 0; }
static void drawDaemonPage(lv_obj_t *p) {
  lv_obj_t *r = row(p);
  static const char *SEGS[] = { "YOURS", "INDEX", "ROUTINES" };
  for (int i = 0; i < 3; i++) button(r, SEGS[i], tapDaemonSeg, (void *)(long)i, i == daemonSeg);
  if (daemonSeg == 1) { drawIndex(p); return; }
  if (daemonSeg == 2) {
    lv_obj_t *c = card(p);
    label(c, "ROUTINES", &lv_font_montserrat_20, QUIET);
    lv_obj_t *rr = row(c);
    button(rr, "THE CASINO", tapCasino);
    button(rr, "THE HOUSE", tapHouse, nullptr, false);   // C-158
    return;
  }
  drawDaemon(p);
}
// PLACES: the boards and the home together
static void drawPlaces(lv_obj_t *p) { drawDevices(p); drawHome(p); }
// the LIBRARY's SONGBOOK: each learned song opens its staff, and PLAY plays it on the speaker (frames, 60 a second)
static void tapSong(lv_event_t *e) {
  long v = (long)lv_event_get_user_data(e);
  JsonDocument nb = newDoc();
  if (!kept("notebook", nb)) return;
  JsonObject pg = nb["sections"][(int)(v >> 8)]["pages"][(int)(v & 0xFF)];
  int midi[14], ms[14], n = 0;
  JsonArray notes = pg["notes"].as<JsonArray>(), frames = pg["frames"].as<JsonArray>();
  for (int i = 0; i < (int)notes.size() && n < 14; i++) {
    int pc; char acc; int step = staffStep(notes[i].as<String>(), pc, acc);
    if (step == 99) continue;
    String nn = notes[i].as<String>(); int oct = nn.substring(acc ? 2 : 1).toInt();
    midi[n] = 12 * (oct + 1) + pc - (acc == 'b' && pc == 11 ? 12 : 0) + (acc == '#' && pc == 0 ? 12 : 0);
    int f = frames.size() > (size_t)i ? (int)(frames[i] | 15) : (i == (int)notes.size() - 1 ? 40 : 15);
    ms[n] = f * 1000 / 60; n++;
  }
  soundSong(midi, ms, n);
}
static void songbookCard(lv_obj_t *p) {
  JsonDocument nb = newDoc();
  lv_obj_t *c = card(p);
  label(c, "SONGBOOK", &lv_font_montserrat_20, QUIET);
  if (!kept("notebook", nb)) return;
  JsonArray secs = nb["sections"].as<JsonArray>();
  int found = 0;
  for (int s = 0; s < (int)secs.size(); s++) {
    if (String((const char *)(secs[s]["name"] | "")) != "SONGBOOK") continue;
    JsonArray pages = secs[s]["pages"].as<JsonArray>();
    for (int k = 0; k < (int)pages.size() && k < 256; k++) {
      if (!pages[k]["notes"].as<JsonArray>().size()) continue;
      lv_obj_t *r = row(c);
      button(r, pages[k]["title"] | "", tapPage, (void *)(long)((s << 8) | k), false);
      button(r, "PLAY", tapSong, (void *)(long)((s << 8) | k));
      found++;
    }
  }
  if (!found) label(c, "The songs you learn in the game are kept here, to see and to hear.", &lv_font_montserrat_20, INK, LV_PCT(100));
}
// the LIBRARY's STREAM: every lesson a MARK or a ROOT has opened, each on its own page
static void streamCard(lv_obj_t *p) {
  JsonDocument pr = newDoc(), m = newDoc();
  lv_obj_t *c = card(p);
  label(c, "STREAM", &lv_font_montserrat_20, QUIET);
  if (!kept("profile", pr) || !kept("marks", m)) return;
  lv_obj_t *r = row(c); int found = 0;
  JsonArray marks = m["marks"].as<JsonArray>(), us = m["understandings"].as<JsonArray>();
  for (int i = 0; i < (int)marks.size(); i++)
    if ((pr["marks"][i] | false) && marks[i]["lesson"].as<JsonArray>().size()) { String t = marks[i]["title"] | ""; t.toUpperCase(); button(r, t, tapMark, (void *)(long)i, false); found++; }
  for (int i = 0; i < (int)us.size(); i++)
    if ((pr["roots"][i] | false) && us[i]["lesson"].as<JsonArray>().size()) { button(r, us[i]["name"] | "", tapRoot, (void *)(long)i, false); found++; }
  if (!found) label(c, "Each MARK and each ROOT opens a lesson; they are kept here.", &lv_font_montserrat_20, INK, LV_PCT(100));
}
static void drawLibraryShelf(lv_obj_t *p) { drawLibrary(p); notebookCard(p); songbookCard(p); streamCard(p); }

