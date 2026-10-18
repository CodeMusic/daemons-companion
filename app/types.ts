// The companion's answers, as the app and the site read them -- one type a route's answer (C-157: out of App.tsx).

// C-73: the Xenith day -- the virtue over its shadow (cue), the chakra, the theme word
export type Day = { day: string; colour: string; hue: string; note: string; chakra: string; virtue: string; shadow?: string;
             cue?: string; theme?: string };

export type Next = { goal: string; subitem: string; step: { id: number; text: string } } | null;

export type Today = { date: string; edition: string; day: Day; season: string; next: Next };

export type Step = { id: number; text: string; done: boolean };

export type Goal = { id: number; title: string; done: boolean; subitems: { id: number; title: string; done: boolean; steps: Step[] }[] };

export type Daemon = { slot: number; species: number; name: string; nickname: string; level: number; friendship: number; away: boolean; asked: boolean;
                holding: string | null };

// C-46: ONE goal, built from milestones and steps -- each entry short on purpose (simpler is better, and the site says
// so). A row is a step, or a milestone holding its own steps. Tap a step to do it; tap again to undo (C-49).
export type GoalNow = { goal: Goal | null; limit: number };

export type Walk = { date: string; goal: number; steps: number; reached: boolean };

export type Settings = { savePath: string | null; dir: string | null; exists: boolean; valid: boolean; source: string; canPick: boolean };

// C-13: the daemon's life -- how it is, its day, and what you can do for it. Never more than this, never a nag.
export type Life = { mood: number; word: string; fed: { today: number; due: number }; watered: { today: number; due: number };
              trained: boolean; tired: string; rested?: boolean; quietDays: number; cue: string | null;
              level: number | null; grown: { exp: number; level: number } | null;
              expression?: import("../server/src/expressions").Drawn };

// C-66, C-65: the daemon's voice on the phone. Its answer (and an INDEX entry read aloud) comes back as mp3 in base64 --
// through the relay too, which carries only JSON -- so it is written to the cache and played from there.
export type Spoken = { answer?: string | null; heard?: string | null; provider?: string | null; error?: string | null; audioBase64?: string | null };

// C-60: who the daemon has met nearby (C-15). Each meeting: the species as the INDEX draws it, when, and whether a SYNC
// has written it into the save yet. Below, quietly, the user's own check that the radios listen: the board's last
// listen, and when the phone and the board last heard each other -- never counted as a meeting.
export type Meeting = { at: string; species: number; name: string; art: string | null; written: boolean; how?: "ble" | "lora"; hops?: number };

// C-72: a wave or a word over LoRa, heard from a daemon nearby or sent from one of our boards (to one, or to everyone)
export type Message = { at: string; dir: "in" | "out"; kind: "wave" | "say"; species: number; name: string; peer: string; hops: number; text: string; ours: boolean };

export type Listen = { at: string; started: boolean; devices: number; beacons: number } | null;

// C-134, the app's side (the hub is server/src/broadcast.ts): NEARBY -- what the daemons have said or done, typed or an
// interaction from the shared list (acts.json, bundled, so it is offered offline too), by LoRa, Bluetooth or the companion,
// each once. Another daemon's act can be answered, once. Asked again every ten seconds while the DAEMON tab is open.
export type Cast = { id: string; name: string; kind: "say" | "act" | "reply"; text?: string; act?: string; replyTo?: string; at: string;
              via: string[]; mine: boolean };

export type Act = { code: string; label: string; seen: string; reply: string };

// C-155 (the user, 2026-10-18: "we should have routines on the phone app too -- including casino"): ROUTINES on the app and
// the site -- THE CASINO, played as a device of its own (on the phone the widget's, so its JACK is the widget's daemon;
// the site keeps an id of its own), by server/src/slots.ts, the boards' own table; and the party's game routines.
// Every word DRAFT.
// C-158: why the CASINO's odds are what they are -- a part of the day's luck (-1..+1), or the string's (in points of return)
export type Reason = { source: string; effect: number; why: string };
// THE HOUSE (GET /api/casino): the day's luck and why, and everyone at the reels with the odds they last said
export type CasinoHouse = { context: { luck: number; rtp: number; reasons: Reason[] };
                            players: { name: string; device: string; species: number; at: string;
                                       odds: { rtp: number; reach: number; dry: number; streak: number } | null; reasons: Reason[] }[];
                            world?: { watch: string; weather: { kind: string; tempC: number; city: string } | null };
                            holiday?: { name: string } | null };
export type PlayerState = { season: string; day?: { note: string; menu?: string } | null; holiday?: { name: string; quiet?: boolean; look: string; colours: string[]; hat: string; flip: boolean } | null; daemon: { slot: number; nickname: string } | null;
                     world?: { watch: string; weather: { kind: string; tempC: number; city: string } | null };   // C-158: the real world outside
                     casino: { balance: number; friends: number[]; table: { name: string; device: string }[];
                               reel?: { species: number; name: string }[]; context?: { luck: number; rtp: number; reasons: Reason[] };   // C-158
                               dress?: { look: string; colours: string[]; hat: string } } | null;   // C-158: how the CASINO is dressed
                     party: { name: string; routines: { name: string; colour: string }[] }[];
                     settings?: { sound?: boolean; volume?: number } };   // C-160: this player's own, over every device's

// C-23: the PROFILE -- whichever save was synced: who it belongs to and how far it has gone, as the trainer card says.
export type Profile = { name: string; trainerId: number; playTime: { hours: number; minutes: number }; edition: string;
                 index: { held: boolean; seen: number; bound: number }; marks: boolean[]; diploma: boolean; opus: boolean;
                 gameClear: boolean; savedIn: { place: string } | null; thisGame: boolean | null; marriedTo: string | null;
                 choice: "REASON" | "INSTINCT"; rival: string; money: number; shoes: "MOM" | "DAD" | null;   // C-125
                 casino?: { pending: number; spins: number; balance: number; table?: { name: string; device: string }[] };   // C-149, C-151
                 notebook: boolean; roots: boolean[]; visited?: string[]; groves?: string[];
                 wisdom?: { root: boolean; given: boolean; insight: boolean }[] };

export type Notebook = { held: boolean; sections: { name: string; pages: { title: string; about: string | null; text: string | null;
                                                                   unread?: boolean; place?: string | null; link?: string | null; kind?: string;
                                                                   key?: string | null; notes?: string[] | null; frames?: number[] | null }[] }[];
                  keyColours?: string[]; outline?: string };

// C-126: the MARKS as the trainer card draws them, and each one's STREAM lesson; the understandings in their colours
// (the USER card brain's), with where each is arrived at. DAEMONS exports both (marks.json, mark_N.png).
export type MarksData = { marks: { n: number; title: string; lesson: string[]; found: string;
                             wisdom?: { leader: string; virtue: string; without: string[]; with: string[]; explain: string[];
                                        union_plugin: string; union_routine: string; insight: string } }[];
                   understandings: { n: number; name: string; name_is_working: boolean; rgb: number[]; lobe: string;
                                     found: string; lesson: string[] | null }[] };

// C-140 (the user, 2026-10-16: "the text isnt organized in a way or styled to make it easy to read"): a MARK or a ROOT,
// opened, reads as a small page -- its own heading (a MARK's in ink beside its badge, a ROOT's in its own colour), the
// lesson's first line leading and the rest as points, and then, as the pair is earned, a small heading over each part:
// the leader afterwards, the union PLUGIN, the insight.
export type Wis = { root: boolean; given: boolean; insight: boolean };

// C-127: the mainland and the islands as the game's region map draws them, a cell a place, lit as they are explored. The
// save keeps a visited flag only for towns and a few places, so a place with no flag lights when it touches one that is
// lit. The islands are ??? -- their name and their filling in -- until the REVIEW BOARD is beaten.
export type RegionsData = { regions: { key: string; name: string; hidden_until: string | null; maps: { grid: string[][] }[];
                                 sections: Record<string, { name: string; visited_flag: number | null }> }[] };

// C-132: the groves the save has found, each its own universe as THE NEXUS's signs name it (T-408) -- only those found:
// the rest are a thing to come across, never listed ahead.
export type GrovesData = { nexus: string; groves: { grove: string; universe: string; sign: string; family: string[] }[] };

// C-128: GAME EVENTS -- the story so far, finer than the PROFILE: the debug page's story-ordered list, each row held or
// not from the save. A row not yet held is not named (it would tell the story ahead); a row the save cannot answer is "?".
export type Progress = { events: { n: number; name: string; section: string; held: boolean | null }[];
                  school: { textbook: boolean; floors: boolean[]; diploma: boolean; best: number | null; last: number | null;
                            attempts: number; grade: string | null; passMark: number } };

// C-129: WHAT YOU HAVE BEEN TAUGHT -- CALLOW SCHOOL as the save has it: each floor's syllabus and board once stood on (the
// TEXTBOOK greys the rest), a copy of the DIPLOMA, and the paper to sit again here -- practice, marked here, never the save.
export type SchoolData = { floors: { floor: string; subject: string; syllabus: string; board_intro: string; board: { topic: string; text: string }[] }[];
                    paper: { section: string; questions: { q: number; title: string; text: string; choices: string[]; answer: number }[] }[];
                    pass_mark: number; grades: { from: number; letter: string }[] };

// C-145: THE LIBRARY -- what you can read, on one shelf: CALLOW SCHOOL (C-129) and, once the save holds it, THE PROGRAMMER'S
// GUIDE TO THE HUMAN MIND with its 8-bit cover. Nothing of the GUIDE shows before it is found (a find stays blind, T-297).
export type GuideBookT = { held: boolean; title?: string; sections?: { key: string; label: string; heading: string;
                    entries: { short: string; title: string; paragraphs: string[]; link?: string | null }[] }[] };

// ---- C-24: the save's own INDEX -- what was seen and bound, as the game shows it, each entry in the save's edition's
// voice; and OPUS's margin beside an entry, when the save holds OPUS and the game would show one.
export type IndexEntry = { national: number; species: number; name: string; bound: boolean; art: string | null;
                    category?: string; types?: string[]; entry?: string; margin?: { state: string; text: string }; native?: string[] };

export type Index = { held: boolean; seen: number; bound: number; opus: boolean; entries: IndexEntry[] };

// C-85: any INDEX entry read aloud, one at a time (the user, 2026-10-08). The voice takes a moment to make, so LISTEN
// turns into a spinner with a stop in it, and then into HUSH while it speaks. While one is being read the other cards
// are locked, so taps cannot start a second voice over the first. Stopping before the voice arrives only lets go of it:
// the server finishes making it and nobody plays it.
export type Reading = { species: number; phase: "making" | "speaking" } | null;

// ---- C-32: the site and the device, linked. The server is the hub: this screen asks it what the link is, sends the
// board commands through it, and shows what the board answered. C-33 (its Wi-Fi) and C-34 (FLARE's search) live here.
export type Link = { linked: boolean; via: "usb" | "wifi" | "phone" | null; lastSeen: string | null; firmware: string;
              routines: { name: string; radio: string; routines: string[] }[];
              pending: { id: number; type: string }[]; results: { id: number; ok: boolean; text: string; at: string }[];
              remotes: { active: number; remotes: { name: string; buttons: boolean[] }[] }; networks: string[]; currentNetwork: string; shared?: string[];
              battery?: { percent: number; charging: boolean; full: boolean; usb: boolean; at: string } | null;   // C-63
              lan: { address: string | null; port: number; open: boolean };
              devices?: DeviceRow[]; away?: Carried[] };
                                              // C-80
// C-80: a daemon in each device -- what each carries, and every daemon away (SENT in the game) to choose from
export type Carried = { personality: number; slot: number; species: number; nickname: string; name: string; level: number };

export type DeviceRow = { id: string; kind: string; via: "usb" | "wifi" | "phone" | "relay" | null; lastSeen: string; here: boolean;
                   firmware: string | null; battery: { percent: number; charging: boolean; usb: boolean } | null;
                   daemon?: Carried | null };
   // C-74, C-75, C-77, C-100
export type RemoteSet = { label: string; protocol: string; bits: number; repeat: number; power: string; volumeUp: string; volumeDown: string };

export type Brand = { brand: string; sets: RemoteSet[] };

// C-43: the board's settings live here, not on the board: it picks them up whenever it is linked.
export type DeviceSettings = { home: "daemon" | "today"; sleepAfter: number; sound: boolean; volume: number; ring: number; meet: boolean; band?: number;
                        palette: "checkpoint" | "rainbow" };

// ---- C-139: HOME -- the house by hand (the user, 2026-10-16: "a new entry in the tab5/app/site where you can also
// control your homeassistant"). The companion talks to Home Assistant (server/src/home.ts) and keeps its token; this
// screen sees rooms, names and states, and asks for an action by name. It asks live every time and never shows what the
// phone kept -- a light shown on that is off is worse than a moment's wait -- and a tap is never kept to be sent later:
// a light switched hours afterwards is not what was asked. ----
export type Thing = { id: string; name: string; kind: string; state: string; on: boolean | null; can: string[]; detail: string | null };

export type HomeView = { ok: boolean; error?: string; home?: string; rooms: { name: string; things: Thing[] }[] };

export type HomeSettings = { url: string | null; hasToken: boolean; ok: boolean; error?: string; home?: string;
                      agent?: { path: string; url: string | null; open: boolean } };

// C-156 (the user, 2026-10-18, B of the mockup): six tabs, SETTINGS behind the gear. The INDEX is DAEMON's, the NOTEBOOK
// LIBRARY's, PROFILE is YOU, and DEVICE and HOME are PLACES together. ("settings" is a screen, not a tab.)
export const TABS = ["today", "daemon", "goals", "library", "you", "places", "settings"] as const;

export const SHOWN_TABS = TABS.filter((t) => t !== "settings");
