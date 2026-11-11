// C-334: a sleep piece kept on the phone -- fetched from the hub once, by its id, and played from the phone's own
// documents every night after, so the night needs no network and the screen can sleep. On the site, the hub's link.
// The oldest go once more than KEEP are kept (the hub keeps four a daemon too).
import { Directory, File, Paths } from "expo-file-system";
import { ON_PHONE, SERVER } from "./net";

const KEEP = 8;
const dir = () => { const d = new Directory(Paths.document, "sleep"); if (!d.exists) d.create({ intermediates: true, idempotent: true }); return d; };

export async function sleepFile(id: string, path: string): Promise<string> {
  const url = `${SERVER.replace(/\/+$/, "")}${path}`;
  if (!ON_PHONE) return url;
  const f = new File(dir(), `${id}.m4a`);
  if (f.exists && (f.size ?? 0) > 0) return f.uri;
  if (f.exists) f.delete();
  const got = await File.downloadFileAsync(url, f);
  if (!got.exists || !(got.size ?? 0)) throw new Error("The sleep sounds did not come from the hub.");   // DRAFT
  try {
    const all = dir().list().filter((x): x is File => x instanceof File).sort((a, b) => (b.modificationTime ?? 0) - (a.modificationTime ?? 0));
    all.slice(KEEP).forEach((x) => x.delete());
  } catch { /* tidied next time */ }
  return got.uri;
}
