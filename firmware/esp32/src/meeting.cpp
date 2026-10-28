// C-212 (the user, 2026-10-28: "hit a button during meetings so it records them ... meeting summary notes -- viewable on
// the watch (with option to read the summary part outloud)"): RECORD A MEETING and LAST MEETING, in HOURS. The microphone
// is read by a task of its own into half-minute parts (two buffers, so one fills while the other is sent), each sent to
// the companion as it is finished (server/src/meetings.ts hears it there) and kept on the SD card first where there is
// one (C-199), so a part the network missed is sent later -- SEND KEPT MEETINGS goes through what is left. While it
// records the glass says so, in red, the whole time: the people in the room can see it. At the end the companion writes
// it up; the watch waits for it and shows the SUMMARY (LISTEN reads it), the ACTION ITEMS, and the daemon's DAY-DREAM.
// Every word DRAFT.
#include <HTTPClient.h>
#include "app.h"
#include "talk.h"
#include "card.h"
#include "sound.h"

void drawArt(int x, int y, int scale, bool mirrored = false);   // ui.cpp
extern String relayKey;                                         // net.cpp: this board's own key

static const int RATE = 16000, PART_S = 30, PART_N = RATE * PART_S;
static int16_t *bufs[2] = { nullptr, nullptr };           // two half-minute buffers, in PSRAM
static volatile int filling = 0; static volatile size_t fill = 0;
static volatile int ready = -1;                            // a buffer finished and waiting to be sent (-1 none)
static volatile bool recording = false;
static TaskHandle_t recTask = nullptr;
static int meetId = 0, parts = 0, sent = 0, kept = 0;
static uint32_t startedAt = 0;
static String meetLine;                                    // what the panel says under the time

static void recLoop(void *) {
  while (recording) {
    size_t n = talkMicRead(bufs[filling] + fill, min((size_t)1024, (size_t)(PART_N - fill)), 50);
    fill += n;
    if (fill >= PART_N) {
      if (ready >= 0) { fill = 0; continue; }              // the last part not yet away: this half-minute is lost, not the next
      ready = filling; filling ^= 1; fill = 0;
    }
  }
  recTask = nullptr; vTaskDelete(nullptr);
}

// one part to the companion, at home (a recording is not JSON, so not through the relay): true when it was taken
static bool sendPart(int id, int n, const uint8_t *wav, size_t bytes) {
  if (!id || !atHome()) return false;
  HTTPClient h;
  h.setTimeout(30000);
  h.begin(serverUrl + "/api/device/meeting/part?id=" + String(id) + "&n=" + String(n));
  h.addHeader("x-device", deviceId());
  if (relayKey.length() >= 16) h.addHeader("authorization", "Bearer " + relayKey);
  h.addHeader("content-type", "audio/wav");
  int code = h.POST((uint8_t *)wav, bytes);
  h.end();
  return code == 200;
}
// a finished buffer: a WAV header in front, onto the card, then away; what the network missed waits on the card
static void partDone(int b, size_t samples) {
  static uint8_t *wav = nullptr;
  if (!wav) wav = (uint8_t *)ps_malloc(44 + PART_N * 2);
  if (!wav) return;
  talkWavHeader(wav, samples);
  memcpy(wav + 44, bufs[b], samples * 2);
  int n = parts++;
  String name = "meetings/" + String(meetId) + "/" + String(n) + ".wav";
  bool onCard = cardReady() && cardWriteBytes(name, wav, 44 + samples * 2);
  if (sendPart(meetId, n, wav, 44 + samples * 2)) { sent++; if (onCard) cardRemove(name); }
  else if (onCard) kept++;
}

// ---- the panel -------------------------------------------------------------------------------------------------------
static String drawRecording(uint16_t day, uint16_t ink) {
  uint32_t s = (millis() - startedAt) / 1000;
  canvas.fillRect(0, 26, W, 34, 0xC000);                   // the RECORDING band, red, the whole time
  canvas.setTextDatum(MC_DATUM); canvas.setTextFont(2); canvas.setTextColor(PAPER);
  canvas.drawString((millis() / 600) % 2 ? "●  RECORDING" : "   RECORDING", W / 2, 43);                                // DRAFT
  canvas.setTextFont(7); canvas.setTextColor(PAPER);
  canvas.drawString((s / 3600 ? String(s / 3600) + ":" : String("")) + (s / 60 % 60 < 10 ? "0" : "") + String(s / 60 % 60) + ":" + (s % 60 < 10 ? "0" : "") + String(s % 60), W / 2, 104);
  canvas.setTextFont(2); canvas.setTextColor(QUIET);
  canvas.drawString(meetLine, W / 2, 150);
  if (st.carrying) drawArt(W / 2 - 32, 166, 2, (millis() / 1500) % 2);   // listening with you
  canvas.setTextDatum(TL_DATUM);
  return "tap: end the meeting";                                                                              // DRAFT
}

static JsonDocument shown;                                 // the write-up the watch shows
static int wPage = 0, wSkip = 0, wLines = 0;
static String pageText() {
  if (wPage == 0) {
    String t = String((const char *)(shown["summary"] | ""));
    JsonArray a = shown["actions"].as<JsonArray>();
    if (a.size()) { t += "\n\nACTION ITEMS"; for (JsonVariant x : a) t += "\n- " + String((const char *)(x | "")); }   // DRAFT
    return t;
  }
  return String((const char *)(shown["daydream"] | ""));
}
static String drawWriteUp(uint16_t day, uint16_t ink) {
  canvas.setTextDatum(TL_DATUM); canvas.setTextFont(2); canvas.setTextColor(readable(day));
  String state = shown["state"] | "";
  canvas.drawString(wPage == 0 ? String((const char *)(shown["title"] | "THE MEETING")) : daemonName() + "'S DAY-DREAM", 10, 30);   // DRAFT
  if (state != "done") {
    wrap(state == "failed" ? "It could not be written up. Try again from the app." : "Writing it up... this takes a minute or two.", 10, 56, W - 20, 2, 18, 6, PAPER);   // DRAFT
    return "hold: back";                                                                                       // DRAFT
  }
  int fit = (H - 50 - 44) / 18;
  wLines = wrap(pageText(), 10, 50, W - 20, 2, 18, fit, wPage == 0 ? PAPER : readable(day), wSkip);
  if (talkCan()) {
    canvas.drawRoundRect(W - 86, H - 38, 78, 30, 8, day);
    canvas.setTextDatum(MC_DATUM); canvas.setTextColor(day); canvas.drawString("LISTEN", W - 47, H - 23);       // DRAFT
    canvas.setTextDatum(TL_DATUM);
  }
  canvas.setTextFont(1); canvas.setTextColor(QUIET);
  canvas.drawString(wPage == 0 ? "swipe: more, then the day-dream" : "swipe back: the summary", 10, H - 30);      // DRAFT
  return " ";
}
static bool fetchWriteUp(int id) {
  bool ok; String got = http("GET", "/api/device/meeting" + (id ? "?id=" + String(id) : String("")), "", &ok);
  if (!ok) return false;
  shown.clear();
  return !deserializeJson(shown, got);
}
// the write-up shown: waited for while it is written, then read -- a swipe scrolls, past the end to the day-dream
static void showWriteUp(int id) {
  wPage = 0; wSkip = 0;
  runPanel = drawWriteUp;
  if (!fetchWriteUp(id)) { say(online() ? "No meeting yet" : "NEEDS WI-FI"); return; }                         // DRAFT
  uint32_t askedAt = millis();
  progress("");
  while (true) {
    String state = shown["state"] | "";
    if (state != "done" && state != "failed" && millis() - askedAt > 5000) { askedAt = millis(); fetchWriteUp(id ? id : (int)(shown["id"] | 0)); progress(""); }
    int step, ev; routineInput(step, ev);
    if (ev == -1 || giveUp()) break;
    if (state == "done" && step) {
      int fit = (H - 50 - 44) / 18;
      if (step > 0 && wSkip + fit >= wLines && wPage == 0) { wPage = 1; wSkip = 0; }
      else if (step < 0 && wSkip == 0 && wPage == 1) { wPage = 0; wSkip = 0; }
      else wSkip = constrain(wSkip + step * fit, 0, max(0, wLines - fit));
      progress("");
    }
    if (state == "done" && ev == 1 && talkCan()) {
      talkReadText(wPage == 0 ? String((const char *)(shown["summary"] | "")) : String((const char *)(shown["daydream"] | "")));
      screen = RUN; progress("");
    }
    delay(20);
  }
}

String runMeeting() {
  if (!talkEarOpen()) return "No microphone here.";                                                            // DRAFT
  for (auto &b : bufs) if (!b) b = (int16_t *)ps_malloc(PART_N * 2);
  if (!bufs[0] || !bufs[1]) { talkEarClose(); return "Not enough memory to record."; }                         // DRAFT
  bool ok; String got = http("POST", "/api/device/meeting/start", "{}", &ok);
  JsonDocument d; meetId = ok && !deserializeJson(d, got) ? (int)(d["id"] | 0) : 0;
  if (!meetId && !cardReady()) { talkEarClose(); return online() ? "The companion did not answer." : "NEEDS WI-FI, OR A CARD"; }   // DRAFT
  if (!meetId) meetId = -(int)(time(nullptr) % 100000000);   // offline: kept on the card under a number of its own, sent later
  parts = sent = kept = 0; filling = 0; fill = 0; ready = -1; recording = true; startedAt = millis();
  xTaskCreatePinnedToCore(recLoop, "meeting", 4096, nullptr, 3, &recTask, 0);
  haptic(16);
  runPanel = drawRecording;
  uint32_t drawnAt = 0;
  while (true) {
    if (ready >= 0) { int b = ready; partDone(b, PART_N); ready = -1; }
    meetLine = String(sent) + " sent" + (kept ? ", " + String(kept) + " on the card" : String(""));          // DRAFT
    int step, ev; routineInput(step, ev);
    if (ev == 1 || ev == -1 || giveUp()) break;
    if (millis() - drawnAt > 500) { drawnAt = millis(); progress(""); }
    delay(10);
  }
  recording = false;
  while (recTask) delay(10);
  if (ready >= 0) { partDone(ready, PART_N); ready = -1; }
  if (fill > RATE) partDone(filling, fill);                 // the last part, as long as it got
  talkEarClose(); haptic(16);
  if (meetId < 0 || kept) {
    runPanel = nullptr;
    return "Recorded. " + String(kept) + " part" + (kept == 1 ? "" : "s") + " kept on the card -- HOURS, SEND KEPT MEETINGS at home.";   // DRAFT
  }
  http("POST", "/api/device/meeting/end", "{\"id\":" + String(meetId) + ",\"parts\":" + String(parts) + "}", &ok);
  showWriteUp(meetId);
  runPanel = nullptr;
  return "";
}

String runLastMeeting() { showWriteUp(0); runPanel = nullptr; return ""; }

// C-199: what the card kept -- each meeting's parts sent (a meeting recorded away is started on the companion now), then
// ended, so it is written up
String runSendKept() {
  if (!cardReady()) return "No card here.";                                                                    // DRAFT
  if (!atHome()) return "NEEDS HOME";                                                                         // DRAFT
  int meetings = 0, partsSent = 0;
  for (String dir : cardList("meetings")) {
    int id = dir.toInt();
    std::vector<String> files = cardList("meetings/" + dir);
    if (files.empty()) continue;
    if (id <= 0) {                                         // recorded away: the companion has not heard of it yet
      bool ok; String got = http("POST", "/api/device/meeting/start", "{}", &ok);
      JsonDocument d; if (!ok || deserializeJson(d, got)) break;
      id = d["id"] | 0;
    }
    int most = 0;
    for (String f : files) {
      int n = f.toInt(); most = max(most, n + 1);
      size_t bytes = 0; uint8_t *wav = cardReadBytes("meetings/" + dir + "/" + f, bytes);
      if (wav && sendPart(id, n, wav, bytes)) { cardRemove("meetings/" + dir + "/" + f); partsSent++; }
      free(wav);
      say("SENT " + String(partsSent)); progress("");                                                         // DRAFT
    }
    bool ok; http("POST", "/api/device/meeting/end", "{\"id\":" + String(id) + ",\"parts\":" + String(most) + "}", &ok);
    meetings++;
  }
  return partsSent ? String(partsSent) + " parts of " + String(meetings) + " meeting" + (meetings == 1 ? "" : "s") + " sent; the app has them written up soon."   // DRAFT
                   : "Nothing kept to send.";                                                                  // DRAFT
}
