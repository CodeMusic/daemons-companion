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
