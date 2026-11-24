// C-290: this file runs on the phone too (C-111) -- the app imports it, directly or through another file -- so keep it free of Node-only APIs (node:*, fs).
// T-609, C-486 (the user, 2026-11-23, by multiple choice, every recommendation; DAEMONS vision 0.7 "Balance"): THE LEAN, the player's balance --
// how far the MARKS have run ahead of the understandings (not THE WEEK'S BALANCE, lifemanagement/balance.ts). MIND: words
// about the player, read from the save's profile.
//
// THE LEAN is the paired MARKS held minus the understandings held. SCORN's TRUE MARK counts on neither side: beating
// him is already both. 0 is in balance; more MARKS lean toward REASON (left, red), more understandings toward INSTINCT
// (right, blue), and the difference says how far. Which pairs are held does not move it.
// NEVER A NUMBER (0.7's rule 2): no screen shows the lean, a meter or a count -- it is only heard and seen, a battle's
// end song tilting its way (C-487), a dream's integrated part named by it (C-486). Whether it is ever shown is T-616.
// THE INTEGRATED VIEW: HARMONIA in balance; out of balance the title's choice names it -- TECHNE for REASON, SOPHROSYNE
// for INSTINCT (the user's names, from Plato's words beside PRAXIS, ARETE and EUDAIMONIA).
// THE EDITION mirrors the sides, never the meaning: in CONTEXT, REASON is drawn and panned on the right, as the southern
// year is the northern turned over.
// EACH TYPE'S SIDE (C-486, approved as drafted): nine a side, LOGIC and CONTEXT opposite as the chart's thesis has them;
// past what a daemon's song knows, its dream's integrated part skews to its type's side.
//
// Every word here DRAFT.
import marksJson from "../../data/marks.json" with { type: "json" };

export type Side = "REASON" | "INSTINCT";
export type View = "HARMONIA" | "TECHNE" | "SOPHROSYNE";
export type Edition = "CONTENT" | "CONTEXT";

/** C-486: each type's side, read from its one-clause test (DAEMONS docs/balance-draft.md 6). */
export const TYPE_SIDE: Readonly<Record<string, Side>> = {
  CONTENT: "REASON", LOGIC: "REASON", VECTOR: "REASON", STRATUM: "REASON", LEGACY: "REASON",
  FROZEN: "REASON", HARDENED: "REASON", CORRUPT: "REASON", GROWTH: "REASON",
  CONTEXT: "INSTINCT", SIGNAL: "INSTINCT", LATENT: "INSTINCT", SWARM: "INSTINCT", ENTROPY: "INSTINCT",
  FLOW: "INSTINCT", EMERGENT: "INSTINCT", OPAQUE: "INSTINCT", ORACLE: "INSTINCT",
};

// the MARKS that pair with an understanding (marks.json's wisdom.root_flag): the seven; the TRUE MARK has none
const PAIRED = (marksJson as unknown as { marks: { wisdom?: { root_flag?: number } | null }[] }).marks
  .map((m) => !!m.wisdom?.root_flag);

export type Balance = {
  lean: number;            // paired MARKS held minus understandings held, -7..+7 -- for how far a song tilts, never shown
  side: Side | null;       // the way it leans; null in balance
  inBalance: boolean;
  view: View;              // the integrated perspective's name
};

/** The player's balance from the profile's MARKS (eight, in order), understandings (seven) and title choice. */
export function balanceOf(p: { marks: boolean[]; roots: boolean[]; choice: Side }): Balance {
  const marks = p.marks.filter((held, i) => held && PAIRED[i]).length;
  const lean = marks - p.roots.filter(Boolean).length;
  return {
    lean,
    side: lean > 0 ? "REASON" : lean < 0 ? "INSTINCT" : null,
    inBalance: lean === 0,
    view: lean === 0 ? "HARMONIA" : p.choice === "REASON" ? "TECHNE" : "SOPHROSYNE",
  };
}

/** Where a side is drawn and panned: REASON on the left in CONTENT, on the right in CONTEXT; INSTINCT opposite. */
export const sideOn = (side: Side, edition: Edition): "left" | "right" =>
  (side === "REASON") === (edition !== "CONTEXT") ? "left" : "right";

/** A daemon's side, by its first type (null for a type with none, or none at all). */
export const typeSide = (types: readonly string[]): Side | null => TYPE_SIDE[types[0] ?? ""] ?? null;
