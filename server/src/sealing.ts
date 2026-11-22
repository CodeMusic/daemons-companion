// C-434: SEALED SPACES on a computer (Node only: THE VAULT, the hub's backup and its restore -- never reached by core.ts or
// routes.ts, so never by the phone). The engine (@daemons/praxis, seal.ts) seals; this file brings what it leaves to the
// app: the cipher, and the recovery code a household's keys are wrapped under.
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import type { Cipher } from "@daemons/praxis";

/** ChaCha20-Poly1305 from Node's crypto (OpenSSL): a 12-byte nonce, a 16-byte tag after the ciphertext. The phone, when it
 *  seals, brings a pure-JS one of the same construction, so either opens what the other sealed. */
export const chacha: Cipher = {
  nonceBytes: 12,
  seal(key, nonce, plain, ad) {
    const c = createCipheriv("chacha20-poly1305", key, nonce, { authTagLength: 16 });
    c.setAAD(ad, { plaintextLength: plain.length });
    return new Uint8Array(Buffer.concat([c.update(plain), c.final(), c.getAuthTag()]));
  },
  open(key, nonce, sealed, ad) {
    if (sealed.length < 16) return null;
    try {
      const d = createDecipheriv("chacha20-poly1305", key, nonce, { authTagLength: 16 });
      d.setAAD(ad, { plaintextLength: sealed.length - 16 });
      d.setAuthTag(sealed.subarray(sealed.length - 16));
      return new Uint8Array(Buffer.concat([d.update(sealed.subarray(0, sealed.length - 16)), d.final()]));
    } catch { return null; }
  },
};

// ---- the recovery code (the user, 2026-11-22: "a code, shown once") ---------------------------------------------------

/** Crockford's base32: no I, L, O or U, so a code read aloud or copied by hand cannot be misread */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
/** a code's letters: 28, so 140 bits -- far past guessing, with or without the slow derivation below */
export const CODE_LETTERS = 28;

/** a new recovery code, in seven groups of four: 7KQ2-M9XA-... */
export function recoveryCode(random: (n: number) => Uint8Array = (n) => new Uint8Array(randomBytes(n))): string {
  const letters = [...random(CODE_LETTERS)].map((b) => ALPHABET[b & 31]);   // 32 divides 256: every letter as likely
  return letters.join("").match(/.{4}/g)!.join("-");
}

/** a code as typed, read the way Crockford's base32 reads it (lower case, spaces and dashes, O for 0, I and L for 1), or
 *  null when it is not a whole code */
export function readCode(typed: string): string | null {
  const s = typed.toUpperCase().replace(/[\s-]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
  return s.length === CODE_LETTERS && [...s].every((c) => ALPHABET.includes(c)) ? s.match(/.{4}/g)!.join("-") : null;
}

/** the key a household's keyring is wrapped under, from its recovery code: scrypt, slow on purpose. The salt is fixed --
 *  the restoring hub has only the code -- which a 140-bit code can afford. */
export function wrappingKey(code: string): Uint8Array {
  const c = readCode(code);
  if (!c) throw new Error("that is not a recovery code");   // DRAFT
  return new Uint8Array(scryptSync(c, "daemons-praxis-recovery-1", 32, { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }));
}
