// The companion on a handheld: setup and the loop. What each part does is in app.h.
#include "talk.h"
#include <WiFi.h>
#include "app.h"
#include "brain.h"
#include "radios.h"
#include "leds.h"
#include "sound.h"
#include "link.h"
#include "meet.h"
#include "lora.h"
#include "broadcast.h"

// C-105: what was printed, sent before going on -- but never waiting long. On the S3's own USB, Serial.flush() waits
// until a program on the computer reads the port, with no limit: plugged into a computer with nothing reading it, a
// board stopped at its first boot step, before its screen started, and went on only when something opened the port.
static size_t txRoom = 0;
void cableFlush(uint32_t ms) {
#if ARDUINO_USB_MODE && ARDUINO_USB_CDC_ON_BOOT
  if (!txRoom) txRoom = Serial.availableForWrite();          // the buffer's room with nothing in it (asked before printing)
  for (uint32_t t0 = millis(); millis() - t0 < ms && (size_t)Serial.availableForWrite() < txRoom; ) delay(1);
#else
  Serial.flush();                                            // a USB-serial chip's UART always drains (the M5GO and Fire)
#endif
}

// Each step says so down the cable as it starts ("boot: ..."), so a board that stops part-way says where.
static void step(const char *what) { Serial.printf("boot: %s (heap %u, largest %u)\n", what, ESP.getFreeHeap(), ESP.getMaxAllocHeap()); cableFlush(); }   // C-97: the heap at each step

void setup() {
  // The bridge's STATE line is ~300 bytes and the USB receive buffer defaults to 256: while the screen is being drawn
  // the rest was dropped, the JSON arrived cut short, and the corner said NO LINK with the bridge plainly connected.
  Serial.setRxBufferSize(4096);
  Serial.begin(115200);
  cableFlush(0);                              // C-105: note the send buffer's room while it is empty
  for (uint32_t t0 = millis(); !Serial && millis() - t0 < 4000; ) delay(10);   // a listener, if one is coming
  // why it started: a crash (PANIC), a watchdog (TASK_WDT, INT_WDT), a deep sleep's wake (DEEPSLEEP), RST (POWERON) ...
  static const char *WHY[] = { "UNKNOWN", "POWERON", "EXT", "SW", "PANIC", "INT_WDT", "TASK_WDT", "WDT", "DEEPSLEEP",
                               "BROWNOUT", "SDIO" };
  int why = (int)esp_reset_reason();
  Serial.printf("boot: start (reset: %s)\n", why >= 0 && why < 11 ? WHY[why] : "?"); cableFlush();
  boardBegin();                               // C-67: which board this is, its peripherals switched on
  Serial.printf("boot: board %s\n", board.id);
  inputBegin();                               // the dial and the buttons this board has
  step("display"); displayBegin();
  watchBegin();                               // C-71: the watch's clock, steps, touch and crown (nothing elsewhere)
  nightBegin();                               // C-200: a night under way when it restarted
  clockBegin();                               // C-205: the alarm, from flash
  step("wifi");    loadWifi();                // C-52: uplinkLoop joins the strongest known network in range
  reportBegin();                              // C-121: the outbox's task
  step("lights");  ledsBegin();
  step("sound");   soundBegin();
  routinesBegin();                            // C-67: the routine types this board has
  if (board.ir) flareBegin();                 // C-51: an older single learned code becomes the first remote
  step("settings"); loadSettings(); brainLoad();   // C-76: the offline brain's link, if one was set
  step("bluetooth"); linkBegin();             // C-55: Bluetooth, for the phone
  if (board.loraChip != LoraChip::None) { step("lora"); loraBegin(); }   // C-72: the watch's and the T-Deck's radio
  lastInput = millis();
  page = homePage();                          // C-42: it starts at home
  draw();
  soundWake();                                // C-94: the title's opening at every start, as on waking
  step("ready");
}

void loop() {
  readUsb();
  readPhone();
  readEncoder();
  readKey();
  readDeck();                               // C-104: the T-Deck's keyboard and trackball
  uint32_t now = millis();
  watchLoop(now);                           // C-71
  nightLoop(now);                           // C-200
  gpsLoop(now);                             // C-174
  intuitionLoop(now);                       // C-203
  clockLoop(now);                           // C-205
  if (now - lastHello > HELLO_MS) { lastHello = now; Serial.println(String("HELLO daemons-companion ") + board.id + " 3 " + deviceId()); dirty = true; }   // C-80: its own name
  static uint32_t phoneHelloAt = 0;          // C-80: the phone carries the board's name on, so it hears it now and then
  if (linkPhoneHere() && (phoneHelloAt == 0 || now - phoneHelloAt > 30000)) {
    phoneHelloAt = now; linkSend(String("HELLO daemons-companion ") + board.id + " 3 " + deviceId());
  }
  if (!linkPhoneHere()) phoneHelloAt = 0;
  batteryLoop(now);                         // C-63
  reportLoop();                             // C-121: the outbox's answer, and the cable carrying what waits
  remotesLoop(now);                         // C-165: the remotes every device shares
  activityLoop(now);                        // C-183: a thousand steps walked, shown
  if (!bridgeLive() && online() && !netBusy()) {   // C-121: not while the outbox sends -- the state comes back with it
    if (now - lastPoll > powerPollMs() ||   // C-242: as often as BATTERY says
         (!st.have && now - lastPoll > 5000)) { lastPoll = now; httpState("GET", "/api/device/state", ""); }
    pollCommands(now);                        // C-32: what the site sent, over Wi-Fi
  }
  if (flashUntil && now > flashUntil) { flashUntil = 0; dirty = true; }
  if (!netBusy()) askForArt();
  uplinkLoop(now);
  linkLoop(now);                            // C-55
  talkLoop(now);                            // C-181: a talk's answer, when the hub has it
  powerLoop(now);                           // C-242, C-243
  meetLoop(now, powerMeet(), st.carrying ? st.daemon.species : 0);   // C-15; C-242 its BATTERY switch and rule
  loraLoop(now, cfg.meet, st.carrying ? st.daemon.species : 0);   // C-72: the same switch, the same tag
  meetCastLoop(now); castLoop(now);         // C-134: broadcasts -- Bluetooth's pieces, answers due
  meetReport();
  static bool wifiWas = false;              // C-52: the site hears at once when the board joins or leaves a network
  if (wifiWas != (WiFi.status() == WL_CONNECTED)) { wifiWas = !wifiWas; reportNetworks(); dirty = true; }
  static uint32_t netsAt = 0;               // C-93: the shared networks moved on -- at most every ten seconds
  if (netsDue && (usbLive() || online()) && now - netsAt > 10000) { netsAt = now; reportNetworks(); }
  if (phoneSeen && !linkPhoneHere()) { phoneSeen = 0; dirty = true; }   // C-57: gone; the next one proves itself again
  ledsLoop();
  soundLoop();                              // C-121: the tune task's dance shown; C-75: the DAC let go between sounds
  static bool wasUndoable = false;
  if (wasUndoable != undoable()) { wasUndoable = undoable(); dirty = true; }
  // C-42: any menu, left alone, goes to sleep; waking lands at home. Signed: watchLoop's touch and crown come after
  // `now` was read, so lastInput can be a few ms newer than it -- unsigned, that was 49 days alone, and the watch slept
  // the moment it was woken or touched (2026-10-18)
  if (!asleep && powerSleepAfter() > 0 && (int32_t)(now - lastInput) > (int32_t)powerSleepAfter() * 1000) sleepNow();   // C-243: sooner in low power
  // C-242: the always-on face, asleep -- drawn dim once a minute (and when the state changes what it shows)
  static int aodMinute = -1;
  if (asleep && aodShowing() && (dirty || aodMinute != (int)(now / 60000))) { aodMinute = now / 60000; dirty = false; draw(); }
  // the daemon at home is alive: redraw it a few times a second
  static uint32_t lifeAt = 0;
  if (!asleep && screen == HOME && (page == DAEMON || (page == FACE_PAGE && faceHasDaemon())) && st.carrying && now - lifeAt > 90) {   // C-162
    lifeAt = now; dirty = true;
  }
  if (dirty && !asleep) draw();
  delay(powerLoopRest());                   // C-255: a sleeping watch rests longer between passes
}

