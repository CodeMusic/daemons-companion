// C-260: the game beside the companion (an iPad on its side, the Mac) -- where the divider was left, and whether the game
// is muted while it is put away. Kept on this device, beside the game's other files; read once, then from here.
import { Directory, File, Paths } from "expo-file-system";

type Kept = { mute: boolean; split: number | null };
let kept: Kept | null = null;
const file = () => new File(new Directory(Paths.document, "game"), "away.json");

function read(): Kept {
  if (kept) return kept;
  kept = { mute: true, split: null };                       // muted while put away, unless chosen otherwise (DRAFT)
  try {
    const f = file();
    if (f.exists) {
      const j = JSON.parse(f.textSync());
      kept = { mute: j.mute !== false, split: typeof j.split === "number" ? j.split : null };
    }
  } catch { /* the defaults */ }
  return kept;
}
function write(k: Kept) {
  kept = k;
  try {
    const d = new Directory(Paths.document, "game");
    if (!d.exists) d.create();
    const f = file();
    if (!f.exists) f.create();
    f.write(JSON.stringify(k));
  } catch { /* kept for this run only */ }
}

export const muteAway = () => read().mute;
export const setMuteAway = (mute: boolean) => write({ ...read(), mute });
export const splitKept = () => read().split;
export const keepSplit = (split: number) => write({ ...read(), split });
