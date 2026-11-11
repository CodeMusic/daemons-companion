// 2026-11-07 (the user: "I'd love to see some indicator in the app so u can tell if the dream voice had been rendered yet
// or not ... all of these renderings should be async so if the user is not able to wait, when they come back it play
// right away"): a voice for a whole piece -- a dream, a journal's chapter -- made on the hub in the background and kept
// on the phone (voiceFile.ts). Asked for once; what is being made is written down, so a phone that was closed or away
// asks after it again when it comes back, and asks for it anew if the hub no longer has it. Every screen showing that
// piece hears when its voice is ready. No React here but the hook.
import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { File, Paths } from "expo-file-system";
import { ALONE, api, ON_PHONE, Unreachable } from "./net";
import { keepVoice, keptVoice } from "./voiceFile";

export type VoiceState = "none" | "making" | "ready" | "failed";
type Making = { id: string | null; body: Record<string, unknown>; at: number; asked: number };

const GIVE_UP_MS = 45 * 60 * 1000;           // past the hub's half hour, and a few tries more
const POLL_MS = 3000, ASK_AGAIN_MS = 15000;

// What one piece is known by: all of its words, and the voice it is read in (C-323: "daemon", "player", "book:<id>"...)
export const wholeKey = (text: string, voice?: string) => voice ? `whole:${voice}:${text}` : `whole:${text}`;

const ledger = () => new File(Paths.document, "voices-making.json");
const making: Record<string, Making> = (() => {
  if (!ON_PHONE) return {};
  try { const f = ledger(); return f.exists ? JSON.parse(f.textSync()) : {}; } catch { return {}; }
})();
const failed = new Set<string>();
const heard = new Set<() => void>();
const changed = () => heard.forEach((f) => f());
function write() {
  try { const f = ledger(); if (!f.exists) f.create(); f.write(JSON.stringify(making)); } catch { /* asked again next time */ }
}

// A voice kept for these words: under its own name, or a short piece's older one (read aloud before 2026-11-07)
// (a piece in a voice of its own has no older name: it was read in the reader's voice before)
export function wholeVoice(text: string, voice?: string): File | null {
  return keptVoice(wholeKey(text, voice)) ?? (!voice && text.length <= 600 ? keptVoice(`text:${text}`) : null);
}

export function voiceState(text: string, voice?: string): VoiceState {
  if (!ON_PHONE) return "none";                       // the site keeps no voices
  if (wholeVoice(text, voice)) return "ready";
  if (making[wholeKey(text, voice)]) return "making";
  return failed.has(wholeKey(text, voice)) ? "failed" : "none";
}

// Begin making it, if it is not kept or being made already
export function makeVoice(text: string, voice?: string) {
  const k = wholeKey(text, voice);
  if (wholeVoice(text, voice) || making[k]) return;
  failed.delete(k);
  making[k] = { id: null, body: { text, whole: true, ...(voice ? { voice } : {}) }, at: Date.now(), asked: 0 };
  write(); changed();
  ask(k).finally(soon);
}

function finish(k: string, b64: string | undefined) {
  delete making[k];
  if (b64) keepVoice(k, b64); else failed.add(k);
  write(); changed();
}

type Answer = { id?: string; status?: string; audioBase64?: string; error?: string | null };
async function ask(k: string) {
  const m = making[k];
  if (!m) return;
  m.asked = Date.now();
  try {
    const r = await api<Answer>(ALONE ? "/api/ai/speak" : "/api/ai/speak?async=1", m.body);
    if (r.audioBase64) return finish(k, r.audioBase64);
    if (r.error || !r.id) return finish(k, undefined);
    m.id = r.id; write();
  } catch (e) {
    if (!(e instanceof Unreachable)) finish(k, undefined);   // away: kept, and asked again
  }
}

async function look(k: string) {
  const m = making[k];
  if (!m) return;
  if (Date.now() - m.at > GIVE_UP_MS) return finish(k, undefined);
  if (!m.id) { if (Date.now() - m.asked > ASK_AGAIN_MS) await ask(k); return; }
  try {
    const r = await api<Answer>(`/api/device/talk/${m.id}`);
    if (r.status === "done") return finish(k, r.error ? undefined : r.audioBase64);
    if (r.status === "failed") return finish(k, undefined);
  } catch (e) {
    if (e instanceof Unreachable) return;                     // away: looked at again
    if (/gone/.test((e as Error).message)) { m.id = null; m.asked = 0; write(); }   // the hub forgot it: asked anew
  }
}

let timer: ReturnType<typeof setTimeout> | null = null;
function soon() {
  if (timer || !Object.keys(making).length) return;
  timer = setTimeout(async () => {
    timer = null;
    for (const k of Object.keys(making)) await look(k);
    soon();
  }, POLL_MS);
}
AppState.addEventListener("change", (s) => { if (s === "active") soon(); });
soon();

// The state of a piece's voice, kept current while the screen shows it
export function useVoiceState(text: string | null, voice?: string): VoiceState {
  const [, again] = useState(0);
  useEffect(() => { const f = () => again((n) => n + 1); heard.add(f); return () => { heard.delete(f); }; }, []);
  return text ? voiceState(text, voice) : "none";
}
