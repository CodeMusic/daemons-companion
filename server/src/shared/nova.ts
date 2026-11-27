// C-290: this file runs on the phone too (C-111) -- the app imports it, directly or through another file -- so keep it free of Node-only APIs (node:*, fs).
// C-591 (the user, 2026-11-26: "the Luma which uses a head band that flashes lights in rhythm with music at similar rates
// to influence cognition -- this particular version doesnt have color just flash modes and patterns ... all needed code
// is in the other app"): THE LUMENATE NOVA's wire protocol, carried from the user's PulseEntrain
// (mobile/src/shared/novaProtocol.js, docs/LUMENATE_NOVA_PROTOCOL.md) -- the frames, never the radio
// (app/platform/nova.ts writes them).
//
// The Nova has two eyes, each its own channel, and no colour: only how fast each flashes, how long each flash lasts
// (its duty, which is what reads as brightness) and a steady on-level under it (0 is a pure flash). A frame is ten
// little-endian uint32s, five an eye: [period us, on us, period' us, on' us, level x 1e6].
//
// SAFETY, the protocol's section 6: THE DEVICE ENFORCES NO LIMIT. It flashes at whatever it is sent, so the clamp is
// here and nowhere else may bypass it. Flashing light from about 3 to 60 Hz can bring on a seizure in someone
// photosensitive, 15-25 Hz most of all; the app asks before any light (app/damagotchi/Devices.tsx) and keeps a ceiling
// below this hard one. DRAFT.
import { toBase64 } from "./pulsetto.js";

export const NAME = /lumenate|nova/i;
export const STREAM = "abcdef01-2345-6789-abcd-ef0123456789";      // telemetry rate, 1 byte: 0x01 about 1 Hz, 0x00 stop
export const STROBE = "f2c51a4e-2a46-4bef-b18f-cb00c716cfa6";      // the frames
export const TELEMETRY = "12345678-9abc-4def-8012-3456789abcde";   // the accelerometer (the device wants a listener)

/** The hard bounds, whatever is asked: never faster than 40 Hz (the gamma studied), never slower than half a hertz. */
export const HARD_MAX_HZ = 40, MIN_HZ = 0.5;
export const clampHz = (hz: unknown, ceiling = HARD_MAX_HZ): number => {
  const v = Number(hz), top = Math.min(HARD_MAX_HZ, Math.max(MIN_HZ, Number(ceiling) || HARD_MAX_HZ));
  return Number.isFinite(v) ? Math.min(top, Math.max(MIN_HZ, v)) : MIN_HZ;
};

/** One eye: how fast it flashes, the part of each period it is lit (0..1), its steady level (0 a pure flash). */
export type Eye = { hz: number; duty: number; level?: number; phaseHz?: number };

const U32 = 0xffffffff;
const us = (s: number) => (!Number.isFinite(s) || s <= 0 ? 0 : Math.min(U32, Math.round(s * 1e6)));
const fixed = (l: number) => (!Number.isFinite(l) ? 0 : Math.min(U32, Math.max(0, Math.round(l * 1e6))));
const unit = (x: number) => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0);

/** An eye as its five ints. Its rate is clamped; `phaseHz` shifts the eye's second LED (period'), as the maker's app does. */
export function eyeInts(e: Eye, ceiling = HARD_MAX_HZ): number[] {
  const f = clampHz(e.hz, ceiling), period = 1 / f, duty = unit(e.duty);
  const primed = e.phaseHz && f - e.phaseHz > 0 ? 1 / (f - e.phaseHz) : period;
  return [us(period), us(period * duty), us(primed), us(primed * duty), fixed(unit(e.level ?? 0))];
}

/** Ints as the device reads them: little-endian, four bytes each. */
export function packLE(ints: number[]): Uint8Array {
  const out = new Uint8Array(ints.length * 4);
  ints.forEach((v, i) => { for (let b = 0; b < 4; b++) out[i * 4 + b] = (v >>> (8 * b)) & 255; });
  return out;
}

/** Both eyes as one forty-byte frame (base64, as the Bluetooth library writes it, and hex, for a log). */
export function frame(left: Eye, right: Eye, ceiling = HARD_MAX_HZ): { b64: string; hex: string } {
  const bytes = packLE([...eyeInts(left, ceiling), ...eyeInts(right, ceiling)]);
  return { b64: toBase64(bytes), hex: [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("") };
}

/** Dark: nothing lit on either eye. Stopping the stream does not clear the LEDs; this does. */
export const OFF = frame({ hz: 8, duty: 0 }, { hz: 8, duty: 0 }).b64;

/** The protocol's golden vector, the short form (both eyes the same, no phase): 10 Hz, half lit, full level. The app
 *  never sends it; a test does, to prove the encoding. */
export const symmetric = (hz: number, duty: number, level: number) => packLE([us(1 / clampHz(hz)), us(duty / clampHz(hz)), fixed(level)]);
