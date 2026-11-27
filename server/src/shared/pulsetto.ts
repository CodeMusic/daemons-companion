// C-290: this file runs on the phone too (C-111) -- the app imports it, directly or through another file -- so keep it free of Node-only APIs (node:*, fs).
// C-591 (the user, 2026-11-26: "it allows you to ... connect ... The Pulsetto which stimulates the vagus nerve ... all
// needed code is in the other app, so lets please bring it over too"): THE PULSETTO's wire protocol, carried from the
// user's PulseEntrain (mobile/src/shared/pulsettoProtocol.js, docs/PULSETTO_PROTOCOL.md) -- what to write, never how.
// The phone's transport (app/platform/pulsetto.ts) writes these bytes over Bluetooth; nothing here touches a radio.
//
// The Pulsetto speaks the Nordic UART service: newline-ended ASCII commands in, notifications out. Its levels are 0..9
// (0 off, 1..9 stimulation), and it is never sent anything outside them, whatever a drift file or a setting says.
// Wellness, not medicine: the Pulsetto is the player's own device, used as its maker means it. DRAFT.

export const NAME_PREFIX = "Pulsetto";
export const SERVICE = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";   // Nordic UART
export const RX = "6e400002-b5a3-f393-e0a9-e50e24dcca9e";         // app -> device (write)
export const TX = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";         // device -> app (notify)

const FULL_V = 3.9, EMPTY_V = 3.5;

/** Any input -- a drift's intensity, a slider, NaN -- as a level the Pulsetto accepts: a whole 0..9, never below `min`. */
export const clampLevel = (n: unknown, min = 0): number => {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return min;
  return Math.min(9, Math.max(min, v));
};

/** Its battery's voltage as a percentage, linear from 3.5 V (empty) to 3.9 V (full). */
export const batteryPercent = (volts: number): number =>
  volts >= FULL_V ? 100 : volts <= EMPTY_V ? 0 : Math.round(((volts - EMPTY_V) / (FULL_V - EMPTY_V)) * 100);

/** The commands, each ended by a newline as the device expects. */
export const CMD = {
  rampUp: "+\n", rampDown: "-\n", off: "0\n", calibrate: "5\n",
  both: "D\n", left: "A\n", right: "C\n",              // which pads: both, left, right
  ledLow: "E\n", ledMid: "F\n", ledHigh: "G\n",        // its own light: low is the least in the way at night
  charging: "u\n", battery: "Q\n", firmware: "v\n", identity: "i\n",
} as const;
export const levelCmd = (n: unknown, min = 0) => `${clampLevel(n, min)}\n`;

/** `+` and `-` (the ramps) are written with a response; everything else without. */
export const withResponse = (cmd: string) => cmd.trim() === "+" || cmd.trim() === "-";

/** One step of a sequence: a command, or a pause in milliseconds. */
export type Step = { send: string } | { wait: number };

/** A session's start, as the maker's own app begins one: the ramps, the 0 -> 5 -> 0 calibration, then the level, the
 *  pads (both) and the LED (low). The same on the Lite and the Fit. */
export function startSequence(level: number): Step[] {
  return [
    { send: CMD.rampUp }, { send: CMD.rampDown }, { wait: 250 },
    { send: CMD.off }, { wait: 450 }, { send: CMD.calibrate }, { wait: 450 }, { send: CMD.off }, { wait: 450 },
    { send: levelCmd(level, 1) }, { wait: 250 },                        // never a session begun outside 1..9
    { send: CMD.both }, { send: CMD.ledLow },
  ];
}
/** A session's end: up, down, down. */
export const STOP_SEQUENCE: Step[] = [{ send: CMD.rampUp }, { send: CMD.rampDown }, { send: CMD.rampDown }];

/** A notification as what it tells: its battery (a percentage), whether it is charging, its firmware. */
export function parseNotification(bytes: Uint8Array): { battery?: number; charging?: boolean; firmware?: string } {
  const text = String.fromCharCode(...bytes).trim(), out: { battery?: number; charging?: boolean; firmware?: string } = {};
  if (text.startsWith("Batt:")) {
    const v = parseFloat(text.slice(5));
    if (Number.isFinite(v)) out.battery = batteryPercent(v);
  }
  if (bytes.length >= 3 && bytes[0] === 0x75 && bytes[1] === 0x01) {   // "u", 0x01, then "1" charging or "0" not
    if (bytes[2] === 0x31) out.charging = true;
    else if (bytes[2] === 0x30) out.charging = false;
  }
  if (text.startsWith("fw:")) out.firmware = text.slice(3).trim();
  return out;
}

/** Bytes to base64 and back, as the Bluetooth library carries values -- here so neither side needs a Buffer. */
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
export function toBase64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i], b = bytes[i + 1], c = bytes[i + 2], n = (a << 16) | ((b ?? 0) << 8) | (c ?? 0);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (b === undefined ? "=" : B64[(n >> 6) & 63]) + (c === undefined ? "=" : B64[n & 63]);
  }
  return out;
}
export function fromBase64(s: string): Uint8Array {
  const clean = s.replace(/[^A-Za-z0-9+/]/g, ""), out: number[] = [];
  for (let i = 0; i < clean.length; i += 4) {
    const n = [0, 1, 2, 3].map((k) => (i + k < clean.length ? B64.indexOf(clean[i + k]) : 0));
    const v = (n[0] << 18) | (n[1] << 12) | (n[2] << 6) | n[3];
    out.push((v >> 16) & 255);
    if (i + 2 < clean.length) out.push((v >> 8) & 255);
    if (i + 3 < clean.length) out.push(v & 255);
  }
  return Uint8Array.from(out);
}
export const textBytes = (s: string) => Uint8Array.from([...s].map((c) => c.charCodeAt(0) & 255));
