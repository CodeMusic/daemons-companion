// C-329 (the user, 2026-11-11): IN DIALOGUE, under OUT TOGETHER on TRADE -- your daemon out talks with another player's
// out now. STANDARD (the bicameral conversation: one leans logical, red, the other creative, blue) or TWO VOICES (one
// tells, the other asks, clarifies or says it back); [-] turns [+], 1 to 11 each; the opening typed here. The talk comes
// as message bubbles, the thinking dots on the side whose line the hub's mind is making, each line heard in its daemon's
// own voice (C-323) as it comes and again with the play mark beside it, the two daemons facing above, the one speaking
// moving. Every talk is kept: the history by week, a dot in its weekday's colour, the title once INTEGRATE has written
// one (the time until then, dd/MMM/yyyy hh:mm TT). The server's rules: server/src/dialogue.ts. Every word DRAFT.
import { setAudioModeAsync, useAudioPlayer } from "expo-audio";
import { useEffect, useRef, useState } from "react";
import { Animated, Easing } from "react-native";
import { Text, XStack, YStack } from "tamagui";
import { byWeek, dayColour, dayName, stampOf, MAX_TURNS, MIN_TURNS, PROMPT_MOST } from "../../../server/src/dialogue";
import { apiLater, apiLive, ON_PHONE } from "../../platform/net";
import { readingVoice, voiceExt } from "../../platform/voiceFile";
import { followVoice, setSpeaking } from "../../sound/speaking";
import type { Spoken } from "../../state/types";
import { Action, Art, Entry, Eyebrow, Segments, Small } from "../../ui/ui";

type Mode = "standard" | "twovoices";
type Party = { player: string; species: number; nickname: string; name: string; level: number; lean?: "red" | "blue"; role?: "tells" | "asks"; voice: string; voiceKey: string };
type Line = { who: "a" | "b"; said: string; at: string; by: string };
type Talk = { id: string; at: string; mode: Mode; turns: number; prompt: string; starter: string; a: Party; b: Party; lines: Line[];
              status: "thinking" | "done" | "failed"; next?: "a" | "b" | null; error?: string;
              written?: { title: string; text: string; at: string; by: string } | null; integrating?: boolean };
type Brief = { id: string; at: string; mode: Mode; turns: number; status: string; title: string | null; lines: number; integrating: boolean; a: Party; b: Party };
type OutOne = { id?: string; species: number; nickname: string; level: number; name: string };

const RED = "#B5413A", BLUE = "#3A62B5";                                  // the two leans' inks: left red, right blue
const LEAN_WORD = { red: "logical", blue: "creative" } as const;           // DRAFT
const ROLE_WORD = { tells: "tells", asks: "asks" } as const;               // DRAFT
const tagOf = (p: Party) => (p.lean ? LEAN_WORD[p.lean] : p.role ? ROLE_WORD[p.role] : "");
const inkOf = (p: Party) => (p.lean === "red" ? RED : p.lean === "blue" ? BLUE : null);

// ---- a line heard in its daemon's own voice: asked once, kept (the phone) or played as it came (the site) ----
function useLineVoice() {
  const player = useAudioPlayer(null);
  const asked = useRef(new Map<string, Promise<string | null>>());
  const [playing, setPlaying] = useState<string | null>(null);
  const ended = useRef<(() => void) | null>(null);
  useEffect(() => {
    const sub = player.addListener("playbackStatusUpdate", (s) => { if (s.didJustFinish) { ended.current?.(); } });
    return () => { sub.remove(); try { player.pause(); } catch { /* gone */ } };
  }, [player]);
  const sourceOf = (key: string, text: string, p: Party) => {
    if (!asked.current.has(key)) {
      const body = { text, voice: `daemon:${p.species}:${p.voiceKey}`, recipe: p.voice };
      asked.current.set(key, (async () => {
        if (ON_PHONE) { const f = await readingVoice(body); return f?.uri ?? null; }
        const r = await apiLater<Spoken>("/api/ai/speak", body);
        return r.audioBase64 ? `data:audio/${voiceExt(r.audioBase64) === "wav" ? "wav" : "mpeg"};base64,${r.audioBase64}` : null;
      })().catch(() => { asked.current.delete(key); return null; }));
    }
    return asked.current.get(key)!;
  };
  // played to its end (or a minute at most); resolves either way
  const play = async (key: string, text: string, p: Party) => {
    const uri = await sourceOf(key, text, p);
    if (!uri) return;
    if (ON_PHONE) await setAudioModeAsync({ playsInSilentMode: true });
    await new Promise<void>((done) => {
      const t = setTimeout(() => finish(), 60000);
      const finish = () => { clearTimeout(t); ended.current = null; setPlaying(null); setSpeaking(false); done(); };
      ended.current?.();
      ended.current = finish;
      setPlaying(key);
      player.replace({ uri }); player.play(); followVoice(player);
    });
  };
  const stop = () => { try { player.pause(); } catch { /* released */ } ended.current?.(); };
  return { play, stop, playing, ready: sourceOf };
}

// ---- the thinking dots: three, one lit after another ----
function Dots({ ink }: { ink: string }) {
  const [n, setN] = useState(0);
  useEffect(() => { const t = setInterval(() => setN((x) => (x + 1) % 3), 380); return () => clearInterval(t); }, []);
  return (
    <XStack gap={5} paddingHorizontal={14} paddingVertical={11}>
      {[0, 1, 2].map((i) => <YStack key={i} width={8} height={8} borderRadius={4} backgroundColor={ink} opacity={i === n ? 0.95 : 0.3} />)}
    </XStack>
  );
}

// ---- the two daemons facing, the one speaking (or thinking) bobbing ----
function Facing({ t, speaking }: { t: Talk; speaking: "a" | "b" | null }) {
  const bob = { a: useRef(new Animated.Value(0)).current, b: useRef(new Animated.Value(0)).current };
  const lively = speaking ?? (t.status === "thinking" ? t.next ?? null : null);
  useEffect(() => {
    const run = (["a", "b"] as const).map((s) => {
      if (s !== lively) { bob[s].setValue(0); return null; }
      const loop = Animated.loop(Animated.sequence([
        Animated.timing(bob[s], { toValue: 1, duration: speaking ? 180 : 600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(bob[s], { toValue: 0, duration: speaking ? 180 : 600, easing: Easing.inOut(Easing.quad), useNativeDriver: true })]));
      loop.start();
      return loop;
    });
    return () => run.forEach((l) => l?.stop());
  }, [lively, speaking]);
  const one = (s: "a" | "b") => {
    const p = t[s], ink = inkOf(p);
    return (
      <YStack alignItems="center" gap={2}>
        <Animated.View style={{ transform: [{ translateY: bob[s].interpolate({ inputRange: [0, 1], outputRange: [0, speaking === s ? -5 : -3] }) },
                                            ...(s === "b" ? [{ scaleX: -1 }] : [])] }}>
          <Art path={`/art/species/${p.species}.png`} size={72} />
        </Animated.View>
        <Text fontSize={13} color="$color12">{p.nickname}</Text>
        <Text fontFamily="$mono" fontSize={10} letterSpacing={1} color={ink ?? "$color10"}>{tagOf(p).toUpperCase()}</Text>
      </YStack>
    );
  };
  return <XStack justifyContent="space-between" alignItems="flex-end" paddingHorizontal={8}>{one("a")}<Small color="$color10">{t.mode === "twovoices" ? "TWO VOICES" : "IN DIALOGUE"}</Small>{one("b")}</XStack>;
}

// ---- one talk: the daemons, the bubbles, INTEGRATE ----
function TalkView({ t, ink, voice, onIntegrate, fresh }: { t: Talk; ink: string; voice: ReturnType<typeof useLineVoice>; onIntegrate: () => Promise<void>; fresh: boolean }) {
  const heard = useRef(fresh ? 0 : t.lines.length);                     // a talk watched live is heard as it comes
  const [speaking, setSpeakingSide] = useState<"a" | "b" | null>(null);
  const busy = useRef(false);
  const key = (i: number) => `${t.id}:${i}`;
  useEffect(() => {                                                    // ask each new line's voice at once, play them in turn
    t.lines.forEach((l, i) => { if (i >= heard.current) voice.ready(key(i), l.said, t[l.who]); });
    if (busy.current) return;
    (async () => {
      busy.current = true;
      try {
        while (heard.current < t.lines.length) {
          const i = heard.current++, l = t.lines[i];
          setSpeakingSide(l.who);
          await voice.play(key(i), l.said, t[l.who]);
          setSpeakingSide(null);
        }
      } finally { busy.current = false; }
    })();
  }, [t.lines.length]);
  const bubble = (l: Line, i: number) => {
    const p = t[l.who], left = l.who === "a", tint = inkOf(p);
    const faint = p.role === "asks";                                  // THE SUBTLE LAYER: the asking voice in faint ink
    const play = (
      <YStack width={30} height={30} borderRadius={15} alignItems="center" justifyContent="center" cursor="pointer" backgroundColor="$color4"
              onPress={() => (voice.playing === key(i) ? voice.stop() : voice.play(key(i), l.said, p))} aria-label="Hear it again">
        <Text fontSize={12} color="$color11">{voice.playing === key(i) ? "■" : "▶"}</Text>
      </YStack>
    );
    return (
      <XStack key={i} justifyContent={left ? "flex-start" : "flex-end"} alignItems="flex-end" gap={6}>
        {left ? null : play}
        <YStack maxWidth="76%" paddingHorizontal={12} paddingVertical={8} borderRadius={16}
                borderBottomLeftRadius={left ? 4 : 16} borderBottomRightRadius={left ? 16 : 4}
                backgroundColor={tint ?? (left ? "$color4" : "$color6")}>
          <Text fontSize={15} lineHeight={20} color={tint ? "#fbfaf6" : "$color12"} opacity={faint ? 0.72 : 1} fontStyle={faint ? "italic" : "normal"}>{l.said}</Text>
        </YStack>
        {left ? play : null}
      </XStack>
    );
  };
  const nextInk = t.next ? inkOf(t[t.next]) ?? "#888" : "#888";
  return (
    <YStack gap={8} paddingTop={6}>
      <Facing t={t} speaking={speaking} />
      {t.written?.title ? <Small color="$color10">{stampOf(t.at)}</Small> : null}
      <YStack alignSelf="center" maxWidth="90%" paddingHorizontal={10} paddingVertical={5} borderRadius={8} borderWidth={1} borderColor="$color6">
        <Text fontSize={13} color="$color11" textAlign="center">{t.prompt}</Text>
      </YStack>
      {t.lines.map(bubble)}
      {t.status === "thinking" && t.next ? (
        <XStack justifyContent={t.next === "a" ? "flex-start" : "flex-end"}>
          <YStack borderRadius={16} backgroundColor="$color4"><Dots ink={nextInk} /></YStack>
        </XStack>
      ) : null}
      {t.error ? <Small color="$color9">{t.error}</Small> : null}
      {t.written ? (
        <YStack gap={4} paddingTop={6} borderTopWidth={1} borderColor="$color5">
          <Text fontSize={16} fontWeight="700" color="$color12">{t.written.title}</Text>
          {t.written.text.split(/\n\s*\n/).map((p, i) => <Text key={i} fontSize={14} lineHeight={20} color="$color12">{p}</Text>)}
          <Small color="$color10">{`Put together by ${t.written.by}`}</Small>
        </YStack>
      ) : t.integrating ? (
        <XStack alignItems="center" gap={6}><Dots ink="#7a5aa8" /><Small>The mind hub is putting the two halves together...</Small></XStack>
      ) : t.status !== "thinking" && t.lines.length ? (
        <Action label="INTEGRATE" ink={ink} onPress={onIntegrate} />
      ) : null}
    </YStack>
  );
}

// ---- the card: begin a talk, the open one, the history ----
export function DialogueCard({ mine, others, ink }: { mine: OutOne | null; others: OutOne[]; ink: string }) {
  const [mode, setMode] = useState<Mode>("standard");
  const [turns, setTurns] = useState(3);
  const [swap, setSwap] = useState(false);
  const [withId, setWith] = useState<string>("");
  const [prompt, setPrompt] = useState("");
  const [open, setOpen] = useState<Talk | null>(null);
  const [fresh, setFresh] = useState(false);
  const [list, setList] = useState<Brief[]>([]);
  const [error, setError] = useState("");
  const voice = useLineVoice();
  const other = others.find((o) => o.id === withId) ?? others[0] ?? null;

  const reloadList = async () => { try { setList((await apiLive<{ dialogues: Brief[] }>("/api/trade/talks", {})).dialogues); } catch { /* not joined yet */ } };
  useEffect(() => { reloadList(); }, []);
  useEffect(() => {                                                    // a talk being made, or put together: asked again
    if (!open || (open.status !== "thinking" && !open.integrating)) return;
    const t = setInterval(async () => {
      try {
        const n = await apiLive<Talk>("/api/trade/talk", { id: open.id });
        setOpen(n);
        if (n.status !== "thinking" && !n.integrating) reloadList();
      } catch { /* asked again */ }
    }, 1500);
    return () => clearInterval(t);
  }, [open?.id, open?.status, open?.integrating]);

  const begin = async () => {
    if (!other?.id) return;
    setError("");
    const t = await apiLive<Talk>("/api/trade/converse", { with: other.id, mode, turns, prompt, swap });
    setFresh(true); setOpen(t); setPrompt(""); reloadList();
  };
  const show = async (id: string) => {
    voice.stop(); setFresh(false);
    try { setOpen(await apiLive<Talk>("/api/trade/talk", { id })); } catch (e) { setError((e as Error).message); }
  };
  const integrate = async () => { if (open) { setOpen(await apiLive<Talk>("/api/trade/integrate", { id: open.id })); reloadList(); } };

  // who leans which way, or who tells, as the talk would begin (the server decides the same: dialogue.ts begin)
  const mineLabel = mine?.nickname ?? "YOURS", otherLabel = other?.nickname ?? "THEIRS";
  const sides = mode === "standard"
    ? [[mineLabel, swap ? "blue" : "red"], [otherLabel, swap ? "red" : "blue"]] as const
    : [[mineLabel, swap ? "tells" : "asks"], [otherLabel, swap ? "asks" : "tells"]] as const;
  const step = (by: number) => setTurns((n) => Math.max(MIN_TURNS, Math.min(MAX_TURNS, n + by)));
  const key = (label: string, onPress: () => void, off: boolean) => (
    <YStack width={40} height={40} borderRadius={20} alignItems="center" justifyContent="center" backgroundColor={off ? "$color3" : "$color9"}
            cursor={off ? "default" : "pointer"} onPress={off ? undefined : onPress} aria-label={label === "−" ? "Fewer turns" : "More turns"}>
      <Text fontFamily="$mono" fontSize={20} fontWeight="700" color={off ? "$color8" : ink}>{label}</Text>
    </YStack>
  );

  return (
    <YStack gap={8} paddingTop={10} borderTopWidth={1} borderColor="$color5">
      <Eyebrow>IN DIALOGUE</Eyebrow>
      {!mine || !others.length ? (
        <Small>{!mine ? "Send one of yours out, and it can talk with another player's daemon that is out." : "When another player's daemon is out, yours can talk with it."}</Small>
      ) : (
        <YStack gap={8}>
          {others.length > 1 ? (
            <XStack flexWrap="wrap" gap={6}>
              {others.map((o) => (
                <YStack key={o.id} paddingHorizontal={10} paddingVertical={5} borderRadius={12} cursor="pointer" onPress={() => setWith(o.id!)}
                        backgroundColor={o.id === other?.id ? "$color9" : "$color3"}>
                  <Text fontSize={13} color={o.id === other?.id ? ink : "$color12"}>{`with ${o.nickname}`}</Text>
                </YStack>
              ))}
            </XStack>
          ) : <Small>{`${mineLabel} and ${otherLabel} can talk.`}</Small>}
          <Segments value={mode} onChange={setMode} options={[["standard", "STANDARD"], ["twovoices", "TWO VOICES"]]} />
          <Small color="$color10">{mode === "standard" ? "One leans logical, working up from the details; the other creative, taking in the whole at once."
                                                        : "One tells. The other only asks: a question, a clarifying question, or what it heard said back."}</Small>
          <XStack alignItems="center" gap={12} flexWrap="wrap" rowGap={8}>
            {key("−", () => step(-1), turns <= MIN_TURNS)}
            <YStack alignItems="center" minWidth={70}>
              <Text fontFamily="$mono" fontSize={26} fontWeight="700" color="$color12">{turns}</Text>
              <Text fontFamily="$mono" fontSize={10} letterSpacing={1} color="$color10">{turns === 1 ? "TURN EACH" : "TURNS EACH"}</Text>
            </YStack>
            {key("+", () => step(1), turns >= MAX_TURNS)}
            <YStack marginLeft="auto" paddingHorizontal={10} paddingVertical={6} borderRadius={8} borderWidth={1} borderColor="$color6" cursor="pointer" onPress={() => setSwap((s) => !s)}>
              {sides.map(([who, how]) => (
                <XStack key={who} alignItems="center" gap={5}>
                  {how === "red" || how === "blue" ? <YStack width={8} height={8} borderRadius={4} backgroundColor={how === "red" ? RED : BLUE} /> : null}
                  <Text fontSize={12} color="$color12">{`${who} ${how === "red" || how === "blue" ? LEAN_WORD[how] : how}`}</Text>
                </XStack>
              ))}
              <Text fontFamily="$mono" fontSize={10} color="$color10">⇄ SWAP</Text>
            </YStack>
          </XStack>
          <Entry value={prompt} onChange={setPrompt} onSubmit={() => { if (prompt.trim()) begin().catch((e) => setError((e as Error).message)); }}
                 placeholder={mode === "standard" ? "What should they talk about?" : "What should be asked?"} limit={PROMPT_MOST} />
          {prompt.trim() ? <Action label="BEGIN" ink={ink} onPress={begin} /> : null}
          <Small color="$color10">The other player sees this talk and what you type.</Small>
        </YStack>
      )}
      {error ? <Small color="$color9">{error}</Small> : null}
      {open ? <TalkView key={open.id} t={open} ink={ink} voice={voice} onIntegrate={integrate} fresh={fresh} /> : null}
      {list.length ? (
        <YStack gap={2} paddingTop={6}>
          <Small color="$color10">PAST TALKS</Small>
          {byWeek(list).map((w) => (
            <YStack key={w.key} gap={2}>
              <Text fontFamily="$mono" fontSize={10} letterSpacing={1} color="$color10" paddingTop={6}>{w.label.toUpperCase()}</Text>
              {w.items.map((d) => (
                <XStack key={d.id} gap={8} alignItems="center" paddingVertical={6} cursor="pointer" onPress={() => show(d.id)}
                        backgroundColor={open?.id === d.id ? "$color3" : "transparent"} borderRadius={6} paddingHorizontal={4}>
                  <YStack width={10} height={10} borderRadius={5} backgroundColor={dayColour(d.at)} aria-label={dayName(d.at)} />
                  <YStack flex={1}>
                    <Text fontSize={14} color="$color12" numberOfLines={1}>{d.title ?? stampOf(d.at)}</Text>
                    <Small>{`${d.a.nickname} & ${d.b.nickname} · ${d.mode === "twovoices" ? "two voices" : "standard"} · ${d.turns} each${d.status === "thinking" ? " · talking now" : d.integrating ? " · being put together" : ""}`}</Small>
                  </YStack>
                </XStack>
              ))}
            </YStack>
          ))}
        </YStack>
      ) : null}
      <Small color="$color8">DRAFT</Small>
    </YStack>
  );
}
