// Part of ui.cpp (C-157): TODAY's day and GOALS. Included by ui.cpp in order -- not a file of its own: it
// shares ui.cpp's statics and may use anything the parts before it declare.
// ---- TODAY ------------------------------------------------------------------------------------------------------------
static void tapDone(lv_event_t *e) {
  long id = (long)lv_event_get_user_data(e);
  soundStep(false);                                      // C-94: the step's own tune, as on the handhelds
  netSend("POST", "/api/steps/" + String(id) + "/done", "{}");
}

static void drawTodayDay(lv_obj_t *p) {
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


// ---- C-137 (the user, 2026-11-24: "it should support all the new features we make"): TODAY's newer cards, as the app's
// TODAY has them under the day -- the day's SPELL CHECK (C-488), THE DAY'S TENDING (C-357 (3)), THE WEEK'S BALANCE (C-432)
// and the newest letter from your daemon (C-455). Each is kept on the Tab5 (net.cpp) and drawn only when the companion
// has one to show. Every word DRAFT.
static void goTab(lv_event_t *e);                        // pages.inl
static void openShadowAt(int at);                         // library.inl: THE SPELL LEFT RUNNING, opened at a page
static int spellPage = -1;                                // the SPELL CHECK's broom, counted through the book's pages
static void tapSpellBook(lv_event_t *) { openShadowAt(spellPage); }
static lv_color_t subtleInk() { return lv_color_hex(darkNow ? 0xEF8CD6 : 0xB0569E); }   // the app's SUBTLE (state/look.ts)
// a small ring, filled when lit, with a word under it: one of the week's seven
static lv_obj_t *weekDot(lv_obj_t *parent, const String &word, bool lit, bool today, bool ahead, lv_color_t ink) {
  lv_obj_t *c = column(parent, 80);
  lv_obj_set_flex_align(c, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
  lv_obj_set_style_pad_row(c, 4, 0);
  lv_obj_remove_flag(c, LV_OBJ_FLAG_CLICKABLE);           // a tap on a day is the card's (THE WEEK'S BALANCE opens)
  lv_obj_t *d = lv_obj_create(c);
  lv_obj_remove_flag(d, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_set_size(d, 22, 22); lv_obj_set_style_radius(d, LV_RADIUS_CIRCLE, 0); lv_obj_set_style_pad_all(d, 0, 0);
  lv_obj_set_style_border_width(d, 3, 0); lv_obj_set_style_border_color(d, lit || today ? ink : UNLIT, 0);
  lv_obj_set_style_bg_color(d, ink, 0); lv_obj_set_style_bg_opa(d, lit ? LV_OPA_COVER : LV_OPA_TRANSP, 0);
  lv_obj_t *l = label(c, word, &lv_font_montserrat_16, lit || today ? ink : QUIET, 80);
  lv_obj_set_style_text_align(l, LV_TEXT_ALIGN_CENTER, 0);
  if (ahead) lv_obj_set_style_opa(c, LV_OPA_40, 0);
  return c;
}
static lv_obj_t *weekRow(lv_obj_t *parent) {             // seven across a card, tops level when a word takes two lines
  lv_obj_t *r = row(parent);
  lv_obj_set_style_pad_column(r, 6, 0);
  lv_obj_set_flex_align(r, LV_FLEX_ALIGN_SPACE_BETWEEN, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START);
  lv_obj_remove_flag(r, LV_OBJ_FLAG_CLICKABLE);
  return r;
}

static void drawSpellCheck(lv_obj_t *p) {
  JsonDocument s = newDoc();
  if (!kept("spell", s) || !(s["held"] | false)) return;
  lv_obj_t *c = card(p);
  label(c, "THE DAY'S SPELL CHECK  -  " + String((const char *)(s["day"] | "")), &lv_font_montserrat_16, QUIET);
  label(c, s["title"] | "", &lv_font_montserrat_28, INK, LV_PCT(100));
  label(c, s["check"] | "", &lv_font_montserrat_20, INK, LV_PCT(100));
  if (String((const char *)(s["broom"] | "")).length()) label(c, s["broom"] | "", &lv_font_montserrat_16, QUIET, LV_PCT(100));
  JsonDocument b = newDoc();                                // C-137: OPEN THE BOOK at the broom's page, as the app does
  if (kept("shadow", b) && (b["held"] | false)) {
    int s0 = s["s"] | -1, j = s["j"] | -1, at = 0;
    JsonArray secs = b["sections"].as<JsonArray>();
    for (int i = 0; i < s0 && i < (int)secs.size(); i++) at += secs[i]["entries"].size();
    spellPage = s0 >= 0 && j >= 0 ? at + j : -1;
    button(c, "OPEN THE BOOK", tapSpellBook);
  } else button(c, "THE LIBRARY", goTab, (void *)(long)P_LIBRARY, false);
}

static void tapTended(lv_event_t *) { soundStep(false); netSend("POST", "/api/subtle/tending", "{}"); }
static void drawTending(lv_obj_t *p) {
  JsonDocument t = newDoc();
  if (!kept("tending", t) || !(t["held"] | false) || t["tending"].isNull() || t["climb"].isNull()) return;
  lv_color_t ink = subtleInk();
  lv_obj_t *c = card(p);
  lv_obj_set_style_border_color(c, ink, 0);
  label(c, "THE DAY'S TENDING", &lv_font_montserrat_16, QUIET);
  String centre = t["centre"] | ""; centre.toLowerCase();
  label(c, "The " + centre + ": " + (const char *)(t["tending"] | ""), &lv_font_montserrat_28, ink, LV_PCT(100));
  if (!t["done"].isNull()) {
    String by = t["done"]["by"] | "you";
    label(c, by == "walk" ? "Tended today: a walk." : by == "dream" ? "Tended today: a dream kept." : "Tended today.", &lv_font_montserrat_20, QUIET);
  } else {
    lv_obj_t *b = button(c, "TENDED", tapTended);
    lv_obj_set_style_bg_color(b, ink, 0);
  }
  lv_obj_t *r = weekRow(c);
  for (JsonObject d : t["climb"].as<JsonArray>()) {
    String w = d["centre"] | ""; w.toLowerCase();
    weekDot(r, w, d["tended"] | false, d["today"] | false, d["ahead"] | false, ink);
  }
  label(c, "So they climb.", &lv_font_montserrat_16, QUIET);
}

static bool balanceOpen = false;
static void tapBalance(lv_event_t *) { balanceOpen = !balanceOpen; drawnAt[P_TODAY] = 0; }
static String balanceActs(JsonObject a) {               // as the app's what(): "2 steps, the centre tended, 1 entry"
  String out;
  auto add = [&](int n, const char *one, const char *many) { if (n) out += (out.length() ? ", " : "") + String(n) + " " + (n == 1 ? one : many); };
  add(a["goals"] | 0, "step", "steps");
  if ((int)(a["tended"] | 0)) out += String(out.length() ? ", " : "") + "the centre tended";
  add(a["entries"] | 0, "entry", "entries"); add(a["dreams"] | 0, "dream", "dreams");
  add(a["actions"] | 0, "action item", "action items"); add(a["learning"] | 0, "lesson or card", "lessons and cards");
  add(a["cooked"] | 0, "meal cooked", "meals cooked");
  if ((int)(a["mine"] | 0)) out += (out.length() ? ", " : "") + String((int)a["mine"]) + " of your own";
  return out;
}
static void drawBalance(lv_obj_t *p) {
  JsonDocument b = newDoc();
  if (!kept("balance", b) || b["days"].isNull()) return;
  lv_obj_t *c = card(p);
  lv_obj_add_flag(c, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_add_event_cb(c, tapBalance, LV_EVENT_CLICKED, nullptr);
  label(c, "THE WEEK'S BALANCE  -  " + String((int)(b["lived"] | 0)) + " of 7 lived", &lv_font_montserrat_16, QUIET);
  lv_obj_t *r = weekRow(c);
  for (JsonObject d : b["days"].as<JsonArray>())
    weekDot(r, String((const char *)(d["day"] | "")).substring(0, 3), d["lived"] | false, d["today"] | false, d["ahead"] | false, DAY);
  String v = b["today"]["virtue"] | "", s = b["today"]["shadow"] | ""; v.toLowerCase(); s.toLowerCase();
  label(c, "Today, " + v + " over " + s + ((b["today"]["paid"] | false) ? ": lived, +2 ARETE." : ": the first thing done today earns 2 ARETE more."),
        &lv_font_montserrat_20, QUIET, LV_PCT(100));
  if (!balanceOpen) return;
  for (JsonObject d : b["days"].as<JsonArray>()) {
    String day = d["day"] | "", virtue = d["virtue"] | "", shadow = d["shadow"] | "";
    String line = (d["ahead"] | false) ? virtue + " over " + shadow : (d["lived"] | false) ? virtue + " lived: " + balanceActs(d["acts"]) : shadow + " untended";
    lv_obj_t *l = label(c, day + "   " + line, &lv_font_montserrat_20, (d["today"] | false) ? DAY : INK, LV_PCT(100));
    if (d["ahead"] | false) lv_obj_set_style_opa(l, LV_OPA_50, 0);
  }
  label(c, "Lived on its own day. Nothing is taken for a day missed.", &lv_font_montserrat_16, DAY, LV_PCT(100));
}

static void tapLetterRead(lv_event_t *e) {
  netSend("POST", "/api/mentions/read", "{\"id\":" + String((long)lv_event_get_user_data(e)) + "}");
}
static void drawMentions(lv_obj_t *p) {
  JsonDocument m = newDoc();
  if (!kept("mentions", m) || m["unread"].isNull()) return;
  JsonObject u = m["unread"];
  lv_obj_t *c = card(p), *r = row(c);
  int species = u["species"] | 0;
  if (species > 0 && hasArt("s" + String(species))) picture(r, "s" + String(species), 256 * 2);
  lv_obj_t *t = column(r, 480);
  label(t, u["title"] | "", &lv_font_montserrat_16, QUIET, 480);
  label(t, String((const char *)(u["said"] | "")) + "  -  from " + (const char *)(u["nickname"] | ""), &lv_font_montserrat_20, QUIET, 480);
  label(c, u["body"] | "", &lv_font_montserrat_28, INK, LV_PCT(100));
  if (String((const char *)(u["state"] | "")) == "writing")
    label(c, String((const char *)(u["nickname"] | "")) + " is still writing; these are its first words.", &lv_font_montserrat_16, QUIET, LV_PCT(100));
  lv_obj_t *b = row(c);
  button(b, "READ", tapLetterRead, (void *)(long)(u["id"] | 0));
  label(b, "Kept in " + String((const char *)(m["book"] | "its book")) + ", in the LIBRARY.", &lv_font_montserrat_16, QUIET);
}
