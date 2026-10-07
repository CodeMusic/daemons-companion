// The companion on a handheld: setup and the loop. What each part does is in app.h.
#include <WiFi.h>
#include "app.h"
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
  step("start");
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
  step("settings"); loadSettings();
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
  if (now - lastHello > HELLO_MS) { lastHello = now; Serial.println(String("HELLO daemons-companion ") + board.id + " 3"); dirty = true; }
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

