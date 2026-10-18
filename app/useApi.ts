// C-157 (the review: one fetch-on-open, written by hand on fifteen screens): what a screen shows from one GET, asked when
// it opens and again when `path` changes -- the answer (null until it comes), a setter for a screen that changes it itself
// (a write's answer, a happy path), and why it could not be had ("" while all is well).
import { useEffect, useState } from "react";
import { api } from "./net";

export function useApi<T>(path: string): [T | null, (v: T | null) => void, string] {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let gone = false;
    api<T>(path).then((v) => { if (!gone) { setData(v); setError(""); } }).catch((e) => { if (!gone) setError((e as Error).message); });
    return () => { gone = true; };
  }, [path]);
  return [data, setData, error];
}
