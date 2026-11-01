// C-270 (the user, 2026-11-01: "the TTS returns the pronouciation of daemon as (DEE-MON) ... anything on the hub that
// goes into tts has a replace for daemons to (daymons) so it pronounes right"): the words a voice is handed, never the
// words shown or kept -- DAEMON respelled the way it is said, DAY-mon. In capitals it comes out Daymon, not DAYMON, which
// a voice may spell out letter by letter. Respelled twice it is unchanged. No imports: the phone's hosting reaches ai/.
export function sayable(text: string): string {
  return text.replace(/\bdaemon(s?)\b/gi, (w, s: string) => (w[0] === "d" ? "daymon" : "Daymon") + s.toLowerCase());
}
