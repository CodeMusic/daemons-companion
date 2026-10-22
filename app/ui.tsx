// The app's building blocks -- cards, words, keys, pictures, the lesson's parts (C-157: out of App.tsx).
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Image, Platform } from "react-native";
import { Button, Input, Text, XStack, YStack } from "tamagui";
import { ALONE, ART, artByJson, isAway, KEYED, ON_PHONE, pairAgain, SERVER } from "./net";
import { Link } from "./types";
 // C-114: each care's phrase, made on the phone (careSound.ts) -- only on the phone, which has a file system to play from
export const { careSound }: typeof import("./careSound") = ON_PHONE ? require("./careSound") : { careSound: () => "" };

export const PIXELATED = Platform.OS === "web" ? ({ imageRendering: "pixelated" } as object) : {};
export function Art({ path, size, height, fit }: { path: string; size: number; height?: number; fit?: "contain" }) {   // C-158: height, for a hat; T-423: fit, for pictures of differing heights
  const [uri, setUri] = useState<string | null>(ART.get(path) ?? (ON_PHONE && (isAway() || ALONE) ? null : SERVER + path));
  const viaJson = useCallback(() => { artByJson(path).then(setUri).catch(() => {}); }, [path]);
  useEffect(() => { if (!uri) viaJson(); }, [uri, viaJson]);
  const style = [{ width: size, height: height ?? size }, PIXELATED as any];
  if (!uri) return <YStack width={size} height={height ?? size} />;
  return <Image source={{ uri }} style={style} resizeMode={fit ?? "cover"} onError={() => { if (uri.startsWith("http") && ON_PHONE) viaJson(); }} />;
}

// Words on the day's colour: ink on the light days (Tuesday's yellow), paper on the dark ones.
export function onColour(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.3 ? "#1d2026" : "#fbfaf6";
}

export const Eyebrow = (p: { children: React.ReactNode }) =>
  <Text fontFamily="$mono" fontSize={11} letterSpacing={1.5} color="$color11">{p.children}</Text>;

export const Small = (p: { children: React.ReactNode; struck?: boolean; color?: string }) =>
  <Text fontSize={14} lineHeight={20} color={p.struck ? "$color8" : (p.color ?? "$color11")}
        textDecorationLine={p.struck ? "line-through" : "none"}>{p.children}</Text>;

export const Card = (p: React.ComponentProps<typeof YStack>) =>
  <YStack backgroundColor="$color1" borderWidth={1} borderColor="$color5" borderRadius={4} padding={16} gap={6} {...p} />;

// C-61: what a screen shows when the companion did not answer -- the reason, and on the phone a way to pair again
export function Stuck({ error, ink }: { error: string; ink: string }) {
  return (
    <YStack gap={4}>
      <Small>{error}</Small>
      {KEYED ? <Small>Paired with {SERVER}. If the companion has moved, pair again from its site: SETTINGS, PAIR A PHONE.</Small> : null}
      {KEYED ? <Action label="Pair again" ink={ink} onPress={() => { pairAgain(); }} /> : null}
    </YStack>
  );
}

// C-118: a care button -- large, all the same width, the one that matters now lit
export function CareKey({ label, onPress, ink, lit = false }: { label: string; onPress: () => void; ink: string; lit?: boolean }) {
  return (
    <Button flex={1} height={52} paddingHorizontal={4} borderRadius={8} backgroundColor={lit ? "$color9" : "$color3"} borderWidth={lit ? 0 : 1.5} borderColor="$color8"
            pressStyle={{ backgroundColor: "$color10" }} hoverStyle={{ backgroundColor: lit ? "$color10" : "$color4" }} onPress={onPress}>
      {/* one line, shrunk to fit: on a 402pt-wide iPhone four keys broke DRINK into DRI / NK (seen 2026-10-15) */}
      <Text fontSize={16} fontWeight="800" letterSpacing={0.5} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}
            color={lit ? ink : "$color12"}>{label.toUpperCase()}</Text>
    </Button>
  );
}

// The ink that reads on the day's colour (onColour), given by the Shell to everything inside it -- a key or a banner on
// $color9 that hard-coded white was too faint on Tuesday's yellow and Wednesday's green (the review, 2026-10-18)
export const InkContext = createContext("#fbfaf6");
export const useInk = () => useContext(InkContext);

// C-157 (the review: ~20 handlers with no catch): a press whose work fails says so under its key for a while, instead of
// failing unseen -- every Action's, so no screen has to remember to catch
export function Action({ label, onPress, ink }: { label: string; onPress: () => unknown; ink?: string }) {
  const dayInk = useInk();
  ink = ink ?? dayInk;
  const [failed, setFailed] = useState<string | null>(null);
  const press = () => {
    const fail = (e: unknown) => { setFailed((e as Error)?.message || "That did not go."); setTimeout(() => setFailed(null), 6000); };   // DRAFT
    try { const r = onPress(); if (r && typeof (r as Promise<unknown>).then === "function") (r as Promise<unknown>).catch(fail); }
    catch (e) { fail(e); }
  };
  const key = (
    <Button alignSelf="flex-start" marginTop={8} backgroundColor="$color9" borderRadius={3} paddingHorizontal={18}
            hoverStyle={{ backgroundColor: "$color10" }} pressStyle={{ backgroundColor: "$color10" }} onPress={press}>
      <Text fontFamily="$mono" fontSize={13} letterSpacing={1} fontWeight="700" color={ink}>{label}</Text>
    </Button>
  );
  return failed ? <YStack alignSelf="flex-start" maxWidth={320}>{key}<Small color="$color8">{failed}</Small></YStack> : key;
}
export function Entry({ value, onChange, onSubmit, placeholder, limit }:
               { value: string; onChange: (v: string) => void; onSubmit: () => void; placeholder: string; limit: number }) {
  return (
    <XStack flexGrow={1} minWidth={200} alignItems="center" gap={6}>
      <Input flexGrow={1} value={value} maxLength={limit} onChangeText={onChange} onSubmitEditing={onSubmit} placeholder={placeholder}
             backgroundColor="$color1" borderColor="$color6" color="$color12" fontSize={14} />
      <Text fontFamily="$mono" fontSize={11} color={value.length >= limit ? "$color9" : "$color8"}>{`${value.length}/${limit}`}</Text>
    </XStack>
  );
}

// C-156: a row of segments inside a tab -- DAEMON's Yours, Party, INDEX and Routines
export function Segments<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: [T, string][] }) {
  return (
    <XStack backgroundColor="$color3" borderRadius={9} padding={3}>
      {options.map(([v, label]) => (
        <YStack key={v} flex={1} paddingVertical={7} borderRadius={7} alignItems="center" cursor="pointer" role="tab"
                aria-selected={v === value} backgroundColor={v === value ? "$color1" : "transparent"} onPress={() => onChange(v)}>
          <Text fontFamily="$mono" fontSize={12} letterSpacing={1} fontWeight={v === value ? "700" : "400"}
                color={v === value ? "$color12" : "$color10"}>{label}</Text>
        </YStack>
      ))}
    </XStack>
  );
}
export const whenSaid = (iso: string) => {
  const t = new Date(iso), today = new Date().toDateString() === t.toDateString();
  const hm = t.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return today ? `today, ${hm}` : `${t.toLocaleDateString([], { month: "short", day: "numeric" })}, ${hm}`;
};
export function Panel({ children }: { children: React.ReactNode }) {
  return <YStack backgroundColor="$color2" borderRadius={6} padding={14} gap={10} marginTop={4}>{children}</YStack>;
}

export function SubHead({ children }: { children: React.ReactNode }) {
  return <Text fontFamily="$mono" fontSize={11} fontWeight="700" letterSpacing={2} color="$color10" marginTop={6}>{children}</Text>;
}

export function Para({ children, lead }: { children: React.ReactNode; lead?: boolean }) {
  return <Text fontSize={lead ? 17 : 15} lineHeight={lead ? 25 : 22} fontWeight={lead ? "600" : "400"} color="$color12">{children}</Text>;
}

export function Points({ lines }: { lines: string[] }) {
  return (
    <YStack gap={6}>
      {lines.map((l, i) => (
        <XStack key={i} gap={8} alignItems="flex-start">
          <Text fontSize={15} lineHeight={22} color="$color9">•</Text>
          <Text flex={1} fontSize={15} lineHeight={22} color="$color12">{l}</Text>
        </XStack>
      ))}
    </YStack>
  );
}

export function Quote({ children }: { children: React.ReactNode }) {
  return (
    <YStack borderLeftWidth={3} borderColor="$color9" paddingLeft={10}>
      <Text fontSize={15} lineHeight={22} fontStyle="italic" color="$color12">{children}</Text>
    </YStack>
  );
}

// every QR code in the game opens its link here instead (the user, 2026-10-16: "in the site/app/tab5 it should browser to
// the link"): a song is listened to, anything else read
export const linkLabel = (url: string) => (/soundcloud\.com|youtu\.?be|spotify\.com|bandcamp\.com/.test(url) ? "Listen" : "Read");

export function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <XStack justifyContent="space-between" alignItems="baseline" gap={12} paddingVertical={6}
            borderBottomWidth={1} borderBottomColor="$color4">
      <Eyebrow>{label}</Eyebrow>
      <Text fontSize={16} color="$color12" fontVariant={["tabular-nums"]}>{children}</Text>
    </XStack>
  );
}
   // C-90

export function Choice<T>({ value, options, onPick, ink }: { value: T; options: [T, string][]; onPick: (v: T) => void; ink?: string }) {
  const dayInk = useInk();
  ink = ink ?? dayInk;
  return (
    <XStack gap={2} flexWrap="wrap">
      {options.map(([v, label]) => (
        <YStack key={String(v)} role="button" cursor="pointer" borderRadius={3} paddingHorizontal={12} paddingVertical={6}
                borderWidth={1} borderColor={v === value ? "$color9" : "$color6"} backgroundColor={v === value ? "$color9" : "$color1"}
                hoverStyle={{ borderColor: "$color9" }} onPress={() => onPick(v)}>
          <Text fontSize={13} fontWeight={v === value ? "700" : "400"} color={v === value ? ink : "$color12"}>{label}</Text>
        </YStack>
      ))}
    </XStack>
  );
}

export function Result({ link, id }: { link: Link; id: number | null }) {
  if (id == null) return null;
  const r = link.results.find((x) => x.id === id);
  if (!r) return <Small>Sent to the board… {link.pending.some((p) => p.id === id) ? "(waiting for it to pick it up)" : ""}</Small>;
  return <Text fontFamily="$mono" fontSize={12} lineHeight={18} color={r.ok ? "$color12" : "$color9"} whiteSpace="pre-wrap">{r.text}</Text>;
}
