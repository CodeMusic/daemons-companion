// C-290: this file runs on the phone too (C-111) -- the app imports it, directly or through another file -- so keep it free of Node-only APIs (node:*, fs).
// C-433 (PRAXIS 6; the user, 2026-11-22, by multiple choice: "kinds, fields, ARETE ... and ask me again after testing"):
// FORMS YOU MAKE YOURSELF (docs/PROJECTS.md 4.2). A form is data: its KINDS, each with the FIELDS the person picks (text,
// long text, a number, a date, a rating, a choice) and what finishing one pays in ARETE under a daily cap; every kind
// is open, then done. Forms are items in the MY FORMS space (their definition a field), SPACES are made from them, and
// ITEMS kept there -- finished, paid by their kind's rule, and the day's virtue on the day's first finish. A changed
// form is a new version, taken by every space made from it. Shared through THE COMMONS (api.ts) as a form alone, never
// its items, and a friend's taken in as one's own. In MINE on JOURNEY. Every word the app shows is DRAFT.
import type { Store } from "../shared/store.js";
import type { FieldDef, Form, Item, KindDef } from "@daemons/praxis";
import { checkForm } from "@daemons/praxis";
import { dayVirtue, ensureSpace, midnight } from "./practice.js";

export const FIELD_KINDS = ["text", "long", "number", "date", "rating", "choice"] as const;
export type MineField = { key: string; title: string; type: (typeof FIELD_KINDS)[number]; choices?: string[] };
export type MineKind = { key: string; title: string; fields: MineField[]; arete: number; cap: number };
export type MineForm = { id: string; title: string; about: string; version: number; kinds: MineKind[]; from: string | null };
export const MOST = { title: 40, about: 300, kinds: 8, fields: 12, choices: 12, arete: 50, cap: 500, item: 200, value: 2000 };

const FORMS: Form = {
  name: "forms", version: 1,
  kinds: { form: { title: "Form", prefix: "FORM", states: [{ name: "kept", phase: "open" }],
                   fields: { definition: { type: "long" }, about: { type: "long" }, from: { type: "text" } } } },
};
const SPACES = new WeakMap<Store, string>();
function formsSpace(store: Store): string {
  const had = SPACES.get(store);
  if (had) return had;
  const s = ensureSpace(store.life.px, FORMS, { title: "My forms", prefix: "FORMS" });
  SPACES.set(store, s);
  return s;
}
const hex = (uuid: string) => uuid.replace(/-/g, "");
const formName = (id: string) => `mine-${hex(id)}`;
const clean = (v: unknown, most: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, most);
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40) || "x";

// ---- forms ------------------------------------------------------------------------------------------------------------
function asForm(it: Item): MineForm {
  let d: { kinds?: MineKind[]; version?: number } = {};
  try { d = JSON.parse(String(it.fields.definition ?? "{}")); } catch { /* none */ }
  return { id: hex(it.id), title: it.title, about: String(it.fields.about ?? ""), version: d.version ?? 1, kinds: d.kinds ?? [],
           from: it.fields.from ? String(it.fields.from) : null };
}
// a person's form as PRAXIS's: each kind open then done, its fields as picked, its rule its ARETE
export function praxisForm(f: MineForm): Form {
  const kinds: Record<string, KindDef> = {};
  for (const k of f.kinds) {
    const fields: Record<string, FieldDef> = {};
    for (const x of k.fields) fields[x.key] = { type: x.type, title: x.title, ...(x.type === "choice" ? { choices: x.choices ?? [] } : {}) };
    kinds[k.key] = { title: k.title, states: [{ name: "open", phase: "open" }, { name: "done", phase: "done" }], fields };
  }
  return { name: formName(f.id), version: f.version, kinds, views: [{ name: "list" }],
           rules: f.kinds.map((k) => ({ kind: k.key, arete: k.arete, cap: k.cap, daemon: [] })) };
}
// what the person sent, checked and given keys: a kind's and a field's key kept as they were, a new one made from its title
export function checkedKinds(raw: unknown): MineKind[] | string {
  const list = Array.isArray(raw) ? raw.slice(0, MOST.kinds) : [];
  if (!list.length) return "a form needs at least one kind";                                     // DRAFT
  const used = new Set<string>(), out: MineKind[] = [];
  for (const r of list as Record<string, unknown>[]) {
    const title = clean(r?.title, MOST.title);
    if (!title) return "every kind needs a name";                                                  // DRAFT
    let key = /^k_[a-z0-9_]{1,40}$/.test(String(r?.key ?? "")) ? String(r.key) : `k_${slug(title)}`;
    while (used.has(key)) key += "_2";
    used.add(key);
    const fused = new Set<string>(), fields: MineField[] = [];
    for (const f of (Array.isArray(r?.fields) ? r.fields : []).slice(0, MOST.fields) as Record<string, unknown>[]) {
      const ft = clean(f?.title, MOST.title);
      if (!ft) continue;
      const type = (FIELD_KINDS as readonly string[]).includes(String(f?.type)) ? (f.type as MineField["type"]) : "text";
      let fk = /^f_[a-z0-9_]{1,40}$/.test(String(f?.key ?? "")) ? String(f.key) : `f_${slug(ft)}`;
      while (fused.has(fk)) fk += "_2";
      fused.add(fk);
      const choices = type === "choice" ? (Array.isArray(f?.choices) ? f.choices : String(f?.choices ?? "").split(","))
        .map((c) => clean(c, 40)).filter(Boolean).slice(0, MOST.choices) : undefined;
      if (type === "choice" && !choices?.length) return `${ft} needs its choices`;                 // DRAFT
      fields.push({ key: fk, title: ft, type, ...(choices ? { choices } : {}) });
    }
    const arete = Math.max(0, Math.min(MOST.arete, Math.round(Number(r?.arete) || 0)));
    const cap = Math.max(arete, Math.min(MOST.cap, Math.round(Number(r?.cap) || arete * 5)));
    out.push({ key, title, fields, arete, cap });
  }
  return out;
}
export function formsOf(store: Store): MineForm[] {
  const s = formsSpace(store);
  return store.life.px.items(s, { kind: "form", archived: false }).map(asForm).sort((a, b) => a.title.localeCompare(b.title));
}
const formItem = (store: Store, id: unknown) => {
  const s = formsSpace(store);
  return store.life.px.items(s, { kind: "form", archived: false }).find((it) => hex(it.id) === String(id ?? "")) ?? null;
};
// a form made, or (with id) changed: a new version, which every space made from it takes
export function saveForm(store: Store, b: any): MineForm | string {
  const title = clean(b?.title, MOST.title);
  if (!title) return "a form needs a name";                                                          // DRAFT
  const kinds = checkedKinds(b?.kinds);
  if (typeof kinds === "string") return kinds;
  const px = store.life.px, about = clean(b?.about, MOST.about);
  const had = b?.id ? formItem(store, b.id) : null;
  if (b?.id && !had) return "no such form";                                                          // DRAFT
  const version = had ? asForm(had).version + 1 : 1;
  const probe = praxisForm({ id: had ? hex(had.id) : "0".repeat(32), title, about, version, kinds, from: null });
  const bad = checkForm(probe);
  if (bad.length) return `that form cannot be kept: ${bad[0]}`;                                      // DRAFT
  const definition = JSON.stringify({ version, kinds });
  let id = had?.id ?? "";
  px.transaction(() => {
    if (had) { px.set(had.id, "title", title); px.set(had.id, "about", about); px.set(had.id, "definition", definition); }
    else id = px.make(formsSpace(store), "form", { title, about, definition, from: clean(b?.from, 120) });
    const f = praxisForm(asForm(px.item(id)!));
    for (const sp of px.spaces().filter((x) => x.form?.name === f.name && !x.archived)) px.adopt(sp.id, f);
  });
  return asForm(px.item(id)!);
}
export function removeForm(store: Store, id: unknown) {
  const it = formItem(store, id);
  if (!it) return "no such form";
  store.life.px.archive(it.id);                                                                      // archived: its spaces keep it
  return mineView(store);
}

// ---- spaces made from them, and their items ------------------------------------------------------------------------
const mineSpaces = (store: Store) => store.life.px.spaces().filter((s) => s.form?.name.startsWith("mine-") && !s.archived && s.home === s.id);
export function mineView(store: Store) {
  const forms = formsOf(store), px = store.life.px;
  const spaces = mineSpaces(store).map((s) => {
    const items = px.items(s.id, { archived: false });
    return { id: s.id, title: s.title, form: s.form!.name.slice(5), formTitle: forms.find((f) => f.id === s.form!.name.slice(5))?.title ?? "",
             open: items.filter((i) => i.phase !== "done").length, done: items.filter((i) => i.phase === "done").length };
  });
  return { forms, spaces, fieldKinds: FIELD_KINDS };
}
export function makeSpace(store: Store, b: any) {
  const it = formItem(store, b?.form);
  if (!it) return "no such form";                                                                    // DRAFT
  const title = clean(b?.title, MOST.title) || it.title;
  store.life.px.makeSpace({ title, form: praxisForm(asForm(it)), reach: "home", prefix: "MINE" });
  return mineView(store);
}
const spaceIn = (store: Store, id: unknown) => mineSpaces(store).find((s) => s.id === String(id ?? "")) ?? null;
export function spaceView(store: Store, id: unknown) {
  const s = spaceIn(store, id);
  if (!s) return null;
  const px = store.life.px, form = s.form!;
  const items = px.items(s.id, { archived: false }).sort((a, b) => Number(a.phase === "done") - Number(b.phase === "done") || b.made.localeCompare(a.made))
    .map((i) => ({ id: i.id, kind: i.kind, title: i.title, done: i.phase === "done", fields: i.fields }));
  const kinds = Object.entries(form.kinds).map(([key, k]) => ({ key, title: k.title,
    fields: Object.entries(k.fields ?? {}).map(([fk, fd]) => ({ key: fk, title: fd.title ?? fk, type: fd.type, choices: fd.choices })),
    arete: ((form.rules ?? []) as { kind: string; arete: number }[]).find((r) => r.kind === key)?.arete ?? 0 }));
  return { id: s.id, title: s.title, kinds, items };
}
// an item kept, or (with id) changed: its title and the fields its kind has, each checked as its type is
function values(store: Store, spaceId: string, kind: string, raw: unknown): Record<string, unknown> | string {
  const s = spaceIn(store, spaceId)!, k = s.form!.kinds[kind], out: Record<string, unknown> = {};
  const given = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  for (const [fk, fd] of Object.entries(k.fields ?? {})) {
    const v = given[fk];
    if (v === undefined || v === "" || v === null) continue;
    if (fd.type === "number" || fd.type === "rating") {
      const n = Number(v);
      if (!Number.isFinite(n) || (fd.type === "rating" && !(Number.isInteger(n) && n >= 0 && n <= 5))) return `${fd.title ?? fk}: ${fd.type === "rating" ? "0 to 5" : "a number"}`;   // DRAFT
      out[fk] = n;
    } else if (fd.type === "date") { if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v))) return `${fd.title ?? fk}: a date, YYYY-MM-DD`; out[fk] = String(v); }   // DRAFT
    else if (fd.type === "choice") { if (!fd.choices?.includes(String(v))) return `${fd.title ?? fk}: one of ${fd.choices?.join(", ")}`; out[fk] = String(v); }   // DRAFT
    else out[fk] = String(v).slice(0, MOST.value);
  }
  return out;
}
export function keepItem(store: Store, b: any) {
  const px = store.life.px;
  if (b?.id) {
    const it = px.item(String(b.id));
    if (!it || it.archived || !spaceIn(store, it.space)) return "no such item";                     // DRAFT
    const v = values(store, it.space, it.kind, b.fields);
    if (typeof v === "string") return v;
    const title = clean(b?.title, MOST.item);
    px.transaction(() => { if (title && title !== it.title) px.set(it.id, "title", title); for (const [f, x] of Object.entries(v)) if (it.fields[f] !== x) px.set(it.id, f, x); });
    return spaceView(store, it.space);
  }
  const s = spaceIn(store, b?.space);
  if (!s) return "no such space";                                                                    // DRAFT
  const kind = String(b?.kind ?? "");
  if (!s.form!.kinds[kind]) return "that form has no such kind";                                     // DRAFT
  const title = clean(b?.title, MOST.item);
  if (!title) return "it needs a name";                                                              // DRAFT
  const v = values(store, s.id, kind, b?.fields);
  if (typeof v === "string") return v;
  px.make(s.id, kind, { title, ...v });
  return spaceView(store, s.id);
}
// done: paid by its kind's rule under the day's cap, and the day's virtue; open again takes them back
export function itemDone(store: Store, id: unknown, done: boolean, now = new Date(store.now())) {
  const px = store.life.px, it = px.item(String(id ?? "")), s = it ? spaceIn(store, it.space) : null;
  if (!it || it.archived || !s) return "no such item";                                              // DRAFT
  const rule = ((s.form!.rules ?? []) as { kind: string; arete: number; cap: number }[]).find((r) => r.kind === it.kind);
  px.transaction(() => {
    if (done && it.phase !== "done") {
      const paid = px.ledger(s.id, { since: midnight(now.getTime()) }).filter((e) => e.op === "award" && !e.back && e.kind === it.kind && e.key.startsWith("finish:")).reduce((n, e) => n + e.points, 0);
      px.state(it.id, "done", { pay: Math.max(0, Math.min(rule?.arete ?? 0, (rule?.cap ?? 0) - paid)), reason: "finish" });
      dayVirtue(px, it.id, now);
    } else if (!done && it.phase === "done") {
      px.state(it.id, "open");
      for (const e of px.ledger(s.id).filter((x) => x.item === it.id && !x.back && x.key.startsWith("virtue:"))) px.takeBack(it.id, "award", e.key);
    }
  });
  return spaceView(store, s.id);
}
export function removeItem(store: Store, id: unknown) {
  const px = store.life.px, it = px.item(String(id ?? ""));
  if (!it || it.archived || !spaceIn(store, it.space)) return "no such item";
  px.archive(it.id);
  return spaceView(store, it.space);
}

// ---- THE COMMONS: what travels is the form's shape alone -------------------------------------------------------------
export function formToShare(store: Store, id: unknown): { id: string; title: string; about: string; form: { title: string; about: string; kinds: MineKind[] } } | null {
  const it = formItem(store, id);
  if (!it) return null;
  const f = asForm(it);
  return { id: f.id, title: f.title, about: f.about, form: { title: f.title, about: f.about, kinds: f.kinds } };
}
// a friend's form taken in as one's own (a copy: changing it changes nothing of theirs)
export function takeForm(store: Store, shared: unknown, from: string) {
  const s = shared as { title?: unknown; about?: unknown; kinds?: unknown } | null;
  if (!s || typeof s !== "object") return "that is not a form";                                     // DRAFT
  return saveForm(store, { title: s.title, about: s.about, kinds: s.kinds, from });
}
