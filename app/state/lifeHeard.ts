// C-300 (the user, 2026-11-05: "the widget daemon, and the app daemon should be the same but I often times see them out
// of sync"): the companion keeps one life; the app's daemon card hears here when it may have changed elsewhere -- the
// widget's kept presses sent (shell/sync.ts), the app back at the front -- and reads it again.
const heard = new Set<() => void>();
export function onLifeHeard(f: () => void) { heard.add(f); return () => { heard.delete(f); }; }
export function lifeHeard() { heard.forEach((f) => f()); }
