// C-69, C-70: the T-Embed SI4732's radio, in the type chart's words (the user, 2026-10-07): AM is LATENT -- what is hidden
// in the noise -- and FM is CONTEXT -- reading what the air carries.
//
// The SI4732 (I2C 0x63 or 0x11 on the T-Embed's bus, reset on IO16) plays its sound through its own amplifier, never
// through the ESP32, so what the board can read of the air is what the chip reports: the signal's strength (RSSI, dBuV)
// and its signal-to-noise (dB), and on FM the station's RDS. The two experiments are built on those numbers:
//
//   LIGHTNING (AM): a lightning stroke is a burst of radio across the low bands (a sferic), heard on AM as a crash.
//   Tuned to a quiet frequency, the strength is sampled fifty times a second; a jump well above the quiet is counted.
//   A storm within a few hundred kilometres is heard; so are a light switch and a motor near the board.
//
//   STATIC SYNTH (FM): tuned between stations, the strength and the noise flicker. Their lowest bits, taken in pairs and
//   kept only where the pair differs (von Neumann's way of evening out a biased coin), become random bits; the bits play
//   notes in the day's key on the board's own speaker. How random they are is to be measured on the board, not assumed.
#include <SI4735.h>
#include "app.h"
#include "leds.h"
#include "sound.h"

static SI4735 rx;
static bool rxUp = false, rxFm = false;
static const int RESET_PIN = 16;

static bool radioOn(bool fm) {
  if (!board.si4732) return false;
  if (!rxUp) {
    if (!rx.getDeviceI2CAddress(RESET_PIN)) return false;     // nothing answered at 0x11 or 0x63
    rx.setup(RESET_PIN, fm ? POWER_UP_FM : POWER_UP_AM);
    delay(250);
    rxUp = true;
  }
  if (fm) rx.setFM(6400, 10800, 9390, 10);                    // 64-108 MHz, in steps of 0.1 MHz
  else    rx.setAM(520, 1710, 1000, 10);                      // the AM band, in steps of 10 kHz
  rxFm = fm;
  if (fm) rx.setRdsConfig(1, 2, 2, 2, 2);
  rx.setVolume(40);
  return true;
}

static void radioOff() { if (rxUp) { rx.powerDown(); rxUp = false; } }

static String freqText() {
  uint16_t f = rx.getFrequency();
  return rxFm ? String(f / 100) + "." + String((f % 100) / 10) + " MHz" : String(f) + " kHz";
}

// The button inside a routine that runs the dial itself: a tap (+1), held half a second to stop (-1), or nothing (0).
// On the CC1101-style boards the top button also stops.
static int buttonEvent() {
  static bool down = false; static uint32_t at = 0;
  if (board.hasSideKey() && !digitalRead(board.sideKey)) return -1;
  bool pressed = !digitalRead(board.encKey);
  if (pressed && !down) { down = true; at = millis(); }
  if (down && pressed && millis() - at >= 500) { down = false; while (!digitalRead(board.encKey)) delay(5); return -1; }
  if (down && !pressed) { down = false; return millis() - at > 30 ? 1 : 0; }
  return 0;
}

// LISTEN: turn to tune, tap to seek the next station, hold to stop. The screen keeps the frequency, the signal and, on
// FM, the station's name and its text.
static String listen(bool fm) {
  if (!radioOn(fm)) return "No radio answered. This needs the T-Embed SI4732.";                          // DRAFT
  String name, text; uint32_t shown = 0;
  while (true) {
    int step = dialStep();
    if (step) { if (step > 0) rx.frequencyUp(); else rx.frequencyDown(); name = text = ""; shown = 0; }
    int b = buttonEvent();
    if (b < 0) break;
    if (b > 0) { progress("Seeking..."); rx.seekStationUp(); name = text = ""; shown = 0; }               // DRAFT
    if (fm) {
      rx.getRdsStatus();
      if (rx.getRdsReceived() && rx.getRdsSync() && rx.getRdsSyncFound()) {
        char *n = rx.getRdsText0A(), *t = rx.getRdsText2A();
        if (n && strlen(n)) name = String(n);
        if (t && strlen(t)) text = String(t);
      }
    }
    if (millis() - shown > 400) {
      shown = millis();
      rx.getCurrentReceivedSignalQuality();
      progress(freqText() + "    signal " + String(rx.getCurrentRSSI()) + " dBuV, " + String(rx.getCurrentSNR()) + " dB" +
               (name.length() ? "\n" + name : "") + (text.length() ? "\n" + text : "") +
               "\n\nturn: tune   tap: seek   hold: stop");                                                // DRAFT
    }
    delay(15);
  }
  String last = freqText();
  radioOff();
  return daemonName() + " listened to " + last + ".";                                                       // DRAFT
}

String runListenFm() { return listen(true); }
String runListenAm() { return listen(false); }

// LIGHTNING: twenty seconds to learn the quiet, then up to five minutes counting crashes.
String runLightning() {
  if (!radioOn(false)) return "No radio answered. This needs the T-Embed SI4732.";                          // DRAFT
  rx.setFrequency(530);                                       // the band's quiet bottom; tune with the dial if a station is there
  float quiet = 0; int learnt = 0, crashes = 0, loudest = 0;
  uint32_t t0 = millis(), shown = 0, lastCrash = 0;
  while (millis() - t0 < 300000) {
    if (int step = dialStep()) { if (step > 0) rx.frequencyUp(); else rx.frequencyDown(); learnt = 0; quiet = 0; t0 = millis(); }
    if (buttonEvent() < 0) break;
    rx.getCurrentReceivedSignalQuality();
    int rssi = rx.getCurrentRSSI();
    uint32_t now = millis();
    if (now - t0 < 20000) { quiet += rssi; learnt++; }
    else {
      float base = learnt ? quiet / learnt : rssi;
      if (rssi >= base + 12 && now - lastCrash > 250) {      // a jump of 12 dB over the quiet, at most four a second
        crashes++; lastCrash = now; loudest = max(loudest, (int)(rssi - base));
        ledsFlash();
      }
    }
    if (now - shown > 500) {
      shown = now;
      progress(now - t0 < 20000 ? "Learning the quiet at " + freqText() + "... " + String(20 - (now - t0) / 1000)
                                : freqText() + "   " + String(crashes) + (crashes == 1 ? " crash" : " crashes") +
                                  "\nquiet " + String(learnt ? quiet / learnt : 0, 0) + " dBuV, now " + String(rssi) +
                                  "\n\nturn: another frequency   hold: stop");                             // DRAFT
    }
    ledsLoop();
    delay(20);
  }
  int minutes = max(1, (int)((millis() - t0) / 60000));
  radioOff();
  return daemonName() + " heard " + String(crashes) + (crashes == 1 ? " crash" : " crashes") + " in about " + String(minutes) +
         (minutes == 1 ? " minute" : " minutes") + (crashes ? ", the loudest " + String(loudest) + " dB over the quiet." : ".") +
         "\nLightning, or something near the board switching.";                                            // DRAFT
}

// STATIC SYNTH: random bits from the static between stations, played as notes in the day's key.
String runStaticSynth() {
  if (!radioOn(true)) return "No radio answered. This needs the T-Embed SI4732.";                           // DRAFT
  rx.setFrequency(8750);                                      // the band's edge, usually empty; the dial moves it
  rx.setAudioMute(true);                                      // the radio's own hiss is not the music
  static const int8_t PENTA[] = {0, 2, 4, 7, 9, 12, 14, 16};
  uint32_t bits = 0; int have = 0, made = 0, ones = 0, notes = 0;
  int prev = -1; uint32_t t0 = millis(), shown = 0;
  String last;
  while (millis() - t0 < 120000) {
    if (int step = dialStep()) { if (step > 0) rx.frequencyUp(); else rx.frequencyDown(); }
    if (buttonEvent() < 0) break;
    rx.getCurrentReceivedSignalQuality();
    int raw = (rx.getCurrentRSSI() ^ (rx.getCurrentSNR() << 1)) & 1;   // one raw bit from the flicker
    if (prev < 0) { prev = raw; continue; }
    if (prev != raw) {                                         // von Neumann: 01 -> 0, 10 -> 1, 00 and 11 dropped
      bits = (bits << 1) | prev; have++; made++; ones += prev;
      if (have == 3) {                                         // three bits, one of eight notes
        playNoteSemis(PENTA[bits & 7], 110);
        last = String(bits & 7) + " " + last; if (last.length() > 40) last = last.substring(0, 40);
        bits = 0; have = 0; notes++;
      }
    }
    prev = -1;
    if (millis() - shown > 500) {
      shown = millis();
      progress(freqText() + "   " + String(made) + " random bits, " + String(made ? 100 * ones / made : 0) + "% ones\n" + last +
               "\n\nturn: another frequency   hold: stop");                                                  // DRAFT
    }
  }
  rx.setAudioMute(false);
  radioOff();
  return daemonName() + " played " + String(notes) + " notes from " + String(made) + " bits of static, " +
         String(made ? 100 * ones / made : 0) + "% of them ones (an even coin is 50).";                     // DRAFT
}
