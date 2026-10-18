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

