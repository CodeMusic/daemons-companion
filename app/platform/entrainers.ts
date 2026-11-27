// C-591: THE PULSETTO and THE NOVA, loaded only on a phone -- a top-level import would pull the Bluetooth library into the
// site's build (app/AGENTS.md, "Phone-only modules load lazily"). The site gets null and says they link in the phone app.
import { ON_PHONE } from "./net";

export const PULSETTO: typeof import("./pulsetto").pulsetto | null = ON_PHONE ? require("./pulsetto").pulsetto : null;
export const NOVA: typeof import("./nova").nova | null = ON_PHONE ? require("./nova").nova : null;
export type { Linked } from "./pulsetto";
