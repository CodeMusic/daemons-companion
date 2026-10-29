// C-220 (the user, 2026-10-29, by multiple choice: "model-written, filtered, no player text" -- kids play): every line
// one daemon says to another player's passes here before anyone sees it. A line that fails is not shown: the meeting
// says a written line in its place (together.ts). What it refuses:
//   * anything that reaches out of the game -- a link, an email, a handle, a run of digits (a phone, an address, an age);
//   * talk of where someone lives, goes to school, their real name, or a password;
//   * a person's name the model made up: a Capitalised word mid-sentence that is not one of the daemons there, a day or
//     a month (the daemons' own names are in capitals, as the game writes them);
//   * rude words; and anything too long for a board's line.
// No node: imports (the phone hosting alone runs it).

const MOST = 120;
const OUT_OF_GAME = [/https?:\/\//i, /www\./i, /\b[\w.+-]+@[\w-]+\.[\w.]+\b/, /(^|\s)@\w/, /\d[\d\s().-]{2,}\d/, /\.(com|net|org|io|ca|uk)\b/i];
const ABOUT_A_PERSON = /\b(my|your) (real )?(name|address|school|street|town|city|house number|phone|number|password|age)\b|\b(i|you) live (in|on|at)\b|\bwhere do you live\b|\bhow old are you\b|\bwhat school\b/i;
// short on purpose: the model is small and talks about food, sleep, dreams and weather; this catches what slips
const RUDE = /\b(damn|hell|crap|shit|fuck\w*|bitch\w*|bastard|ass(hole)?|piss\w*|dick|cock|sex\w*|kill (you|yourself)|stupid|idiot|hate you|shut up|dumb)\b/i;
const CALENDAR = new Set(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday", "January", "February", "March",
  "April", "May", "June", "July", "August", "September", "October", "November", "December", "I", "I'm", "I'll", "I've", "I'd", "OK"]);

// the line as said, or null: refused. `known`: the names this meeting may use (the two daemons, their kinds).
export function safeLine(line: string, known: string[] = [], most = MOST): string | null {
  const s = line.replace(/\s+/g, " ").trim();
  if (!s || s.length > most) return null;
  if (OUT_OF_GAME.some((r) => r.test(s)) || ABOUT_A_PERSON.test(s) || RUDE.test(s)) return null;
  const names = new Set(known.flatMap((k) => k.toUpperCase().split(/[\s/]+/)));
  // every word after the first of each sentence: Capitalised, and not a daemon's name, a day or a month -> a person
  for (const sentence of s.split(/(?<=[.!?])\s+/)) {
    const words = sentence.replace(/[^\p{L}' -]/gu, " ").split(/\s+/).filter(Boolean).slice(1);
    for (const w of words) {
      if (/^\p{Lu}\p{Ll}/u.test(w) && !CALENDAR.has(w) && !names.has(w.toUpperCase())) return null;
    }
  }
  return s;
}
