// C-157 (the review: one fetch-on-open, written by hand on fifteen screens): what a screen shows from one GET, asked when
// it opens and again when `path` changes -- the answer (null until it comes), a setter for a screen that changes it itself
// (a write's answer, a happy path), and why it could not be had ("" while all is well).
import { useCallback, useEffect, useState } from "react";
import { api } from "./net";

// C-344 (the user, 2026-11-11: "components refresh ... it makes panels shift and jump around"): a fresher answer used to
// re-make the whole page (the ScrollView's key), so every card went back to nothing and came in again one by one -- and
// on a phone a slow answer that changed each time (THE TALK's health) re-made SETTINGS over and over. Now the page stays
// mounted and the fresh generation moves instead: a screen that reads it asks again in place, its last answer kept on
// screen until the next one comes.
let generation = 0;
const listeners = new Set<(n: number) => void>();
export function bumpFresh() { generation += 1; listeners.forEach((f) => f(generation)); }
export function useFresh(): number {
  const [n, setN] = useState(generation);
  useEffect(() => { listeners.add(setN); return () => { listeners.delete(setN); }; }, []);
  return n;
}

// C-344: each path's last answer, for this run of the app -- a card opened again (another tab and back) is drawn at once
// with what it showed last, at its own height, while it asks again, rather than empty until the answer comes
const LAST = new Map<string, unknown>();

export function useApi<T>(path: string): [T | null, (v: T | null) => void, string] {
  const [data, setData] = useState<T | null>(() => (LAST.get(path) as T | undefined) ?? null);
  const [error, setError] = useState("");
  const fresh = useFresh();
  useEffect(() => {
    let gone = false;
    api<T>(path).then((v) => { LAST.set(path, v); if (!gone) { setData(v); setError(""); } })
      .catch((e) => { if (!gone) setError((e as Error).message); });
    return () => { gone = true; };
  }, [path, fresh]);
  const set = useCallback((v: T | null) => { if (v === null) LAST.delete(path); else LAST.set(path, v); setData(v); }, [path]);
  return [data, set, error];
}
