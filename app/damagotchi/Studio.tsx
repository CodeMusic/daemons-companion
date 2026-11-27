// C-590 (the user, 2026-11-26: "in the area where we can make the daemon sing, or paint a picture, or make sleep sounds
// along with binaurals beats, first the UX and UI in that area we could improve a lot"): THE STUDIO, at the top of
// ROUTINES -- the four things a daemon makes with you, each a door: IT SINGS, THE EASEL, REVERIE (sleep sounds and DRIFT
// DOWN) and SYNESTHESIA, FELT (C-592). Each door opens its page in the studio's place, with ‹ THE STUDIO to come back;
// nothing opens inside a card any more. While a reverie plays, NOW PLAYING stays at the top -- what, the beat now, the
// minutes left, where the drift is going -- with STOP. The doors wear the carried daemon's three colours (T-612, C-490):
// IT SINGS its KEY, THE EASEL its DAY, REVERIE its MONTH, SYNESTHESIA all three. Every word DRAFT.
import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { Text, XStack, YStack } from "tamagui";
import speciesJson from "../../server/data/species.json";
import songsJson from "../../server/data/songs.json";
import { Synesthesia, type TypeKey } from "../../server/src/psyche/synesthesia";
import { api } from "../platform/net";
import { onSleep, sleepState, stopSleep } from "../sound/sleepSession";
import { PALETTE } from "../state/look";
import { SingScreen } from "./Sing";   // C-362
import { EaselScreen } from "./Easel";   // C-338
import { left, ReveriePage } from "./SleepSounds";   // C-334, C-590
import { SynesthesiaScreen } from "./Synesthesia";   // C-592
import { CreationsScreen } from "./Creations";   // C-358
import { DriftOutputsCard, OutputChips } from "./Devices";   // C-591
import { Action, Card, Eyebrow, Small } from "../shared/ui/ui";

export type StudioPage = "home" | "sing" | "easel" | "reverie" | "synesthesia" | "devices" | "made";
const SPECIES = speciesJson as unknown as Record<string, { national: number; types: string[] }>;
const KEYS = (songsJson as unknown as { keys: Record<string, TypeKey> }).keys;
const PLAIN = { key: ["#c9a24a"], day: ["#5b8fb0"], month: ["#7d6bb3"] };   // no daemon carried: the studio's own

/** The carried daemon's three colours, by its species. */
function coloursOf(species: number | null) {
  const s = species !== null ? SPECIES[String(species)] : null, k = s ? KEYS[s.types[0]] : null;
  if (!s || !k) return PLAIN;
  const d = Synesthesia.daemon(s.national, k, PALETTE);
  const dim = (h: string) => `#${[1, 3, 5].map((i) => Math.round(parseInt(h.slice(i, i + 2), 16) * 0.55).toString(16).padStart(2, "0")).join("")}`;
  return { key: d.key.minor ? d.key.colours.map(dim) : d.key.colours, day: d.day.colours, month: d.month.colours };   // a minor key, dim (T-612)
}

function Door({ glyph, title, line, colours, status, onPress, off }:
  { glyph: string; title: string; line: string; colours: string[]; status?: string; onPress: () => void; off?: string }) {
  return (
    <YStack flexBasis="47%" flexGrow={1} minWidth={150} minHeight={138} borderRadius={10} borderWidth={1} borderColor="$color5" backgroundColor="$color1"
            overflow="hidden" cursor={off ? "default" : "pointer"} role="button" aria-label={`${title}: ${line}`} aria-disabled={!!off}
            hoverStyle={off ? undefined : { borderColor: "$color8" }} pressStyle={off ? undefined : { backgroundColor: "$color2" }}
            onPress={off ? undefined : onPress} opacity={off ? 0.55 : 1}>
      <XStack height={8}>{colours.map((c, i) => <View key={`${c}${i}`} style={{ flex: 1, backgroundColor: c }} />)}</XStack>
      <YStack padding={12} gap={4} flex={1}>
        <XStack alignItems="center" gap={8}>
          <YStack width={30} height={30} borderRadius={15} alignItems="center" justifyContent="center" backgroundColor={colours[0]}>
            <Text fontSize={16} color="#fbfaf6">{glyph}</Text>
          </YStack>
          <Text fontFamily="$mono" fontSize={13} letterSpacing={1.5} fontWeight="800" color="$color12" flexShrink={1}>{title}</Text>
        </XStack>
        <Text fontSize={13} lineHeight={18} color="$color11">{off ?? line}</Text>
        {status ? <Text fontFamily="$mono" fontSize={11} letterSpacing={1} color="$color12" marginTop="auto">{status}</Text> : null}
      </YStack>
    </YStack>
  );
}

/** NOW PLAYING: the reverie playing, from any page of the studio. */
export function NowPlaying({ ink, onOpen }: { ink: string; onOpen?: () => void }) {
  const [now, setNow] = useState(sleepState());
  const [, tickle] = useState(0);
  useEffect(() => onSleep(setNow), []);
  useEffect(() => { if (!now.playing) return; const t = setInterval(() => tickle((n) => n + 1), 15000); return () => clearInterval(t); }, [now.playing]);
  if (!now.playing) return null;
  return (
    <Card borderLeftWidth={5} borderLeftColor="$color9" gap={4}>
      <XStack alignItems="center" justifyContent="space-between" gap={8}>
        <YStack flex={1} gap={2} cursor={onOpen ? "pointer" : undefined} onPress={onOpen} role={onOpen ? "button" : undefined}>
          <Eyebrow>{"NOW PLAYING"}</Eyebrow>
          <Text fontFamily="$mono" fontSize={14} fontWeight="700" color="$color12" numberOfLines={1}>{now.title || "Sleep sounds"}</Text>
          <Small>{`${now.drift && now.stage ? `${now.stage}${now.beat ? `, ${now.beat} Hz` : ""}. ` : now.drift ? "" : "DRIFT DOWN off. "}${left(now.startedAt)}`}</Small>
        </YStack>
        <Action label="STOP" ink={ink} onPress={stopSleep} />
      </XStack>
      {now.drift ? <OutputChips /> : null}
    </Card>
  );
}

export function Studio({ ink, daemon, page, onPage }:
  { ink: string; daemon?: { nickname: string; slot: number | null } | null; page: StudioPage; onPage: (p: StudioPage) => void }) {
  const [species, setSpecies] = useState<number | null>(null);
  const [now, setNow] = useState(sleepState());
  useEffect(() => onSleep(setNow), []);
  useEffect(() => {   // the carried daemon's species, for its colours and its three notes
    if (!daemon || daemon.slot === null) { setSpecies(null); return; }
    api<{ party: { slot: number; species: number }[] }>("/api/party").then((r) => setSpecies(r.party?.find((d) => d.slot === daemon.slot)?.species ?? null)).catch(() => {});
  }, [daemon?.slot]);
  const c = useMemo(() => coloursOf(species), [species]);
  const home = () => onPage("home");
  const back = (
    <Text fontFamily="$mono" fontSize={13} letterSpacing={2} fontWeight="700" color="$color12" cursor="pointer" role="link" onPress={home}>{"‹ THE STUDIO"}</Text>
  );
  const name = daemon?.nickname || "Your daemon";

  if (page === "sing" && daemon) return <YStack gap={12}><NowPlaying ink={ink} onOpen={() => onPage("reverie")} /><SingScreen ink={ink} name={daemon.nickname} onClose={home} /></YStack>;
  if (page === "easel" && daemon) return <YStack gap={12}>{back}<NowPlaying ink={ink} onOpen={() => onPage("reverie")} /><EaselScreen ink={ink} name={daemon.nickname} slot={daemon.slot} /></YStack>;
  if (page === "reverie") return <ReveriePage ink={ink} onBack={home} />;
  if (page === "synesthesia") return <SynesthesiaScreen ink={ink} species={species} name={daemon?.nickname} onBack={home} />;
  if (page === "devices") return <YStack gap={12}>{back}<DriftOutputsCard ink={ink} /></YStack>;
  if (page === "made") return <CreationsScreen ink={ink} onClose={home} />;

  return (
    <YStack gap={12}>
      <NowPlaying ink={ink} onOpen={() => onPage("reverie")} />
      <Card>
        <Eyebrow>{"THE STUDIO · DRAFT"}</Eyebrow>
        <Small>{daemon ? `What ${name} makes with you: a song, a painting, a night to drift through, and its own notes felt as colour.` : "Carry a daemon and it sings and paints for you here. REVERIE and SYNESTHESIA are open to anyone."}</Small>
      </Card>
      <XStack gap={10} flexWrap="wrap">
        <Door glyph="♪" title="IT SINGS" line="A song from a prompt, your own words, or its own day." colours={c.key}
              off={daemon ? undefined : "Carry a daemon for it to sing."} onPress={() => onPage("sing")} />
        <Door glyph="✎" title="THE EASEL" line="A painting, titled and hung in its gallery." colours={c.day}
              off={daemon ? undefined : "Carry a daemon for it to paint."} onPress={() => onPage("easel")} />
        <Door glyph="☾" title="REVERIE" line="Music to drift with -- sleep, stillness, a place, a state -- and DRIFT DOWN under it." colours={c.month}
              status={now.playing ? `PLAYING${now.drift && now.stage ? ` · ${now.stage}` : ""}` : undefined} onPress={() => onPage("reverie")} />
        <Door glyph="◐" title="SYNESTHESIA" line={species !== null ? `${name}'s three notes as colour, tone and light.` : "The week and the year as colour, tone and light."}
              colours={[c.key[0], c.day[0], c.month[0]]} onPress={() => onPage("synesthesia")} />
      </XStack>
      <Card gap={8}>
        <Eyebrow>{"WHERE THE DRIFT GOES"}</Eyebrow>
        <OutputChips onPress={() => onPage("devices")} />
        <Text fontFamily="$mono" fontSize={12} letterSpacing={1.5} fontWeight="700" color="$color12" cursor="pointer" role="link" onPress={() => onPage("devices")}>{"HEADPHONES, PULSETTO, NOVA ›"}</Text>
      </Card>
      <Text fontFamily="$mono" fontSize={13} letterSpacing={2} fontWeight="700" color="$color12" cursor="pointer" role="link" onPress={() => onPage("made")}>{"EVERYTHING MADE ›"}</Text>
    </YStack>
  );
}
