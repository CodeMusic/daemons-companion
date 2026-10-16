// C-130: the devices as they look -- a sprite of each, made of rectangles on a 32x32 grid in the device's own colours,
// and the maker it is listed under. The list is firmware/common/device_sprites.py's (server/data/devices.json), the
// same one the Tab5 draws from.
import { View } from "react-native";
import devicesJson from "../server/data/devices.json";

type Shape = [number, number, number, number, number, string];   // x, y, w, h, corner radius, colour
type Look = { maker: string; name: string; shapes: Shape[] };
const DATA = devicesJson as unknown as { makers: string[]; aliases: Record<string, string>; devices: Record<string, Look> };

export const MAKERS: string[] = [...DATA.makers, "Other"];

// A device's look by its kind -- the name its firmware gives it (t-deck, m5-dial, ...), or a longer one beginning so.
export function lookFor(kind: string): Look | undefined {
  const k = DATA.aliases[kind] ?? kind;
  if (DATA.devices[k]) return DATA.devices[k];
  const best = Object.keys(DATA.devices).filter((d) => k.startsWith(d)).sort((a, b) => b.length - a.length)[0];
  return best ? DATA.devices[best] : undefined;
}

export const makerOf = (kind: string) => lookFor(kind)?.maker ?? "Other";

// The sprite, `size` points square. An unknown device is a plain grey board.
export function DeviceSprite({ kind, size = 48, dim = false }: { kind: string; size?: number; dim?: boolean }) {
  const look = lookFor(kind);
  const s = size / 32;
  const shapes: Shape[] = look?.shapes ?? [[4, 8, 24, 16, 2, "#5a5d63"], [7, 11, 18, 10, 1, "#46a8e0"]];
  return (
    <View style={{ width: size, height: size, opacity: dim ? 0.7 : 1 }} accessibilityLabel={look ? `${look.maker} ${look.name}` : kind}>
      {shapes.map(([x, y, w, h, r, c], i) => (
        <View key={i} style={{ position: "absolute", left: x * s, top: y * s, width: w * s, height: h * s,
                               borderRadius: r * s, backgroundColor: c }} />
      ))}
    </View>
  );
}
