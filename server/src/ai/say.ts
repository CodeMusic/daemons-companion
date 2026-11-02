// C-270 (the user, 2026-11-01: "the TTS returns the pronouciation of daemon as (DEE-MON) ... anything on the hub that
// goes into tts has a replace for daemons to (daymons) so it pronounes right"): the words a voice is handed, never the
// words shown or kept -- DAEMON respelled the way it is said, DAY-mon. In capitals it comes out Daymon, not DAYMON, which
// a voice may spell out letter by letter. Respelled twice it is unchanged. No imports: the phone's hosting reaches ai/.
// A word that ends in daemon is respelled too, its front kept -- eudaemon, cacodaemon, agathodaemon (the fourth book's
// words, 2026-11-01) -- but daemonic is left alone.
export function sayable(text: string): string {
  return text.replace(/\b(\w*?)daemon(s?)\b/gi, (w) => {
    const said = w.toLowerCase().replace(/daemon(s?)$/, "daymon$1");
    return w[0] === w[0].toLowerCase() ? said : said[0].toUpperCase() + said.slice(1);
  });
}
