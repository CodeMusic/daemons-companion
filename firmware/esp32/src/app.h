#pragma once
// The companion on a handheld (C-26; one base for every board since C-67). It shows what GET /api/device/state says --
// the Xenith day, the season, the ONE next step, and the daemon you carry -- and ticks the step off when the dial is
// pressed (POST /api/device/ticks).
//
// Three ways to the server, one protocol:
//   Wi-Fi  -- the board joins a network it has learned and asks the server itself (net.cpp).
//   USB    -- usb_bridge.py on the computer relays it over the cable: HELLO and TICK lines one way, STATE lines back.
//   Phone  -- the companion app carries the same lines over Bluetooth (link.cpp, C-55).
// A bridge (USB or phone) that has spoken lately wins over Wi-Fi.
//
// The parts: state.cpp (what the server said, and the settings), net.cpp (Wi-Fi, the server, the bridges, the site's
// commands), ui.cpp (the screens), input.cpp (the dial and buttons, sleep), routines.cpp (the daemon's routines),
// main.cpp (setup and loop). board.cpp and display.cpp are the hardware.
#include <Arduino.h>
#include <ArduinoJson.h>
#include "board.h"
#include "display.h"
#include "battery.h"
#include "watch.h"

static const uint32_t POLL_MS = 30000, USB_FRESH_MS = 15000, HELLO_MS = 3000, UNDO_MS = 15000;
static const int MAX_NETS = 8;            // C-52: the networks the board has learned
static const uint16_t INK = 0x18E4, PAPER = 0xFFDE, QUIET = 0x8C51;

// ---- what the server says (state.cpp) -------------------------------------------------------------------------------
struct Daemon { String name, nickname, holding, category, entry, types, artKey; int level = 0, friendship = 0, species = 0;
                String word, cue; int fed = 0, watered = 0, due = 0;              // C-13: its life, as the server reads it
                int grownTo = 0; };                                               // C-45: the level it has grown to here
// C-68: a party daemon, and its routines as the game names them, each with the colour its streak takes on this body
struct Member { String name, types; int level = 0, n = 0; String routine[4], type[4]; uint32_t colour[4] = {}; };
struct State {
  bool have = false;
  String date, edition, season, day, colour = "#5b6b8c", menu = "#5b6b8c", led = "#4060ff", note, virtue, chakra, theme;
  long step = -1; String stepText, goal, milestone; int msAt = 0, msOf = 0;   // C-49: its milestone, if in one
  bool carrying = false; Daemon daemon;
  Member party[6]; int partyN = 0;          // C-68
};
// C-43: the board's settings, set on the site and carried in the state; kept in flash for when it is unlinked
struct Settings { String home = "daemon"; int sleepAfter = 120; bool sound = true; int volume = 40; int ring = 33;
                  bool meet = true; int band = 433; };         // meet: C-15, meeting others nearby; band: C-72, LoRa
extern State st;
extern Settings cfg;
extern bool dirty;
extern uint16_t artPal[16];
extern uint8_t artPix[2048];
extern String artKeyHave;
extern uint32_t artAskedAt;
void loadSettings();
void takeSettings(JsonVariant s);
bool takeState(const String &json);
bool takeArt(const String &json);
int dayIndex();                           // C-50: Sunday 0, for its tunes
String daemonName();                      // C-51: the routines speak in its name

// ---- where you are (ui.cpp, input.cpp) ------------------------------------------------------------------------------
// HOME turns between TODAY, DAEMON, ROUTINES and the DAY. ROUTINES opens a list of routine TYPES, a type its ROUTINES, a
// routine RUNs. INDEX_ENTRY: the carried daemon's (C-36). PICK_NET, TYPE_PASS: joining a network on the board (C-33).
// CARE: feed, water, train, or read its INDEX entry (C-13). PICK_REMOTE: C-51. PARTY, MOVES: GAME ROUTINES (C-68) -- the
// party, then a daemon's routines; picking one plays it, the ring lit its colour.
enum Page { TODAY, DAEMON, ROUTINES_PAGE, DAY_PAGE, FACE_PAGE };   // C-73: the Xenith day; C-71: the watch's face
Page homePage();                          // where waking lands: the watch's face, or the daemon (or TODAY, C-42)
enum Screen { HOME, TYPES, LIST, RUN, INDEX_ENTRY, PICK_NET, TYPE_PASS, CARE, PICK_REMOTE, PARTY, MOVES, TALK };   // TALK: C-66
extern Page page;
extern Screen screen;
extern int careAt, remoteAt, typeAt, routineAt, partyAt, moveAt;
extern uint32_t hopUntil;
extern bool pickRemoteNext, joinNext;
extern String nets[12]; extern int netRssi[12], netCount, netAt, wheelAt; extern String typed;
extern const char WHEEL[]; extern const int WHEEL_N;
extern String runResult;
extern String flash; extern uint32_t flashUntil;
extern bool asleep;
extern uint32_t lastInput;
extern long lastDone; extern String lastDoneText; extern uint32_t lastDoneAt;
bool undoable();
extern Battery bat;                       // C-63

void draw();
void say(const String &word);
void celebrate(const String &what);
void progress(const String &text);        // what a routine is waiting for, on the RUN screen (it answers SHOT too)
void shot();                              // the screen, down the cable
extern String (*runPanel)(uint16_t day, uint16_t ink);   // C-101: set while a routine draws its own screen; returns its footer
extern int cableKey;                      // C-101: a press sent down the cable while a routine runs (1, 2 taps, -1 stop)
extern bool routineRunning;               // a routine is at work (the RUN screen's footer says so)
String upper(String s);
int wrap(const String &text, int x, int y, int w, int font, int lineH, int maxLines, uint16_t colour, int skip = 0);
extern int entryTop, entryLines;   // C-99: the INDEX entry, scrolled this many lines; how many it has
uint16_t hex565(const String &h);
bool lightColour(const String &h);

// ---- input (input.cpp) ------------------------------------------------------------------------------------------------
extern int8_t encLast, encSum;
extern bool sideWas;
void inputBegin();
void readEncoder();
int dialStep();                           // one detent, read and spent (a routine tuning a radio)
void readKey();
void turn(int step);
void press();
void back();
bool wake();
void sleepNow();
void tick();
void untick();
bool giveUp();                            // the top button (or the held dial) while a routine waits
int buttonEvent();                        // a routine running the dial itself: 1 a tap, 2 two taps, -1 held (or the cable's KEY)
int deckTakeKey();                        // C-104: the T-Deck's keyboard, one character read and spent (0: none)
void readDeck();                          // C-104: the keyboard and the trackball, every pass of the loop

// ---- the server, the bridges, the site (net.cpp) --------------------------------------------------------------------
extern String serverUrl;
extern String knownSsid[MAX_NETS], knownPass[MAX_NETS]; extern int knownCount;
extern uint32_t usbSeen, phoneSeen, lastPoll, lastHello;
bool wifiSet();
bool online();
bool atHome();                                     // C-82: home answered last (not the relay)
bool relaySet(); bool viaRelay();                  // C-82: the relay's address and this board's key are kept; in use now
void loadAway(); void takeAway(const String &url, const String &key);
void loadWifi();
void learnNetwork(const String &ssid, const String &pass, const String &server);
void forgetNetwork(int i);
void uplinkLoop(uint32_t now);
String networksJson(bool secrets = false);    // C-93: with the passwords only for a channel that proves itself
bool takeShared(const String &json);
void netsRevSeen(long rev);
extern bool netsDue;
const char *linkName();
String http(const char *method, const String &path, const String &body, bool *ok = nullptr);
bool httpState(const char *method, const String &path, const String &body);
bool bridgeLive();
bool usbLive();                           // the cable's bridge has spoken lately
void bridge(const String &line);
void readUsb();
void readPhone();
void pollCommands(uint32_t now);
void report(const String &kind, const String &detail);
void reportRemotes();
void reportNetworks();
void meetReport();
void askForArt();
void batteryLoop(uint32_t now);           // C-63
void batteryFake(int pct);                // C-63: BATTEST <pct> down the cable -- 30 s of a pretend charge, never a sleep

// ---- the daemon's routines (routines.cpp) ---------------------------------------------------------------------------
typedef String (*RoutineFn)();
struct Routine { const char *name; RoutineFn run; };
struct RoutineType { const char *name; const char *radio; const Routine *routines; int count; };
extern RoutineType types[8];
extern int typeCount;
void routinesBegin();                     // the types this board can run
bool partyFirst();                        // C-68: ROUTINES opens the party (a board with no radios of its own)
bool isPartyType(int i);                  // C-68: the CC1101's PARTY type, which opens the same screen
int partyRows();                          // the party, and on a party-first board one more row: its radios
void playGameRoutine();                   // C-68: the chosen routine -- its tune, the ring its colour
String runTheaterMode();                  // C-58: run on the board itself, never from the site
void runRoutine();
String routinesJson();
