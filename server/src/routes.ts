// C-111: the requests a phone hosting on its own answers itself -- the day, the goal and its steps, the walk, the save's
// party, profile and INDEX, a species, the daemon's life and care, and SYNC. The server answers the same ones here
// (api.ts hands them over), so the phone and the computer can never disagree about what a request means. Nothing here
// may import Node: it runs in the app too (app/local.ts).
import speciesJson from "../data/species.json" with { type: "json" };
import type { Store } from "./store.js";
import { readAway, readSave } from "./save/reader.js";
import { readProfile } from "./save/profile.js";
import { readPlan, readWild } from "./planner.js";   // C-191
import { casinoPending, clampMoney, tableFor } from "./casino.js";
import actsJson from "../data/acts.json" with { type: "json" };
import { readGuide } from "./save/guide.js";
import { bookList, booksOf, chapterOf } from "./books.js";   // C-208: the books held, as a board reads them
import { readNotebook } from "./save/notebook.js";
import { readProgress } from "./save/progress.js";
import { readPlay } from "./save/play.js";
import { readSubtle } from "./save/subtle.js";
import { readsView, takeLean, takeRead } from "./intuition.js";   // C-203
import { answerOf, dayOf, journalOf, keepAnswer, todaysQuestion } from "./subtleask.js";   // C-229, C-230
import { cardOfDay, draw } from "./arcana.js";   // C-232
import marksJson from "../data/marks.json" with { type: "json" };
const MARKS = marksJson;
import regionsJson from "../data/regions.json" with { type: "json" };
const REGIONS = regionsJson;
import grovesJson from "../data/groves.json" with { type: "json" };
import schoolJson from "../data/school.json" with { type: "json" };
const GROVES = grovesJson, SCHOOL = schoolJson;
import { readIndex } from "./save/index.js";
import { awayNow, careGiven, soundings, carriedDaemon, daemonExpression, daemonLife, doStep, ENTRY_LIMIT, entry, grown, setWalk, sync, today, walk, type Host } from "./core.js";

const SPECIES = speciesJson as unknown as Record<string, any>;

export type Ask = { method: string; path: string; body: any; deviceId: string; query?: Record<string, string> };   // C-134: query, for ?since=
export type Reply = { status: number; body: unknown };

const STEP = /^\/api\/steps\/(\d+)\/(done|undo)$/, SPECIES_ID = /^\/api\/species\/(\d+)$/, CARE = /^\/api\/daemon\/(feed|water|train|sleep|wake)$/;
import { ACTS, castsSince, sendCast, takeCast, type Via } from "./broadcast.js";   // C-134
import { checkNight, dreamsOf, keepNight, rested, type Dream } from "./dreams.js";   // C-200
import { askFind, checkFix, fixesOf, walkedSince, keepFix, type Fix } from "./where.js";   // C-174
import { bondAdd } from "./evolve.js";
import { thriveOf } from "./thrive.js";   // C-207
import { writtenLine, type LineKind, saying } from "./lines.js";   // C-196
import { validDeviceId } from "./deviceid.js";
const GETS = ["/api/broadcasts", "/api/broadcast/acts", "/api/today", "/api/goals", "/api/walk", "/api/goal", "/api/profile", "/api/notebook", "/api/guide", "/api/marks", "/api/regions", "/api/groves", "/api/school", "/api/progress", "/api/play", "/api/subtle", "/api/index", "/api/party", "/api/daemon/life", "/api/soundings", "/api/planner", "/api/planner/wild", "/api/dreams", "/api/where", "/api/reads", "/api/books", "/api/book", "/api/index/list", "/api/index/entry", "/api/subtle/today", "/api/subtle/journal", "/api/arcana/today", "/api/arcana/draw"];
const POSTS = ["/api/broadcast", "/api/device/broadcast", "/api/sync", "/api/walk", "/api/goal", "/api/goal/step", "/api/goal/milestone", "/api/goal/remove", "/api/where/find", "/api/subtle/ask", "/api/subtle/today"];

// Whether route() answers this request -- asked before the body is read, so a request is never read twice
export function handles(method: string, path: string): boolean {
  if (method === "GET") return GETS.includes(path) || SPECIES_ID.test(path);
  if (method === "POST") return POSTS.includes(path) || STEP.test(path) || CARE.test(path);
  return false;
}

const ok = (body: unknown, status = 200): Reply => ({ status, body });
const no = (status: number, error: string, more: object = {}): Reply => ({ status, body: { error, ...more } });
const NO_SAVE = "no save named -- set it in Settings";

export function route(h: Host, store: Store, a: Ask, now = new Date()): Reply {
  const { method, path, body: b, deviceId } = a;
  if (method === "GET") {
    // C-134: broadcasts -- a word or an act to every daemon, and their answers (broadcast.ts)
    if (path === "/api/broadcasts") return ok({ items: castsSince(store, Number(a.query?.since) || 0) });
    if (path === "/api/broadcast/acts") return ok({ acts: ACTS, casino: (actsJson as { casino?: unknown[] }).casino ?? [] });   // C-151: JACKPOT, BIGWIN
    if (path === "/api/today") return ok(today(h, store, now));
    if (path === "/api/goals") return ok(store.goals());
    if (path === "/api/walk") return ok(walk(h, store, now));   // C-48
    if (path === "/api/goal") return ok({ goal: store.currentGoal(), limit: ENTRY_LIMIT });   // C-46: ONE goal
    if (path === "/api/daemon/life") return lifeNow(h, store, deviceId, now);
    if (path === "/api/soundings") return ok({ daemons: soundings(h, store) });   // C-195
    const sp = path.match(SPECIES_ID);
    if (sp) {
      const row = SPECIES[sp[1]];
      return row ? ok({ ...row, entry: row.entry[h.edition] }) : no(404, "no such species");
    }
    if (path === "/api/regions") return ok(REGIONS);   // C-131: the two regions' maps, for the Tab5 (no save needed)
    if (path === "/api/groves") return ok(GROVES);     // C-137: the groves' universes and signs, for the Tab5 (no save needed)
    if (path === "/api/school") return ok(SCHOOL);     // C-137: CALLOW SCHOOL's floors and the paper, for the Tab5
    if (path === "/api/marks") return ok(MARKS);
    if (path === "/api/dreams") return ok({ dreams: dreamsOf(store) });   // C-200: the dream journal, the newest first
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
    if (path === "/api/progress") return ok(readProgress(save));        // C-128, C-129: GAME EVENTS and CALLOW SCHOOL
    if (path === "/api/play") {                                         // T-426: the instrument, held or not, and the songs
      const p = readPlay(save, h.edition);                              // ?preview=1, a bench check: as if held, every song learned
      const pv = a.query?.preview;                                      // (?preview=flute or harp: that instrument)
      return ok(pv ? { ...p, instrument: pv === "flute" || pv === "harp" ? pv : p.instrument, unlocked: true,
                       songs: p.songs.map((x) => ({ ...x, learned: true, heard: false })) } : p);
    }
    if (path === "/api/notebook") return ok(readNotebook(save));        // C-125: the pages held, readable here
    if (path === "/api/guide") return ok(readGuide(save));              // C-145: the GUIDE, once found
    if (path === "/api/books" || path === "/api/book") {               // C-208: the books held -- their chapters, or one chapter
      const books = booksOf(readSubtle(save), readGuide(save), readNotebook(save));   // never ?preview: the boards read what the save holds
      if (path === "/api/books") return ok({ books: bookList(books) });
      const c = chapterOf(books, a.query?.book ?? "", Number(a.query?.n));
      return c ? ok(c) : no(404, "no such chapter");
    }
    if (path === "/api/reads") return ok({ held: readSubtle(save, undefined, a.query?.preview === "1").held, ...readsView(store, now) });   // C-203: the companion's own log
    if (path === "/api/subtle") return ok(readSubtle(save, undefined, a.query?.preview === "1"));
    if (path === "/api/arcana/draw") {                                   // C-232: a card, or a spread of three (a GET: the watch may ask it)
      if (!readSubtle(save).held) return no(403, "Find THE SUBTLE LAYER first.");   // DRAFT
      return ok({ cards: draw(a.query?.count === "3" ? 3 : 1) });
    }
    if (path === "/api/arcana/today") {                                  // C-232: the day's card, the same all day for this trainer
      if (!readSubtle(save).held) return ok({ held: false });
      const p = readProfile(save);
      return ok({ held: true, card: cardOfDay(today(h, store, now).date, `${p.name}${p.trainerId}`) });
    }
    if (path === "/api/subtle/today" || path === "/api/subtle/journal") {   // C-230: the book's question of the day, and what was answered
      if (!readSubtle(save).held) return ok({ held: false });
      const t = today(h, store, now), q = todaysQuestion(t.date, dayOf(t));
      return ok(path.endsWith("journal") ? { held: true, entries: journalOf(store).slice(0, 60) }
                                          : { held: true, ...q, answer: journalOf(store).find((x) => x.date === t.date)?.answer ?? null });
    }   // T-423: THE SUBTLE LAYER, once found (?preview=1, a bench check)
    if (path === "/api/index") return ok(readIndex(save, h.edition));   // C-24: the save's own INDEX, OPUS's margins with it
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
    // C-229: ASK THE SUBTLE LAYER -- its own line and a question back, or TWO VOICES' asking voice (the hub's module may say
    // the line in its own words instead: api.ts); C-230: the day's question answered, kept in the journal
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
    const care = path.match(CARE);                      // C-13: care -- feed, water, train, and SLEEP (C-114) -- kept as the device's are
    if (care) {
      // C-196: the daemon's written line for it, as the boards show (chosen before the care counts, as api.ts's careLine)
      const l = daemonLife(store, now), kind = care[1] as LineKind;
      const said = writtenLine(kind, l.mood, now.toLocaleDateString("en-CA"), kind === "feed" ? l.fed.today : kind === "water" ? l.watered.today : 0);
      store.logInteraction(care[1], "site"); careGiven(h, store, care[1], deviceId);
      const r = lifeNow(h, store, deviceId, now), save = h.save.read();
      return { ...r, body: { ...(r.body as object), ...saying(said, !!save && readSubtle(save).held) } };   // C-204: and under it
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
      const open = store.currentGoal();
      if (open && !b.replace) return no(409, "one goal at a time: finish this one, or replace it", { goal: open });
      if (open) store.db.prepare("UPDATE goals SET done = ? WHERE id = ?").run(`set aside ${now.toISOString()}`, open.id);
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
  }
  return no(404, "not found");
}

function lifeNow(h: Host, store: Store, deviceId: string, now: Date): Reply {
  const d = carriedDaemon(h, store, deviceId);
  const lf = daemonLife(store, now);
  return ok({ ...lf, expression: daemonExpression(store, now, lf, d?.species ?? null), grown: d ? grown(d, store) : null, level: d?.level ?? null,
            thrive: thriveOf(store, now) });   // C-119; C-207: the week, for the den's glow and marks
}

// C-174: a watch's fix -- "where <lat> <lon> <metres>" -- kept for the app's map, never logged as tending. The server's
// interact and a phone hosting alone (app/local.ts) both take it here.
export function takeFix(store: Store, detail: string, deviceId: string, now = new Date()): Fix | string {
  const f = checkFix(detail);
  if (typeof f === "string") return f;
  // C-199: a fix told late (kept on the Ultra's card while nothing was in reach) carries when it was taken -- its fourth
  // number, seconds since 1970; one from the future, or from before the GNSS could have run, is taken as now
  const taken = Number(detail.split(" ")[3]) * 1000;
  const at = Number.isFinite(taken) && taken > Date.UTC(2026, 0) && taken <= now.getTime() + 60000 ? new Date(taken) : now;
  return keepFix(store, f, deviceId, at);
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
// hosting alone (app/local.ts) both take them here.
export function takeSubtle(store: Store, kind: string, detail: string, deviceId: string, now = new Date()): Reply {
  if (kind === "read") { const r = takeRead(store, detail, deviceId, now); return typeof r === "string" ? no(400, r) : ok({ read: r }); }
  const l = takeLean(store, detail, now);
  return typeof l === "string" ? no(400, l) : ok({ leans: { told: l.told, landed: l.landed } });
}
