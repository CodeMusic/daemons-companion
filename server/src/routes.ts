// C-290: this file runs on the phone too (C-111) -- the app imports it, directly or through another file -- so keep it free of Node-only APIs (node:*, fs).
// C-111: the requests a phone hosting on its own answers itself -- the day, the goal and its steps, the walk, the save's
// party, profile and INDEX, a species, the daemon's life and care, and SYNC. The server answers the same ones here
// (api.ts hands them over), so the phone and the computer can never disagree about what a request means. Nothing here
// may import Node: it runs in the app too (app/platform/local.ts).
import { signsOfDream } from "./psyche/dreamsigns.js";   // C-484
import speciesJson from "../data/species.json" with { type: "json" };
import weekJson from "../data/week.json" with { type: "json" };   // C-412: a dream's day colour
import type { Store } from "./shared/store.js";
import { readAway, readSave } from "./game/save/reader.js";
import { readProfile } from "./game/save/profile.js";
import { accentsOf } from "./accents.js";   // C-349
import { readPlan, readWild } from "./game/planner.js";   // C-191
import { casinoPending, clampMoney, tableFor } from "./game/casino.js";
import actsJson from "../data/acts.json" with { type: "json" };
import { readGuide } from "./game/save/guide.js";
import { bookList, booksOf, chapterOf } from "./library/books.js";   // C-208: the books held, as a board reads them
import { readNotebook } from "./game/save/notebook.js";
import { readProgress } from "./game/save/progress.js";
import { readPlay } from "./game/save/play.js";
import { readSubtle } from "./game/save/subtle.js";
import { howOf, MASK_UNDER, maskOf, readsView, seeRead, takeLean, takeRead } from "./psyche/intuition.js";   // C-203; C-357: RECOGNITION, THE MASK
import { answerOf, dayOf, journalOf, keepAnswer, todaysQuestion } from "./library/subtleask.js";   // C-229, C-230
import { tend, tendingView } from "./lifemanagement/tending.js";
import { weekBalance } from "./lifemanagement/balance.js";   // C-432
import { editReward, removeReward, shelfView, spend, stock, unspend } from "./lifemanagement/rewards.js";   // C-433
import { cooked, keepRecipe, recipesView, removeRecipe, uncooked } from "./lifemanagement/recipes.js";   // C-433
import { itemDone, itemState, keepItem, makeSpace, mineView, removeForm, removeItem, saveForm, spaceView } from "./lifemanagement/myforms.js";   // C-433
import { addTo, decide, dueCards, learningView, lessonDone, lessonOf, markQuiz, quizOf, quizView, removeFrom, rename, review } from "./lifemanagement/learning.js";   // C-433   // C-357 (3)
import { weatheringOf } from "./psyche/weathering.js";   // C-357 (4)
import { VESSEL_UNDER, vesselOf } from "./damagotchi/vessel.js";   // C-357 (5)
import { cardOfDay, daySpread, draw, futureAgain, isHalloween, thirteenOfDay, type Deck } from "./psyche/arcana.js";   // C-232; C-357
import marksJson from "../data/marks.json" with { type: "json" };
const MARKS = marksJson;
import regionsJson from "../data/regions.json" with { type: "json" };
const REGIONS = regionsJson;
import grovesJson from "../data/groves.json" with { type: "json" };
import schoolJson from "../data/school.json" with { type: "json" };
const GROVES = grovesJson, SCHOOL = schoolJson;
import { readIndex } from "./game/save/index.js";
import { indexOf, artName, awayNow, careGiven, indexSongsWith, songNow, trainSong, careOwner, caresFor, soundings, carriedDaemon, daemonExpression, daemonFeelings, daemonLife, doStep, ENTRY_LIMIT, entry, grown, setWalk, skyOf, sync, today, walk, type Host } from "./core.js";

const SPECIES = speciesJson as unknown as Record<string, any>;

export type Ask = { method: string; path: string; body: any; deviceId: string; query?: Record<string, string> };   // C-134: query, for ?since=
export type Reply = { status: number; body: unknown };

const STEP = /^\/api\/steps\/(\d+)\/(done|undo)$/, SPECIES_ID = /^\/api\/species\/(\d+)$/, CARE = /^\/api\/daemon\/(feed|water|train|sleep|wake)$/;
import { ACTS, castsSince, sendCast, takeCast, type Via } from "./devices/broadcast.js";   // C-134
import { centreOf, checkNight, dayOfDream, dreamAuthors, dreamBooks, dreamsOf, keepNight, rested, titleOf, type Dream } from "./damagotchi/dreams.js";   // C-200; C-308: titleOf; T-531: dayOfDream; C-412: centreOf
import { askFind, checkFix, fixesOf, walkedSince, keepFix, type Fix } from "./where.js";   // C-174
import { bondAdd, evolvedOf } from "./damagotchi/evolve.js";
import { songOf, SONGS, summonsFor } from "./damagotchi/ownsong.js";   // C-418; C-419 (3): summonsFor
import { WAKES, wakesBy } from "./damagotchi/life.js";   // C-293: the cares that wake it, one list
import { faceOf, openMouthOf } from "./damagotchi/expressions.js";   // C-303: a species' open mouth, as patches; C-357: its eyes, for THE MASK
import { thriveOf } from "./damagotchi/thrive.js";   // C-207
import { again, askSigns, chapterWords, finishChapter, journalOf as aJournal, journalsOf, keepEntry, newJournal, plainPage, removeEntry, removeJournal, renameJournal, summarize } from "./lifemanagement/journal.js";   // C-298
import { writtenLine, type LineKind, saying } from "./damagotchi/lines.js";   // C-196
import { validDeviceId } from "./devices/deviceid.js";
import { carryView } from "./damagotchi/carry.js";
import { apart, partnerIn, spaceOf, spaces as householdSpaces, swap, together } from "./devices/household.js";   // C-327
import * as Dialogue from "./damagotchi/dialogue.js";   // C-329: two daemons of the household in dialogue
import { dayFacts, speciesFacts } from "./psyche/personaof.js";   // C-329
import { carriedFor } from "./damagotchi/carry.js";   // C-329
import { ackSpellcraft, FIRST_SIGHT, firstSight, readHermetic } from "./library/hermetic.js";   // C-238
import { readEudaimon } from "./library/eudaimon.js";   // C-297: THE EUDAIMON LAYER, the dawn half
import { readUnity } from "./library/unity.js";
import { readOrigin } from "./library/originbook.js";   // DAEMONS T-533: THE ORIGIN OF A DAEMON
import { readShadow, spellCheckOf } from "./library/shadowbook.js";   // C-474: THE SPELL LEFT RUNNING (DAEMONS T-606)
import { dawnEarned, dawnsKept, DAWNS_TO_EARN, keepDawn } from "./psyche/dawns.js";   // C-314: the dawn half, earned at dawn
import { costumeOf, halloweenOn, treatsOf } from "./psyche/halloween.js";   // C-240
import { glassView, moment, removeNote, saveNote, show } from "./devices/glass.js";   // C-262: the T-Glass
import { BOOK as MENTIONS_BOOK, markRead, mentionsOf, newestUnread } from "./psyche/mentions.js";   // C-455
const GETS = ["/api/household", "/api/dawns", "/api/broadcasts", "/api/broadcast/acts", "/api/today", "/api/goals", "/api/walk", "/api/goal", "/api/arete", "/api/balance", "/api/rewards", "/api/recipes", "/api/mine", "/api/mine/space", "/api/learning", "/api/learning/lesson", "/api/learning/review", "/api/learning/quiz", "/api/goal/weathering", "/api/profile", "/api/accents", "/api/notebook", "/api/guide", "/api/marks", "/api/regions", "/api/groves", "/api/school", "/api/progress", "/api/play", "/api/subtle", "/api/index", "/api/party", "/api/daemon/life", "/api/daemon/song", "/api/soundings", "/api/planner", "/api/planner/wild", "/api/dreams", "/api/dreambooks", "/api/mentions", "/api/where", "/api/reads", "/api/books", "/api/book", "/api/index/list", "/api/index/entry", "/api/subtle/today", "/api/subtle/journal", "/api/subtle/tending", "/api/arcana/today", "/api/arcana/draw", "/api/arcana/spread", "/api/hermetic", "/api/eudaimon", "/api/unity", "/api/origin", "/api/shadow", "/api/shadow/today", "/api/hermetic/first", "/api/halloween", "/api/glass", "/api/journals", "/api/journal"];
const POSTS = ["/api/mine/form", "/api/mine/form/remove", "/api/mine/space", "/api/mine/item", "/api/mine/item/done", "/api/mine/item/state", "/api/mine/item/remove", "/api/learning/quiz", "/api/learning/quiz/answer", "/api/learning/add", "/api/learning/rename", "/api/learning/remove", "/api/learning/decide", "/api/learning/lesson/done", "/api/learning/review", "/api/recipes", "/api/recipes/remove", "/api/recipes/cooked", "/api/recipes/uncooked", "/api/rewards", "/api/rewards/edit", "/api/rewards/remove", "/api/rewards/spend", "/api/rewards/undo", "/api/household/swap", "/api/play/summoned", "/api/household/together", "/api/household/apart", "/api/household/converse", "/api/household/talks", "/api/household/talk", "/api/household/integrate", "/api/dawn/kept", "/api/broadcast", "/api/device/broadcast", "/api/sync", "/api/walk", "/api/goal", "/api/goal/step", "/api/goal/milestone", "/api/goal/remove", "/api/where/find", "/api/subtle/ask", "/api/subtle/today", "/api/subtle/tending", "/api/reads/seen", "/api/hermetic/ack", "/api/glass/note", "/api/glass/note/remove", "/api/glass/show", "/api/glass/care", "/api/journal", "/api/journal/rename", "/api/journal/remove", "/api/journal/entry", "/api/journal/entry/remove", "/api/journal/summarize", "/api/journal/again", "/api/journal/plain", "/api/journal/signs", "/api/mentions/read"];

// Whether route() answers this request -- asked before the body is read, so a request is never read twice
export function handles(method: string, path: string): boolean {
  if (method === "GET") return GETS.includes(path) || SPECIES_ID.test(path);
  if (method === "POST") return POSTS.includes(path) || STEP.test(path) || CARE.test(path);
  return false;
}

const ok = (body: unknown, status = 200): Reply => ({ status, body });
const no = (status: number, error: string, more: object = {}): Reply => ({ status, body: { error, ...more } });
const NO_SAVE = "no save named -- set it in Settings";

// C-419 (3): the daemons that have come to their song in PLAY FREELY, each the first time
const SUMMONED = "play.summoned";
function summonedOf(store: Store): { species: number; at: string }[] {
  try { const v = JSON.parse(store.getSetting(SUMMONED) ?? "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
}

// C-327: each device's daemon, by device id, and the household spaces in use
function householdView(h: Host, store: Store, now: Date) {
  const { byDevice, unplaced } = carryView(store, awayNow(h));
  const brief = (d: { personality: number; slot: number; species: number; name: string; nickname: string; level: number }) =>
    ({ personality: d.personality, slot: d.slot, species: d.species, name: d.name, nickname: d.nickname, level: d.level });
  return { carrying: Object.fromEntries(Object.entries(byDevice).map(([id, d]) => [id, brief(d)])), unplaced: unplaced.map(brief),
           spaces: householdSpaces(store, now).map(({ a, b, since, until }) => ({ a, b, since, until })) };
}

export function route(h: Host, store: Store, a: Ask, now = new Date()): Reply {
  const { method, path, body: b, deviceId } = a;
  if (method === "GET") {
    // C-134: broadcasts -- a word or an act to every daemon, and their answers (broadcast.ts)
    if (path === "/api/broadcasts") return ok({ items: castsSince(store, Number(a.query?.since) || 0) });
    if (path === "/api/broadcast/acts") return ok({ acts: ACTS, casino: (actsJson as { casino?: unknown[] }).casino ?? [] });   // C-151: JACKPOT, BIGWIN
    if (path === "/api/today") {                                        // C-305: the aurora waits on the mending; C-306: both lines,
      const { mended, both } = skyOf(h);                               // with a daemon from the other edition in the party
      return ok({ ...today(h, store, now), mended, both });
    }
    if (path === "/api/household") return ok(householdView(h, store, now));   // C-327: who carries whom, and the spaces shared
    if (path === "/api/glass") return ok(glassView(store, now.getTime()));   // C-262: what the glasses show, and the notes
    if (path === "/api/goals") return ok(store.goals());
    // C-298: the JOURNAL -- every journal, or one with its entries and chapters (journal.ts)
    if (path === "/api/journals") return ok({ journals: journalsOf(store) });
    if (path === "/api/journal") { const j = aJournal(store, Number(a.query?.id), now); return j ? ok(j) : no(404, "no such journal"); }
    if (path === "/api/walk") return ok(walk(h, store, now));   // C-48
    if (path === "/api/goal") return ok({ goal: store.currentGoal(), limit: ENTRY_LIMIT });   // C-46: ONE goal
    if (path === "/api/balance") return ok(weekBalance(store, now));   // C-432: THE WEEK'S BALANCE
    if (path === "/api/rewards") return ok(shelfView(store, now));     // C-433: THE REWARD SHELF
    if (path === "/api/recipes") return ok(recipesView(store));         // C-433: RECIPES
    // C-433: MINE -- the forms you made, the spaces made from them, one space and its items
    if (path === "/api/mine") return ok(mineView(store));
    if (path === "/api/mine/space") { const v = spaceView(store, a.query?.id); return v ? ok(v) : no(404, "no such space"); }
    // C-433: LEARNING -- the courses, a lesson, the cards due
    if (path === "/api/learning") return ok(learningView(store));
    if (path === "/api/learning/lesson") { const l = lessonOf(store, a.query?.id); return l ? ok(l) : no(404, "no such lesson"); }
    if (path === "/api/learning/review") return ok({ cards: dueCards(store, a.query?.course) });
    if (path === "/api/learning/quiz") { const q = quizView(store, String(a.query?.lesson ?? "")); return ok({ quiz: q }); }
    if (path === "/api/arete") return ok(store.life.arete(now));   // C-430: ARETE held, earned today and this week, and its rules
    if (path === "/api/goal/weathering") {                               // C-357 (4): SLOW WRITES, once the book is held
      const g = store.currentGoal(), s = h.save.read();
      return ok(g && s && readSubtle(s, undefined, a.query?.preview === "1").held ? { held: true, goal: g.id, ...weatheringOf(store, g.id, now) } : { held: false });
    }
    if (path === "/api/daemon/life") return lifeNow(h, store, deviceId, now);
    // C-418: its own song now, and the part it is learning -- for the widget, which draws and sings TRAIN on its own
    if (path === "/api/daemon/song") {
      const s = songNow(h, store, deviceId, now);
      return ok(s ? { ...s, part: songOf(s.species, s.shiny).at(-1) ?? null, window: SONGS.window, candidates: SONGS.static.candidates,
                      floor: SONGS.static.floor } : null);
    }
    if (path === "/api/soundings") return ok({ daemons: soundings(h, store) });   // C-195
    const sp = path.match(SPECIES_ID);
    if (sp) {
      const row = SPECIES[sp[1]];
      // C-303: `said` rides in the row; `mouth` is its open mouth as patches on its picture, where one is known
      return row ? ok({ ...row, entry: row.entry[h.edition], mouth: openMouthOf(row.art?.front) }) : no(404, "no such species");
    }
    if (path === "/api/regions") return ok(REGIONS);   // C-131: the two regions' maps, for the Tab5 (no save needed)
    if (path === "/api/groves") return ok(GROVES);     // C-137: the groves' universes and signs, for the Tab5 (no save needed)
    if (path === "/api/school") return ok(SCHOOL);     // C-137: CALLOW SCHOOL's floors and the paper, for the Tab5
    if (path === "/api/marks") return ok(MARKS);
    // C-456: the DREAM-BOOKS -- a volume a month for each daemon, every page as DREAMS shows it
    // C-455: MENTIONS FROM YOUR DAEMON -- every letter kept (newest first), and TODAY's: the newest not yet read
    if (path === "/api/mentions") return ok({ book: MENTIONS_BOOK, mentions: mentionsOf(store), unread: newestUnread(store, now) });
    if (path === "/api/dreambooks") {
      const page = ({ left: _l, right: _r, ...d }: Dream) => ({
        ...d, title: titleOf(d), day: dayOfDream(d), centre: centreOf(d), dayColour: weekJson.days[new Date(d.from || d.at).getDay()].colour,
        signs: signsOfDream(store, d, now) });   // C-484: SIGNS & SYMBOLS, the house's reading or the lexicon's
      return ok({ volumes: dreamBooks(store).map((v) => ({ ...v, dreams: v.dreams.map(page) })),
                  authors: dreamAuthors(store).map((a) => ({ ...a, dreams: a.dreams.map(page) })) });   // C-483: DAEMON DREAMS, a book a daemon
    }
    if (path === "/api/dreams") return ok({ dreams: dreamsOf(store).map((d) => ({ ...d, title: titleOf(d), day: dayOfDream(d), centre: centreOf(d), dayColour: weekJson.days[new Date(d.from || d.at).getDay()].colour })) });   // C-200: the dream journal, the newest first; C-308: each titled
    if (path === "/api/where") {                          // C-174: the newest first; walked since the asker's midnight
      const fixes = fixesOf(store, a.query?.device || undefined), since = new Date(a.query?.since ?? "");
      return ok({ fixes, walked: isNaN(since.getTime()) ? null : walkedSince(fixes, since) });
    }   // C-174: the newest first   // C-131: each MARK's and understanding's words, for the Tab5 (no save needed)
    const save = h.save.read();
    if (!save) return no(404, NO_SAVE);
    if (path === "/api/profile") {
      const prof = readProfile(save);
      const m = store.married();
      const thisGame = m ? m.name === prof.name && m.trainerId === prof.trainerId && m.secretId === prof.secretId : null;
      const c = casinoPending(store);                                   // C-149: what the CASINO has won or lost since the last SYNC
      return ok({ ...prof, edition: h.edition, thisGame, marriedTo: m ? m.name : null,
                  casino: { pending: c.delta, spins: c.spins, balance: clampMoney(prof.money + c.delta),
                            table: tableFor(store, "", readAway(save), now) } });   // C-151: the boards at the reels now
    }
    if (path === "/api/accents") return ok(accentsOf(store, readProfile(save)));   // C-349: the places unlocked, and where it was saved
    if (path === "/api/progress") return ok(readProgress(save));        // C-128, C-129: GAME EVENTS and CALLOW SCHOOL
    if (path === "/api/play") {                                         // T-426: the instrument, held or not, and the songs
      const p = readPlay(save, h.edition);                              // ?preview=1, a bench check: as if held, every song learned
      const pv = a.query?.preview;                                      // (?preview=flute or harp: that instrument)
      // C-419 (3): the daemons PLAY FREELY can call -- those the INDEX has seen (a preview too: it is the instrument that
      // is as if held, not the INDEX) -- and those that have come to their song
      let seen: number[] = [];
      try { seen = indexOf(save, h.edition, now).entries.map((e) => e.species); } catch { seen = []; }
      const summons = { summonable: seen, summoned: summonedOf(store) };
      return ok(pv ? { ...p, instrument: pv === "flute" || pv === "harp" ? pv : p.instrument, unlocked: true,
                       songs: p.songs.map((x) => ({ ...x, learned: true, heard: false })), ...summons } : { ...p, ...summons });
    }
    if (path === "/api/notebook") return ok(readNotebook(save));        // C-125: the pages held, readable here
    if (path === "/api/guide") return ok(readGuide(save, undefined, a.query?.preview === "1"));   // C-145: the GUIDE, once found (C-275: ?preview=1, as if held)
    if (path === "/api/books" || path === "/api/book") {               // C-208: the books held -- their chapters, or one chapter
      const books = booksOf(readSubtle(save), readGuide(save), readNotebook(save), readHermetic(save, store));   // never ?preview: the boards read what the save holds (C-238: or what was found here)
      if (path === "/api/books") return ok({ books: bookList(books) });
      const c = chapterOf(books, a.query?.book ?? "", Number(a.query?.n));
      return c ? ok(c) : no(404, "no such chapter");
    }
    if (path === "/api/reads") return ok({ held: readSubtle(save, undefined, a.query?.preview === "1").held, ...readsView(store, now) });   // C-203: the companion's own log
    if (path === "/api/subtle") return ok(readSubtle(save, undefined, a.query?.preview === "1"));
    if (path === "/api/hermetic") return ok(readHermetic(save, store, a.query?.preview === "1"));   // C-238: THE HERMETIC LAYER
    if (path === "/api/eudaimon" || path === "/api/unity") {            // C-297, C-299: the dawn half and the mended book, the observer's line as the lead reads it
      let lead;
      try { lead = save ? readSave(save).party[0]?.spirits.class : undefined; } catch { /* as it is */ }
      return ok(path === "/api/unity" ? readUnity(save, a.query?.preview === "1", lead)
                : readEudaimon(save, a.query?.preview === "1", lead, dawnEarned(store)));   // C-314: or seven dawns kept
    }
    // DAEMONS T-533: THE ORIGIN OF A DAEMON, only as far as the save has it back (?preview=1: the whole book)
    if (path === "/api/origin") return ok(readOrigin(save, a.query?.preview === "1"));
    if (path === "/api/shadow") return ok(readShadow(save, a.query?.preview === "1"));   // C-474
    if (path === "/api/shadow/today") return ok(spellCheckOf(save, now, a.query?.preview === "1"));   // C-488: the day's SPELL CHECK
    if (path === "/api/dawns") { const k = dawnsKept(store).length; return ok({ kept: k, needed: DAWNS_TO_EARN, earned: k >= DAWNS_TO_EARN }); }   // C-314
    if (path === "/api/hermetic/first")                                 // C-238: the hour, first seen (?preview=1: the message, nothing kept)
      return ok({ message: a.query?.preview === "1" ? FIRST_SIGHT : firstSight(store, save, now) });
    if (path === "/api/halloween") {                                    // C-240: today, with the book held -- the costume and the treats
      const held = readHermetic(save, store).held, sp = Number(a.query?.species) || 0;
      return ok(held && halloweenOn(now) ? { on: true, costume: sp ? costumeOf(sp, now) : null, treats: treatsOf(store, now) } : { on: false });
    }
    // C-232: THE SUBTLE LAYER's deck; C-239: ?deck=spellcraft, THE HERMETIC LAYER's -- each only once its book is held;
    // C-273: ?deck=hermetic, its ABOVE and BELOW; ?pick= one of the book's two decks (or both, as one); ?spread=mbs
    const deckOf = (q?: string): Deck => q === "spellcraft" ? "spellcraft" : q === "hermetic" ? "hermetic" : q === "dawn" ? "dawn" : "subtle";
    // C-313: the dawn half's deck, once THE EUDAIMON LAYER is held -- by the game's flag or seven dawns kept (C-314)
    const dawnHeld = (pv: boolean) => readEudaimon(save, pv, undefined, dawnEarned(store)).held;
    if (path === "/api/arcana/draw") {                                   // C-232: a card, or a spread of three (a GET: the watch may ask it)
      const deck = deckOf(a.query?.deck), spell = deck !== "subtle", pv = a.query?.preview === "1";   // the user, 2026-10-29: the preview shows both decks
      if (deck === "dawn" ? !dawnHeld(pv) : spell ? !readHermetic(save, store, pv).held : !readSubtle(save, undefined, pv).held)
        return no(403, deck === "dawn" ? "Find THE EUDAIMON LAYER first." : spell ? "Find THE HERMETIC LAYER first." : "Find THE SUBTLE LAYER first.");   // DRAFT
      const pick = (["reason", "instinct", "above", "below", "dawn"] as const).find((k) => k === a.query?.pick) ?? "both";
      return ok({ cards: draw(a.query?.count === "3" ? 3 : 1, Math.random, deck, pick, a.query?.spread === "mbs" ? "mbs" : "ppf") });
    }
    if (path === "/api/arcana/spread") {                                 // C-357 (2): THE SUBTLE LAYER's PAST / PRESENT / FUTURE, kept for the day
      if (!readSubtle(save, undefined, a.query?.preview === "1").held) return no(403, "Find THE SUBTLE LAYER first.");   // DRAFT
      const pick = (["reason", "instinct"] as const).find((k) => k === a.query?.pick) ?? "both", date = today(h, store, now).date;
      const s = a.query?.again === "future" ? { ...futureAgain(store, date, pick, Math.random, now), kept: true } : daySpread(store, date, pick, Math.random, now);
      return ok(s);
    }
    if (path === "/api/arcana/today") {                                  // C-232: the day's card, the same all day for this trainer
      const deck = deckOf(a.query?.deck), spell = deck !== "subtle", pv = a.query?.preview === "1", hermetic = readHermetic(save, store, pv).held;
      if (deck === "dawn" ? !dawnHeld(pv) : spell ? !hermetic : !readSubtle(save, undefined, pv).held) return ok({ held: false });
      if (deck === "dawn") return ok({ held: true, card: cardOfDay(today(h, store, now).date, (() => { const p = readProfile(save); return `${p.name}${p.trainerId}`; })(), "dawn") });   // C-313
      const p = readProfile(save), date = today(h, store, now).date, who = `${p.name}${p.trainerId}`;
      if (hermetic && isHalloween(date)) return ok({ held: true, card: thirteenOfDay(date, who), halloween: true });   // C-240
      return ok({ held: true, card: cardOfDay(date, who, deck) });
    }
    if (path === "/api/subtle/tending") {                                // C-357 (3): the day's centre, its tending, the week's climb
      return ok(readSubtle(save, undefined, a.query?.preview === "1").held ? { held: true, ...tendingView(store, now) } : { held: false });
    }
    if (path === "/api/subtle/today" || path === "/api/subtle/journal") {   // C-230: the book's question of the day, and what was answered
      if (!readSubtle(save, undefined, a.query?.preview === "1").held) return ok({ held: false });   // ?preview=1: as if held, read only
      const t = today(h, store, now), q = todaysQuestion(t.date, dayOf(t));
      return ok(path.endsWith("journal") ? { held: true, entries: journalOf(store).slice(0, 60) }
                                          : { held: true, ...q, answer: journalOf(store).find((x) => x.date === t.date)?.answer ?? null });
    }   // T-423: THE SUBTLE LAYER, once found (?preview=1, a bench check)
    if (path === "/api/index") {                                        // C-24: the save's own INDEX, OPUS's margins with it
      const ix = readIndex(save, h.edition), known = indexSongsWith(h, store, deviceId, now);
      // C-419: a bound daemon with a song carries how much of its own part the INDEX sings (1, whole); C-482: a shiny's
      return ok({ ...ix, entries: ix.entries.map((e) => (e.bound && songOf(e.species).length
        ? { ...e, song: known.share[e.species] ?? 1, ...(known.shiny[e.species] ? { shiny: true } : {}) } : e)) });
    }
    // C-199 (3): the INDEX as a watch reads it -- every daemon met, in a line each; then one entry at a time (its picture
    // is /api/device/art?species=, its voice the reading's, kept on the card once heard)
    if (path === "/api/index/list") {
      const ix = readIndex(save, h.edition);
      return ok({ seen: ix.seen, bound: ix.bound, entries: ix.entries.map((e) => ({ n: e.national, s: e.species, name: e.name, b: e.bound })) });
    }
    if (path === "/api/index/entry") {
      const e = readIndex(save, h.edition).entries.find((x) => x.species === Number(a.query?.species));
      if (!e) return no(404, "not met yet");
      return ok({ n: e.national, s: e.species, name: e.name, bound: e.bound, category: e.category ?? "", types: e.types ?? [],
                  entry: e.entry ?? "", margin: e.margin?.text ?? "" });
    }
    if (path === "/api/party") return ok(readSave(save));
    if (path === "/api/planner") return ok(readPlan(save));             // C-191: up to the next step, nothing past it
    if (path === "/api/planner/wild") {                                  // C-191: one place's wild daemons, once it is open
      const w = readWild(save, String(a.query?.place ?? ""), h.edition);
      return w ? ok(w) : no(404, "That place is not open yet.");
    }
  }
  if (method === "POST") {
    // C-433: LEARNING -- added by hand, renamed, taken off, the TUTOR's proposals decided, a lesson finished, a card reviewed
    // C-433: MINE -- a form kept or changed, taken off; a space made from one; an item kept, done (paid), taken off
    if (path.startsWith("/api/mine/")) {
      const r = path === "/api/mine/form" ? saveForm(store, b) : path === "/api/mine/form/remove" ? removeForm(store, b?.id)
              : path === "/api/mine/space" ? makeSpace(store, b) : path === "/api/mine/item" ? keepItem(store, b)
              : path === "/api/mine/item/done" ? itemDone(store, b?.id, b?.done !== false, now)
              : path === "/api/mine/item/state" ? itemState(store, b?.id, b?.state, now) : removeItem(store, b?.id);   // C-476
      return typeof r === "string" ? no(400, r) : r ? ok(path === "/api/mine/form" ? { form: r, ...mineView(store) } : r) : no(404, "not found");
    }
    // C-433: a lesson's quiz -- made from its cards; answered and marked plainly (api.ts marks by THE TUTOR where a mind is)
    if (path === "/api/learning/quiz") { const r = quizOf(store, b?.lesson); return typeof r === "string" ? no(400, r) : ok({ quiz: r }); }
    if (path === "/api/learning/quiz/answer") { const r = markQuiz(store, b?.quiz, b?.answers, null, "plain", now); return typeof r === "string" ? no(400, r) : ok({ quiz: r }); }
    if (path.startsWith("/api/learning/")) {
      const r = path.endsWith("/add") ? addTo(store, b) : path.endsWith("/rename") ? rename(store, b) : path.endsWith("/remove") ? removeFrom(store, b?.id)
              : path.endsWith("/decide") ? decide(store, b) : path.endsWith("/lesson/done") ? lessonDone(store, b?.id, b?.done !== false, now)
              : review(store, b?.id, b?.grade, now);
      return typeof r === "string" ? no(400, r) : r ? ok(r) : no(404, "not found");
    }
    // C-433: RECIPES -- kept, taken off, COOKED (the daemon eats with you: the app's own FEED), a meal taken back that day
    if (path.startsWith("/api/recipes")) {
      const r = path === "/api/recipes" ? keepRecipe(store, b) : path.endsWith("remove") ? removeRecipe(store, Number(b?.id))
              : path.endsWith("uncooked") ? uncooked(store, Number(b?.id), Number(b?.meal), now) : cooked(store, Number(b?.id), now);
      if (typeof r === "string") return no(400, r);
      if (!path.endsWith("/cooked")) return ok(r);
      const fed = route(h, store, { ...a, path: "/api/daemon/feed", body: {} }, now);
      return ok({ ...r, fed: fed.status === 200 ? { said: (fed.body as { said?: string }).said ?? "" } : null });
    }
    // C-433: THE REWARD SHELF -- stocked, changed, taken off, SPENT (the daemon glad with you), taken back the same day
    if (path.startsWith("/api/rewards")) {
      const r = path === "/api/rewards" ? stock(store, b, now) : path.endsWith("edit") ? editReward(store, b, now)
              : path.endsWith("remove") ? removeReward(store, Number(b?.id), now)
              : path.endsWith("spend") ? spend(store, Number(b?.id), now) : unspend(store, Number(b?.id), String(b?.key ?? ""), now);
      if (typeof r === "string") return no(400, r);
      const d = "spent" in r ? carriedDaemon(h, store, deviceId) : null;
      return ok(d ? { ...r, daemon: { nickname: d.nickname, species: d.species } } : r);
    }
    // C-327: social within the household -- a swap of what two devices carry, two daemons in one space, and out of it.
    // A device names the other; its own is `a`, or the asker itself (?device=)
    // C-419 (3): a daemon came to its song in PLAY FREELY -- kept, so the INDEX can say its QUOTATION once T-599 has
    // written one. Never caught, never a battle; only one the INDEX has seen.
    if (path === "/api/play/summoned") {
      const sp = Number(b?.species), save = h.save.read();
      if (!save) return no(400, NO_SAVE);
      let seen = false;
      try { seen = indexOf(save, h.edition, now).entries.some((e) => e.species === sp); } catch { seen = false; }
      if (!seen || !summonsFor([sp]).length) return no(400, "summoned {species}: a daemon the INDEX has seen, with a song");   // DRAFT
      const all = summonedOf(store);
      if (!all.some((x) => x.species === sp)) store.setSetting(SUMMONED, JSON.stringify([...all, { species: sp, at: now.toISOString() }]));
      return ok({ species: sp, name: SONGS.parts[String(sp)]?.name ?? "", quotation: null, summoned: summonedOf(store) });   // T-599: no words yet
    }
    if (path === "/api/household/swap" || path === "/api/household/together") {
      const one = typeof b?.a === "string" ? b.a : deviceId, two = typeof b?.b === "string" ? b.b : "";
      const r = path.endsWith("swap") ? swap(store, awayNow(h), one, two) : together(store, one, two, now);
      return typeof r === "string" ? no(400, r) : ok(householdView(h, store, now));
    }
    // C-329: the two daemons in this device's household space talk (dialogue.ts) -- within the home, so nothing is
    // filtered; each one's persona from its species, the day and the home's goals (the talk is the house's own: "home")
    if (path === "/api/household/converse") {
      const device = typeof b?.device === "string" ? b.device : deviceId ?? "", space = spaceOf(store, device, now);
      if (!space) return no(400, "put two of your devices together first");                          // DRAFT
      const away = awayNow(h), mine = carriedFor(store, away, device), theirs = carriedFor(store, away, partnerIn(space, device));
      if (!mine || !theirs) return no(400, "both devices must carry a daemon");                     // DRAFT
      const goals = store.openGoals().slice(0, 4).map((g) => ({ goal: g.title }));
      const held = (d: typeof mine) => { try { return store.workingMemory(d.personality).held().map((x) => ({ words: x.words, from: x.from })); } catch { return []; } };   // C-469
      const facts = (d: typeof mine) => ({ ...speciesFacts(d.species, d.nickname, h.edition, d.personality), level: d.level, goals, day: dayFacts(now), inMind: held(d) });
      const r = Dialogue.begin(store, "home", { player: "home", facts: facts(mine), edition: h.edition }, { player: "home", facts: facts(theirs), edition: h.edition },
                               b ?? {}, { filtered: false, space: "household", now });
      return "id" in r ? ok(Dialogue.shown(r)) : no(400, r.error);
    }
    if (path === "/api/household/talks") return ok(Dialogue.list(store, "home"));
    if (path === "/api/household/talk" || path === "/api/household/integrate") {
      if (path.endsWith("integrate")) {
        const r = Dialogue.integrate(store, "home", b?.id);                        // begins at once; the write-up follows
        void r.catch(() => {});
      }
      const r = Dialogue.one(store, "home", b?.id);
      return "id" in r ? ok(r) : no(404, r.error);
    }
    if (path === "/api/household/apart") {
      apart(store, typeof b?.device === "string" ? b.device : deviceId, now);
      return ok(householdView(h, store, now));
    }
    if (path === "/api/dawn/kept") return ok(keepDawn(store, now));   // C-314: this morning, if it is the creator's hour here
    // C-229: ASK THE SUBTLE LAYER -- its own line and a question back, or TWO VOICES' asking voice (the hub's module may say
    // the line in its own words instead: api.ts); C-230: the day's question answered, kept in the journal
    if (path === "/api/reads/seen") {                                   // C-357, RECOGNITION and THE MASK: a read or lean answered
      const save = h.save.read();
      if (!save || !readSubtle(save).held) return no(403, "Find THE SUBTLE LAYER first.");   // DRAFT
      const r = seeRead(store, b?.kind, b?.at, now);
      return typeof r === "string" ? no(400, r) : ok({ held: true, ...readsView(store, now) });
    }
    if (path === "/api/subtle/tending") {                                // C-357 (3): tended, by a touch -- once a day
      const save = h.save.read();
      if (!save || !readSubtle(save).held) return no(403, "Find THE SUBTLE LAYER first.");   // DRAFT
      tend(store, now);
      return ok({ held: true, ...tendingView(store, now) });
    }
    if (path === "/api/subtle/ask" || path === "/api/subtle/today") {
      const save = h.save.read(), s = save ? readSubtle(save) : null;
      if (!s?.held) return no(403, "Find THE SUBTLE LAYER first.");   // DRAFT
      const t = today(h, store, now), day = dayOf(t), text = typeof b?.text === "string" ? b.text.trim().slice(0, 500) : "";
      if (path.endsWith("today")) {
        const p = readProfile(save!), c = cardOfDay(t.date, `${p.name}${p.trainerId}`);
        const k = keepAnswer(store, { ...todaysQuestion(t.date, day), card: { n: c.n, side: c.side, keyword: c.keyword, shiny: c.shiny } }, text, now);
        return typeof k === "string" ? no(400, k) : ok({ kept: k });
      }
      if (!text) return no(400, "ask it something");
      return ok(answerOf(s, text.slice(0, 200), b?.mode === "voices" ? "voices" : "ask", Number(b?.turn) || 0, day, t.date));
    }
    if (path === "/api/hermetic/ack") return ok({ spellcraft: ackSpellcraft(store, "app", now), ...readHermetic(h.save.read(), store) });   // C-238
    // C-174: FIND -- one device asked to say where it is, and to sound
    if (path === "/api/where/find") {
      if (!validDeviceId(b?.id)) return no(400, "find {id}");
      // found, or heard enough: the ask taken back, so the watch stops at its next state (the user, 2026-10-28: it beeped
      // and buzzed on indoors, where no fix comes to answer it)
      if (b.stop === true) { store.setSetting(`find.${b.id}`, null); return ok({ asked: false }); }
      askFind(store, b.id, now); return ok({ asked: true });
    }
    // C-134: a broadcast from the app, the site or the Tab5, as one of our daemons
    if (path === "/api/broadcast") {
      const r = sendCast(store, awayNow(h), b, now);
      return "error" in r ? no(400, r.error ?? "") : ok({ id: r.cast.id, cast: r.cast });
    }
    // C-134: a board's broadcast -- one it sent ("out"), or one it heard over LoRa or Bluetooth ("in") -- kept once
    if (path === "/api/device/broadcast") {
      const via: Via = b.via === "lora" || b.via === "ble" ? b.via : "net";
      const r = takeCast(store, b, via, b.dir === "out", deviceId, now);
      return "error" in r ? no(400, r.error ?? "") : ok({ fresh: r.fresh, id: r.cast.id });
    }
    if (path === "/api/sync") return ok(sync(h, store, now));
    // C-262: the T-Glass -- a note written, removed, shown; what the glasses show; a care, and its reaction laid over it
    if (path === "/api/glass/note") { const r = saveNote(store, b ?? {}, now); return typeof r === "string" ? no(400, r) : ok(r); }
    if (path === "/api/glass/note/remove") return removeNote(store, Number(b?.id)) ? ok({ ok: true }) : no(404, "no such note");
    if (path === "/api/glass/show") { const r = show(store, b ?? {}); return typeof r === "string" ? no(400, r) : ok(r); }
    if (path === "/api/glass/care") {
      const kind = String(b?.kind ?? "");
      if (!["feed", "water", "train"].includes(kind)) return no(400, "care is feed, water or train");
      const r = route(h, store, { ...a, path: `/api/daemon/${kind}` }, now);   // the care itself, as the app's own CARE gives it
      if (r.status !== 200) return r;
      const said = (r.body as { said?: string }).said ?? "";
      return ok({ ...(r.body as object), glass: moment(store, kind, said, now.getTime()) });
    }
    const care = path.match(CARE);                      // C-13: care -- feed, water, train, and SLEEP (C-114) -- kept as the device's are
    if (care) {
      const night = care[1] === "sleep" ? null : appNight(h, store, deviceId, now, b?.stirs);   // C-283: woken -- the night it slept
      // C-196: the daemon's written line for it, as the boards show (chosen before the care counts, as api.ts's careLine)
      const owner = careOwner(h, store, care[1], deviceId);   // C-415: the daemon this device carries
      const l = daemonLife(store, now, caresFor(store, owner)), kind = care[1] as LineKind;
      const said = writtenLine(kind, l.mood, now.toLocaleDateString("en-CA"), kind === "feed" ? l.fed.today : kind === "water" ? l.watered.today : 0);
      store.logInteraction(care[1], "site", now, owner); careGiven(h, store, care[1], deviceId, now);
      const lessonOf = care[1] === "train" ? trainSong(h, store, deviceId, now) : null;   // C-418: TRAIN sings, and learns
      const r = lifeNow(h, store, deviceId, now), save = h.save.read();
      return { ...r, body: { ...(r.body as object), ...saying(said, !!save && readSubtle(save).held),   // C-204: and under it
                             ...(lessonOf ? { lesson: lessonOf } : {}),
                             ...(night ? { dream: { id: night.id, text: night.text, by: night.by, quality: night.quality } } : {}) } };
    }
    const step = path.match(STEP);
    if (step) {
      if (step[2] === "undo") return store.undoStep(Number(step[1])) ? ok({ next: store.nextStep() }) : no(404, "no such step");
      const r = doStep(h, store, Number(step[1]), "site");
      return r.ok ? ok({ ...r, next: store.nextStep() }) : no(404, "no such step");
    }
    if (path === "/api/walk") {
      const r = setWalk(h, store, b);
      return typeof r === "string" ? no(400, r) : ok(r);
    }
    if (path === "/api/goal") {
      const title = entry(b.title);
      if (!title) return no(400, `a goal is a few words, at most ${ENTRY_LIMIT} letters`);
      // C-430: TODAY's rule (the LIFE form's), not the database's: one open goal at a time -- a new one sets the old aside
      const open = store.currentGoal(), full = !store.life.roomToday();
      if (full && !b.replace) return no(409, "one goal at a time: finish this one, or replace it", { goal: open });
      if (full && open) store.setAside(open.id);
      return ok({ goal: store.addGoal(title), limit: ENTRY_LIMIT }, 201);
    }
    if (path === "/api/goal/step" || path === "/api/goal/milestone") {
      const g = store.currentGoal();
      if (!g) return no(400, "set a goal first");
      const text = entry(b.text ?? b.title);
      if (!text) return no(400, `keep it short: at most ${ENTRY_LIMIT} letters`);
      const done = path.endsWith("milestone") ? store.addMilestone(g.id, text)
                 : store.addStep(g.id, text, Number.isInteger(b.milestone) ? b.milestone : undefined);
      if (done == null) return no(400, "no such milestone in this goal");
      return ok({ goal: store.currentGoal(), limit: ENTRY_LIMIT });
    }
    if (path === "/api/goal/remove") {
      if (Number.isInteger(b.step)) store.removeStep(b.step);
      else if (Number.isInteger(b.milestone)) store.removeMilestone(b.milestone);
      else return no(400, "remove {step} or {milestone}");
      return ok({ goal: store.currentGoal(), limit: ENTRY_LIMIT });
    }
    // C-298: the JOURNAL. SUMMARIZE (and again) answer {writing: chapter}: whoever answered writes the page after --
    // the hub's background thinker (api.ts), or a phone hosting alone, plainly (app/platform/local.ts)
    if (path === "/api/mentions/read") {            // C-455: a letter read on TODAY ({id}); it stays in its book
      return markRead(store, Number(b?.id)) ? ok({ unread: newestUnread(store, now) }) : no(404, "no such letter");   // DRAFT
    }
    if (path.startsWith("/api/journal")) {
      const said = (r: unknown) => typeof r === "string" ? no(r.startsWith("no such") ? 404 : 400, r) : null;
      if (path === "/api/journal") { const r = newJournal(store, b.title, now, b.kind); return said(r) ?? ok(r, 201); }   // C-356: {kind: "standard" | "dream"}
      if (path === "/api/journal/rename") { const r = renameJournal(store, Number(b.id), b.title, now); return said(r) ?? ok(r); }
      if (path === "/api/journal/remove") return removeJournal(store, Number(b.id)) ? ok({ journals: journalsOf(store) }) : no(404, "no such journal");
      if (path === "/api/journal/entry") { const r = keepEntry(store, b, now); return said(r) ?? ok(r, b.id == null ? 201 : 200); }
      if (path === "/api/journal/entry/remove") { const r = removeEntry(store, Number(b.journal), Number(b.id), now); return said(r) ?? ok(r); }
      if (path === "/api/journal/summarize" || path === "/api/journal/again") {
        const r = path === "/api/journal/again" ? again(store, Number(b.chapter), now) : summarize(store, Number(b.journal), now);
        const sg = (r as { signing?: number }).signing;   // C-356: a dream chapter's signs, read after its page
        return said(r) ?? ok({ ...(r as { journal: object }).journal, writing: (r as { chapter: number }).chapter, ...(sg ? { signing: sg } : {}) });
      }
      if (path === "/api/journal/signs") {          // C-356: READ THE SIGNS of {journal, entry} or {journal, chapter}; read after (signs.ts)
        const r = askSigns(store, b, now);
        return said(r) ?? ok({ ...(r as { journal: object }).journal, signing: (r as { signing: number }).signing });
      }
      if (path === "/api/journal/plain") {         // a page the thinker could not write, laid out as written instead
        const w = chapterWords(store, Number(b.chapter));
        if (!w) return no(404, "no such summary");
        finishChapter(store, Number(b.chapter), plainPage(w), "plain");
        const j = aJournal(store, Number(b.journal), now);
        return j ? ok(j) : no(404, "no such journal");
      }
    }
  }
  return no(404, "not found");
}

function lifeNow(h: Host, store: Store, deviceId: string, now: Date): Reply {
  const d = carriedDaemon(h, store, deviceId);
  const who = caresFor(store, d?.personality);              // C-415: its own cares
  const lf = daemonLife(store, now, who);
  // C-357 (5): CONTAINER -- the form it is now (what it became here, until SYNC writes it), and a line under it for a week
  const save = d ? h.save.read() : null, form = d ? (evolvedOf(store, d.personality)?.to ?? d.species) : null;
  const vessel = d && form !== null ? vesselOf(store, d.personality, form, now) : null;
  const vesselUnder = vessel && save && readSubtle(save).held ? VESSEL_UNDER : null;
  const mask = !!(d && save && readSubtle(save).held && maskOf(store, now).mask);   // C-357, THE MASK
  return ok({ ...lf, expression: daemonExpression(store, now, lf, d?.species ?? null, who), grown: d ? grown(d, store) : null, level: d?.level ?? null,
            thrive: thriveOf(store, now), vesselUnder, mask, maskUnder: mask ? MASK_UNDER : null,
            song: songNow(h, store, deviceId, now),                                     // C-418: its own song, as it knows it
            maskEyes: mask && form !== null ? faceOf(artName(form))?.eyes ?? null : null });   // C-119; C-207: the week, for the den's glow and marks; C-357: its eyes, checked (faces.json)
}

// C-174: a watch's fix -- "where <lat> <lon> <metres>" -- kept for the app's map, never logged as tending. The server's
// interact and a phone hosting alone (app/platform/local.ts) both take it here.
export function takeFix(store: Store, detail: string, deviceId: string, now = new Date()): Fix | string {
  const f = checkFix(detail);
  if (typeof f === "string") return f;
  // C-199: a fix told late (kept on the Ultra's card while nothing was in reach) carries when it was taken -- its fourth
  // number, seconds since 1970; one from the future, or from before the GNSS could have run, is taken as now
  const taken = Number(detail.split(" ")[3]) * 1000;
  const at = Number.isFinite(taken) && taken > Date.UTC(2026, 0) && taken <= now.getTime() + 60000 ? new Date(taken) : now;
  return keepFix(store, f, deviceId, at);
}
// C-283 (the user, 2026-11-03: "when u hit sleep it should make the select local ai create a dream"): a daemon put to bed
// in the evening or the night (SLEEP, on any device) and then woken or tended has had a night -- from the SLEEP to that
// moment, tucked in, its stirs as the phone counted them (C-284, `stirs` with the care) -- unless a watch told that night
// already. Kept as the watch's are (takeNight); api.ts asks the talk AI for its telling. A nap in the day is no night.
// 2026-11-14: the night ends when it was woken or when it woke by itself (noon, life.ts wakesBy), whichever came first,
// and at most NIGHT_MOST after the SLEEP -- a daemon put to bed at seven and left till one was a seventeen-hour night,
// which checkNight refuses, and its dream was lost. `byItself` (the hub's own round, api.ts): only once it has woken.
export const NIGHT_MOST = 16 * 3600000;
export function appNight(h: Host, store: Store, deviceId: string, now: Date, stirs: unknown, byItself = false): Dream | null {
  const since = store.interactionsSince(new Date(now.getTime() - 40 * 3600000)), at = (e: { at: string }) => Date.parse(e.at);
  const sleep = [...since].reverse().find((e) => e.kind === "sleep");
  if (!sleep) return null;
  const h0 = new Date(sleep.at).getHours();
  if (h0 < 18 && h0 >= 6) return null;                                       // a nap
  if (since.some((e) => at(e) > at(sleep) && WAKES.includes(e.kind))) return null;   // woken already
  if (dreamsOf(store).some((d) => Date.parse(d.to) > at(sleep))) return null;    // the watch told this night
  const woke = wakesBy(new Date(sleep.at)).getTime();
  if (byItself && now.getTime() < woke) return null;                          // still asleep
  const end = Math.min(now.getTime(), woke, at(sleep) + NIGHT_MOST);
  const s = Number.isInteger(stirs) && (stirs as number) >= 0 ? (stirs as number) : 0;
  const r = takeNight(h, store, `${Math.floor(at(sleep) / 1000)} ${Math.floor(end / 1000)} ${s} 1`, deviceId);
  return typeof r === "string" ? null : r.dream;
}
// C-200: a night ended on the watch -- "night <from> <to> <stirs> <tucked>" (seconds since 1970), so it travels as every
// interaction does (Wi-Fi, the outbox, the cable's INTERACT, the phone). Kept with a written dream at once; a rested night
// is the bond's. Not logged as tending: sleeping is not a care. The module's own telling, after, is the server's (api.ts).
export function takeNight(h: Host, store: Store, detail: string, deviceId: string): { dream: Dream; carried: boolean } | string {
  const [from, to, stirs, tucked] = detail.split(" ").map(Number);
  const n = checkNight({ from: new Date(from * 1000), to: new Date(to * 1000), stirs, tucked: tucked === 1 });
  if (typeof n === "string") return n;
  const d = carriedDaemon(h, store, deviceId);
  const dream = keepNight(store, n, { nickname: d?.nickname ?? "", species: d?.species ?? 0, personality: d?.personality ?? null, device: deviceId });
  // one rested night a day toward the bond, by the day it ended -- nights sent without a key cannot pump it (the review)
  const restedDay = `dream.restedDay.${d?.personality ?? 0}.${new Date(n.to).toLocaleDateString("en-CA")}`;
  if (d && rested(n) && !store.getSetting(`dream.rested.${dream.id}`) && !store.getSetting(restedDay)) {
    bondAdd(store, d.personality, "nights"); store.setSetting(`dream.rested.${dream.id}`, "1"); store.setSetting(restedDay, "1");
  }
  return { dream, carried: !!d };
}

// C-203: a read given on a watch -- "read <near|rain|night|walk> <0|1> [way]" -- or a lean told at the CASINO's reels --
// "lean <pays|not> <0|1>". Kept for the log (intuition.ts), never logged as tending. The server's interact and a phone
// hosting alone (app/platform/local.ts) both take them here.
export function takeSubtle(store: Store, kind: string, detail: string, deviceId: string, now = new Date()): Reply {
  const how = howOf(daemonFeelings(store, now), now);   // the day, its centre, and calm or with argument (TRUE OR NOT)
  if (kind === "read") { const r = takeRead(store, detail, deviceId, now, how); return typeof r === "string" ? no(400, r) : ok({ read: r }); }
  const l = takeLean(store, detail, now, how);
  return typeof l === "string" ? no(400, l) : ok({ leans: { told: l.told, landed: l.landed } });
}
