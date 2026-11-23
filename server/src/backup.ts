// C-434: the hub's BACKUP to THE VAULT (vault.ts), and the restore from it. Node only (api.ts runs the backup;
// restore_main.ts the restore) -- never reached by core.ts or routes.ts, so never by the phone.
//
// Every HOME and SHARED space gets a key of its own (THIS PHONE never leaves its phone; PUBLIC is THE COMMONS's). The
// keys live in backup.json beside the database (mode 600), never in it, so a copy of the database carries none. They
// travel only wrapped, under the key the household's RECOVERY CODE makes (sealing.ts), kept at the vault as a keyring
// (the next generation each time a space is added). The code is shown once, when the backup is turned on, and kept
// nowhere: with it alone a new hub gets everything back (restore()). Once a minute the hub and the vault exchange what
// the other lacks, sealed (@daemons/praxis syncSealed).
//
// What it keeps is what is on PRAXIS: GOALS and their ARETE today; the journals, tending and the rest as they move onto it
// (C-432, C-433).
import { chmodSync, existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  fromBase64, keyringName, local, newKey, Praxis, syncSealed, toBase64, unwrapKeys, wrapKeys,
  type BlobPeer, type BlobStore, type Db, type Peer, type Reach,
} from "@daemons/praxis";
import { blobsBeside } from "./shared/blobstore.js";
import { hubPeer } from "./shared/praxissync.js";
import { chacha, recoveryCode, wrappingKey } from "./sealing.js";
import type { Store } from "./shared/store.js";

/** where this hub's vault is, and its household's token there (config.json's `vault`) */
export interface VaultConfig { url: string; token: string }
/** backup.json: what the hub keeps to back up -- the vault it backs up to, the wrapping key its code made, each space's key */
interface Kept { vault: string; token?: string; wrapping: string; keys: Record<string, string>; generation: number; since: string }
export interface BackupStatus {
  on: boolean; vault: string | null; since?: string; spaces?: number;
  last?: string; sent?: number; taken?: number; unread?: number; blobs?: number; error?: string;
}

/** the reaches a backup keeps */
export const BACKED: readonly Reach[] = ["home", "shared"];
/** the vault set on the site (SETTINGS, BACKUP), when config.json names none: its address and the household's token,
 *  in the hub's settings beside the relay's */
export function vaultOf(store: Store): VaultConfig | null {
  const url = store.getSetting("vault.url"), token = store.getSetting("vault.token");
  return url && token ? { url, token } : null;
}
export function setVault(store: Store, url: string, token: string) {
  if (!/^https?:\/\/[^\s/]+(:\d+)?\/?$/.test(url)) throw new Error("the vault's address, e.g. http://roverbyteseer:4760");   // DRAFT
  if (!/^[A-Za-z0-9_-]{20,200}$/.test(token)) throw new Error("the household's token, as the vault printed it");   // DRAFT
  store.setSetting("vault.url", url.replace(/\/+$/, ""));
  store.setSetting("vault.token", token);
}

/** backup.json beside a database, or nowhere for one in memory */
export const backupFile = (database: string) => (database === ":memory:" ? null : join(dirname(database), "backup.json"));

const keysOf = (k: Record<string, string>) => new Map(Object.entries(k).map(([s, b]) => [s, fromBase64(b)!] as const));
function write(file: string, kept: Kept) {
  const passing = `${file}.${process.pid}.part`;
  writeFileSync(passing, JSON.stringify(kept, null, 2) + "\n", { mode: 0o600 });
  renameSync(passing, file);
  chmodSync(file, 0o600);
}

export class Backup {
  private kept: Kept | null;
  private busy = false;
  private last: Omit<BackupStatus, "on" | "vault" | "since" | "spaces"> = {};

  /** `vault`: where this hub's vault is -- config.json's, or the one set on the site (vaultOf) -- read at each use */
  constructor(private readonly store: Store, private readonly blobs: BlobStore, private readonly file: string | null,
              private readonly vaultIs: VaultConfig | null | (() => VaultConfig | null), private readonly f: typeof fetch = fetch) {
    this.kept = file && existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
  }

  get on() { return !!this.kept; }
  private get vault(): VaultConfig | null { return typeof this.vaultIs === "function" ? this.vaultIs() : this.vaultIs; }

  status(): BackupStatus {
    const k = this.kept;
    return { on: !!k, vault: k?.vault ?? this.vault?.url ?? null, ...(k ? { since: k.since, spaces: Object.keys(k.keys).length } : {}), ...this.last };
  }

  /** the vault this backup began with (and the token it was given then), or the one set now */
  private peer(): Peer & BlobPeer {
    const url = this.kept?.vault ?? this.vault?.url, token = this.kept?.token ?? this.vault?.token;
    if (!url || !token) throw new Error("no vault is set for this hub");   // DRAFT
    return hubPeer(url, token, this.f);
  }

  /** turn the backup on: a recovery code, the keyring kept at the vault, the first exchange. The code is returned once
   *  and kept nowhere; nothing is kept here unless the vault took the keyring. */
  async turnOn(): Promise<string> {
    if (this.kept) throw new Error("the backup is on already");   // DRAFT
    if (!this.vault || !this.file) throw new Error("no vault is set for this hub");   // DRAFT
    const code = recoveryCode();
    const kept: Kept = { vault: this.vault.url, token: this.vault.token, wrapping: toBase64(wrappingKey(code)), keys: {}, generation: -1, since: new Date(this.store.now()).toISOString() };
    await this.keyring(kept);                         // throws, keeping nothing, if the vault will not take it
    this.kept = kept;
    write(this.file, kept);
    await this.run();
    return code;
  }

  /** a key for every space the backup keeps that has none, and the keyring kept again when there were any -- the keys
   *  are used only once the vault holds a keyring with them in it */
  private async keyring(kept: Kept) {
    const px = this.store.life.px;
    const fresh = px.spaces().filter((s) => BACKED.includes(s.reach) && !kept.keys[s.id]);
    if (!fresh.length && kept.generation >= 0) return;
    const keys = { ...kept.keys, ...Object.fromEntries(fresh.map((s) => [s.id, toBase64(newKey())])) };
    const wrapping = fromBase64(kept.wrapping)!, generation = kept.generation + 1;
    if (!(await this.peer().putBlob(keyringName(wrapping, generation), wrapKeys(keysOf(keys), wrapping, chacha))))
      throw new Error("the vault did not keep the keyring");   // DRAFT
    kept.keys = keys;
    kept.generation = generation;
  }

  /** one exchange with the vault: what it lacks sent sealed, what it holds that this hub lacks taken back */
  async run(): Promise<BackupStatus> {
    if (!this.kept || this.busy) return this.status();
    this.busy = true;
    try {
      const kept = this.kept, before = kept.generation;
      await this.keyring(kept);
      if (kept.generation !== before && this.file) write(this.file, kept);
      const px = this.store.life.px;
      const r = await syncSealed(local(px, this.blobs), this.peer(),
        { keys: keysOf(kept.keys), cipher: chacha, named: (s) => px.blobs([s]) }, { reaches: BACKED });
      this.last = { last: new Date(this.store.now()).toISOString(), sent: r.toB, taken: r.toA, unread: r.unread,
                    blobs: r.blobsToB + r.blobsToA };
    } catch (e) {
      this.last = { ...this.last, error: String((e as Error)?.message ?? e) };
    } finally {
      this.busy = false;
    }
    return this.status();
  }
}

/** C-434: a new hub's database filled from the vault with nothing but the household's recovery code -- every space the
 *  keyring has a key for, its events and its blobs. This hub then keeps each space's numbers (the hub it restores is
 *  gone, or will number nothing more), and backup.json is written beside the database so the backup carries on. Into a
 *  database that holds no PRAXIS events only. */
export async function restore(o: { database: string; vault: VaultConfig; code: string; f?: typeof fetch; blobs?: BlobStore }):
  Promise<{ spaces: number; events: number; blobs: number; generation: number }> {
  const wrapping = wrappingKey(o.code);
  const vault = hubPeer(o.vault.url, o.vault.token, o.f ?? fetch);
  let ring: Uint8Array | null = null, generation = -1;
  for (let g = 0; ; g++) {
    const b = await vault.blob(keyringName(wrapping, g));
    if (!b) break;
    ring = b; generation = g;
  }
  if (!ring) throw new Error("the vault holds no keyring for that code");   // DRAFT
  const keys = unwrapKeys(ring, wrapping, chacha);
  if (!keys) throw new Error("that code does not open the keyring");   // DRAFT

  const db = new DatabaseSync(o.database);
  try {
    const px = new Praxis(db as unknown as Db);
    if (Object.keys(px.have()).length) throw new Error("restore into a new database only -- this one holds PRAXIS's events");   // DRAFT
    const blobs = o.blobs ?? blobsBeside(o.database);
    const r = await syncSealed(local(px, blobs), vault, { keys, cipher: chacha, named: (s) => px.blobs([s]) });
    for (const s of px.spaces()) if (keys.has(s.id) && s.keeper && s.keeper !== px.replica) px.setSpace(s.id, "keeper", px.replica);
    const file = backupFile(o.database);
    if (file) write(file, { vault: o.vault.url, token: o.vault.token, wrapping: toBase64(wrapping), generation, since: new Date().toISOString(),
                           keys: Object.fromEntries([...keys].map(([s, k]) => [s, toBase64(k)])) });
    return { spaces: keys.size, events: r.toA, blobs: r.blobsToA, generation };
  } finally {
    db.close();
  }
}
