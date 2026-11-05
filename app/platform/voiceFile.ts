// 2026-11-05: a voice the hub sent, kept in the cache under the name its bytes say -- iOS decodes a file by its name, and a
// WAV (the Tiiny's voice) filed as .mp3 played as static. The hub sends MP3 to the phone now; this keeps a WAV playable too.
import { File, Paths } from "expo-file-system";

export const voiceExt = (b64: string) => (b64.startsWith("UklGR") ? "wav" : "mp3");   // "UklGR": RIFF, base64

export function voiceFile(prefix: string, b64: string): File {
  const f = new File(Paths.cache, `${prefix}-${Date.now()}.${voiceExt(b64)}`);
  f.create(); f.write(b64, { encoding: "base64" });
  return f;
}
