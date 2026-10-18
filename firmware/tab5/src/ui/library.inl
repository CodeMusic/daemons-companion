// Part of ui.cpp (C-157): the LIBRARY: CALLOW SCHOOL, THE GUIDE. Included by ui.cpp in order -- not a file of its own: it
// shares ui.cpp's statics and may use anything the parts before it declare.
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

