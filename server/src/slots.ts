// C-155 (the user, 2026-10-18: "we should have routines on the phone app too -- including casino"): THE CASINO's SLOTS,
// the rules every player keeps -- the handhelds (firmware/esp32/src/casino.cpp, the same table in C++: a test holds the
// two together), the phone app and whatever comes after. Nothing here may import Node: the app imports it.
//
// The result is decided at the pull, from WEIGHTS (in a thousand), and each reel then slips on to its piece -- so
// stopping the reels is the fun of it, not a skill. 94.4 back of every 100 bet, as the Game Corner kept a house edge.
// A pull's coins go to the companion as INTERACT casino (resultDetail), and SYNC writes them into the game (casino.ts).

// the pieces: the daemon carried (three of it the jackpot), up to three of the party's others, the coin, the season's own
export const PIECES = ["JACK", "F1", "F2", "F3", "COIN", "SEASON"] as const;
export type Piece = 0 | 1 | 2 | 3 | 4 | 5;
export const JACK = 0, F1 = 1, F3 = 3, COIN = 4, SEASON = 5;

export const OUTCOMES = ["LOSE", "SEASON1", "JACK2", "SEASON3", "COIN3", "FRIEND3", "JACK3"] as const;
export const WEIGHTS = [694, 180, 40, 40, 30, 12, 4];        // of 1000
export const PAYS = [0, 1, 2, 4, 6, 12, 50];                  // for each coin bet, the bet included
export const BETS = [10, 20, 50, 100, 200, 500, 1000];
export const STRIP = 12;                                     // each piece twice round a reel: a reel slips at most six
export const RETURN = WEIGHTS.reduce((n, w, o) => n + w * PAYS[o], 0) / 1000;   // 0.944

export function outcomeOf(a: number, b: number, c: number): number {
  if (a === b && b === c) return a === JACK ? 6 : a === COIN ? 4 : a === SEASON ? 3 : 5;
  if (a === JACK && b === JACK) return 2;
  if (a === SEASON) return 1;
  return 0;
}

// the result of a pull, from the table
export function draw(rand: () => number = Math.random): number {
  let r = Math.floor(rand() * 1000);
  for (let o = 0; o < WEIGHTS.length; o++) { if (r < WEIGHTS[o]) return o; r -= WEIGHTS[o]; }
  return 0;
}

// three pieces that make exactly this result
export function piecesFor(o: number, rand: () => number = Math.random): [Piece, Piece, Piece] {
  const any = () => Math.floor(rand() * 6) as Piece;
  switch (o) {
    case 6: return [0, 0, 0];
    case 5: { const f = (F1 + Math.floor(rand() * 3)) as Piece; return [f, f, f]; }
    case 4: return [4, 4, 4];
    case 3: return [5, 5, 5];
    case 2: { let c = any(); while (c === JACK) c = any(); return [0, 0, c]; }
    default:
      for (let tries = 0; tries < 500; tries++) {
        const p: [Piece, Piece, Piece] = [o === 1 ? 5 : any(), any(), any()];
        if (outcomeOf(...p) === o) return p;
      }
      return [4, 1, 2];                                       // a loss, whatever the dice did
  }
}

// a reel's strip: each piece twice, shuffled
export function strip(rand: () => number = Math.random): Piece[] {
  const s = Array.from({ length: STRIP }, (_, i) => (i % 6) as Piece);
  for (let i = s.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [s[i], s[j]] = [s[j], s[i]]; }
  return s;
}

// where a reel stops for its piece: the first place past `pos` (by at least `ahead`) that shows it -- never back
export function stopAt(reel: Piece[], pos: number, piece: Piece, ahead = 0.7): number {
  let at = Math.ceil(pos + ahead);
  while (reel[((at % STRIP) + STRIP) % STRIP] !== piece) at++;
  return at;
}

// C-151: a win this big is called to the table, as the broadcast act of this code (acts.json's "casino")
export function tableAct(o: number): "JACKPOT" | "BIGWIN" | null { return o === 6 ? "JACKPOT" : PAYS[o] >= 12 ? "BIGWIN" : null; }

// INTERACT casino's detail: what a run of pulls came to, which report of this player's it is, and how many pulls
export function resultDetail(delta: number, boot: string, seq: number, device: string, spins: number): string {
  return `${Math.round(delta)} ${boot}.${seq} ${device} ${spins}`;
}

// ---- C-158 (the user, 2026-10-18): THE CASINO in context, and the cat and the string ---------------------------------
// "odds via context, so like random is a base mode but there should be other factors -- like st Patrick's holiday gives
// luck, also we should use psychology ... if u dangle a string by a cat he will play with it but if the string is out of
// reach, or always within reach the cat loses interest -- it is best engaged when it is surprised, it almost gets the
// string but what it predicted was a bit off, basically using under the hood the same learning mechanism as model
// training". The user decided: between 90 and 100 back of every 100 bet -- an ordinary day keeps a small house edge, a
// lucky one reaches even; the cat and the string shape WHEN wins come within that.
//
// LUCK, from the context (casino.ts's casinoContext: the holiday, the weather, the watch, the season), -1..+1, sets the
// day's return: 90 at -1, 95 at 0, 100 at +1. REACH, the cat and the string, is the player's own, -1..+1: each pull it
// learns as a model's weight does -- a step against its error, the error being whether a real win (2x or more) came
// against how often one should (TARGET) -- so a dry spell brings the string nearer, a win takes it away, and a little
// noise keeps it from being foreseen. It moves one pull's return by up to REACH_SPAN either way, and its mean is
// nought, so over many pulls the day's return is what comes back. A loss often falls NEAR: the piece that would have won
// stopped one place off the line -- oftener the nearer the string.
export const RETURN_AT = (luck: number) => Math.min(1, Math.max(0.9, 0.95 + 0.05 * Math.max(-1, Math.min(1, luck))));
export const REACH_SPAN = 0.04;                              // a pull's return, moved this much at the string's nearest
export const TARGET = WEIGHTS.slice(2).reduce((a, b) => a + b, 0) / 1000;   // real wins (2x and up), as the table has them: 0.126
export const LEARN = 0.25, NOISE = 0.08;                     // the step, and the surprise

// the table for a return: every win's weight scaled alike, the loss taking up the rest -- in TEN thousand, so the
// jackpot's small weight is scaled finely enough to keep the return (in a thousand it is 4, and rounds by a tenth)
export const FINE = 10000;
export function weightsFor(ret: number): number[] {
  const k = ret / RETURN;
  const wins = WEIGHTS.slice(1).map((w) => Math.round(w * 10 * k));
  return [FINE - wins.reduce((a, b) => a + b, 0), ...wins];
}
export function drawFrom(weights: number[], rand: () => number = Math.random): number {
  let r = Math.floor(rand() * weights.reduce((a, b) => a + b, 0));
  for (let o = 0; o < weights.length; o++) { if (r < weights[o]) return o; r -= weights[o]; }
  return 0;
}

export interface Cat { reach: number; dry: number; streak: number; pulls: number }
export const CAT: Cat = { reach: 0, dry: 0, streak: 0, pulls: 0 };
// one pull's return: the day's, moved by the string
export function pullReturn(luck: number, cat: Cat): number {
  return Math.min(1.04, Math.max(0.86, RETURN_AT(luck) + REACH_SPAN * cat.reach));
}
// after a pull: the string learns (a step against the error), and a little noise
export function learn(cat: Cat, outcome: number, rand: () => number = Math.random): Cat {
  const won = PAYS[outcome] >= 2 ? 1 : 0;
  const reach = Math.max(-1, Math.min(1, cat.reach - LEARN * (won - TARGET) + NOISE * (rand() * 2 - 1)));
  return { reach, dry: won ? 0 : cat.dry + 1, streak: won ? cat.streak + 1 : 0, pulls: cat.pulls + 1 };
}
// a loss falls near (the winning piece one place off the line) this often -- oftener the nearer the string
export const nearChance = (cat: Cat) => Math.min(0.6, 0.25 + 0.35 * Math.max(0, cat.reach));

// near: three pieces for a loss that ALMOST won -- two alike and the third not -- chosen from what the third reel
// really has: its piece is one that sits beside the piece it wanted, so the wanted one shows one place off the line
// (stopNear). Null where no such pair comes round on that reel (seen on the watch, 2026-10-18: a "SO CLOSE" whose
// wanted piece was nowhere near the line).
const besideOn = (reel: Piece[], wanted: Piece) =>
  reel.flatMap((p, i) => p === wanted ? [reel[(i + STRIP - 1) % STRIP], reel[(i + 1) % STRIP]] : []);
export function nearPieces(reel3?: Piece[], rand: () => number = Math.random): { pieces: [Piece, Piece, Piece]; wanted: Piece } | null {
  if (!reel3) {                                   // an older caller, without the reel: as before -- not always truly near
    const pick = ([1, 2, 3, 4] as Piece[])[Math.floor(rand() * 4)];
    let c = Math.floor(rand() * 6) as Piece;
    while (c === pick || outcomeOf(pick, pick, c) !== 0) c = Math.floor(rand() * 6) as Piece;
    return { pieces: [pick, pick, c], wanted: pick };
  }
  const order = ([1, 2, 3, 4] as Piece[]).sort(() => rand() - 0.5);   // a friend or the coin: two JACKs would pay
  for (const pick of order) {
    const c = besideOn(reel3, pick).filter((x) => x !== pick && outcomeOf(pick, pick, x) === 0);
    if (c.length) return { pieces: [pick, pick, c[Math.floor(rand() * c.length)]], wanted: pick };
  }
  return null;
}
// two JACKs (a 2x): the third reel's piece one that sits beside a JACK, so a JACK shows one place off the line --
// almost the jackpot. Null where no such piece comes round.
export function almostThird(reel3: Piece[], rand: () => number = Math.random): Piece | null {
  const c = besideOn(reel3, JACK).filter((x) => x !== JACK);
  return c.length ? c[Math.floor(rand() * c.length)] : null;
}
// where a reel stops for its piece with another piece beside it, one place off the line -- or, if no such place comes
// round in one turn, where it would stop anyway
export function stopNear(reel: Piece[], pos: number, piece: Piece, beside: Piece, ahead = 0.7): number {
  const at0 = Math.ceil(pos + ahead), at = (i: number) => reel[((i % STRIP) + STRIP) % STRIP];
  for (let i = at0; i < at0 + STRIP; i++) if (at(i) === piece && (at(i + 1) === beside || at(i - 1) === beside)) return i;
  return stopAt(reel, pos, piece, ahead);
}

// why a pull's odds are what they are, in words: the string's part (casino.ts adds the context's)
export function catReason(cat: Cat): { source: string; effect: number; why: string } {
  const effect = Math.round(REACH_SPAN * cat.reach * 1000) / 10;   // in points of return
  const why = cat.streak >= 2 ? `${cat.streak} wins running: the string moves away`
            : cat.dry >= 8 ? `${cat.dry} pulls without a win: the string comes nearer`
            : cat.reach > 0.2 ? "the string is near" : cat.reach < -0.2 ? "the string is out of reach" : "the string where it should be";   // DRAFT
  return { source: "the string", effect, why };
}
