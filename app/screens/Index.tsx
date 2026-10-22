// the INDEX -- every entry the save holds, NATIVE, OPUS's margins, LISTEN. (C-157: out of App.tsx.)
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { File, Paths } from "expo-file-system";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { Spinner, Text, XStack, YStack } from "tamagui";
import { api, apiLater, ON_PHONE } from "../net";
import { Index, Reading, Spoken } from "../types";
import { Art, Card, Eyebrow, Small } from "../ui";
import { useApi } from "../useApi";
export function useIndexReader() {
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);
  const [reading, setReading] = useState<Reading>(null);
  const [failed, setFailed] = useState("");
  const turn = useRef(0);                                  // a stopped request's answer is recognised and dropped
  useEffect(() => { if (status.didJustFinish) setReading((r) => (r?.phase === "speaking" ? null : r)); }, [status.didJustFinish]);
  const listen = async (species: number) => {
    if (reading) return;
    const mine = ++turn.current;
    setFailed(""); setReading({ species, phase: "making" });
    try {
      const r = await apiLater<Spoken>("/api/ai/speak", { species });   // C-180
      if (turn.current !== mine) return;
      if (!r.audioBase64) { setFailed(r.error ?? "No voice came back."); setReading(null); return; }
      let uri = `data:audio/mpeg;base64,${r.audioBase64}`;                      // the site plays it as it came
      if (ON_PHONE) {                                                              // the phone, from its cache
        const f = new File(Paths.cache, `index-${Date.now()}.mp3`);
        f.create(); f.write(r.audioBase64, { encoding: "base64" }); uri = f.uri;
        await setAudioModeAsync({ playsInSilentMode: true });
      }
      player.replace({ uri }); player.play();
      setReading({ species, phase: "speaking" });
    } catch (e) { if (turn.current === mine) { setFailed((e as Error).message); setReading(null); } }
  };
  const stop = () => { turn.current++; player.pause(); setReading(null); };
  return { reading, failed, listen, stop };
}

// LISTEN (a play mark in a ring), the spinner with its stop square, and HUSH -- each a ring and a word, so the control
// keeps its place and its size as it changes.
export function ListenControl({ phase, onListen, onStop, ink }: { phase: "making" | "speaking" | null; onListen: () => void;
                                                           onStop: () => void; ink: string }) {
  const Word = ({ children }: { children: string }) =>
    <Text fontFamily="$mono" fontSize={12} letterSpacing={1.5} color="$color12">{children}</Text>;
  const ring = { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" } as const;
  if (phase === "making") return (
    <XStack alignItems="center" gap={10} role="button" aria-label="Stop" cursor="pointer" onPress={onStop}>
      <YStack {...ring}>
        <Spinner size="large" color="$color9" position="absolute" />
        <View style={{ width: 12, height: 12, borderRadius: 2, backgroundColor: "#888" }} />
      </YStack>
      <Word>STOP</Word>
    </XStack>
  );
  if (phase === "speaking") return (
    <XStack alignItems="center" gap={10} role="button" aria-label="Hush" cursor="pointer" onPress={onStop}>
      <YStack {...ring} borderWidth={2} borderColor="$color9">
        <XStack gap={3} alignItems="flex-end">
          {[8, 14, 10].map((h, i) => <YStack key={i} width={3} height={h} borderRadius={1} backgroundColor="$color9" />)}
        </XStack>
      </YStack>
      <Word>HUSH</Word>
    </XStack>
  );
  return (
    <XStack alignItems="center" gap={10} role="button" aria-label="Listen" cursor="pointer" onPress={onListen}>
      <YStack {...ring} backgroundColor="$color9">
        <View style={{ width: 0, height: 0, marginLeft: 4, borderTopWidth: 8, borderBottomWidth: 8, borderLeftWidth: 13,
                       borderTopColor: "transparent", borderBottomColor: "transparent", borderLeftColor: ink }} />
      </YStack>
      <Word>LISTEN</Word>
    </XStack>
  );
}

export function IndexScreen({ ink }: { ink: string }) {
  const [ix, , error] = useApi<Index>("/api/index");
  const [open, setOpen] = useState<number | null>(null);
  const voice = useIndexReader();
  const busy = voice.reading !== null;
  if (error) return <Small>{error}</Small>;
  if (!ix) return <Small>Loading…</Small>;
  const flat = (s: string) => s.replace(/\n/g, " ");      // the game's line breaks are for its own window
  return (
    <YStack gap={10}>
      <Card>
        <Eyebrow>THE INDEX</Eyebrow>
        <Text fontSize={20} fontWeight="600" color="$color12">{ix.seen} seen · {ix.bound} bound</Text>
        {ix.opus ? <Small>OPUS is in your bag: where it has written beside an entry, it is shown.</Small> : null}
      </Card>
      {ix.entries.map((e) => (
        <Card key={e.national} padding={12} cursor={e.bound && !busy ? "pointer" : "default"}
              opacity={busy && open !== e.national ? 0.45 : 1}
              onPress={() => e.bound && !busy && setOpen(open === e.national ? null : e.national)}>
          <XStack gap={12} alignItems="center">
            {e.art ? <Art path={e.art} size={64} /> : null}
            <YStack flex={1}>
              <Text fontFamily="$mono" fontSize={11} color="$color10">{`No. ${String(e.national).padStart(3, "0")}`}</Text>
              <Text fontSize={16} fontWeight="600" color="$color12">{e.name}</Text>
              {e.bound ? <Small>{`${e.category} · ${(e.types ?? []).join(" / ")}`}</Small> : <Small>Seen</Small>}
            </YStack>
            {e.margin ? <Text fontFamily="$mono" fontSize={11} color="$color9">MARGIN</Text> : null}
          </XStack>
          {open === e.national ? (
            <YStack gap={8} marginTop={8}>
              <Text fontSize={15} lineHeight={22} color="$color12">{flat(e.entry ?? "")}</Text>
              {e.entry ? (
                <ListenControl phase={voice.reading?.species === e.species ? voice.reading.phase : null} ink={ink}
                               onListen={() => voice.listen(e.species)} onStop={voice.stop} />
              ) : null}
              {voice.failed && open === e.national ? <Small color="$color8">{voice.failed}</Small> : null}
              {e.native?.length ? (   /* T-407: NATIVE, as the game's area page says it */
                <YStack gap={2}>
                  <Eyebrow>NATIVE</Eyebrow>
                  {e.native.map((n) => <Text key={n} fontFamily="$mono" fontSize={13} color="$color11">{n}</Text>)}
                </YStack>
              ) : null}
              {e.margin ? (
                <YStack borderLeftWidth={3} borderLeftColor="$color9" paddingLeft={10}>
                  <Text fontSize={14} lineHeight={21} fontStyle="italic" color="$color11">{flat(e.margin.text)}</Text>
                </YStack>
              ) : null}
            </YStack>
          ) : null}
        </Card>
      ))}
    </YStack>
  );
}
