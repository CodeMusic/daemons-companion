// C-80: a device's own name -- its kind and the end of its MAC (docs/DEVICES.md). Apart from devices.ts, which needs
// Node's crypto for the boards' keys, so a phone hosting on its own (C-111) can check one too.
const ID = /^[a-z0-9][a-z0-9-]{2,47}$/;

export function validDeviceId(id: unknown): id is string { return typeof id === "string" && ID.test(id); }

// "t-embed-cc1101-36f484" -> "t-embed-cc1101": the kind is the id without its MAC tail.
export function kindOf(id: string): string { return id.replace(/-[0-9a-f]{6}$/, ""); }
