// C-69, C-70: the T-Embed SI4732's radio, in the type chart's words (the user, 2026-10-07): AM is LATENT -- what is hidden
// in the noise -- and FM is CONTEXT -- reading what the air carries.
//
// The SI4732 (I2C 0x63 or 0x11 on the T-Embed's bus, reset on IO16) plays its sound through its own amplifier, never
// through the ESP32. C-101: that amplifier is muted by IO17 (HIGH mutes, LOW plays: LilyGO's SI473x_Shield example hands
// it to the library as the mute pin). Left alone, it never played a sound. What the board reads of the air is what the
// chip reports -- the signal's strength (RSSI, dBuV), its signal-to-noise (dB), on FM the station's RDS -- and, through
// its own two microphones, how loud the speaker is now.
//
// C-101 (the user, 2026-10-09: "like a psychic move the daemon can learn (frequencies) ... the daemon channels the signal
// and speaks it ... the leds should change so that it is like it is speaking along with the audio"): CHANNEL is a move.
// Tuned to a clear station and held there, the daemon attunes to it, and once attuned it has LEARNED that frequency --
// eight a band, kept on the board, marked on the dial, and a double tap away from then on. While a station plays, the
// daemon speaks it: its sprite moves with the voice and the ring of lights speaks along, both from the microphones.
//
//   LIGHTNING (AM): a lightning stroke is a burst of radio across the low bands (a sferic), heard on AM as a crash.
//   Tuned to a quiet frequency, the strength is sampled fifty times a second; a jump well above the quiet is counted.
//
//   STATIC SYNTH (FM): tuned between stations, the strength and the noise flicker. Their lowest bits, taken in pairs and
//   kept only where the pair differs (von Neumann's way of evening out a biased coin), become random bits; the bits play
//   notes in the day's key on the board's own speaker.
#include <SI4735.h>
#include <Preferences.h>
#include "app.h"
#include "leds.h"
#include "sound.h"
#include "talk.h"

void drawArt(int x, int y, int scale);                        // ui.cpp

static SI4735 rx;
static bool rxUp = false, rxFm = false;
static const int RESET_PIN = 16, MUTE_PIN = 17;

static bool radioOn(bool fm) {
  if (!board.si4732) return false;
  if (!rxUp) {
    rx.setAudioMuteMcuPin(MUTE_PIN);                          // C-101: the amplifier's mute, held while it starts
    rx.setHardwareAudioMute(true);
    if (!rx.getDeviceI2CAddress(RESET_PIN)) return false;     // nothing answered at 0x11 or 0x63
    rx.setup(RESET_PIN, fm ? POWER_UP_FM : POWER_UP_AM);
    delay(250);
    rxUp = true;
  }
  rx.setTuneFrequencyAntennaCapacitor(0);                     // C-101: automatic, as LilyGO's example sets it
  if (fm) { rx.setFM(6400, 10800, 9390, 10);                  // 64-108 MHz, in steps of 0.1 MHz
            rx.setSeekFmLimits(8750, 10800); rx.setSeekFmSpacing(10);
            rx.setSeekFmRssiThreshold(12); rx.setSeekFmSNRThreshold(4); }   // C-101: measured indoors, static read 9-20 dBuV at 0-3 dB
  else    { rx.setAM(520, 1710, 1000, 10);                    // the AM band, in steps of 10 kHz
            rx.setSeekAmLimits(520, 1710); rx.setSeekAmSpacing(10);
            rx.setSeekAmRssiThreshold(15); rx.setSeekAmSNRThreshold(3); }
  rxFm = fm;
  if (fm) { rx.RdsInit(); rx.setRdsConfig(1, 2, 2, 2, 2); }
  // C-101: the site's volume (40 by default). The SI4732's 0-63 is steep at the top: measured through the board's own
  // microphones, 45 was 26 and 63 was 184 -- so the default sits near the top, and 0 is silent.
  rx.setVolume(!cfg.sound || cfg.volume <= 0 ? 0 : constrain(44 + cfg.volume * 19 / 100, 0, 63));
  rx.setHardwareAudioMute(false);                             // C-101: and now it plays
  return true;
}

static void radioOff() { if (rxUp) { rx.setHardwareAudioMute(true); rx.powerDown(); rxUp = false; } }

static String freqNumber(uint16_t f, bool fm) { return fm ? String(f / 100) + "." + String((f % 100) / 10) : String(f); }
static String freqText() { uint16_t f = rx.getFrequency(); return freqNumber(f, rxFm) + (rxFm ? " MHz" : " kHz"); }

// The button inside a routine that runs the dial itself: a tap (1), two taps close together (2), held half a second to
// stop (-1), or nothing (0). On the CC1101-style boards the top button also stops.
static int buttonEvent() {
  static bool down = false; static uint32_t at = 0, tappedAt = 0; static int taps = 0;
  if (cableKey) { int k = cableKey; cableKey = 0; return k; }
  if (board.hasSideKey() && !digitalRead(board.sideKey)) return -1;
  bool pressed = !digitalRead(board.encKey);
  if (pressed && !down) { down = true; at = millis(); }
  if (down && pressed && millis() - at >= 500) { down = false; taps = 0; while (!digitalRead(board.encKey)) delay(5); return -1; }
  if (down && !pressed) { down = false; if (millis() - at > 30) { taps++; tappedAt = millis(); } }
  if (taps >= 2) { taps = 0; return 2; }
  if (taps == 1 && !down && millis() - tappedAt > 320) { taps = 0; return 1; }
  return 0;
}

// ---- what the daemon has learned: up to eight frequencies a band, each with the name it heard there ------------------
static const int KNOWN_MAX = 8;
struct Known { uint16_t f; String name; };
static Known known[KNOWN_MAX]; static int knownN = 0;

static void loadKnown(bool fm) {
  knownN = 0;
  Preferences p; p.begin("psy", true);
  String s = p.getString(fm ? "fm" : "am", "");
  p.end();
  int at = 0;
  while (at < (int)s.length() && knownN < KNOWN_MAX) {
    int end = s.indexOf(';', at); if (end < 0) end = s.length();
    String one = s.substring(at, end); int bar = one.indexOf('|');
    uint16_t f = (bar < 0 ? one : one.substring(0, bar)).toInt();
    if (f) known[knownN++] = { f, bar < 0 ? String("") : one.substring(bar + 1) };
    at = end + 1;
  }
}
static void saveKnown(bool fm) {
  String s;
  for (int i = 0; i < knownN; i++) { String n = known[i].name; n.replace(";", " "); n.replace("|", " "); s += String(known[i].f) + "|" + n + ";"; }
  Preferences p; p.begin("psy", false); p.putString(fm ? "fm" : "am", s); p.end();
}
static int knownAt(uint16_t f) { for (int i = 0; i < knownN; i++) if (known[i].f == f) return i; return -1; }

// ---- the screen while the radio runs (C-101) -------------------------------------------------------------------------
enum PanelMode { P_CHANNEL, P_LIGHTNING, P_SYNTH };
static struct {
  PanelMode mode; bool fm;
  uint16_t f; int rssi, snr; bool stereo;
  String name, text, status, banner;
  int level = 0;                                     // the voice now, 0..100 (the microphones, or the signal without them)
  uint8_t wave[56] = {}; int waveAt = 0;             // its last moments, for the line it speaks
  int attune = 0;                                    // 0..100: holding a clear station, the daemon attuning to it
  uint32_t bannerUntil = 0, flashUntil = 0;
  uint32_t scrollAt = 0;
} pn;

static void voice(int level) {
  pn.level = constrain(level, 0, 100);
  pn.wave[pn.waveAt] = pn.level; pn.waveAt = (pn.waveAt + 1) % 56;
}

static void signalBars(int x, int y, int rssi, uint16_t day) {   // ten bars, rising; lit to the strength
  int lit = constrain(rssi / 6, 0, 10);
  for (int i = 0; i < 10; i++) {
    int h = 3 + i * 13 / 9;
    canvas.fillRect(x + i * 5, y + 16 - h, 4, h, i < lit ? (i >= 7 ? PAPER : day) : 0x39E7);
  }
}

static void bandDial(int y, uint16_t day) {          // the band, its marks, what is known, and the needle
  int lo, hi;
  if (pn.fm) { lo = pn.f >= 8700 ? 8700 : 6400; hi = 10800; } else { lo = 520; hi = 1710; }
  int x0 = 10, x1 = W - 10;
  auto xOf = [&](int f) { return x0 + (int)((long)(f - lo) * (x1 - x0) / (hi - lo)); };
  canvas.drawFastHLine(x0, y, x1 - x0, QUIET);
  int major = pn.fm ? 200 : 100, minor = pn.fm ? 100 : 50;
  for (int f = (lo / minor) * minor; f <= hi; f += minor) {
    if (f < lo) continue;
    bool big = f % major == 0;
    canvas.drawFastVLine(xOf(f), y - (big ? 5 : 2), big ? 5 : 2, QUIET);
  }
  canvas.setTextFont(1); canvas.setTextColor(QUIET); canvas.setTextDatum(TL_DATUM);
  canvas.drawString(freqNumber(lo, pn.fm), x0, y + 3);
  canvas.setTextDatum(TR_DATUM); canvas.drawString(freqNumber(hi, pn.fm), x1, y + 3);
  canvas.setTextDatum(TL_DATUM);
  for (int i = 0; i < knownN; i++) {                 // what it has learned: a small mark above the line
    if (known[i].f < lo || known[i].f > hi) continue;
    int x = xOf(known[i].f);
    canvas.fillTriangle(x - 3, y - 10, x + 3, y - 10, x, y - 6, day);
  }
  int x = xOf(constrain((int)pn.f, lo, hi));
  canvas.fillRect(x - 1, y - 13, 3, 17, PAPER);      // the needle
}

static String drawRadio(uint16_t day, uint16_t ink) {
  uint32_t now = millis();
  bool speaking = pn.mode == P_CHANNEL && pn.level > 8;
  // the daemon, at the left: an aura that swells with its voice, and a small lift as it speaks
  int cx = 40, cy = 64;
  if (pn.mode == P_CHANNEL) {
    int r = 33 + pn.level / 10;
    canvas.drawCircle(cx, cy, r, day);
    if (speaking) canvas.drawCircle(cx, cy, r + 3 + pn.level / 20, pn.level > 60 ? PAPER : day);
  } else if (now < pn.flashUntil) canvas.fillCircle(cx, cy, 36, PAPER);      // LIGHTNING: the crash, seen
  if (artKeyHave.length() && artKeyHave == st.daemon.artKey) drawArt(cx - 32, cy - 32 - (speaking ? pn.level / 30 : 0), 1);
  else {                                             // its picture not here yet: a face that speaks all the same
    canvas.fillCircle(cx, cy, 22, day);
    canvas.fillCircle(cx - 8, cy - 6, 3, PAPER); canvas.fillCircle(cx + 8, cy - 6, 3, PAPER);
    canvas.fillRoundRect(cx - 7, cy + 7 - pn.level / 25, 14, 2 + pn.level / 12, 2, INK);
  }
  // under it: what it knows, and the attuning
  canvas.setTextFont(1); canvas.setTextDatum(TL_DATUM);
  if (pn.mode == P_CHANNEL) {
    int k = knownAt(pn.f);
    canvas.setTextColor(QUIET);
    canvas.drawString("KNOWS " + String(knownN) + "/" + String(KNOWN_MAX), 10, 104);   // DRAFT
    canvas.drawRect(10, 115, 62, 6, QUIET);
    if (k >= 0) { canvas.fillRect(11, 116, 60, 4, day); canvas.setTextColor(day); canvas.drawString("KNOWN", 10, 124); }   // DRAFT
    else if (pn.attune) {
      canvas.fillRect(11, 116, 60 * pn.attune / 100, 4, PAPER);
      canvas.setTextColor(PAPER); canvas.drawString("ATTUNING", 10, 124);   // DRAFT
    }
  } else {
    canvas.setTextColor(QUIET);
    canvas.drawString(pn.mode == P_LIGHTNING ? "LIGHTNING" : "STATIC", 10, 104);   // DRAFT
  }
  // the frequency, large, and its unit
  int fx = 84;
  canvas.setTextFont(7); canvas.setTextColor(PAPER); canvas.setTextDatum(TL_DATUM);
  String num = freqNumber(pn.f, pn.fm);
  canvas.drawString(num, fx, 30);
  int tw = canvas.textWidth(num);
  canvas.setTextFont(2); canvas.setTextColor(day);
  canvas.drawString(pn.fm ? "MHz" : "kHz", fx + tw + 4, 62);
  canvas.setTextFont(1); canvas.setTextColor(QUIET);
  canvas.drawString(pn.fm ? "CONTEXT" : "LATENT", fx + tw + 4, 34);
  if (pn.stereo) canvas.drawString("STEREO", fx + tw + 4, 46);
  // the signal
  signalBars(fx, 82, pn.rssi, day);
  canvas.setTextFont(1); canvas.setTextColor(QUIET); canvas.setTextDatum(TL_DATUM);
  canvas.drawString(String(pn.rssi) + " dBuV  " + String(pn.snr) + " dB", fx + 56, 89);
  // what the station says, or what the routine has found
  String line = pn.mode == P_CHANNEL ? (pn.name.length() || pn.text.length() ? pn.name + (pn.name.length() && pn.text.length() ? "  -  " : "") + pn.text
                                                                             : String(pn.rssi < 20 ? "static..." : "a voice with no name"))   // DRAFT
                                     : pn.status;
  canvas.setTextFont(2); canvas.setTextColor(pn.mode == P_CHANNEL && !pn.name.length() && !pn.text.length() ? QUIET : PAPER);
  int room = W - 6 - fx;
  if (canvas.textWidth(line) > room) {               // too long: it scrolls by
    String loop = line + "      ";
    int shift = ((now - pn.scrollAt) / 40) % max(1, (int)canvas.textWidth(loop));
    canvas.setClipRect(fx, 100, room, 18);
    canvas.drawString(loop + loop, fx - shift, 101);
    canvas.clearClipRect();
  } else canvas.drawString(line, fx, 101);
  // the voice: the line it speaks, its last moments either side of the middle
  int wy = 127;
  for (int i = 0; i < 56 && fx + i * 4 < W - 6; i++) {
    int v = pn.wave[(pn.waveAt + i) % 56], h = v * 8 / 100;
    uint16_t c = v > 70 ? PAPER : day;
    if (h) canvas.drawFastVLine(fx + i * 4, wy - h, h * 2 + 1, c);
    else canvas.drawPixel(fx + i * 4, wy, QUIET);
  }
  bandDial(H - 26, day);
  // a move learned: said across the middle, for a moment
  if (now < pn.bannerUntil) {
    canvas.fillRoundRect(20, 50, W - 40, 54, 6, day);
    canvas.drawRoundRect(20, 50, W - 40, 54, 6, PAPER);
    canvas.setTextDatum(MC_DATUM); canvas.setTextColor(ink);
    canvas.setTextFont(2); canvas.drawString(upper(daemonName()) + " LEARNED", W / 2, 62);   // DRAFT
    canvas.setTextFont(4); canvas.drawString(pn.banner, W / 2, 86);
    canvas.setTextDatum(TL_DATUM);
  }
  return pn.mode == P_CHANNEL ? (knownN ? "turn: tune   tap: seek   2 taps: known   hold: stop" : "turn: tune   tap: seek   hold the dial: stop")   // DRAFT
       : "turn: another frequency    hold the dial: stop";                                                                          // DRAFT
}

static void panelBegin(PanelMode mode, bool fm) {
  pn.mode = mode; pn.fm = fm; pn.name = pn.text = pn.status = ""; pn.attune = 0; pn.level = 0;
  pn.bannerUntil = pn.flashUntil = 0; pn.scrollAt = millis();
  memset(pn.wave, 0, sizeof pn.wave);
  loadKnown(fm);
  runPanel = drawRadio;
}
static void panelEnd() { runPanel = nullptr; ledsDance(-1, 0, 0); }
static void readSignal() {
  rx.getCurrentReceivedSignalQuality();
  pn.f = rx.getFrequency(); pn.rssi = rx.getCurrentRSSI(); pn.snr = rx.getCurrentSNR();
  pn.stereo = pn.fm && rx.getCurrentPilot();
}
static void frame() { progress(""); }

// The ear: how loud the speaker is, scaled against the quiet and the loudest of late, so the daemon speaks along at any
// volume. Without microphones it follows the signal's flicker instead.
struct Ear {
  bool on = false; float floor = -1, peak = 0;
  void open() { on = talkEarOpen(); floor = -1; peak = 0; }
  void close() { if (on) talkEarClose(); on = false; }
  int level() {
    if (!on) return -1;
    int rms = talkEarLevel();
    if (rms < 0) return -1;
    if (floor < 0) floor = rms;
    floor = rms < floor ? rms : floor + (rms - floor) * 0.002f;   // the quiet: falls at once, rises slowly
    peak = max(peak * 0.995f, (float)rms);                          // the loudest of late, fading
    float span = max(24.0f, peak - floor);                          // EARTEST: the radio at 45 was ~26 over a room of ~1
    return constrain((int)(100 * (rms - floor) / span), 0, 100);
  }
};

// ---- CHANNEL: the move. Turn to tune, tap to seek, two taps to the next frequency it knows, hold to stop. -------------
static String channel(bool fm) {
  if (!radioOn(fm)) return "No radio answered. This needs the T-Embed SI4732.";                          // DRAFT
  panelBegin(P_CHANNEL, fm);
  Ear ear; ear.open();
  uint32_t shown = 0, sampled = 0, clearSince = 0, t0 = millis();
  int learntNow = 0;
  readSignal();
  while (true) {
    uint32_t now = millis();
    int step = dialStep();
    if (step) {
      if (step > 0) rx.frequencyUp(); else rx.frequencyDown();
      pn.name = pn.text = ""; pn.attune = 0; clearSince = 0; pn.scrollAt = now;
      pn.f = rx.getFrequency(); frame(); continue;
    }
    int b = buttonEvent();
    if (b < 0) break;
    if (b == 1) {                                                     // seek the next station, the needle moving with it
      pn.name = "seeking..."; pn.text = ""; frame();                   // DRAFT
      rx.seekStationProgress([](uint16_t f) { pn.f = f; progress(""); }, 1);
      pn.name = pn.text = ""; pn.attune = 0; clearSince = 0; pn.scrollAt = now;
    }
    if (b == 2 && knownN) {                                           // the next frequency it knows, above this one
      int next = -1;
      for (int i = 0; i < knownN; i++) if (known[i].f > pn.f && (next < 0 || known[i].f < known[next].f)) next = i;
      if (next < 0) for (int i = 0; i < knownN; i++) if (next < 0 || known[i].f < known[next].f) next = i;
      rx.setFrequency(known[next].f);
      pn.name = known[next].name; pn.text = ""; pn.attune = 0; clearSince = 0; pn.scrollAt = now;
      ledsFlash();
    }
    if (fm) {
      rx.getRdsStatus();
      if (rx.getRdsReceived() && rx.getRdsSync() && rx.getRdsSyncFound()) {
        char *n = rx.getRdsText0A(), *t = rx.getRdsText2A();
        if (n && strlen(n)) { String s = String(n); s.trim(); if (s.length()) pn.name = s; }
        if (t && strlen(t)) { String s = String(t); s.trim(); if (s.length() && s != pn.text) { pn.text = s; pn.scrollAt = now; } }
      }
    }
    if (now - sampled >= 100) {                                       // ten times a second: the signal, and attuning
      sampled = now;
      readSignal();
      bool clear = fm ? (pn.rssi >= 18 && pn.snr >= 6) : (pn.rssi >= 25 && pn.snr >= 8);   // over the static measured (0-3 dB)
      if (knownAt(pn.f) >= 0) pn.attune = 0;
      else if (clear) {
        if (!clearSince) clearSince = now;
        pn.attune = min(100, (int)((now - clearSince) / 40));           // four seconds held clear
        if (pn.attune >= 100) {                                         // learned
          if (knownN == KNOWN_MAX) { for (int i = 1; i < knownN; i++) known[i - 1] = known[i]; knownN--; }   // the oldest forgotten
          known[knownN++] = { pn.f, pn.name };
          saveKnown(fm);
          pn.banner = freqNumber(pn.f, fm) + (fm ? " FM" : " AM"); pn.bannerUntil = now + 2600;   // DRAFT
          pn.attune = 0; clearSince = 0; learntNow++;
          frame();
          for (int k = 0; k < 6; k++) { ledsDance(DANCE_BLOOM, k, 6); delay(70); }
          ledsDance(-1, 0, 0);
        }
      } else { clearSince = 0; pn.attune = max(0, pn.attune - 10); }
      int k = knownAt(pn.f);                                          // a name heard after it was learned is kept
      if (k >= 0 && pn.name.length() && !known[k].name.length()) { known[k].name = pn.name; saveKnown(fm); }
    }
    int heard = ear.level();
    static uint32_t told = 0;                                         // for a check from the computer
    if (now - told > 2000) { told = now; Serial.printf("CHANNEL %u rssi %d snr %d ear %d level %d floor %.0f peak %.0f\n", pn.f, pn.rssi, pn.snr, ear.on, heard, ear.floor, ear.peak); }
    if (heard >= 0) voice(pn.snr < 3 ? heard / 3 : heard);           // static is not a voice: a murmur, not speech
    else if (!ear.on) voice(pn.rssi >= 20 ? constrain(pn.snr * 4 + (int)random(-15, 15), 0, 100) : 0);   // no ear: the signal's flicker
    if (now >= pn.bannerUntil) ledsVoice(pn.level);
    ledsLoop();
    if (now - shown >= 40) { shown = now; frame(); }                  // twenty-five frames a second, at most
    delay(4);
  }
  ear.close();
  panelEnd();
  String last = freqText();
  radioOff();
  int minutes = (millis() - t0) / 60000;
  return daemonName() + " channelled " + last + (minutes ? " for " + String(minutes) + (minutes == 1 ? " minute" : " minutes") : String("")) +
         (learntNow ? " and learned " + String(learntNow) + (learntNow == 1 ? " frequency" : " frequencies") : String("")) +
         ". It knows " + String(knownN) + " on " + (fm ? "FM" : "AM") + ".";                          // DRAFT
}

// C-101: EARTEST down the cable -- what the microphones hear: the room, the board's own speaker playing a note, and
// the radio on static with its amplifier muted, then playing. Says whether the radio can be heard at all.
String radioEarTest() {
  if (!talkEarOpen()) return "EARTEST no ear";
  auto listen = [](uint32_t ms) { uint32_t t = millis(); long sum = 0; int n = 0, top = 0;
    while (millis() - t < ms) { int v = talkEarLevel(); if (v >= 0) { sum += v; n++; top = max(top, v); } delay(10); }
    return String(n ? sum / n : -1) + "/" + String(top); };
  String out = "EARTEST room " + listen(800);
  out += " note ";
  { uint32_t t = millis(); long sum = 0; int n = 0, top = 0;
    playNoteSemis(12, 700);
    while (millis() - t < 700) { int v = talkEarLevel(); if (v >= 0) { sum += v; n++; top = max(top, v); } delay(10); }
    out += String(n ? sum / n : -1) + "/" + String(top); }
  if (radioOn(true)) {
    rx.setFrequency(8770);
    rx.setHardwareAudioMute(true);  delay(300); out += " radio-muted " + listen(800);
    rx.setHardwareAudioMute(false); delay(300); out += " radio-playing " + listen(800);
    rx.setVolume(63);               delay(300); out += " radio-loudest " + listen(800);
    pinMode(MUTE_PIN, INPUT);       delay(300); out += " pin17-loose " + listen(800);
    pinMode(MUTE_PIN, OUTPUT);
    readSignal(); out += " (" + String(pn.rssi) + " dBuV)";
    radioOff();
  } else out += " no radio";
  talkEarClose();
  return out;
}

String runListenFm() { return channel(true); }
String runListenAm() { return channel(false); }

// LIGHTNING: twenty seconds to learn the quiet, then up to five minutes counting crashes.
String runLightning() {
  if (!radioOn(false)) return "No radio answered. This needs the T-Embed SI4732.";                          // DRAFT
  rx.setFrequency(530);                                       // the band's quiet bottom; tune with the dial if a station is there
  panelBegin(P_LIGHTNING, false);
  float quiet = 0; int learnt = 0, crashes = 0, loudest = 0;
  uint32_t t0 = millis(), shown = 0, lastCrash = 0;
  while (millis() - t0 < 300000) {
    if (int step = dialStep()) { if (step > 0) rx.frequencyUp(); else rx.frequencyDown(); learnt = 0; quiet = 0; t0 = millis(); }
    if (buttonEvent() < 0) break;
    readSignal();
    int rssi = pn.rssi;
    uint32_t now = millis();
    float base = learnt ? quiet / learnt : rssi;
    if (now - t0 < 20000) { quiet += rssi; learnt++; }
    else if (rssi >= base + 12 && now - lastCrash > 250) {   // a jump of 12 dB over the quiet, at most four a second
      crashes++; lastCrash = now; loudest = max(loudest, (int)(rssi - base));
      pn.flashUntil = now + 150; ledsFlash();
    }
    voice(constrain((int)((rssi - base) * 100 / 24), 0, 100));
    pn.status = now - t0 < 20000 ? "learning the quiet... " + String(20 - (now - t0) / 1000)
                                 : String(crashes) + (crashes == 1 ? " crash" : " crashes") + "   quiet " + String(base, 0) + " dBuV";   // DRAFT
    ledsLoop();
    if (now - shown >= 60) { shown = now; frame(); }
    delay(20);
  }
  panelEnd();
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
  panelBegin(P_SYNTH, true);
  static const int8_t PENTA[] = {0, 2, 4, 7, 9, 12, 14, 16};
  uint32_t bits = 0; int have = 0, made = 0, ones = 0, notes = 0;
  int prev = -1; uint32_t t0 = millis(), shown = 0;
  while (millis() - t0 < 120000) {
    if (int step = dialStep()) { if (step > 0) rx.frequencyUp(); else rx.frequencyDown(); }
    if (buttonEvent() < 0) break;
    readSignal();
    int raw = (pn.rssi ^ (pn.snr << 1)) & 1;                  // one raw bit from the flicker
    if (prev < 0) { prev = raw; continue; }
    if (prev != raw) {                                         // von Neumann: 01 -> 0, 10 -> 1, 00 and 11 dropped
      bits = (bits << 1) | prev; have++; made++; ones += prev;
      if (have == 3) {                                         // three bits, one of eight notes
        voice(20 + (bits & 7) * 11);
        ledsVoice(pn.level);
        playNoteSemis(PENTA[bits & 7], 110);
        bits = 0; have = 0; notes++;
      }
    } else voice(pn.level * 8 / 10);
    prev = -1;
    pn.status = String(notes) + " notes   " + String(made) + " bits, " + String(made ? 100 * ones / made : 0) + "% ones";   // DRAFT
    ledsLoop();
    if (millis() - shown >= 60) { shown = millis(); frame(); }
  }
  panelEnd();
  rx.setAudioMute(false);
  radioOff();
  return daemonName() + " played " + String(notes) + " notes from " + String(made) + " bits of static, " +
         String(made ? 100 * ones / made : 0) + "% of them ones (an even coin is 50).";                     // DRAFT
}
