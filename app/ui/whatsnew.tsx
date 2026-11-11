// C-318 (the user, 2026-11-10: "if the whats new dialog has not been opened that button will say WHAT'S NEW, that will
// open a dialog, with the current version selected and a scrollable panel with stylized (headers/text) detailing what is
// new in this build version, if you tap the version you can select previous versions ... if u have selected a previous
// version, there should be a button to produce a tag entry which represents a span ... fed to the local ai network ...
// it would show something entertaining on screen (and should be async if u ended up not waiting), when results come in
// an entry would be added"): WHAT'S NEW.
//   - the header's ? HOW TO PLAY reads ✦ WHAT'S NEW until this build's notes are opened (and again when a span the mind
//     was telling comes in unread)
//   - the build tapped opens the TIMELINE: every build as a bead on one line, newest first, and the spans the mind has told
//     as tags above it; a bead tapped shows that build
//   - with an older build shown, ✦ TELL ME asks the hub's mind for the span from it to now; ⟷ ANY SPAN picks both ends
//   - while it thinks, the daemons' signs dance and the house mutters; the dialog may be closed, and the tag lands anyway
// Notes from server/data/whatsnew.json (server/tools/whatsnew.py); spans from the hub (server/src/whatsnew.ts), each a
// task in THE MIND AT WORK. Every word DRAFT.
import { useEffect, useMemo, useRef, useState } from "react";
import { ScrollView } from "react-native";
import { Text, XStack, YStack } from "tamagui";
import { NOTES, type BuildNotes, type Digest } from "../../server/src/whatsnew";
import { api } from "../platform/net";
import { deviceName, whoAmI } from "../state/me";   // C-319
import { placeOf, setPlace } from "../state/place";
import { openHowTo } from "./howto";

// a chronicle's colours: night paper, a lamp's gold, pale words
const PAPER = "#141a2a", EDGE = "#d9a74a", INNER = "#3a4466", WORD = "#eef1f8", SOFT = "#9aa6c4", TOLD = "#7fd1c7";
const SIGNS = ["✦", "◇", "☾", "❀", "§", "♪", "δ", "▣", "☀", "◐"];
const MUTTERS = [                                                                 // DRAFT
  "Reading every build's notes, oldest first…", "Asking the Tiiny what a widget is…", "Untangling the commit messages…",
  "Counting the voices that got faster…", "Teaching the daemons to summarise…", "Looking for the one that broke the Mac…",
  "Sorting the patch notes by mood…", "Pretending it was all planned…", "Finding a title worthy of it…",
];

// ---- seen, and the spans told -------------------------------------------------------------------------------------
const heard = new Set<() => void>();
const ping = () => heard.forEach((f) => f());
let open = false;
let told: Digest[] = [];
let toldUnread = placeOf<string[]>("whatsnew.unread", []);
export function openWhatsNew() { open = true; setPlace("whatsnew.seen", NOTES.latest); ping(); }
export function closeWhatsNew() { open = false; ping(); }
const useTick = () => { const [, set] = useState(0); useEffect(() => { const f = () => set((n) => n + 1); heard.add(f); return () => { heard.delete(f); }; }, []); };
// the header's button: WHAT'S NEW while this build's notes are unread, or a span came in unread
export function useWhatsNewDue(): boolean {
  useTick();
  return placeOf<number>("whatsnew.seen", 0) < NOTES.latest || toldUnread.length > 0;
}

let polling: ReturnType<typeof setInterval> | null = null;
async function readTold() {
  try {
    const r = await api<{ digests: Digest[] }>("/api/whatsnew/digests");
    const was = new Map(told.map((d) => [d.id, d.state]));
    told = r.digests ?? [];
    // a span that finished while the dialog was shut is unread
    const landed = told.filter((d) => d.state !== "thinking" && was.get(d.id) === "thinking" && !open).map((d) => d.id);
    if (landed.length) { toldUnread = [...new Set([...toldUnread, ...landed])]; setPlace("whatsnew.unread", toldUnread); }
    ping();
    if (!told.some((d) => d.state === "thinking") && polling) { clearInterval(polling); polling = null; }
  } catch { /* the hub away: what was known stays */ }
}
const pollWhileThinking = () => { if (!polling) polling = setInterval(readTold, 4000); };
const seenTold = (id: string) => { if (toldUnread.includes(id)) { toldUnread = toldUnread.filter((x) => x !== id); setPlace("whatsnew.unread", toldUnread); ping(); } };

// ---- the words ----------------------------------------------------------------------------------------------------
const dayOf = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString([], { day: "numeric", month: "short" });
function Heading({ children, big }: { children: string; big?: boolean }) {
  return (
    <XStack gap={8} alignItems="center" marginTop={big ? 0 : 14} marginBottom={4}>
      <YStack width={3} alignSelf="stretch" backgroundColor={EDGE} borderRadius={2} />
      <Text flex={1} fontFamily="$mono" fontSize={big ? 15 : 12} letterSpacing={big ? 1.5 : 1} fontWeight="700" color={big ? EDGE : WORD}>{children}</Text>
    </XStack>
  );
}
const Line = ({ children }: { children: string }) => (
  <XStack gap={8} paddingLeft={11} marginTop={3}>
    <Text fontSize={13} lineHeight={19} color={EDGE}>·</Text>
    <Text flex={1} fontSize={13} lineHeight={19} color={WORD}>{children}</Text>
  </XStack>
);
function BuildPage({ b }: { b: BuildNotes }) {
  return (
    <YStack>
      {b.sections.map((s, i) => (
        <YStack key={i}>
          <Heading>{s.title.replace(/\s*\(.*$/, "").toUpperCase()}</Heading>
          {s.lines.map((l, j) => <Line key={j}>{l}</Line>)}
        </YStack>
      ))}
    </YStack>
  );
}
function ToldPage({ d }: { d: Digest }) {
  if (d.state === "thinking") return <Thinking d={d} />;
  if (d.state === "failed") return <Text fontSize={13} color={SOFT}>{`The mind could not tell this span: ${d.error ?? "it failed"}.`}</Text>;   // DRAFT
  const parts = (d.text ?? "").split("\n");
  return (
    <YStack>
      <Text fontSize={11} color={SOFT} marginBottom={6}>{`builds ${d.from}–${d.to}, told by ${d.mind ?? "the house's mind"} for ${d.by}`}</Text>
      {parts.map((p, i) => /^#{2,}\s+/.test(p) ? <Heading key={i}>{p.replace(/^#+\s+/, "").replace(/\*+/g, "").toUpperCase()}</Heading>
        : /^\s*[-*•]\s+/.test(p) ? <Line key={i}>{p.replace(/^\s*[-*•]\s+/, "").replace(/\*+/g, "")}</Line>
        : p.trim() ? <Text key={i} fontSize={13} lineHeight={19} color={WORD} marginTop={4}>{p.replace(/\*+/g, "")}</Text> : null)}
    </YStack>
  );
}
// while the mind thinks: the daemons' signs dancing on a wave, and the house muttering
function Thinking({ d }: { d: Digest }) {
  const [t, setT] = useState(0);
  useEffect(() => { const id = setInterval(() => setT((n) => n + 1), 120); return () => clearInterval(id); }, []);
  const secs = Math.max(0, Math.round((Date.now() - Date.parse(d.at)) / 1000));
  return (
    <YStack alignItems="center" paddingVertical={18} gap={14}>
      <XStack height={46} alignItems="center" gap={6}>
        {SIGNS.map((s, i) => (
          <Text key={i} fontSize={18} color={i % 3 === 0 ? TOLD : i % 3 === 1 ? EDGE : WORD}
                style={{ transform: [{ translateY: Math.sin(t / 3 + i * 0.7) * 12 }, { rotate: `${Math.sin(t / 5 + i) * 20}deg` }] }}
                opacity={0.45 + 0.55 * Math.abs(Math.sin(t / 6 + i / 2))}>{s}</Text>
        ))}
      </XStack>
      <Text fontFamily="$mono" fontSize={12} color={WORD} textAlign="center">{MUTTERS[Math.floor(t / 22) % MUTTERS.length]}</Text>
      <Text fontSize={11} color={SOFT} textAlign="center">
        {`${d.mind ?? "The house's mind"} is telling builds ${d.from}–${d.to} · ${secs}s\nClose this if you like: the tag will be here when it lands.`}
      </Text>
    </YStack>
  );
}

function Key({ label, onPress, lit, hint }: { label: string; onPress: () => void; lit?: boolean; hint?: string }) {
  return (
    <YStack role="button" cursor="pointer" aria-label={hint ?? label} onPress={onPress} paddingHorizontal={10} paddingVertical={6}
            borderRadius={4} borderWidth={1} borderColor={lit ? EDGE : INNER} backgroundColor={lit ? "rgba(217,167,74,0.18)" : "transparent"}>
      <Text fontFamily="$mono" fontSize={11} letterSpacing={1} color={lit ? EDGE : WORD}>{label}</Text>
    </YStack>
  );
}

// ---- the timeline -------------------------------------------------------------------------------------------------
// every build a bead on one line, newest at the left; a span drawn as the line lit between its ends; the told spans as
// tags above, each over the beads it covers
function Timeline({ at, span, onBead, onTag }: { at: number | string; span: [number, number] | null;
                                                 onBead: (b: number) => void; onTag: (d: Digest) => void }) {
  const W = 58, builds = NOTES.builds;
  const x = (n: number) => { const i = builds.findIndex((b) => b.build === n); return i < 0 ? 0 : i * W + W / 2; };
  const lit = (n: number) => !!span && n >= Math.min(...span) && n <= Math.max(...span);
  const scroller = useRef<ScrollView>(null);
  useEffect(() => { if (typeof at === "number") scroller.current?.scrollTo({ x: Math.max(0, x(at) - 120), animated: true }); }, []);
  const rows: Digest[][] = [];                                    // the tags packed into rows that do not overlap
  for (const d of told) {
    const [a, b] = [x(d.to) - W / 2 + 3, x(d.from) + W / 2 - 3];
    const row = rows.find((r) => r.every((o) => x(o.from) + W / 2 < a || x(o.to) - W / 2 > b));
    row ? row.push(d) : rows.push([d]);
  }
  return (
    <ScrollView ref={scroller} horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
      <YStack width={builds.length * W} paddingBottom={4}>
        {rows.map((r, ri) => (
          <YStack key={ri} height={24} marginBottom={3} position="relative">
            {r.map((d) => (
              <XStack key={d.id} position="absolute" left={x(d.to) - W / 2 + 3} width={x(d.from) - x(d.to) + W - 6} height={22}
                      borderRadius={11} borderWidth={1} borderColor={TOLD} alignItems="center" justifyContent="center" paddingHorizontal={6}
                      backgroundColor={at === d.id ? "rgba(127,209,199,0.32)" : "rgba(127,209,199,0.10)"} role="button" cursor="pointer"
                      aria-label={`the span ${d.from} to ${d.to}`} onPress={() => onTag(d)}>
                <Text fontFamily="$mono" fontSize={10} color={TOLD} numberOfLines={1}>
                  {`${d.state === "thinking" ? "…" : d.state === "failed" ? "✕" : toldUnread.includes(d.id) ? "● ✦" : "✦"} ${d.title ?? `${d.from}–${d.to}`}`}
                </Text>
              </XStack>
            ))}
          </YStack>
        ))}
        <YStack position="relative">
        <YStack height={2} backgroundColor={INNER} position="absolute" left={W / 2} right={W / 2} top={7} />
        {span ? <YStack height={4} backgroundColor={EDGE} borderRadius={2} position="absolute"
                        left={x(Math.max(...span))} width={x(Math.min(...span)) - x(Math.max(...span))} top={6} /> : null}
        <XStack>
          {builds.map((b) => (
            <YStack key={b.build} width={W} alignItems="center" gap={3} role="button" cursor="pointer" aria-label={`build ${b.build}`}
                    onPress={() => onBead(b.build)}>
              <YStack width={at === b.build ? 16 : 11} height={at === b.build ? 16 : 11} marginTop={at === b.build ? 0 : 2.5} marginBottom={at === b.build ? 0 : 2.5}
                      borderRadius={8} borderWidth={2} borderColor={at === b.build || lit(b.build) ? EDGE : SOFT}
                      backgroundColor={at === b.build ? EDGE : lit(b.build) ? "rgba(217,167,74,0.5)" : PAPER} />
              <Text fontFamily="$mono" fontSize={11} fontWeight={at === b.build ? "700" : "400"} color={at === b.build ? EDGE : WORD}>{b.build}</Text>
              <Text fontSize={9} color={SOFT}>{dayOf(b.date)}</Text>
            </YStack>
          ))}
        </XStack>
        </YStack>
      </YStack>
    </ScrollView>
  );
}

// ---- the dialog ---------------------------------------------------------------------------------------------------
export function WhatsNewOverlay() {
  useTick();
  const [at, setAt] = useState<number | string>(NOTES.latest);      // a build, or a told span's id
  const [rail, setRail] = useState(false);
  const [any, setAny] = useState<number[] | null>(null);            // ⟷ ANY SPAN: the ends picked so far
  const [note, setNote] = useState("");
  useEffect(() => { if (open) { readTold().then(() => { if (told.some((d) => d.state === "thinking")) pollWhileThinking(); }); } }, [open]);
  const build = typeof at === "number" ? NOTES.builds.find((b) => b.build === at) ?? null : null;
  const digest = typeof at === "string" ? told.find((d) => d.id === at) ?? null : null;
  useEffect(() => { if (digest && digest.state !== "thinking") seenTold(digest.id); }, [digest?.id, digest?.state]);
  const span: [number, number] | null = useMemo(() => any?.length === 2 ? [any[0], any[1]] : any?.length === 1 ? [any[0], any[0]]
    : build && build.build !== NOTES.latest ? [build.build, NOTES.latest] : digest ? [digest.from, digest.to] : null, [any, build, digest]);
  if (!open) return null;

  const pickBead = (n: number) => {
    if (any) { const next = any.length >= 2 ? [n] : [...any, n]; setAny(next); return; }
    setAt(n);
  };
  const ask = async (from: number, to: number) => {
    if (from === to) { setNote("A span needs two different builds."); return; }   // DRAFT
    setNote("");
    try {
      const r = await api<{ digest: Digest }>("/api/whatsnew/digest", { from, to, user: await whoAmI(), device: deviceName() });
      told = [r.digest, ...told.filter((d) => d.id !== r.digest.id)];
      setAt(r.digest.id); setAny(null); setRail(true);
      pollWhileThinking(); ping();
    } catch (e) { setNote(`The hub could not be asked: ${(e as Error).message}`); }   // DRAFT
  };
  const label = digest ? (digest.title ?? `${digest.from}–${digest.to}`) : build ? `BUILD ${build.build}` : "";
  const sub = digest ? `a span told · ${new Date(digest.at).toLocaleDateString([], { day: "numeric", month: "short" })}`
    : build ? `${dayOf(build.date)}${build.build === NOTES.latest ? " · this build" : ""}` : "";
  const older = build && build.build !== NOTES.latest;
  return (
    <YStack position="absolute" top={0} left={0} right={0} bottom={0} zIndex={950} alignItems="center" justifyContent="center"
            padding={14} backgroundColor="rgba(6,8,14,0.66)" onPress={closeWhatsNew} role="dialog" aria-label="what's new">
      <YStack borderWidth={2} borderColor={EDGE} borderRadius={10} backgroundColor={PAPER} padding={3} maxWidth={560} width="100%"
              maxHeight="92%" onPress={(e: any) => e?.stopPropagation?.()}>
        <YStack borderWidth={1} borderColor={INNER} borderRadius={8} paddingHorizontal={16} paddingTop={14} paddingBottom={12} flexShrink={1}>
          <XStack alignItems="center" gap={8}>
            <Text flex={1} fontFamily="$mono" fontSize={11} letterSpacing={3} color={SOFT}>✦ WHAT'S NEW</Text>
            <Key label="✕" hint="close" onPress={closeWhatsNew} />
          </XStack>
          {/* the version: tapped, the timeline */}
          <XStack marginTop={6} alignItems="flex-end" gap={10} role="button" cursor="pointer" aria-label="pick a version"
                  onPress={() => { setRail(!rail); if (rail) setAny(null); }}>
            <YStack flex={1}>
              <Text fontSize={digest ? 19 : 24} lineHeight={digest ? 24 : 28} fontWeight="700" color={digest ? TOLD : WORD} numberOfLines={2}>{label}</Text>
              <Text fontSize={11} color={SOFT}>{sub}</Text>
            </YStack>
            <Text fontFamily="$mono" fontSize={11} color={EDGE} paddingBottom={2}>{rail ? "▴ VERSIONS" : "▾ VERSIONS"}</Text>
          </XStack>
          {rail ? (
            <YStack>
              <Timeline at={at} span={span} onBead={pickBead} onTag={(d) => { setAny(null); setAt(d.id); }} />
              <XStack gap={8} flexWrap="wrap" marginTop={6} alignItems="center">
                <Key label={any ? "⟷ PICKING A SPAN" : "⟷ ANY SPAN"} lit={!!any} onPress={() => setAny(any ? null : [])} />
                {any ? <Text fontSize={11} color={SOFT} flex={1} minWidth={140}>
                  {any.length === 0 ? "Tap one end of the span." : any.length === 1 ? `From ${any[0]}… tap the other end.` : `${Math.min(...any)}–${Math.max(...any)}`}
                </Text> : null}
                {any?.length === 2 ? <Key label={`✦ TELL ME ${Math.min(...any)}–${Math.max(...any)}`} lit onPress={() => ask(any[0], any[1])} /> : null}
              </XStack>
            </YStack>
          ) : null}
          {older && !any ? (
            <XStack marginTop={10} padding={10} borderRadius={6} borderWidth={1} borderColor={TOLD} gap={10} alignItems="center"
                    backgroundColor="rgba(127,209,199,0.08)">
              <Text flex={1} fontSize={12} lineHeight={17} color={WORD}>{`Everything from ${build!.build} to now, told as one story by the house's mind.`}</Text>
              <Key label={`✦ TELL ME ${build!.build}–${NOTES.latest}`} lit onPress={() => ask(build!.build, NOTES.latest)} />
            </XStack>
          ) : null}
          {note ? <Text fontSize={11} color={EDGE} marginTop={6}>{note}</Text> : null}
          <YStack height={1} backgroundColor={INNER} marginVertical={10} />
          <ScrollView style={{ flexGrow: 0, flexShrink: 1 }} contentContainerStyle={{ paddingBottom: 6 }}>
            {digest ? <ToldPage d={digest} /> : build ? <BuildPage b={build} /> : null}
          </ScrollView>
          <XStack marginTop={10} gap={8} alignItems="center">
            <Key label="? HOW TO PLAY" onPress={() => { closeWhatsNew(); openHowTo(); }} />
            <YStack flex={1} />
            {digest && digest.state !== "thinking" ? <Key label="FORGET THIS SPAN" onPress={async () => {
              try { await api("/api/whatsnew/digest", { forget: digest.id }); } catch { /* it stays */ }
              told = told.filter((d) => d.id !== digest.id); setAt(NOTES.latest); ping();
            }} /> : null}
            <Text fontSize={9} color={SOFT}>DRAFT</Text>
          </XStack>
        </YStack>
      </YStack>
    </YStack>
  );
}
