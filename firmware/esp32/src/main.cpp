// The companion on a handheld: setup and the loop. What each part does is in app.h.
#include <WiFi.h>
#include "app.h"
#include "brain.h"
#include "radios.h"
#include "leds.h"
#include "sound.h"
#include "link.h"
#include "meet.h"

// Each step says so down the cable as it starts ("boot: ..."), so a board that stops part-way says where.
static void step(const char *what) { Serial.printf("boot: %s\n", what); Serial.flush(); }

void setup() {
  // The bridge's STATE line is ~300 bytes and the USB receive buffer defaults to 256: while the screen is being drawn
  // the rest was dropped, the JSON arrived cut short, and the corner said NO LINK with the bridge plainly connected.
  Serial.setRxBufferSize(4096);
  Serial.begin(115200);
  for (uint32_t t0 = millis(); !Serial && millis() - t0 < 4000; ) delay(10);   // a listener, if one is coming
  // why it started: a crash (PANIC), a watchdog (TASK_WDT, INT_WDT), a deep sleep's wake (DEEPSLEEP), RST (POWERON) ...
  static const char *WHY[] = { "UNKNOWN", "POWERON", "EXT", "SW", "PANIC", "INT_WDT", "TASK_WDT", "WDT", "DEEPSLEEP",
                               "BROWNOUT", "SDIO" };
  int why = (int)esp_reset_reason();
  Serial.printf("boot: start (reset: %s)\n", why >= 0 && why < 11 ? WHY[why] : "?"); Serial.flush();
  boardBegin();                               // C-67: which board this is, its peripherals switched on
  Serial.printf("boot: board %s\n", board.id);
  inputBegin();                               // the dial and the buttons this board has
  step("display"); displayBegin();
  watchBegin();                               // C-71: the watch's clock, steps, touch and crown (nothing elsewhere)
  step("wifi");    loadWifi();                // C-52: uplinkLoop joins the strongest known network in range
  step("lights");  ledsBegin();
  step("sound");   soundBegin();
  routinesBegin();                            // C-67: the routine types this board has
  if (board.ir) flareBegin();                 // C-51: an older single learned code becomes the first remote
  step("settings"); loadSettings(); brainLoad();   // C-76: the offline brain's link, if one was set
  step("bluetooth"); linkBegin();             // C-55: Bluetooth, for the phone
  lastInput = millis();
  page = homePage();                          // C-42: it starts at home
  draw();
  step("ready");
}

void loop() {
  readUsb();
  readPhone();
  readEncoder();
  readKey();
  uint32_t now = millis();
  watchLoop(now);                           // C-71
  if (now - lastHello > HELLO_MS) { lastHello = now; Serial.println(String("HELLO daemons-companion ") + board.id + " 3 " + deviceId()); dirty = true; }   // C-80: its own name
  static uint32_t phoneHelloAt = 0;          // C-80: the phone carries the board's name on, so it hears it now and then
  if (linkPhoneHere() && (phoneHelloAt == 0 || now - phoneHelloAt > 30000)) {
    phoneHelloAt = now; linkSend(String("HELLO daemons-companion ") + board.id + " 3 " + deviceId());
  }
  if (!linkPhoneHere()) phoneHelloAt = 0;
  batteryLoop(now);                         // C-63
  if (!bridgeLive() && online()) {
    if (now - lastPoll > POLL_MS || (!st.have && now - lastPoll > 5000)) { lastPoll = now; httpState("GET", "/api/device/state", ""); }
    pollCommands(now);                        // C-32: what the site sent, over Wi-Fi
  }
  if (flashUntil && now > flashUntil) { flashUntil = 0; dirty = true; }
  askForArt();
  uplinkLoop(now);
  linkLoop(now);                            // C-55
  meetLoop(now, cfg.meet, st.carrying ? st.daemon.species : 0);   // C-15
  meetReport();
  static bool wifiWas = false;              // C-52: the site hears at once when the board joins or leaves a network
  if (wifiWas != (WiFi.status() == WL_CONNECTED)) { wifiWas = !wifiWas; reportNetworks(); dirty = true; }
  if (phoneSeen && !linkPhoneHere()) { phoneSeen = 0; dirty = true; }   // C-57: gone; the next one proves itself again
  ledsLoop();
  soundIdle();                              // C-75: the M5GO and Fire let their DAC go between sounds
  static bool wasUndoable = false;
  if (wasUndoable != undoable()) { wasUndoable = undoable(); dirty = true; }
  // C-42: any menu, left alone, goes to sleep; waking lands at home
  if (!asleep && cfg.sleepAfter > 0 && now - lastInput > (uint32_t)cfg.sleepAfter * 1000) sleepNow();
  // the daemon at home is alive: redraw it a few times a second
  static uint32_t lifeAt = 0;
  if (!asleep && screen == HOME && page == DAEMON && st.carrying && now - lifeAt > 90) { lifeAt = now; dirty = true; }
  if (dirty && !asleep) draw();
  delay(1);
}

