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
struct Den { String motif = "nest", wall = "#67625a", deep = "#3b3832", floor = "#2b2924", glow = "#e4ded3"; };   // C-113
struct Daemon { String name, nickname, holding, category, entry, types, artKey; int level = 0, friendship = 0, species = 0;
                String word, cue; int fed = 0, watered = 0, due = 0;              // C-13: its life, as the server reads it
                int grownTo = 0;                                                  // C-45: the level it has grown to here
                long expTotal = 0, expFrom = 0, expNext = 0;                      // C-183: where it stands in that level
                String tired = "awake"; Den den;                                  // C-113: asleep it stays put; its den
                String margin; };                                                 // C-149: OPUS's margin, if the save holds OPUS
// C-68: a party daemon, and its routines as the game names them, each with the colour its streak takes on this body
struct Member { String name, types; int level = 0, n = 0; String routine[4], type[4]; uint32_t colour[4] = {}; };
// C-149: THE CASINO's coins -- the save's money and what waits for SYNC (server/src/casino.ts), `seen` the newest of this
// board's reports counted in it ("<boot>.<seq>"), and the party's other daemons by slot, the reels' pictures -- and how
// the board dresses today: the holiday (server/data/holidays.json), its look, two colours and a hat; a QUIET day plain
struct Casino { bool have = false, known = false;   // known: the companion sends `casino` at all (null: no save read)
               String table[4]; int tableSpecies[4] = {}; int tableN = 0;   // C-151: our other boards at the reels, by their daemons
               float luck = 0; String why;                       // C-158: the day's luck (-1..+1), and its biggest reason in words
               int reel[3] = {}; int reelN = 0;                  // C-158: the reels' other daemons by species (seen in the game)
               String look, hat; uint32_t colour[2] = { 0, 0 };   // C-158: how it is dressed, the companion's one rule (empty: an older one)
                long money = 0, pending = 0, balance = 0; String seen; int friends[5] = {}; int friendN = 0; };
// C-211: who answers a talk first -- the hub's module or n8n, the other after the deadline -- and whether each answered
// the server's last check (a minute apart); `have` false from a companion that does not send it
struct Talk { bool have = false; String first = "n8n"; bool n8n = false, module = false; };
struct Holiday { String name, look = "none", hat = "none"; uint32_t colour[2] = { 0, 0 }; bool quiet = false, flip = false; };
struct State {
  bool have = false;
  String date, edition, season, day, colour = "#5b6b8c", menu = "#5b6b8c", led = "#4060ff", note, virtue, chakra, theme;
  long step = -1; String stepText, goal, milestone; int msAt = 0, msOf = 0;   // C-49: its milestone, if in one
  bool carrying = false; Daemon daemon;
  Member party[6]; int partyN = 0;          // C-68
  String companion, cardNote;               // C-124: whose cards are ours; a note waiting for a card
  Casino casino; Holiday holiday;           // C-149
  Talk talk;                                // C-211
  String watch, sky;                        // C-158: the real world -- the hour (DAWN DAY DUSK NIGHT) and the weather's kind
};
// C-43: the board's settings, set on the site and carried in the state; kept in flash for when it is unlinked
struct Settings { String home = "daemon"; int sleepAfter = 120; bool sound = true; int volume = 40; int ring = 33;
                  bool meet = true; int band = 433;   // meet: C-15, meeting others nearby; band: C-72, LoRa
                  bool wakeEvery = false;      // C-159: the wake jingle on every wake, not only at power-up
                  String face = "daemon";      // C-162: the round face -- daemon, clock or virtue
                  bool faceSky = true;         // C-163: the season behind the daemon's faces, and the weather in front
                  int hours = 24;              // C-166: the clock in 12 or 24 hours
                  String instrument = "default";
                  String quick = "care,music,hours"; };   // C-206: the Ultra's three buttons under its face   // PLAY to test: the save's ("default"), or "harp" or "flute" forced
void playForce(const String &name);
// C-203 (intuition.cpp): THE SUBTLE LAYER on the watches -- the daemon noticing, a read now and then, a lean at the reels
enum ReadAbout { READ_NEAR, READ_RAIN, READ_NIGHT, READ_WALK };
void intuitionFromState(JsonVariantConst s); void intuitionLoop(uint32_t now); bool intuitionOn(); String intuitionStatus();
void intuitionMoment(int about); void intuitionHeard(const String &tag, bool lora, bool mine);
bool intuitionNoticing(bool &right, float &phase); void intuitionRipple(int cx, int cy, int side, float phase);
bool readShowing(); void readDismiss(); void drawRead(uint16_t day);
void leanPull(bool pays, bool may = true); void leanResult(bool paid); void drawLean(int y);
// C-200 (night.cpp): the night and the daemon's dream
// C-174 (gps.cpp): the Ultra's GNSS -- walks, a poll, FIND
void gpsLoop(uint32_t now); void gpsFromState(JsonVariantConst f); String gpsStatus();
void clockBegin(); void clockLoop(uint32_t now); String clockStatus();   // C-205: HOURS (clock.cpp)
String alarmWords();                                       // C-205: the alarm's time, "" off
long gpsMetresToday();                                     // C-174: walked today by the GNSS, -1 none
String stepsWords(long steps);                             // "1234 STEPS", and the distance beside them where there is one
void nightBegin(); void nightLoop(uint32_t now); void nightTuck(); void nightWake();
void nightFromState(JsonVariantConst d); String nightStatus();
bool dreamShowing(); void dreamDismiss(); void drawDream(uint16_t day);       // play.cpp: an instrument forced for testing (and PLAY open), or "default"
bool dreamTap(int x, int y);
bool dreamWaiting(); bool dreamAgain();
bool quickTap(int x, int y);                               // C-206 (ui.cpp): a button under the Ultra's face                    // C-206: a dream not yet read; shown again
bool lastNight(float &hours, String &quality, long &endedAt);   // C-206: the last night told, for the heads-up                                // the dream's LISTEN tapped: read aloud
extern State st;
extern Settings cfg;
extern bool dirty;
extern uint16_t artPal[16];
extern uint8_t artPix[2048];
extern String artKeyHave;
extern uint32_t artAskedAt;
void loadSettings();
void takeSettings(JsonVariant s);
void soundSetHere(bool on);               // C-159: SOUND turned on or off on the board itself -- kept, and told to the companion
bool takeState(const String &json);
bool takeState(const char *json);
bool takeArt(const String &json);
void drawDen(int x, int y, int w, int h, int floorY);   // C-113, den.cpp
int dayIndex();                           // C-50: Sunday 0, for its tunes
String daemonName();                      // C-51: the routines speak in its name

// ---- where you are (ui.cpp, input.cpp) ------------------------------------------------------------------------------
// HOME turns between TODAY, DAEMON, ROUTINES and the DAY. ROUTINES opens a list of routine TYPES, a type its ROUTINES, a
// routine RUNs. INDEX_ENTRY: the carried daemon's (C-36). PICK_NET, TYPE_PASS: joining a network on the board (C-33).
// CARE: feed, water, train, or read its INDEX entry (C-13). PICK_REMOTE: C-51. PARTY, MOVES: GAME ROUTINES (C-68) -- the
// party, then a daemon's routines; picking one plays it, the ring lit its colour.
enum Page { TODAY, DAEMON, ROUTINES_PAGE, DAY_PAGE, FACE_PAGE, OFF_PAGE, SOUND_PAGE, TALK_PAGE };   // C-211: TALK, who answers first   // C-159: SOUND, on or off on the board   // C-73: the Xenith day; C-71: the watch's face; SWITCH OFF
Page homePage();                          // where waking lands: the watch's face, or the daemon (or TODAY, C-42)
enum Screen { HOME, TYPES, LIST, RUN, INDEX_ENTRY, PICK_NET, TYPE_PASS, CARE, PICK_REMOTE, PARTY, MOVES, TALK, COMPOSE,   // TALK: C-66; COMPOSE: C-123
              CARE_KEYS,                  // C-149: the three-button boards' CARE -- a button each, then home
              CARE_GRID,                  // C-163: the watch's CARE -- four tiles, a double tap on the face
              LAUNCH };                   // C-172: the watch's pages as tiles -- a swipe from the face
extern String composing;                  // C-123: the message being typed, to everyone nearby
void keyboardIn(int c);                   // one key from the T-Deck's keyboard (or the cable's KEY TYPE)
extern Page page;
extern Screen screen;
extern int careAt, remoteAt, typeAt, routineAt, partyAt, moveAt;
extern uint32_t hopUntil;
extern bool menuOpen;                     // C-117: three-button boards -- A and C together open it
bool quickScreen();                       // C-149: a screen the three buttons opened from home (CARE, INDEX): home after
extern uint8_t keysHeld;                  // C-121: the three buttons down right now (bit 0 A, 1 B, 2 C), lit on the screen
void keyForce(int k, bool held);          // C-121: KEY DOWN|UP A|B|C from the computer (0 A, 1 B, 2 C)
void keyForget();                         // C-121: KEY CANCEL -- what is held forgotten, nothing done
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
void say(const String &word, uint32_t ms = 1500);
void celebrate(const String &what);
void progress(const String &text);        // what a routine is waiting for, on the RUN screen (it answers SHOT too)
void shot();                              // the screen, down the cable
extern String (*runPanel)(uint16_t day, uint16_t ink);   // C-101: set while a routine draws its own screen; returns its footer
extern int cableKey;                      // C-101: a press sent down the cable while a routine runs (1, 2 taps, -1 stop)
extern bool routineRunning;               // a routine is at work (the RUN screen's footer says so)
String upper(String s);
int wrap(const String &text, int x, int y, int w, int font, int lineH, int maxLines, uint16_t colour, int skip = 0);
int listRowsFit();                         // list rows a screen holds clear of its footer: 5, or 3 on the StickS3
extern int entryTop, entryLines;   // C-99: the INDEX entry, scrolled this many lines; how many it has
uint16_t hex565(const String &h);
bool lightColour(const String &h);
uint16_t readable(uint16_t c);             // the day's colour as text on the dark ground, lifted when dark

// ---- input (input.cpp) ------------------------------------------------------------------------------------------------
extern int8_t encLast, encSum;
extern bool sideWas;
void inputBegin();
void readEncoder();
int dialStep();                           // one detent, read and spent (a routine tuning a radio)
void routineInput(int &step, int &ev);    // C-134 (broadcast.cpp): every board's controls inside a routine; C-148 GLOW too
void playFromState(JsonVariantConst p);    // T-426 (play.cpp): what the save holds of the instrument
void playBenchUnlock();                    // T-426: PLAY UNLOCK down the cable -- open on this board until it restarts
String playStatus();                       // T-426: PLAY? down the cable
void readKey();
void turn(int step);
void press();
void back();
bool wake();
void sleepNow();
void tick();
void untick();
bool giveUp();                            // the top button (or the held dial) while a routine waits
bool routineQuit();                       // the same, but never a touch: for routines that read swipes and taps themselves
int buttonEvent();                        // a routine running the dial itself: 1 a tap, 2 two taps, -1 held (or the cable's KEY)
void touchStep(int step);                 // C-161: a swipe, for dialStep() to give a routine (input.cpp)
bool wide();                              // C-105: a screen wide enough for two columns (the T-Display-S3 Pro's 480)
void talkSpot(int &x, int &y);            // where the face's TALK button is (drawn there, touched there)
int talkReach();                          // C-162: how far from it a finger still talks -- the daemon is larger than a button
bool faceHasDaemon();                     // C-162: the face shows the daemon (and holding it talks)
// C-163 (faces.cpp): the faces' sky and weather, and the watch's CARE grid
String seasonLook();                      // casino.cpp: the companion's dress -- leaves, petals, snow, rain, stars ...
uint32_t seasonColour(int k);             // casino.cpp: its two colours, 0 and 1
bool faceSkyOn();
void faceSky(int hillTop);                // the season's sky in the face's circle, and the hill the daemon stands on
void faceWeather();                       // the weather (or the season's own) falling in front
void edgedString(const String &s, int x, int y, uint16_t colour);   // words edged in INK, over the sky
extern int gridAt;
int careGridAt(int x, int y);             // the tile at a point, or -1
int careGridKind(int tile);               // careDo's kind for a tile
void openCareGrid();
void drawCareGrid(uint16_t day, uint16_t ink);
bool tapAt(int x, int y, int &off, bool area = false);   // C-161, C-172: the row or tile tapped, as an offset from the chosen one
void tapRect(int x, int y, int w, int h, int off);
void tapArea(int x, int y, int w, int h);
bool gridLists();                         // C-172: lists drawn as 2x2 grids (the watch)
void pick(int off);                       // C-172: the row or tile that many from the chosen one, chosen (input.cpp)
const int LAUNCH_N = 5;
extern const Page LAUNCH_PAGES[LAUNCH_N];
extern int launchAt;
String launchWord(int i);
int launchIndex(Page p);
void openLaunch(int at = 0);
void pageDots(int at, int n);
void drawTiles(int n, int sel, const String *words, const char *title, void (*icon)(int, int, int), uint16_t day, uint16_t ink);
void pageIcon(int i, int cx, int cy);
void typeIcon(const char *name, int cx, int cy);
// C-183 (activity.cpp): what was just done, shown at once as the game would, and the day's tallies
void activity(int kind, const String &what, int expGain);   // kind 0 a care, 1 a routine, 2 a step done
void activityGrew(int to);
void activityEvolved(const String &from, const String &to, const String &at);   // C-184
void activityGift(const String &name, const String &at, bool home);   // C-185
void activityLoop(uint32_t now);
bool activityShowing();
void drawActivity(uint16_t day, uint16_t ink);
float expFill();
String activityToday(int width);
void goHomeNow();                         // C-161: the crown pressed twice
void cableFlush(uint32_t ms = 60);       // C-105: send what was printed, waiting at most this long for a reader
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
void reportBegin();   // C-121: the outbox -- what is told to the server goes from a task of its own
void reportLoop();    // C-121: every pass of the loop -- the state it brought back; what waits, carried by the cable
bool netBusy();       // C-121: the outbox is sending, or has something to send (the loop's own polls wait for it)
void switchOff(const String &word);   // the board off: its own off, or the chip's deep sleep woken by its top button (or B)
const char *startAgain();             // how it is started again, said on the SWITCH OFF page
String outboxStatus();   // C-121: OUTBOX down the cable -- what waits, and the last send: its answer, time, way and tries
void reportRemotes();
void remotesLoop(uint32_t now);           // C-165: the remotes told again now and then, the shared list taken back
void reportNetworks();
void meetReport();
void askForArt();
void batteryLoop(uint32_t now);           // C-63
void batteryFake(int pct);                // C-63: BATTEST <pct> down the cable -- 30 s of a pretend charge, never a sleep

// ---- the daemon's routines (routines.cpp) ---------------------------------------------------------------------------
typedef String (*RoutineFn)();
struct Routine { const char *name; RoutineFn run; };
struct RoutineType { const char *name; const char *radio; const Routine *routines; int count; };
extern RoutineType types[14];
extern int typeCount;
void routinesBegin();                     // the types this board can run
bool partyFirst();                        // C-68: ROUTINES opens the party (a board with no radios of its own)
bool isPartyType(int i);                  // C-68: the CC1101's PARTY type, which opens the same screen
int partyRows();                          // the party, and on a party-first board one more row: its radios
int partyRowOf(int at);                   // where partyAt is on the screen: on a party-first board the radios are row 0
int partyAtRow(int row);                  // ... and back
void playGameRoutine();                   // C-68: the chosen routine -- its tune, the ring its colour
String runTheaterMode();                  // C-58: run on the board itself, never from the site
void runRoutine();
String routinesJson();
