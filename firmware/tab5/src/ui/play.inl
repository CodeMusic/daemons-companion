// Part of ui.cpp (C-157): PLAY (T-426) -- the save's own instrument on the Tab5, by touch, as the app plays it
// (app/screens/Play.tsx) and the game listens. Included by ui.cpp in order -- not a file of its own: it shares ui.cpp's
// statics and may use anything the parts before it declare.
// ---- PLAY -------------------------------------------------------------------------------------------------------------
// The user, 2026-10-18: "choose a song, choose a key ... strings on the screen u pluck like a harp ... when u play a note
// ... you see the colourized note appears and float over the screen (like the game) and once u play a song they connect
// and u hear the song echo". The instrument, whether it is held and the songs learned come with the state (`play`: i, u,
// l, h -- the companion reads them from the save); the songs themselves are built in (common/play.h). A key from the
// wheel (major, C at the top, clockwise in the key colours); the HARP eight strings to touch or draw a finger across, the
// FLUTE eight holes, each sounding while it is held (the Tab5's microphones are its TALK's, so the finger alone here); an
// octave either way; the last sixteen notes listened to -- a learned song in its key and order joins and echoes, the same
// shape in another key is ALMOST. Every word DRAFT.
#include "../../common/play.h"
static const int PLAY_SCALE[8] = { 0, 2, 4, 5, 7, 9, 11, 12 };
static const char *const PLAY_NAMES[12] = { "C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B" };
static int playSongAt = -1, playKey = 0, playOctave = 0, playHeld = -1, playHeldCh = -1, playJoined = -1;
static bool playHarp = true;
static uint8_t playHeard[16]; static int playHeardN = 0;
static lv_obj_t *playSurface = nullptr, *playStaff = nullptr, *playSaid = nullptr, *playLines[8] = {};
static int playLastString = -1;
static uint32_t playJoinedAt = 0;

static bool playLearned(JsonDocument &st, const char *id) {
  for (JsonVariant v : st["play"]["l"].as<JsonArray>()) if (!strcmp(v | "", id)) return true;
  return false;
}
static bool playHeardOf(JsonDocument &st, const char *id) {
  for (JsonVariant v : st["play"]["h"].as<JsonArray>()) if (!strcmp(v | "", id)) return true;
  return false;
}
static int playMidi(int d) { int base = 60 + playKey - (playKey > 6 ? 12 : 0); return base + PLAY_SCALE[d] + 12 * playOctave; }
static lv_color_t playColour(int midi) { return lv_color_hex(PLAY_COLOURS[((midi % 12) + 12) % 12]); }

// the staff: what is played (the last twelve), or a song's notes ahead as hollow rings filled as they are played in order,
// or -- a song heard -- its notes joined
static void playDrawStaff() {
  if (!playStaff) return;
  lv_obj_clean(playStaff);
  int shown[16], n = 0, done = 0; bool ghosts = false, joined = playJoined >= 0;
  if (joined) { const PlaySong &s = PLAY_SONGS[playJoined]; for (int i = 0; i < s.n && n < 16; i++) shown[n++] = s.notes[i]; }
  else if (playSongAt >= 0) {
    const PlaySong &s = PLAY_SONGS[playSongAt]; int shift = playKey - s.key;
    for (int i = 0; i < s.n && n < 16; i++) shown[n++] = s.notes[i] + shift;
    for (int k = min(n, playHeardN); k > 0 && !done; k--) {
      bool ok = true;
      for (int i = 0; i < k; i++) if ((playHeard[playHeardN - k + i] - shown[i]) % 12 != 0) ok = false;
      if (ok) done = k;
    }
    ghosts = true;
  } else for (int i = max(0, playHeardN - 12); i < playHeardN; i++) shown[n++] = playHeard[i];
  for (int i = 0; i < n; i++) {
    if (joined && i) { lv_obj_t *b = lv_obj_create(playStaff); lv_obj_remove_style_all(b); lv_obj_set_size(b, 14, 5);
                       lv_obj_set_style_bg_opa(b, LV_OPA_COVER, 0); lv_obj_set_style_bg_color(b, playColour(shown[i]), 0); }
    lv_obj_t *h = lv_obj_create(playStaff); lv_obj_remove_style_all(h); lv_obj_set_size(h, 30, 30);
    lv_obj_set_style_radius(h, LV_RADIUS_CIRCLE, 0); lv_obj_set_style_border_width(h, 3, 0);
    bool ghost = ghosts && i >= done;
    lv_obj_set_style_border_color(h, ghost ? playColour(shown[i]) : lv_color_hex(PLAY_OUTLINE), 0);
    lv_obj_set_style_bg_opa(h, ghost ? LV_OPA_TRANSP : LV_OPA_COVER, 0); lv_obj_set_style_bg_color(h, playColour(shown[i]), 0);
  }
}

// a note drifting up from where it was played, in its colour, and fading
static void playFloatY(void *o, int32_t v) { lv_obj_set_y((lv_obj_t *)o, v); }
static void playFloatOpa(void *o, int32_t v) { lv_obj_set_style_opa((lv_obj_t *)o, (lv_opa_t)v, 0); }
static void playFloatDone(lv_anim_t *a) { lv_obj_delete_async((lv_obj_t *)a->var); }
static void playFloat(int midi, int x, int y) {
  if (!playSurface) return;
  lv_obj_t *n = lv_obj_create(playSurface); lv_obj_remove_style_all(n);
  lv_obj_add_flag(n, LV_OBJ_FLAG_FLOATING); lv_obj_remove_flag(n, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_set_size(n, 34, 34); lv_obj_set_pos(n, x - 17, y - 17);
  lv_obj_set_style_radius(n, LV_RADIUS_CIRCLE, 0); lv_obj_set_style_bg_opa(n, LV_OPA_COVER, 0); lv_obj_set_style_bg_color(n, playColour(midi), 0);
  lv_obj_set_style_border_width(n, 3, 0); lv_obj_set_style_border_color(n, lv_color_hex(PLAY_OUTLINE), 0);
  lv_obj_t *stem = lv_obj_create(n); lv_obj_remove_style_all(stem); lv_obj_set_size(stem, 5, 30); lv_obj_set_pos(stem, 26, -22);
  lv_obj_set_style_bg_opa(stem, LV_OPA_COVER, 0); lv_obj_set_style_bg_color(stem, playColour(midi), 0);
  lv_obj_remove_flag(n, LV_OBJ_FLAG_SCROLLABLE); lv_obj_set_style_clip_corner(n, false, 0);
  lv_anim_t a; lv_anim_init(&a); lv_anim_set_var(&a, n); lv_anim_set_values(&a, y - 17, y - 177); lv_anim_set_duration(&a, 1600);
  lv_anim_set_exec_cb(&a, playFloatY); lv_anim_set_path_cb(&a, lv_anim_path_ease_out); lv_anim_start(&a);
  lv_anim_t b; lv_anim_init(&b); lv_anim_set_var(&b, n); lv_anim_set_values(&b, 255, 0); lv_anim_set_duration(&b, 1600);
  lv_anim_set_exec_cb(&b, playFloatOpa); lv_anim_set_completed_cb(&b, playFloatDone); lv_anim_start(&b);
}

// each note played: it drifts up, joins the sixteen listened to, and may be a song
static void playNoted(int midi, int x, int y) {
  playFloat(midi, x, y);
  if (playHeardN == 16) { memmove(playHeard, playHeard + 1, 15); playHeardN = 15; }
  playHeard[playHeardN++] = (uint8_t)midi;
  JsonDocument st = newDoc(); kept("state", st);
  for (int s = 0; s < PLAY_SONG_N; s++) {
    if (playSongAt >= 0 && s != playSongAt) continue;
    bool learned = !strcmp(PLAY_SONGS[s].id, "FIR") || playLearned(st, PLAY_SONGS[s].id);
    if (playSongAt < 0 && !learned) continue;           // playing freely, only the songs learned are listened for
    const PlaySong &song = PLAY_SONGS[s];
    if (playHeardN < song.n) continue;
    int d = ((playHeard[playHeardN - song.n] - song.notes[0]) % 12 + 12) % 12; bool same = true, shape = true;
    for (int i = 0; i < song.n; i++) {
      int diff = ((playHeard[playHeardN - song.n + i] - song.notes[i]) % 12 + 12) % 12;
      if (diff) same = false;
      if (diff != d) shape = false;
    }
    if (!same && !(shape && d)) continue;
    if (!same) { lv_label_set_text(playSaid, ("ALMOST: that is " + String(song.title) + ", in another key.").c_str()); break; }
    playHeardN = 0;
    if (!learned) { lv_label_set_text(playSaid, ("That is " + String(song.title) + ". Play it back in the game to learn it.").c_str()); break; }
    lv_label_set_text(playSaid, "");
    playJoined = s; playJoinedAt = millis();
    soundEcho(song.notes, song.frames, song.n);
    break;
  }
  playDrawStaff();
}

// the touch on the instrument: the harp's string under the finger (and every one it is drawn across), the flute's hole
static void playTouch(lv_event_t *e) {
  lv_event_code_t code = lv_event_get_code(e);
  lv_point_t pt; lv_indev_get_point(lv_indev_active(), &pt);
  lv_area_t at; lv_obj_get_coords(playSurface, &at);
  int x = pt.x - at.x1, y = pt.y - at.y1, w = lv_area_get_width(&at), h = lv_area_get_height(&at);
  if (playHarp) {
    if (code == LV_EVENT_RELEASED || code == LV_EVENT_PRESS_LOST) { playLastString = -1; return; }
    int d = constrain(x * 8 / max(1, w), 0, 7);
    if (code == LV_EVENT_PRESSED) playLastString = -1;
    if (d == playLastString) return;
    int from = playLastString < 0 ? d : playLastString + (d > playLastString ? 1 : -1);
    for (int k = from; ; k += (d >= from ? 1 : -1)) {
      soundNote(playMidi(k), 1600);
      if (playLines[k]) { lv_obj_set_style_width(playLines[k], 8, 0); }
      playNoted(playMidi(k), (2 * k + 1) * w / 16, y);
      if (k == d) break;
    }
    for (int k = 0; k < 8; k++) if (playLines[k] && k != d) lv_obj_set_style_width(playLines[k], 4, 0);
    playLastString = d;
  } else {
    int d = constrain(x * 4 / max(1, w), 0, 3) + (y > h / 2 ? 4 : 0);
    bool up = code == LV_EVENT_RELEASED || code == LV_EVENT_PRESS_LOST;
    if (!up && d == playHeld) return;
    if (playHeldCh >= 0) { soundNoteOff(playHeldCh); playHeldCh = -1; }
    if (playHeld >= 0 && playLines[playHeld]) lv_obj_set_style_bg_opa(playLines[playHeld], LV_OPA_TRANSP, 0);
    playHeld = up ? -1 : d;
    if (up) return;
    playHeldCh = soundNote(playMidi(d), 4000);
    if (playLines[d]) lv_obj_set_style_bg_opa(playLines[d], LV_OPA_COVER, 0);
    playNoted(playMidi(d), (2 * (d % 4) + 1) * w / 8, d < 4 ? h * 28 / 100 : h * 72 / 100);
  }
}

static void playDrawInstrument();
static void playKeyChosen(lv_event_t *e) { playKey = (int)(long)lv_event_get_user_data(e); playOctave = 0; playHeardN = 0; playJoined = -1; playDrawInstrument(); }
static void playDrawWheel();
static void playBackToKeys(lv_event_t *) { playDrawWheel(); }
static void playOctaveBy(lv_event_t *e) { playOctave = constrain(playOctave + (int)(long)lv_event_get_user_data(e), -1, 1); playDrawInstrument(); }
static void playClosing() {
  if (playHeldCh >= 0) soundNoteOff(playHeldCh);
  playHeldCh = playHeld = -1; playSurface = playStaff = playSaid = nullptr;
  for (auto &l : playLines) l = nullptr;
}

// THE KEY WHEEL: twelve dots in their colours, C at the top, clockwise; a song's own key ringed
static void playDrawWheel() {
  lv_obj_t *o = openOverlay();
  overlayClosing = playClosing;
  button(o, "CLOSE", closeOverlay, nullptr, false);
  String head = playSongAt >= 0 ? String(PLAY_SONGS[playSongAt].title) + "  -  CHOOSE A KEY" : String("PLAY FREELY  -  CHOOSE A KEY");
  label(o, head, &lv_font_montserrat_28, DAY, LV_PCT(100));
  if (playSongAt >= 0) label(o, "It is learned in " + String(PLAY_NAMES[PLAY_SONGS[playSongAt].key]) + ". In another key it is only ALMOST.",
                             &lv_font_montserrat_20, QUIET, LV_PCT(100));
  lv_obj_t *ring = lv_obj_create(o); lv_obj_remove_style_all(ring); lv_obj_set_size(ring, 480, 480);
  lv_obj_remove_flag(ring, LV_OBJ_FLAG_SCROLLABLE); lv_obj_set_style_align(ring, LV_ALIGN_CENTER, 0);
  for (int k = 0; k < 12; k++) {
    float a = k * 2 * PI / 12;
    lv_obj_t *dot = lv_button_create(ring); lv_obj_remove_style_all(dot); lv_obj_set_size(dot, 84, 84);
    lv_obj_set_pos(dot, 198 + (int)(190 * sinf(a)), 198 - (int)(190 * cosf(a)));
    lv_obj_set_style_radius(dot, LV_RADIUS_CIRCLE, 0); lv_obj_set_style_bg_opa(dot, LV_OPA_COVER, 0);
    lv_obj_set_style_bg_color(dot, lv_color_hex(PLAY_COLOURS[k]), 0);
    bool own = playSongAt >= 0 && PLAY_SONGS[playSongAt].key == k;
    lv_obj_set_style_border_width(dot, own ? 8 : 3, 0); lv_obj_set_style_border_color(dot, own ? INK : lv_color_hex(PLAY_OUTLINE), 0);
    lv_obj_t *t = lv_label_create(dot); lv_label_set_text(t, PLAY_NAMES[k]); lv_obj_center(t);
    lv_obj_set_style_text_font(t, &lv_font_montserrat_28, 0); lv_obj_set_style_text_color(t, k >= 7 ? lv_color_white() : lv_color_hex(0x1D2026), 0);
    lv_obj_add_event_cb(dot, playKeyChosen, LV_EVENT_CLICKED, (void *)(long)k);
  }
}

// the instrument: the staff, the strings or the holes, the octave, and back
static void playDrawInstrument() {
  lv_obj_t *o = openOverlay();
  overlayClosing = playClosing;
  lv_obj_t *top = row(o);
  button(top, "CLOSE", closeOverlay, nullptr, false);
  button(top, "< KEY", playBackToKeys, nullptr, false);
  String head = String(playHarp ? "THE HARP" : "THE FLUTE") + "  -  IN " + PLAY_NAMES[playKey] + "  -  " +
                (playSongAt >= 0 ? String(PLAY_SONGS[playSongAt].title) : String("FREELY"));
  label(o, head, &lv_font_montserrat_20, DAY, LV_PCT(100));
  playStaff = row(o); lv_obj_set_style_pad_column(playStaff, 4, 0); lv_obj_set_height(playStaff, LV_SIZE_CONTENT);
  playSurface = lv_obj_create(o);
  lv_obj_set_size(playSurface, LV_PCT(100), 560); lv_obj_set_style_radius(playSurface, 12, 0);
  lv_obj_set_style_bg_color(playSurface, lv_color_hex(0x1D2026), 0); lv_obj_set_style_border_width(playSurface, 0, 0);
  lv_obj_set_style_pad_all(playSurface, 0, 0); lv_obj_remove_flag(playSurface, LV_OBJ_FLAG_SCROLLABLE);
  lv_obj_set_scroll_dir(playSurface, LV_DIR_NONE); lv_obj_remove_flag(playSurface, LV_OBJ_FLAG_SCROLL_CHAIN);
  lv_obj_add_flag(playSurface, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_update_layout(o);
  int w = lv_obj_get_width(playSurface), h = 560;
  for (int d = 0; d < 8; d++) {
    lv_obj_t *l = playLines[d] = lv_obj_create(playSurface); lv_obj_remove_style_all(l);
    lv_obj_add_flag(l, LV_OBJ_FLAG_FLOATING); lv_obj_remove_flag(l, LV_OBJ_FLAG_CLICKABLE);
    if (playHarp) {                                    // a string
      lv_obj_set_size(l, 4, h - 40); lv_obj_set_pos(l, (2 * d + 1) * w / 16 - 2, 20);
      lv_obj_set_style_bg_opa(l, LV_OPA_COVER, 0); lv_obj_set_style_bg_color(l, playColour(playMidi(d)), 0); lv_obj_set_style_radius(l, 2, 0);
    } else {                                           // a hole
      int s = min(w / 4, h / 2) * 60 / 100;
      lv_obj_set_size(l, s, s); lv_obj_set_pos(l, (2 * (d % 4) + 1) * w / 8 - s / 2, (d < 4 ? h * 28 / 100 : h * 72 / 100) - s / 2);
      lv_obj_set_style_radius(l, LV_RADIUS_CIRCLE, 0); lv_obj_set_style_border_width(l, 6, 0);
      lv_obj_set_style_border_color(l, playColour(playMidi(d)), 0); lv_obj_set_style_bg_color(l, playColour(playMidi(d)), 0);
      lv_obj_set_style_bg_opa(l, LV_OPA_TRANSP, 0);
    }
    lv_obj_t *num = lv_label_create(playSurface); lv_obj_add_flag(num, LV_OBJ_FLAG_FLOATING);
    lv_label_set_text(num, String(d + 1).c_str()); lv_obj_set_style_text_color(num, lv_color_hex(0x9AA0AA), 0);
    lv_obj_set_style_text_font(num, &lv_font_montserrat_16, 0);
    if (playHarp) lv_obj_set_pos(num, (2 * d + 1) * w / 16 - 4, h - 18);
    else lv_obj_set_pos(num, (2 * (d % 4) + 1) * w / 8 - 4, (d < 4 ? h * 28 / 100 : h * 72 / 100) - 9);
  }
  for (lv_event_code_t c : { LV_EVENT_PRESSED, LV_EVENT_PRESSING, LV_EVENT_RELEASED, LV_EVENT_PRESS_LOST })
    lv_obj_add_event_cb(playSurface, playTouch, c, nullptr);
  playSaid = label(o, "", &lv_font_montserrat_20, INK, LV_PCT(100));
  lv_obj_t *oct = row(o);
  button(oct, "OCTAVE -", playOctaveBy, (void *)(long)-1, false);
  label(oct, playOctave < 0 ? "LOW" : playOctave > 0 ? "HIGH" : "MIDDLE", &lv_font_montserrat_20, QUIET);
  button(oct, "OCTAVE +", playOctaveBy, (void *)(long)1, false);
  label(o, playHarp ? "Touch a string, or draw a finger across them." : "Hold a hole to sound its note.", &lv_font_montserrat_16, QUIET, LV_PCT(100));
  playDrawStaff();
}

// every pass: a joined song's notes come apart once its echo has played
static void playLook() {
  if (playJoined >= 0 && millis() - playJoinedAt > 4500 && playStaff) { playJoined = -1; playDrawStaff(); }
}

static void playChoose(lv_event_t *e) {
  playSongAt = (int)(long)lv_event_get_user_data(e);
  JsonDocument st = newDoc(); kept("state", st);
  playHarp = String((const char *)(st["play"]["i"] | "harp")) != "flute";
  playDrawWheel();
}
// the SONGBOOK's own card: PLAY THE HARP (or the FLUTE) -- freely, or a song learned (or heard, to practise)
static void playCard(lv_obj_t *p) {
  JsonDocument st = newDoc();
  if (!kept("state", st) || st["play"].isNull()) return;
  String name = String((const char *)(st["play"]["i"] | "harp")) == "flute" ? "FLUTE" : "HARP";
  lv_obj_t *c = card(p);
  label(c, "PLAY THE " + name, &lv_font_montserrat_20, QUIET);
  if (!(st["play"]["u"] | false)) { label(c, "The " + name + " is waiting in the game. Once it is yours there, it plays here too.", &lv_font_montserrat_20, INK, LV_PCT(100)); return; }
  lv_obj_t *r = row(c);
  button(r, "PLAY FREELY", playChoose, (void *)(long)-1);
  for (int s = 0; s < PLAY_SONG_N; s++) {
    bool learned = !strcmp(PLAY_SONGS[s].id, "FIR") || playLearned(st, PLAY_SONGS[s].id);
    if (learned || playHeardOf(st, PLAY_SONGS[s].id)) button(r, PLAY_SONGS[s].title, playChoose, (void *)(long)s, false);
  }
}
