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
  if (lv_image_dsc_t *dsc = artDsc("guide_cover_plain")) {
    lv_obj_t *img = lv_image_create(box);
    lv_image_set_src(img, dsc);
    lv_image_set_antialias(img, false);
    lv_image_set_pivot(img, 0, 0);
    lv_image_set_scale(img, 256 * k);
    lv_obj_set_pos(img, -54 * k, 0);
  }
  // the art carries no lettering (the game's font is Nintendo's): the title and author, set here in the Tab5's own type --
  // two small lines, the last two words large, above the cyan rules; the author at the foot (large covers only)
  JsonDocument gd = newDoc();
  if (k >= 2 && kept("guide", gd)) {
    String title = (const char *)(gd["title"] | ""), author = (const char *)(gd["author"] | "");
    int sp2 = title.lastIndexOf(' '), sp1 = sp2 > 0 ? title.lastIndexOf(' ', sp2 - 1) : -1;
    String big = sp1 >= 0 ? title.substring(sp1 + 1) : title, rest = sp1 >= 0 ? title.substring(0, sp1) : String("");
    int cut = -1, best = 999;                        // the small lines split as evenly as the words allow
    for (int i = rest.indexOf(' '); i > 0; i = rest.indexOf(' ', i + 1))
      if (abs((int)(i - (rest.length() - i - 1))) < best) { best = abs((int)(i - (rest.length() - i - 1))); cut = i; }
    auto put = [&](const String &t, const lv_font_t *f, int y) {
      if (!t.length()) return;
      lv_obj_t *l = lv_label_create(box); lv_label_set_text(l, t.c_str());
      lv_obj_set_style_text_font(l, f, 0); lv_obj_set_style_text_color(l, lv_color_hex(0xF3F4F6), 0);
      lv_obj_align(l, LV_ALIGN_TOP_MID, 0, y);
    };
    put(cut > 0 ? rest.substring(0, cut) : rest, &lv_font_montserrat_20, 4 * k);
    put(cut > 0 ? rest.substring(cut + 1) : String(""), &lv_font_montserrat_20, 4 * k + 24);
    put(big, &lv_font_montserrat_40, 4 * k + 54);
    put(author, &lv_font_montserrat_20, 148 * k);    // clear of the art (the user, 2026-10-19)
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

// ---- T-423: THE SUBTLE LAYER, a trainer's handbook, once the save holds it (GET /api/subtle, kept as "subtle"; its
// pictures kept as subtle_<picture>_<frame>) -- an open book in its own purples, as the app reads it: the cover (its title
// set here in the Tab5's own type: the art carries no game font), the contents, then each page with its picture on the
// left and its words on the right, a turning picture a frame every 0.7 s, TWO VOICES' asking voice faint. Every word DRAFT.
// C-238: THE HERMETIC LAYER, the third book, is read the same way, in the tablet's emerald on the breathing purple, its
// green words (an inscription: a spell, to be said) in emerald -- the one these pages draw is whichever was opened (`hermOpen`)
struct BookLook { lv_color_t boards, page, edge, ink, faint, accent; const char *kept, *art, *title; };
static const BookLook SUBTLE_LOOK = { lv_color_hex(0x1B0F1F), lv_color_hex(0x2C1C32), lv_color_hex(0x4A3352), lv_color_hex(0xF0E6F2),
                                      lv_color_hex(0x9A86A0), lv_color_hex(0xE07AD0), "subtle", "subtle_", "THE SUBTLE LAYER" };
static const BookLook HERMETIC_LOOK = { lv_color_hex(0x140B1C), lv_color_hex(0x231530), lv_color_hex(0x3F2A52), lv_color_hex(0xEDE6F2),
                                        lv_color_hex(0x9886A6), lv_color_hex(0x50C878), "hermetic", "hermetic_", "THE HERMETIC LAYER" };
static const BookLook *bookOpen = &SUBTLE_LOOK;
#define SUB_BOARDS (bookOpen->boards)
#define SUB_PAGE (bookOpen->page)
#define SUB_EDGE (bookOpen->edge)
#define SUB_INK (bookOpen->ink)
#define SUB_FAINT (bookOpen->faint)
#define SUB_PINK (bookOpen->accent)
static int subtleAt = -1, subtleFrames = 1, subtleFrame = 0;
static lv_obj_t *subtleImg = nullptr;
static String subtlePic;
static lv_timer_t *subtleTimer = nullptr;
static void showSubtle();
static void tapSubtleAt(lv_event_t *e) { subtleAt = (int)(long)lv_event_get_user_data(e); showSubtle(); }
static void openSubtle(lv_event_t *e) { bookOpen = &SUBTLE_LOOK; tapSubtleAt(e); }
static void openHermetic(lv_event_t *e) { bookOpen = &HERMETIC_LOOK; tapSubtleAt(e); }
static void subtleClosing() { subtleImg = nullptr; if (subtleTimer) { lv_timer_delete(subtleTimer); subtleTimer = nullptr; } }
static void subtleTurn(lv_timer_t *) {
  if (!subtleImg || subtleFrames < 2) return;
  subtleFrame = (subtleFrame + 1) % subtleFrames;
  if (lv_image_dsc_t *d = artDsc(bookOpen->art + subtlePic + "_" + String(subtleFrame))) lv_image_set_src(subtleImg, d);
}
static lv_obj_t *subtleLink(lv_obj_t *parent, const String &text, int to, bool on = true) {
  lv_obj_t *b = lv_button_create(parent);
  lv_obj_set_style_bg_opa(b, LV_OPA_TRANSP, 0); lv_obj_set_style_shadow_width(b, 0, 0); lv_obj_set_style_pad_all(b, 10, 0);
  lv_obj_t *t = lv_label_create(b); lv_label_set_text(t, text.c_str());
  lv_obj_set_style_text_font(t, &lv_font_montserrat_20, 0); lv_obj_set_style_text_color(t, on ? SUB_PINK : SUB_EDGE, 0);
  if (on) lv_obj_add_event_cb(b, tapSubtleAt, LV_EVENT_CLICKED, (void *)(long)to);
  return b;
}
static lv_obj_t *subtleCover(lv_obj_t *parent, int k, JsonDocument &b, const BookLook *look = nullptr) {
  const BookLook *was = bookOpen; if (look) bookOpen = look;
  lv_obj_t *box = lv_obj_create(parent);
  lv_obj_set_size(box, 132 * k, 160 * k);
  lv_obj_set_style_bg_color(box, SUB_BOARDS, 0); lv_obj_set_style_border_width(box, 0, 0); lv_obj_set_style_pad_all(box, 0, 0);
  lv_obj_set_style_radius(box, 0, 0); lv_obj_remove_flag(box, LV_OBJ_FLAG_SCROLLABLE); lv_obj_remove_flag(box, LV_OBJ_FLAG_CLICKABLE);
  if (lv_image_dsc_t *dsc = artDsc(String(bookOpen->art) + "cover")) {
    lv_obj_t *img = lv_image_create(box); lv_image_set_src(img, dsc); lv_image_set_antialias(img, false);
    lv_image_set_pivot(img, 0, 0); lv_image_set_scale(img, 256 * k); lv_obj_set_pos(img, -54 * k, 0);
  }
  if (k >= 2) {
    lv_obj_t *t = lv_label_create(box); lv_label_set_text(t, b["title"] | bookOpen->title);
    lv_obj_set_style_text_font(t, &lv_font_montserrat_28, 0); lv_obj_set_style_text_color(t, SUB_INK, 0); lv_obj_align(t, LV_ALIGN_TOP_MID, 0, 11 * k);   // below the border (the user, 2026-10-19)
    lv_obj_t *u = lv_label_create(box); lv_label_set_text(u, b["subtitle"] | "");
    lv_obj_set_style_text_font(u, &lv_font_montserrat_20, 0); lv_obj_set_style_text_color(u, SUB_FAINT, 0); lv_obj_align(u, LV_ALIGN_TOP_MID, 0, 24 * k);
  } else if (!artDsc(String(bookOpen->art) + "cover")) {          // no cover drawn yet (the third book's): its title, small
    lv_obj_t *t = lv_label_create(box); lv_label_set_text(t, b["title"] | bookOpen->title); lv_obj_set_width(t, 120 * k);
    lv_label_set_long_mode(t, LV_LABEL_LONG_WRAP); lv_obj_set_style_text_align(t, LV_TEXT_ALIGN_CENTER, 0);
    lv_obj_set_style_text_font(t, &lv_font_montserrat_16, 0); lv_obj_set_style_text_color(t, SUB_PINK, 0); lv_obj_center(t);
  }
  bookOpen = was;
  return box;
}
static void showSubtle() {
  JsonDocument b = newDoc();
  if (!kept(bookOpen->kept, b) || !(b["held"] | false)) return;
  JsonObject sec, ent; int total = 0;
  for (JsonObject s : b["sections"].as<JsonArray>())
    for (JsonObject e : s["entries"].as<JsonArray>()) { if (total == subtleAt) { sec = s; ent = e; } total++; }
  lv_obj_t *o = openOverlay();
  overlayClosing = subtleClosing;
  lv_obj_set_style_bg_color(o, SUB_BOARDS, 0);
  button(o, "CLOSE", closeOverlay, nullptr, false);
  lv_obj_t *pg = column(o, LV_PCT(100));
  lv_obj_set_style_bg_color(pg, SUB_PAGE, 0); lv_obj_set_style_bg_opa(pg, LV_OPA_COVER, 0);
  lv_obj_set_style_border_color(pg, SUB_EDGE, 0); lv_obj_set_style_border_width(pg, 1, 0);
  lv_obj_set_style_pad_all(pg, 24, 0); lv_obj_set_style_pad_row(pg, 14, 0);
  if (ent.isNull()) {                              // the cover, then CONTENTS
    subtleAt = -1;
    lv_obj_move_to_index(subtleCover(o, 3, b), 1);
    label(pg, "CONTENTS", &lv_font_montserrat_20, SUB_PINK);
    int n = 0;
    for (JsonObject s : b["sections"].as<JsonArray>()) {
      label(pg, s["label"] | "", &lv_font_montserrat_16, SUB_FAINT);
      label(pg, s["heading"] | "", &lv_font_montserrat_28, SUB_INK, LV_PCT(100));
      lv_obj_t *r = row(pg);
      for (JsonObject e : s["entries"].as<JsonArray>()) subtleLink(r, e["short"] | "", n++);
    }
    return;
  }
  String head = String((const char *)(sec["label"] | ""));
  String h2 = String((const char *)(sec["heading"] | "")); h2.toUpperCase();
  label(pg, head == h2 ? head : head + "  -  " + h2, &lv_font_montserrat_16, SUB_FAINT, LV_PCT(100));
  lv_obj_t *spread = row(pg);                      // the left page, the picture; the right, the words
  lv_obj_set_flex_align(spread, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START);
  lv_obj_t *left = lv_obj_create(spread); lv_obj_remove_style_all(left); lv_obj_set_size(left, 196, 176);
  lv_obj_set_style_bg_color(left, SUB_BOARDS, 0); lv_obj_set_style_bg_opa(left, LV_OPA_COVER, 0);
  lv_obj_remove_flag(left, LV_OBJ_FLAG_SCROLLABLE);
  subtlePic = String((const char *)(ent["picture"] | "")); subtleFrames = max(1, (int)(ent["frames"] | 1)); subtleFrame = 0;
  subtleImg = nullptr;
  if (lv_image_dsc_t *d = artDsc(bookOpen->art + subtlePic + "_0")) {
    subtleImg = lv_image_create(left); lv_image_set_src(subtleImg, d); lv_image_set_antialias(subtleImg, false);
    lv_image_set_pivot(subtleImg, 0, 0); lv_image_set_scale(subtleImg, 512); lv_obj_set_pos(subtleImg, 4, 4);
  }
  lv_obj_t *right = column(spread, 400);
  label(right, ent["title"] | "", &lv_font_montserrat_28, SUB_INK, LV_PCT(100));
  for (JsonObject para : ent["paragraphs"].as<JsonArray>()) {
    bool asking = String((const char *)(para["voice"] | "")) == "asking", spell = para["inscription"] | false;
    label(right, para["text"] | "", spell ? &lv_font_montserrat_28 : &lv_font_montserrat_20, spell ? SUB_PINK : asking ? SUB_FAINT : SUB_INK, LV_PCT(100));
  }
  if (strlen(ent["caption"] | "")) label(pg, ent["caption"] | "", &lv_font_montserrat_16, SUB_FAINT, LV_PCT(100));
  lv_obj_t *nav = row(pg);
  subtleLink(nav, "< BACK", subtleAt - 1, subtleAt > 0);
  subtleLink(nav, "CONTENTS", -1);
  subtleLink(nav, "NEXT >", subtleAt + 1, subtleAt < total - 1);
  label(pg, String(subtleAt + 1) + " / " + String(total), &lv_font_montserrat_16, SUB_FAINT);
  if (subtleFrames > 1 && !subtleTimer) subtleTimer = lv_timer_create(subtleTurn, 700, nullptr);
}

// ---- C-233: THE PLAYER'S MANUAL, as words (GET /api/manual, kept as "manual"): its contents, then a chapter at a time,
// each section's heading and paragraphs, BACK and NEXT between chapters. The pictures are the PDF's (the app).
static int manualAt = -1;
static void showManual();
static void tapManualAt(lv_event_t *e) { manualAt = (int)(long)lv_event_get_user_data(e); showManual(); }
static lv_obj_t *manualLink(lv_obj_t *parent, const String &text, int to, bool on = true) {
  lv_obj_t *b = lv_button_create(parent);
  lv_obj_set_style_bg_opa(b, LV_OPA_TRANSP, 0); lv_obj_set_style_shadow_width(b, 0, 0); lv_obj_set_style_pad_all(b, 10, 0);
  lv_obj_t *t = lv_label_create(b); lv_label_set_text(t, text.c_str());
  lv_obj_set_style_text_font(t, &lv_font_montserrat_20, 0); lv_obj_set_style_text_color(t, on ? DAY : QUIET, 0);
  if (on) lv_obj_add_event_cb(b, tapManualAt, LV_EVENT_CLICKED, (void *)(long)to);
  return b;
}
static void showManual() {
  JsonDocument m = newDoc();
  if (!kept("manual", m)) return;
  JsonArray chs = m["chapters"].as<JsonArray>();
  int total = chs.size();
  if (manualAt >= total) manualAt = -1;
  lv_obj_t *o = openOverlay();
  button(o, "CLOSE", closeOverlay, nullptr, false);
  lv_obj_t *pg = column(o, LV_PCT(100));
  lv_obj_set_style_pad_all(pg, 24, 0); lv_obj_set_style_pad_row(pg, 12, 0);
  if (manualAt < 0) {
    label(pg, "THE PLAYER'S MANUAL", &lv_font_montserrat_40, INK, LV_PCT(100));
    if (!m["release"].isNull()) label(pg, String("For v") + (const char *)m["release"] + ".", &lv_font_montserrat_20, QUIET);
    label(pg, "CONTENTS", &lv_font_montserrat_20, DAY);
    for (int i = 0; i < total; i++) manualLink(pg, String(i + 1) + ".  " + (const char *)(chs[i]["title"] | "") + "   >", i);
    return;
  }
  JsonObject ch = chs[manualAt];
  label(pg, String(manualAt + 1) + " / " + String(total), &lv_font_montserrat_16, QUIET);
  label(pg, ch["title"] | "", &lv_font_montserrat_40, INK, LV_PCT(100));
  for (JsonObject s : ch["sections"].as<JsonArray>()) {
    if (strlen(s["title"] | "")) label(pg, s["title"] | "", &lv_font_montserrat_28, DAY, LV_PCT(100));
    for (JsonVariant para : s["paragraphs"].as<JsonArray>()) label(pg, para.as<String>(), &lv_font_montserrat_20, INK, LV_PCT(100));
  }
  lv_obj_t *nav = row(pg);
  manualLink(nav, "< BACK", manualAt - 1, manualAt > 0);
  manualLink(nav, "CONTENTS", -1);
  manualLink(nav, "NEXT >", manualAt + 1, manualAt < total - 1);
}

static void drawLibrary(lv_obj_t *p) {
  JsonDocument md = newDoc();                       // C-233: THE PLAYER'S MANUAL, first on the shelf, for everyone
  if (kept("manual", md) && md["chapters"].size()) {
    lv_obj_t *mc = card(p);
    label(mc, "THE PLAYER'S MANUAL", &lv_font_montserrat_20, QUIET);
    label(mc, String("Every way to play DAEMONS, and how it all works.") + (md["release"].isNull() ? "" : String("  For v") + (const char *)md["release"] + "."),
          &lv_font_montserrat_28, INK, LV_PCT(100));   // DRAFT
    button(mc, "READ", tapManualAt, (void *)(long)-1);
  }
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
  JsonDocument sd = newDoc();                       // T-423: THE SUBTLE LAYER, once found
  if (kept("subtle", sd) && (sd["held"] | false)) {
    lv_obj_t *sc = card(p);
    lv_obj_t *r = row(sc);
    subtleCover(r, 1, sd, &SUBTLE_LOOK);
    lv_obj_t *t = column(r, 460);
    label(t, sd["title"] | "THE SUBTLE LAYER", &lv_font_montserrat_20, QUIET);
    label(t, sd["subtitle"] | "", &lv_font_montserrat_28, INK, LV_PCT(100));
    button(t, "READ", openSubtle, (void *)(long)-1);
  }
  JsonDocument hd = newDoc();                       // C-238: THE HERMETIC LAYER, once found -- or shown as a PREVIEW (SETTINGS)
  if (kept("hermetic", hd) && (hd["held"] | false)) {
    lv_obj_t *hc = card(p);
    lv_obj_t *r = row(hc);
    subtleCover(r, 1, hd, &HERMETIC_LOOK);
    lv_obj_t *t = column(r, 460);
    bool preview = String((const char *)(hd["how"] | "")) == "preview";
    label(t, String((const char *)(hd["title"] | "THE HERMETIC LAYER")) + (preview ? "  -  PREVIEW" : ""), &lv_font_montserrat_20, QUIET);
    label(t, hd["subtitle"] | "", &lv_font_montserrat_28, INK, LV_PCT(100));
    button(t, "READ", openHermetic, (void *)(long)-1);
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

