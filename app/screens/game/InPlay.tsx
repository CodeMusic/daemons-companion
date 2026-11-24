// C-493 (C-478's rest; the user, 2026-11-22: "If you go to this new area: if many ongoing game plays, some list, otherwise
// it auto-selects the one that is active. From that save you have options to see things like where they are, their
// daemons, their icons etc. ... it streams screenshots"): IN PLAY in the app and the site, as THE ENGINE ROOM draws it
// (server/admin/admin.js drawInPlay) -- every game the hub has heard from in the last moments: one opens by itself, many
// are a list; each with its screen (fetched with this device's key, only when a newer one has come), where it runs and
// for whom, where it was last saved, its time and MARKS, its party. An AI run-through can be ended. On PLACES, under the
// devices. A phone on its own has no hub to ask, and shows nothing. Every word DRAFT.
import { useEffect, useRef, useState } from "react";
import { Image, Platform } from "react-native";
import { Text, XStack, YStack } from "tamagui";
import { ALONE, api, homeBase, TOKEN } from "../../platform/net";
import { Action, Art, Card, Eyebrow, Small, whenSaid } from "../../shared/ui/ui";

type Party = { species: number; name: string; nickname: string; level: number }[];
export type InPlayGame = { id: string; source: string; device: string; user: string; edition?: string; began: string; heard: string;
                           ending?: boolean; summary?: { name: string; savedIn: string | null; playTime: string; marks: number; party: Party };
                           frame?: { at: string; type: string; bytes: number } };
type Games = { playing: InPlayGame[]; lately: InPlayGame[]; sources: Record<string, string> };
export const IN_PLAY_EVERY = 5000;

// the screen: on the phone the picture is asked with this device's key; on the site, fetched and shown from memory
function Screen({ g, wide }: { g: InPlayGame; wide: number }) {
  const h = Math.round(wide * 2 / 3), src = `${homeBase()}/api/games/${encodeURIComponent(g.id)}/frame?at=${encodeURIComponent(g.frame?.at ?? "")}`;
  const [url, setUrl] = useState<string | null>(null), was = useRef<string | null>(null);
  useEffect(() => {
    if (Platform.OS !== "web" || !g.frame) return;
    let on = true;
    fetch(src, { headers: TOKEN ? { authorization: `Bearer ${TOKEN}` } : {} }).then((r) => (r.ok ? r.blob() : null)).then((b) => {
      if (!on || !b) return;
      const u = URL.createObjectURL(b);
      if (was.current) URL.revokeObjectURL(was.current);
      was.current = u; setUrl(u);
    }).catch(() => {});
    return () => { on = false; };
  }, [g.id, g.frame?.at]);
  useEffect(() => () => { if (was.current) URL.revokeObjectURL(was.current); }, []);
  if (!g.frame) return (
    <YStack width={wide} height={h} borderRadius={4} backgroundColor="#0f1115" alignItems="center" justifyContent="center">
      <Small color="#8b90a0">no picture yet</Small>
    </YStack>);
  const headers: Record<string, string> = TOKEN ? { authorization: `Bearer ${TOKEN}` } : {};
  const source = Platform.OS === "web" ? (url ? { uri: url } : null) : { uri: src, headers };
  return source ? <Image source={source} style={{ width: wide, height: h, borderRadius: 4, backgroundColor: "#0f1115" }} resizeMode="contain"
                         {...(Platform.OS === "web" ? {} : { fadeDuration: 0 })} />
    : <YStack width={wide} height={h} borderRadius={4} backgroundColor="#0f1115" />;
}

const where = (v: Games, g: InPlayGame) => [v.sources[g.source] ?? g.source.toUpperCase(), g.device, g.user].filter(Boolean).join(" · ") + (g.edition ? ` · ${g.edition}` : "");

function OneGame({ v, g, live, onAll, wide }: { v: Games; g: InPlayGame; live: boolean; onAll?: () => void; wide: number }) {
  const [asked, setAsked] = useState(false);
  const s = g.summary;
  return (
    <YStack gap={8}>
      <Screen g={g} wide={wide} />
      <XStack justifyContent="space-between" alignItems="flex-start" gap={8}>
        <YStack flex={1} gap={2}>
          <Text fontSize={18} fontWeight="700" color="$color12">{s?.name ?? g.user ?? "A game"}</Text>
          <Small>{where(v, g)}</Small>
          <Small>{live ? `playing · began ${whenSaid(g.began)} · heard ${whenSaid(g.heard)}` : `played ${whenSaid(g.heard)}`}</Small>
        </YStack>
        {onAll ? <Action label="ALL GAMES" onPress={onAll} /> : null}
      </XStack>
      {s ? <Small>{`Last saved in ${s.savedIn ?? "somewhere"} · ${s.playTime} played · ${s.marks} ${s.marks === 1 ? "MARK" : "MARKS"}`}</Small> : null}
      {s?.party?.length ? (
        <XStack gap={10} flexWrap="wrap">
          {s.party.map((d, i) => (
            <YStack key={i} alignItems="center" width={64}>
              <Art path={`/art/species/${d.species}.png`} size={48} />
              <Text fontFamily="$mono" fontSize={11} fontWeight="700" color="$color12" numberOfLines={1}>{d.nickname || d.name}</Text>
              <Small>{`L${d.level}`}</Small>
            </YStack>
          ))}
        </XStack>
      ) : null}
      {g.source === "ai" && live ? (g.ending || asked
        ? <Small>Asked to end. It stops at its next heartbeat.</Small>
        : <Action label="END THIS RUN-THROUGH" onPress={async () => { await api(`/api/games/${encodeURIComponent(g.id)}/end`, {}).catch(() => {}); setAsked(true); }} />) : null}
    </YStack>
  );
}

/** IN PLAY: one game opens by itself, many are a list; the lately played under them. Asked again every few seconds. */
export function InPlayCard() {
  const [v, setV] = useState<Games | null>(null), [pick, setPick] = useState<string | null>(null), [w, setW] = useState(0);
  useEffect(() => {
    if (ALONE) return;
    let on = true;
    const ask = () => api<Games>("/api/games").then((r) => { if (on) setV(r); }).catch(() => { if (on) setV(null); });
    ask();
    const t = setInterval(ask, IN_PLAY_EVERY);
    return () => { on = false; clearInterval(t); };
  }, []);
  if (!v || (!v.playing.length && !v.lately.length)) return null;
  const all = [...v.playing, ...v.lately], chosen = pick ? all.find((g) => g.id === pick) : undefined;
  const open = chosen ?? (v.playing.length === 1 ? v.playing[0] : undefined);
  const live = (g: InPlayGame) => v.playing.some((x) => x.id === g.id);
  const wide = Math.max(0, Math.min(w, 480)), tile = Math.max(0, Math.min(Math.floor((w - 12) / 2), 240));
  return (
    <Card>
      <YStack gap={10} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
        <Eyebrow>IN PLAY</Eyebrow>
        <Small>{v.playing.length ? `${v.playing.length} ${v.playing.length === 1 ? "game" : "games"} being played that this hub has heard from.` : "No game is being played right now."}  DRAFT</Small>
        {!w ? null : open ? <OneGame v={v} g={open} live={live(open)} wide={wide} onAll={v.playing.length > 1 || chosen ? () => setPick(null) : undefined} />
          : v.playing.length ? (
            <XStack gap={12} flexWrap="wrap">
              {v.playing.map((g) => (
                <YStack key={g.id} gap={4} width={tile} onPress={() => setPick(g.id)} cursor="pointer" role="button">
                  <Screen g={g} wide={tile} />
                  <Text fontWeight="700" color="$color12" numberOfLines={1}>{g.summary?.name ?? g.user ?? "A game"}</Text>
                  <Small>{where(v, g)}</Small>
                </YStack>
              ))}
            </XStack>) : null}
        {!open && v.lately.length ? (
          <YStack gap={4}>
            <Eyebrow>PLAYED LATELY</Eyebrow>
            {v.lately.map((g) => (
              <XStack key={g.id} justifyContent="space-between" gap={8} onPress={() => setPick(g.id)} cursor="pointer" role="button">
                <Text flex={1} color="$color12" numberOfLines={1}>{`${g.summary?.name ?? g.user ?? "A game"} · ${where(v, g)}`}</Text>
                <Small>{whenSaid(g.heard)}</Small>
              </XStack>
            ))}
          </YStack>) : null}
      </YStack>
    </Card>
  );
}
