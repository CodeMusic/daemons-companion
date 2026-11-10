// C-316 (the user, 2026-11-10: "from the meetings tab you should be able to trigger one from the phone, or even import
// from voice memo, it then does the same pipeline as the watch"): a meeting recorded on this phone, or a voice memo given
// to it, sent whole to the hub (POST /api/meeting/import), which cuts it into the watch's parts and hears and writes it up.
// A recording is big, so it goes straight to the hub's address -- never through the relay -- and one that cannot be sent
// now is kept on the phone, waiting, and sent from the MEETINGS page later. On the site, the browser posts it itself.
import { Directory, File, Paths } from "expo-file-system";
import { FileSystemUploadType, uploadAsync } from "expo-file-system/legacy";
import { RecordingPresets, type RecordingOptions } from "expo-audio";
import { asThisDevice, ON_PHONE, SERVER, TOKEN } from "./net";

// speech, not music: mono, 16 kHz, 32 kbps AAC -- about 14 MB an hour (HIGH_QUALITY would be 60), and the hub hears 16 kHz
export const MEETING_RECORDING: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY, sampleRate: 16000, numberOfChannels: 1, bitRate: 32000,
  android: { extension: ".m4a", outputFormat: "mpeg4", audioEncoder: "aac" },
  web: { mimeType: "audio/webm", bitsPerSecond: 32000 },
};

export type Sending = { uri: string; from: "phone" | "memo"; at: number; ended?: number; name?: string };   // at 0: not known (a memo, by its end)
export type Waiting = Sending & { id: string; why: string };

const path = (s: Sending) => `/api/meeting/import?from=${s.from}${s.at ? `&at=${s.at}` : ""}${s.ended ? `&ended=${s.ended}` : ""}${s.name ? `&name=${encodeURIComponent(s.name)}` : ""}`;

// sent, and the hub's meeting id; throws with why it could not be
export async function sendMeeting(s: Sending): Promise<number> {
  const url = SERVER + await asThisDevice(path(s)), auth: Record<string, string> = TOKEN ? { authorization: `Bearer ${TOKEN}` } : {};
  if (!ON_PHONE) {
    const blob = await (await fetch(s.uri)).blob();
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/octet-stream", ...auth }, body: blob });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error ?? `the companion answered ${r.status}`);
    return j.id;
  }
  // a background session: it carries on if the phone is locked or the app put away while it sends
  const r = await uploadAsync(url, s.uri, { httpMethod: "POST", uploadType: FileSystemUploadType.BINARY_CONTENT,
                                            headers: { "content-type": "application/octet-stream", ...auth } });
  let j: { id?: number; error?: string } = {};
  try { j = JSON.parse(r.body); } catch { /* said below */ }
  if (r.status !== 200 || typeof j.id !== "number") throw new Error(j.error ?? `the companion answered ${r.status}`);
  return j.id;
}

// ---- waiting on the phone: the recording moved into the app's own documents, and a list of them beside it ----------
const dir = () => new Directory(Paths.document, "meetings-waiting");
const listFile = () => new File(Paths.document, "meetings-waiting.json");
export function waiting(): Waiting[] {
  if (!ON_PHONE) return [];
  try { const f = listFile(); return f.exists ? JSON.parse(f.textSync()) : []; } catch { return []; }
}
const keepList = (l: Waiting[]) => { const f = listFile(); if (!f.exists) f.create(); f.write(JSON.stringify(l)); };

// sent now if it can be; else kept, and why said. The id of the hub's meeting, or null when kept.
export async function sendOrKeep(s: Sending): Promise<{ id: number | null; why?: string }> {
  try { return { id: await sendMeeting(s) }; }
  catch (e) {
    const why = (e as Error).message;
    if (!ON_PHONE) throw e;
    const d = dir(); if (!d.exists) d.create();
    const id = String(Date.now()), from = new File(s.uri), kept = new File(d, `${id}${from.extension || ".m4a"}`);
    from.copy(kept);
    keepList([...waiting(), { ...s, uri: kept.uri, id, why }]);
    return { id: null, why };
  }
}
// each waiting one tried again; those sent are forgotten here (the hub has them)
export async function sendWaiting(): Promise<{ sent: number; left: number; why?: string }> {
  let sent = 0, why: string | undefined;
  const left: Waiting[] = [];
  for (const w of waiting()) {
    try { await sendMeeting(w); sent++; try { new File(w.uri).delete(); } catch { /* gone already */ } }
    catch (e) { why = (e as Error).message; left.push({ ...w, why }); }
  }
  keepList(left);
  return { sent, left: left.length, why };
}
export function forgetWaiting(id: string) {
  const l = waiting(), w = l.find((x) => x.id === id);
  if (w) try { new File(w.uri).delete(); } catch { /* gone already */ }
  keepList(l.filter((x) => x.id !== id));
}
