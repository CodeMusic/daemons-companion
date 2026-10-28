// The daemon's routines: what this board's radios can do, named in the game's words (C-67: from main.cpp).
#include <WiFi.h>
#include "app.h"
#include "radios.h"
#include "leds.h"
#include "sound.h"

// ---- C-28: the device's ROUTINES -- the board's radios, named in the game's words ----------------------------------
// The user chose the names (2026-10-04): FLARE (IR), WHISPER (Bluetooth), TOUCHSTONE (NFC), LONGWAVE (Sub-GHz), and
// UPLINK (Wi-Fi). Each routine runs on the author's own gear only (CONTEXT.md); the radio ones are in radios.cpp. A type
// with nothing wired yet opens on an empty list, which is fine (LONGWAVE, until it is tried with the board in hand).
String runNetworksInRange();
String runChooseRemote();
String runTheaterMode();
String runJoinNetwork();
String runWifiMotion();                   // C-70: experiments.cpp
String runWhatsOnTheAir(); String runFindIt();   // LONGWAVE: longwave.cpp
String runWhatRemote();                   // FLARE: radios.cpp
String runListenFm(); String runStaticSynth(); String runListenAm(); String runLightning();   // C-69, C-70: radio.cpp
String runNearby(); String runCallOut();   // C-72: MESH (LoRa), lora.cpp
#include "broadcast.h"                    // C-134: CHORUS, broadcast.cpp
String runSongbook(); String runPlayFreely();   // T-426: MUSIC, play.cpp
String runSeeTheHeat(); String runWarmestThing(); String runSomeonesHere(); String runHowWarm();   // C-148: GLOW, glow.cpp
#include "casino.h"                       // C-149: CASINO, casino.cpp
String runWakeMe(); String runStopwatch(); String runCountdown();   // C-205: HOURS, clock.cpp
String runMeeting(); String runLastMeeting(); String runSendKept();  // C-212: meeting.cpp
String runBooks();                        // C-208: BOOKS, books.cpp
static const Routine FLARE_ROUTINES[]      = { { "TEACH A REMOTE", runTeachRemote }, { "POWER", runPower },
                                               { "VOLUME UP", runVolumeUp }, { "VOLUME DOWN", runVolumeDown },
                                               { "THEATER MODE", runTheaterMode }, { "CHOOSE A REMOTE", runChooseRemote },
                                               { "WHAT REMOTE IS THIS", runWhatRemote } };   // listening only, DRAFT
// C-150: a board whose IR only sends (the T-Watch, the StickC-Plus) -- FLARE's sending routines, nothing that listens
static const Routine FLARE_SEND_ROUTINES[] = { { "POWER", runPower }, { "VOLUME UP", runVolumeUp }, { "VOLUME DOWN", runVolumeDown },
                                               { "THEATER MODE", runTheaterMode }, { "CHOOSE A REMOTE", runChooseRemote } };
static const Routine WHISPER_ROUTINES[]    = { { "PAIR MY PHONE", runPairMyPhone }, { "OPEN TO MY PHONE", runOpenToMyPhone },
                                               { "FORGET MY PHONES", runForgetPhones } };
static const Routine TOUCHSTONE_ROUTINES[] = { { "HOLD A CARD", runCard }, { "READ MY TAG", runReadMyTag } };   // C-124, DRAFT
static const Routine NOTE_ROUTINES[]       = { { "A NOTE FOR A CARD", runCardNote } };   // C-124: the T-Deck, DRAFT
static const Routine CONTEXT_ROUTINES[]    = { { "CHANNEL", runListenFm }, { "STATIC SYNTH", runStaticSynth } };   // C-69: FM, DRAFT
static const Routine LATENT_ROUTINES[]     = { { "CHANNEL", runListenAm }, { "LIGHTNING", runLightning } };      // C-69: AM, DRAFT
static const Routine LONGWAVE_ROUTINES[]   = { { "WHAT'S ON THE AIR", runWhatsOnTheAir }, { "FIND IT", runFindIt } };   // receive only, DRAFT
static const Routine MESH_ROUTINES[]       = { { "NEARBY", runNearby }, { "CALL OUT", runCallOut } };   // C-72: LoRa, DRAFT (MESH was held for it, PLAN 10)
static const Routine MUSIC_ROUTINES[]      = { { "SONGBOOK", runSongbook }, { "PLAY FREELY", runPlayFreely } };   // T-426, DRAFT
static const Routine CHORUS_ROUTINES[]     = { { "TO EVERY DAEMON", runToEveryone }, { "WHAT CAME", runWhatCame } };   // C-134, DRAFT
static const Routine GLOW_ROUTINES[]      = { { "SEE THE HEAT", runSeeTheHeat }, { "WARMEST THING", runWarmestThing },
                                               { "SOMEONE'S HERE", runSomeonesHere }, { "HOW WARM IS THAT", runHowWarm } };   // C-148: the user's names, DRAFT
static const Routine HOURS_ROUTINES[]      = { { "WAKE ME", runWakeMe }, { "STOPWATCH", runStopwatch }, { "COUNTDOWN", runCountdown },
                                               { "RECORD A MEETING", runMeeting }, { "LAST MEETING", runLastMeeting },
                                               { "SEND KEPT MEETINGS", runSendKept } };   // C-205; C-212, DRAFT
static const Routine BOOKS_ROUTINES[]      = { { "READ", runBooks } };   // C-208, DRAFT
static const Routine CASINO_ROUTINES[]     = { { "SLOTS", runSlots } };   // C-149, DRAFT
static const Routine UPLINK_ROUTINES[]     = { { "NETWORKS IN RANGE", runNetworksInRange }, { "TEACH A NETWORK", runJoinNetwork },
                                               { "WI-FI MOTION", runWifiMotion } };   // C-70, DRAFT

// C-67: the types this board can run -- the CC1101's radios only where they are; Bluetooth and Wi-Fi everywhere.
RoutineType types[14];
int typeCount = 0;
void routinesBegin() {
  typeCount = 0;
  if (board.hatSda >= 0) types[typeCount++] = { "GLOW",  "Thermal",   GLOW_ROUTINES,       4 };   // C-148: the board's own sense first; DRAFT
  types[typeCount++] =                     { "CASINO",     "the game's money", CASINO_ROUTINES, 1 };   // C-149: every board, first (after the StickC-Plus's GLOW), DRAFT
  if (board.ir)     types[typeCount++] = board.irRx >= 0 ? RoutineType{ "FLARE", "IR", FLARE_ROUTINES, 7 }
                                                         : RoutineType{ "FLARE", "IR out", FLARE_SEND_ROUTINES, 5 };   // C-150
  types[typeCount++] =                     { "CHORUS",     "every way", CHORUS_ROUTINES,     2 };   // C-134: every board, DRAFT
  if (isWatch()) types[typeCount++] = { "BOOKS", "the books the save holds", BOOKS_ROUTINES, 1 };   // C-208, DRAFT
  if (isWatch()) types[typeCount++] = { "HOURS", "the daemon keeps time", HOURS_ROUTINES, 6 };   // C-205, DRAFT
  if (board.keyboard || isWatch()) types[typeCount++] = { "MUSIC", "the game's instrument", MUSIC_ROUTINES, 2 };   // T-426: the boards with number keys; the watches' strings and holes, DRAFT
  types[typeCount++] =                     { "WHISPER",    "Bluetooth", WHISPER_ROUTINES,    3 };
  if (board.nfc)    types[typeCount++] = { "TOUCHSTONE", "NFC",       TOUCHSTONE_ROUTINES, 2 };
  else if (board.keyboard) types[typeCount++] = { "TOUCHSTONE", "a card, through a reader", NOTE_ROUTINES, 1 };   // C-124
  if (board.cc1101) types[typeCount++] = { "LONGWAVE",   "Sub-GHz",   LONGWAVE_ROUTINES,   2 };
  if (board.loraChip != LoraChip::None) types[typeCount++] = { "MESH", "LoRa", MESH_ROUTINES, 2 };   // C-72, DRAFT
  if (board.si4732) types[typeCount++] = { "LATENT",     "AM",        LATENT_ROUTINES,     2 };   // C-69: the user's names
  if (board.si4732) types[typeCount++] = { "CONTEXT",    "FM",        CONTEXT_ROUTINES,    2 };
  if (!partyFirst()) types[typeCount++] = { "PARTY",      "the game",  nullptr,             0 };   // C-68, DRAFT
  types[typeCount++] =                     { "UPLINK",     "Wi-Fi",     UPLINK_ROUTINES,     3 };
}

// C-68: GAME ROUTINES. A board with no radios of its own (the plain T-Embed; the SI4732 until its own types, C-69) opens
// the party from ROUTINES, with its Bluetooth and Wi-Fi a row below; the CC1101 reaches the same screen as its PARTY type.
// C-148: a board with a HAT header is not one -- GLOW is a sense of its own, so it opens on the types, GLOW first.
// C-149: nor the three-button boards, whose B opens the ROUTINE TYPES at once -- the CASINO, then the party among them
bool partyFirst() { return !board.ir && !board.cc1101 && !board.nfc && !board.si4732 && board.loraChip == LoraChip::None && board.hatSda < 0 && !board.threeKeys(); }   // the SI4732 has its radio (C-69); LoRa is a radio too (C-72)
bool isPartyType(int i) { return i >= 0 && i < typeCount && !strcmp(types[i].name, "PARTY"); }
int partyRows() { return st.partyN + (partyFirst() ? 1 : 0); }
// The user, 2026-10-15, asking how WHISPER is reached on the M5GO and the Fire: below the whole party, about seven
// presses from home. On a party-first board the RADIOS row now comes first -- row 0 -- and the party after it.
// partyAt keeps its meaning (a member's index; partyN the radios), so only the order on the screen moves.
int partyRowOf(int at) { return partyFirst() ? (at >= st.partyN ? 0 : at + 1) : at; }
int partyAtRow(int row) { return partyFirst() ? (row == 0 ? st.partyN : row - 1) : row; }

void playGameRoutine() {
  const Member &m = st.party[partyAt];
  if (moveAt >= m.n) return;
  flash = m.name + " used " + m.routine[moveAt] + "!"; flashUntil = millis() + 2500;   // DRAFT -- the game's own line
  draw();
  soundGameRoutine(m.routine[moveAt], m.type[moveAt], m.colour[moveAt]);
  dirty = true;
}

String runChooseRemote() {
  if (!flareCount()) return daemonName() + " knows no remote yet.\nChoose TEACH A REMOTE, or add one by brand on the site.";
  pickRemoteNext = true; remoteAt = flareActive();
  return "";
}
void runRoutine() {
  const RoutineType &t = types[typeAt];
  runResult = "Running...";
  screen = RUN;
  draw();
  if (strcmp(t.name, "CASINO")) soundRoutine(t.name);   // C-40: its tune, the ring dancing (C-149: the CASINO pulls its own lever)
  routineRunning = true;
  runResult = t.routines[routineAt].run();
  routineRunning = false; lastInput = millis();
  if (joinNext) { joinNext = false; screen = PICK_NET; netAt = 0; }       // C-33: JOIN A NETWORK goes on to choose one
  if (pickRemoteNext) { pickRemoteNext = false; screen = PICK_REMOTE; }    // C-51: CHOOSE A REMOTE, a list
  if (!strcmp(t.name, "FLARE") && routineAt == 0) reportRemotes();         // a remote taught: the site hears of it
  while (giveUp()) delay(10);                 // a give-up press is spent here, not read again as "back"
  sideWas = true;
  report("routine", String(t.name) + "/" + t.routines[routineAt].name);
  activity(1, String(t.routines[routineAt].name), 0);           // C-183
  dirty = true;
}

// ---- UPLINK (Wi-Fi): the networks in range, by name and strength. Lists only; joins nothing. --------------------
// C-58: THEATER MODE -- the board becomes the remote (the user, 2026-10-05): the front button is POWER, the dial
// clockwise VOLUME UP and counter-clockwise VOLUME DOWN, one press of the remote for each click of the dial, until the
// top button. It holds the controls, so the site cannot start it.
String runTheaterMode() {
  if (!flareCount()) return daemonName() + " knows no remote yet.\nChoose TEACH A REMOTE, or add one by brand on the site.";
  String head = "THEATER MODE  (" + flareName(flareActive()) + ")\npress: POWER\nright: VOLUME UP    left: VOLUME DOWN\ntop button: done";
  progress(head);
  int8_t last = (digitalRead(board.encA) << 1) | digitalRead(board.encB), sum = 0;
  static const int8_t table[16] = {0, -1, 1, 0, 1, 0, 0, -1, -1, 0, 0, 1, 0, 1, -1, 0};
  bool keyWas = digitalRead(board.encKey);
  uint32_t keyAt = 0;
  while (!giveUp()) {
    int8_t now = (digitalRead(board.encA) << 1) | digitalRead(board.encB);
    sum += table[(last << 2) | now];
    last = now;
    String sent;
    if (sum >= 4 || sum <= -4) {
      int step = sum > 0 ? 1 : -1;
      sum = 0;
      ledsSpin(step);
      sent = step > 0 ? runVolumeUp() : runVolumeDown();
    }
    bool key = digitalRead(board.encKey);
    if (!key && keyWas && millis() - keyAt > 150) { keyAt = millis(); ledsFlash(); sent = runPower(); }
    keyWas = key;
    if (sent.length()) progress(head + "\n\n" + sent.substring(0, sent.indexOf('\n')));   // what went, in its first line
    ledsLoop();
    delay(1);
  }
  lastInput = millis();
  encLast = last; encSum = 0;               // the main loop's dial picks up from here, not from before
  return "THEATER MODE: done.";
}

String runNetworksInRange() {
  if (!wifiSet()) WiFi.mode(WIFI_STA);   // with no network set the radio is idle; it listens for the scan
  int n = WiFi.scanNetworks();
  if (n <= 0) return n == 0 ? "No networks in range." : "The scan did not finish. Press to try again.";
  String out = daemonName() + " hears " + String(n) + (n == 1 ? " network" : " networks") + "  (* it knows):";
  for (int i = 0; i < n && i < 6; i++) {
    String name = WiFi.SSID(i);
    bool known = false;
    for (int k = 0; k < knownCount; k++) if (knownSsid[k] == name) known = true;
    if (!name.length()) name = "(hidden)";
    bool on = WiFi.status() == WL_CONNECTED && WiFi.SSID() == WiFi.SSID(i);   // C-52: the one it has joined
    out += "\n" + String(on ? "> " : known ? "* " : "  ") + name + "  " + String(WiFi.RSSI(i)) + " dBm" + (on ? "  joined" : "");
  }
  WiFi.scanDelete();
  return out;
}

// ---- UPLINK (Wi-Fi): JOIN A NETWORK -- choose one in range, type its password on the wheel (C-33). --------------------
String runJoinNetwork() {
  if (!wifiSet()) WiFi.mode(WIFI_STA);
  int n = WiFi.scanNetworks();
  if (n <= 0) return n == 0 ? "No networks in range." : "The scan did not finish. Press to try again.";
  netCount = 0;
  for (int i = 0; i < n && netCount < 12; i++) {
    if (!WiFi.SSID(i).length()) continue;      // a hidden network cannot be chosen by name
    nets[netCount] = WiFi.SSID(i); netRssi[netCount++] = WiFi.RSSI(i);
  }
  WiFi.scanDelete();
  if (!netCount) return "Only hidden networks are in range.";
  joinNext = true;
  return "";
}

