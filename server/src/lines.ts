// C-180 (HUB.md Phase 5 item 2): most replies need no model. A care given (FEED, WATER, TRAIN, SLEEP, WAKE) and a
// hello are answered at once from written lines, chosen by the daemon's mood and the day -- the model is for talk only.
// The same care on the same day in the same mood gives the same line, the next one of the day the next line. Short
// enough for the smallest board's screen (36 characters). All DRAFT. No node: imports (it runs on the phone).
export type LineKind = "feed" | "water" | "train" | "sleep" | "wake" | "hello";
type Band = "bright" | "fine" | "quiet";

const LINES: Record<LineKind, Record<Band, string[]>> = {
  feed: {
    bright: ["That hit the spot!", "Delicious. Thank you!", "Full and happy.", "More of that, please!"],
    fine: ["Thank you. That helps.", "Mm. Good.", "Just what I needed."],
    quiet: ["...thank you.", "A little better now.", "I'll eat slowly."],
  },
  water: {
    bright: ["Cool and clear. Ahh!", "Splash! Thank you!", "Perfectly refreshing."],
    fine: ["That's better.", "Thank you for the water.", "Cool. Nice."],
    quiet: ["...that helps.", "A sip. Thank you.", "Slowly, slowly."],
  },
  train: {
    bright: ["Again! Again!", "I felt that one grow!", "Stronger every day!"],
    fine: ["Good practice.", "I'm getting it.", "One more step."],
    quiet: ["I tried my best.", "A small step today.", "Let's go gently."],
  },
  sleep: {
    bright: ["Goodnight! Big day!", "Dreaming already...", "See you at sunrise!"],
    fine: ["Goodnight.", "Time to rest.", "Mm. Sleepy now."],
    quiet: ["Rest will help.", "Goodnight. Stay near?", "Tomorrow, then."],
  },
  wake: {
    bright: ["Morning! Let's go!", "I'm up! What's today?", "A whole new day!"],
    fine: ["Good morning.", "Awake. Hello.", "Morning. Ready soon."],
    quiet: ["...morning.", "Slow start today.", "Five more minutes?"],
  },
  hello: {
    bright: ["There you are!", "Hi! I missed you!", "Hello! Good to see you!"],
    fine: ["Hello.", "Hi there.", "Oh, it's you. Hi."],
    quiet: ["...hi.", "Hello. It's quiet here.", "Stay a while?"],
  },
};

export const LINE_KINDS = Object.keys(LINES) as LineKind[];
export const bandOf = (mood: number): Band => (mood >= 72 ? "bright" : mood >= 55 ? "fine" : "quiet");

// The line for this care: by mood, then by the day and how many of this care came before today
export function writtenLine(kind: LineKind, mood: number, day: string, before = 0): string {
  const list = LINES[kind][bandOf(mood)];
  let h = 0;
  for (const c of `${day}/${kind}`) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return list[(h + before) % list.length];
}
export const isLineKind = (k: string): k is LineKind => (LINE_KINDS as string[]).includes(k);

// C-204 (the user, 2026-10-28, by multiple choice): words under words -- once the save holds THE SUBTLE LAYER, a purple
// line under four of the daemon's own, what it means beneath what it says, as DAEMONS T-459 D puts one under four
// people's. Never a feeling named. DRAFT.
const UNDER: Record<string, string> = {
  "Hi! I missed you!": "I counted.",
  "Goodnight. Stay near?": "Don't go far.",
  "Again! Again!": "Watch me.",
  "Five more minutes?": "Stay with me.",
};
export const UNDER_LINES = Object.keys(UNDER);
// a written line as an answer carries it: `said`, and `under` when there is one and the book is held
export function saying(said: string, held: boolean): { said: string; under?: string } {
  return held && UNDER[said] ? { said, under: UNDER[said] } : { said };
}
