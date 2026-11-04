// A bench check: PLAY, THE SUBTLE LAYER, THE HERMETIC LAYER and the witching hour shown as if the game had given them,
// read only -- the companion is asked with ?preview=1 and the save is never touched. C-275: no longer a switch of its
// own in SETTINGS: DEVELOPER MODE's </> tab sets each book and the hour (game/dev.ts, in memory only); on the site the
// page's own ?preview= (1, harp, flute) still works too.
import { Platform } from "react-native";
import { bookForced, hourForced } from "./dev";

const URL_PREVIEW = Platform.OS === "web" ? /[?&]preview=(1|harp|flute)\b/.exec(globalThis.location?.search ?? "")?.[1] ?? null : null;

// shown as a preview, so read only: the site's ?preview=, or </> holding a book or the hour that the save does not
export const previewing = () => URL_PREVIEW !== null || hourForced() === true || bookForced("subtle") === true || bookForced("hermetic") === true;
// the site's own query to ask with (</>'s books are asked for in net.ts, devRoute)
export const previewQuery = () => (URL_PREVIEW ? `?preview=${URL_PREVIEW}` : "");
