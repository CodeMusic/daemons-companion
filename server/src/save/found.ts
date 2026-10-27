// C-189: what the game just gave -- the NOTEBOOK pages and INDEX cards a save holds now and did not before, so the app
// can open them beside the game. A page is known by its section and title; a card by its number and whether it is bound
// (a daemon met and later bound is new twice). Pages first: a page is what the game hands over on purpose. No node:
// imports (it runs on the phone).
export type FoundPage<P> = { kind: "page"; key: string; section: string; page: P };
export type FoundCard<E> = { kind: "card"; key: string; entry: E };
export type Found<P, E> = FoundPage<P> | FoundCard<E>;

export function heldKeys<P extends { title: string }, E extends { national: number; bound: boolean }>(
    n: { sections: { name: string; pages: P[] }[] } | null, ix: { entries: E[] } | null): Map<string, Found<P, E>> {
  const m = new Map<string, Found<P, E>>();
  for (const s of n?.sections ?? []) for (const p of s.pages) {
    const key = `page:${s.name}/${p.title}`;
    m.set(key, { kind: "page", key, section: s.name, page: p });
  }
  for (const e of ix?.entries ?? []) {
    const key = `card:${e.national}:${e.bound ? "bound" : "seen"}`;
    m.set(key, { kind: "card", key, entry: e });
  }
  return m;
}

export function newlyFound<P, E>(before: Map<string, Found<P, E>>, now: Map<string, Found<P, E>>): Found<P, E>[] {
  return [...now.values()].filter((f) => !before.has(f.key)).sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "page" ? -1 : 1));
}
