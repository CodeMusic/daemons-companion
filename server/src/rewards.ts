// C-290: this file runs on the phone too (C-111) -- the app imports it, directly or through another file -- so keep it free of Node-only APIs (node:*, fs).
// C-433 (PRAXIS 6; the user, 2026-11-22, by multiple choice): THE REWARD SHELF (docs/PROJECTS.md 6) -- real rewards the
// person stocks themselves (an episode, a coffee out, an hour of DAEMONS), each with its price in ARETE, once or any
// number of times. SPEND takes the price at once and the daemon is glad with you; it can be taken back the same day.
// A reward is an item in the REWARD SHELF space; a spend is ARETE's own `spend` event, named for its reward, so the
// ledger says what each ARETE went on. Every word the app shows is DRAFT.
import type { Store } from "./store.js";
import type { Form, Item } from "@daemons/praxis";
import { ensureSpace, midnight } from "./practice.js";

const TEXT = { type: "text" as const };
export const REWARDS: Form = {
  name: "rewards", version: 1,
  kinds: { reward: { title: "Reward", prefix: "REWARD",
                     states: [{ name: "stocked", phase: "open" }, { name: "taken", phase: "done" }],
                     fields: { price: { type: "number" }, times: TEXT, note: { type: "long" } } } },
  views: [{ name: "shelf" }],
};
export const PRICE_MOST = 10000, TITLE_MOST = 60;
export type Reward = { id: number; title: string; price: number; times: "once" | "any"; note: string; taken: boolean;
                       spends: { key: string; at: string; undoable: boolean }[] };

const SPACES = new WeakMap<Store, string>();
function shelf(store: Store): string {
  const had = SPACES.get(store);
  if (had) return had;
  const space = ensureSpace(store.life.px, REWARDS, { title: "The reward shelf", prefix: "SHELF" });
  SPACES.set(store, space);
  return space;
}
const iso = (hlc: string) => new Date(Number(hlc.slice(0, 18))).toISOString();
function asReward(store: Store, it: Item, now: Date): Reward {
  const px = store.life.px, today = midnight(now.getTime());
  const spends = px.ledger(it.space).filter((e) => e.item === it.id && e.op === "spend" && !e.back)
    .map((e) => ({ key: e.key, at: iso(e.hlc), undoable: Number(e.hlc.slice(0, 18)) >= today }));
  return { id: it.number as number, title: it.title, price: Number(it.fields.price ?? 0), times: it.fields.times === "once" ? "once" : "any",
           note: String(it.fields.note ?? ""), taken: it.phase === "done", spends };
}
const rewardOf = (store: Store, id: number) => { const s = shelf(store), it = store.life.px.numbered(s, id, "reward"); return it && !it.archived ? it : null; };

export function shelfView(store: Store, now = new Date(store.now())) {
  const s = shelf(store), px = store.life.px;
  const rewards = px.items(s, { kind: "reward", archived: false }).map((it) => asReward(store, it, now))
    .sort((a, b) => Number(a.taken) - Number(b.taken) || a.price - b.price || a.id - b.id);
  return { arete: store.life.arete(now), rewards };
}

function checked(b: any): { title: string; price: number; times: "once" | "any"; note: string } | string {
  const title = String(b?.title ?? "").replace(/\s+/g, " ").trim().slice(0, TITLE_MOST);
  const price = Number(b?.price);
  if (!title) return "a reward needs a name";                                            // DRAFT
  if (!Number.isInteger(price) || price < 1 || price > PRICE_MOST) return `a price is a whole number of ARETE, 1 to ${PRICE_MOST}`;   // DRAFT
  return { title, price, times: b?.times === "once" ? "once" : "any", note: String(b?.note ?? "").trim().slice(0, 500) };
}
export function stock(store: Store, b: any, now = new Date(store.now())) {
  const r = checked(b);
  if (typeof r === "string") return r;
  store.life.px.make(shelf(store), "reward", r);
  return shelfView(store, now);
}
export function editReward(store: Store, b: any, now = new Date(store.now())) {
  const it = rewardOf(store, Number(b?.id));
  if (!it) return "no such reward";                                                      // DRAFT
  const r = checked({ ...asReward(store, it, now), ...b });
  if (typeof r === "string") return r;
  const px = store.life.px;
  px.transaction(() => { for (const [f, v] of Object.entries(r)) if ((f === "title" ? it.title : it.fields[f]) !== v) px.set(it.id, f, v); });
  return shelfView(store, now);
}
// taken off the shelf: archived, never deleted -- what was spent on it stays in the ledger
export function removeReward(store: Store, id: number, now = new Date(store.now())) {
  const it = rewardOf(store, id);
  if (!it) return "no such reward";
  store.life.px.archive(it.id);
  return shelfView(store, now);
}

// SPEND: the price taken at once (never more than is held), a reward kept once set taken, the daemon glad with you
export function spend(store: Store, id: number, now = new Date(store.now())) {
  const it = rewardOf(store, id);
  if (!it) return "no such reward";
  const r = asReward(store, it, now), px = store.life.px;
  if (r.taken) return "already taken -- it was for once";                                // DRAFT
  if (store.life.arete(now).held < r.price) return `${r.price} ARETE is more than you hold`;   // DRAFT
  px.transaction(() => {
    px.spend(it.space, r.price, { item: it.id, reason: r.title });   // its own key, so a spend taken back and made again is a new one
    if (r.times === "once") px.state(it.id, "taken");
  });
  store.logInteraction("reward", `${r.price} ${r.title}`, now);                         // the daemon's own log: a reward taken together
  return { ...shelfView(store, now), spent: { id: r.id, title: r.title, price: r.price } };
}
// taken back: the same day only
export function unspend(store: Store, id: number, key: string, now = new Date(store.now())) {
  const it = rewardOf(store, id);
  if (!it) return "no such reward";
  const s = asReward(store, it, now).spends.find((x) => x.key === key);
  if (!s) return "no such spend";                                                         // DRAFT
  if (!s.undoable) return "a spend can be taken back on its own day only";                // DRAFT
  const px = store.life.px;
  px.transaction(() => {
    px.takeBack(it.id, "spend", key);
    if (it.phase === "done") px.state(it.id, "stocked");
  });
  return shelfView(store, now);
}
