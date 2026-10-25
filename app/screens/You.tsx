// YOU -- the trainer card, MARKS and ROOTS, the region maps, GROVES, GAME EVENTS. (C-157: out of App.tsx.)
import { useMemo, useState } from "react";
import { Image, View } from "react-native";
import { Text, XStack, YStack } from "tamagui";
import { GROVES, lessonParas, MARK_ART, MARKS, onNight, PLAYER_ART, REGIONS, rgbOf, rootOfMark } from "../data";
import { useDark } from "../look";
import { Profile, Progress, RegionsData, Wis } from "../types";
import { Card, Eyebrow, Fact, Panel, Para, Points, Quote, Small, SubHead } from "../ui";
import { useApi } from "../useApi";
 // C-144: the badges are drawn for the paper -- in the dark each sits on a chip of it
export function Badge({ n, size }: { n: number; size: number }) {
  const dark = useDark();
  return (
    <YStack padding={dark ? 2 : 0} borderRadius={4} backgroundColor={dark ? "#ece9df" : "transparent"}>
      <Image source={MARK_ART[n]} style={{ width: size, height: size }} resizeMode="contain" />
    </YStack>
  );
}

export function MarkPage({ n, w }: { n: number; w?: Wis }) {
  const m = MARKS.marks[n];
  const paras = lessonParas(m.lesson, m.title);
  const r = rootOfMark(n), root = r >= 0 ? MARKS.understandings[r] : null;
  return (
    <Panel>
      <XStack gap={10} alignItems="center">
        <Badge n={n} size={20} />
        <Text fontFamily="$mono" fontSize={17} fontWeight="800" letterSpacing={1} color="$color12">{m.title.toUpperCase()}</Text>
      </XStack>
      {paras.length ? <Para lead>{paras[0]}</Para> : null}
      {paras.length > 1 ? <Points lines={paras.slice(1)} /> : null}
      <Small color="$color10">{`From the BENCHMARK in ${m.found}.`}</Small>
      {m.wisdom && w ? (
        <YStack gap={6}>
          <SubHead>{w.root && root ? `${m.wisdom.leader}, WITH ${root.name}` : `${m.wisdom.leader}, AFTERWARDS`}</SubHead>
          <Para>{(w.root ? m.wisdom.with : m.wisdom.without).join(" ")}</Para>
          {w.given ? (
            <>
              <SubHead>UNION PLUGIN</SubHead>
              <Text fontFamily="$mono" fontSize={14} fontWeight="700" color="$color12">{`${m.wisdom.union_plugin} · ${m.wisdom.union_routine}`}</Text>
              <Points lines={m.wisdom.explain} />
            </>
          ) : null}
          {w.insight ? (
            <>
              <SubHead>{`INSIGHT · ${m.wisdom.virtue}`}</SubHead>
              <Quote>{m.wisdom.insight}</Quote>
            </>
          ) : null}
        </YStack>
      ) : null}
    </Panel>
  );
}

export function RootPage({ i, marks, wisdom }: { i: number; marks: boolean[]; wisdom?: Wis[] }) {
  const u = MARKS.understandings[i];
  // T-405: read as a MARK's lesson is (C-140) -- its own name dropped, the heading says it; the first box leading, the rest as points
  const paras = lessonParas(u.lesson, u.name);
  const n = MARKS.marks.findIndex((_, k) => rootOfMark(k) === i);
  const m = n >= 0 ? MARKS.marks[n] : null;
  const dark = useDark();
  return (
    <Panel>
      <Text fontFamily="$mono" fontSize={17} fontWeight="800" letterSpacing={1} color={rgbOf(dark ? onNight(u.rgb) : u.rgb)}>{u.name}</Text>
      {paras.length ? <Para lead>{paras[0]}</Para> : <Text fontSize={15} lineHeight={22} fontStyle="italic" color="$color10">Its lesson is still being written.</Text>}
      {paras.length > 1 ? <Points lines={paras.slice(1)} /> : null}
      {m && marks[n] ? (
        <YStack gap={6}>
          <SubHead>PAIRED WITH</SubHead>
          <XStack gap={8} alignItems="center">
            <Badge n={n} size={18} />
            <Text fontFamily="$mono" fontSize={14} fontWeight="700" color="$color12">{m.title.toUpperCase()}</Text>
          </XStack>
          {wisdom?.[n]?.insight && m.wisdom ? (
            <>
              <SubHead>{`INSIGHT · ${m.wisdom.virtue}`}</SubHead>
              <Quote>{m.wisdom.insight}</Quote>
            </>
          ) : null}
        </YStack>
      ) : null}
    </Panel>
  );
}

export function MarksRow({ held, wisdom }: { held: boolean[]; wisdom?: Wis[] }) {
  const [at, setAt] = useState<number | null>(null);
  const dark = useDark();
  return (
    <YStack paddingVertical={8} gap={8}>
      <XStack justifyContent="space-between"><Eyebrow>MARKS</Eyebrow><Text fontSize={16} color="$color12">{held.filter(Boolean).length} of 8</Text></XStack>
      <XStack gap={2} flexWrap="wrap">
        {held.map((h, i) => (
          <YStack key={i} onPress={() => setAt(at === i ? null : i)} cursor="pointer" padding={3} borderRadius={4}
                  borderWidth={2} borderColor={at === i ? "$color9" : "transparent"} aria-label={`MARK ${i + 1}${h ? ", earned" : ""}`}
                  backgroundColor={dark ? "#ece9df" : "transparent"}>
            <Image source={MARK_ART[i]} style={{ width: 28, height: 28, opacity: h ? 1 : 0.18 }} resizeMode="contain" />
          </YStack>
        ))}
      </XStack>
      {at === null ? null : held[at] ? <MarkPage n={at} w={wisdom?.[at]} />
        : <Panel><Text fontSize={15} color="$color10">{`MARK ${at + 1} -- not yet earned.`}</Text></Panel>}
    </YStack>
  );
}

export function RootsRow({ held, marks, wisdom }: { held: boolean[]; marks: boolean[]; wisdom?: Wis[] }) {
  const [at, setAt] = useState<number | null>(null);
  return (
    <YStack paddingVertical={8} gap={8}>
      {/* the USER card's ROOTS -- each in its own colour, lit, never counted */}
      <Eyebrow>ROOTS</Eyebrow>
      <XStack gap={10}>
        {held.map((r, i) => {
          const c = rgbOf(MARKS.understandings[i]?.rgb ?? [90, 107, 140]);
          return <YStack key={i} onPress={() => setAt(at === i ? null : i)} cursor="pointer" width={22} height={22} borderRadius={11}
                         borderWidth={2} borderColor={c} opacity={r ? 1 : 0.35} backgroundColor={r ? c : "transparent"}
                         outlineWidth={at === i ? 2 : 0} outlineColor="$color12" outlineStyle="solid" />;
        })}
      </XStack>
      {at === null ? null : held[at] ? <RootPage i={at} marks={marks} wisdom={wisdom} />
        : <Panel><Text fontSize={15} color="$color10">Not yet.</Text></Panel>}
    </YStack>
  );
}

export function RegionMap({ region, visited, open, cell }: { region: RegionsData["regions"][number]; visited: Set<string>; open: boolean; cell: number }) {
  const [litCell, unlitCell] = useDark() ? ["#5a82ad", "#454c47"] : ["#43658B", "#C9D2C4"];   // C-144: the night's pair
  const lit = useMemo(() => {
    const on = new Set<string>();
    if (!open) return on;
    for (const [m, sec] of Object.entries(region.sections)) if (sec.visited_flag != null && visited.has(m)) on.add(m);
    for (const map of region.maps) map.grid.forEach((row, y) => row.forEach((m, x) => {
      if (m === "MAPSEC_NONE" || on.has(m) || region.sections[m]?.visited_flag != null) return;
      const near = [[0, 1], [1, 0], [0, -1], [-1, 0]].some(([dx, dy]) => { const n = map.grid[y + dy]?.[x + dx]; return n && on.has(n) && region.sections[n]?.visited_flag != null; });
      if (near) on.add(m);
    }));
    return on;
  }, [region, visited, open]);
  return (
    <YStack gap={3} alignItems="center">
      <XStack gap={4}>
        {region.maps.map((map, k) => {
          // cropped to the cells the region map uses -- the islands sit in mostly empty grids
          const used = map.grid.flatMap((row, y) => row.map((m, x) => (m === "MAPSEC_NONE" ? null : [x, y]))).filter(Boolean) as number[][];
          const x0 = Math.min(...used.map((c) => c[0])), y0 = Math.min(...used.map((c) => c[1]));
          const w = Math.max(...used.map((c) => c[0])) - x0 + 1, h = Math.max(...used.map((c) => c[1])) - y0 + 1;
          return (
            <View key={k} style={{ width: w * cell, height: h * cell }}>
              {used.map(([x, y]) => {
                const m = map.grid[y][x];
                return <View key={`${x}-${y}`} style={{ position: "absolute", left: (x - x0) * cell, top: (y - y0) * cell, width: cell - 0.5,
                                                         height: cell - 0.5, backgroundColor: lit.has(m) ? litCell : unlitCell }} />;
              })}
            </View>
          );
        })}
      </XStack>
      <Text fontFamily="$mono" fontSize={10} letterSpacing={1} color="$color10">{open ? region.name : "???"}</Text>
    </YStack>
  );
}
export function GrovesCard({ found }: { found: string[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const mine = GROVES.groves.filter((g) => found.includes(g.grove));
  if (!mine.length) return null;
  return (
    <Card>
      <Eyebrow>GROVES</Eyebrow>
      <Small>{`Beyond them all, ${GROVES.nexus}.`}</Small>
      {mine.map((g) => (
        <YStack key={g.grove} borderTopWidth={1} borderColor="$color5" paddingVertical={8} gap={4}>
          <XStack onPress={() => setOpen(open === g.grove ? null : g.grove)} justifyContent="space-between" cursor="pointer">
            <Text fontFamily="$mono" fontSize={15} fontWeight="700" letterSpacing={1} color="$color12">{g.universe}</Text>
            <Text fontSize={18} color="$color10">{open === g.grove ? "−" : "+"}</Text>
          </XStack>
          {open === g.grove ? (
            <YStack gap={4}>
              <Text fontSize={15} lineHeight={22} fontStyle="italic" color="$color12">{g.sign.replace(/\n/g, " ")}</Text>
              {g.family.length ? <Small>{`Lives here: ${g.family.join(", ")}`}</Small> : null}
            </YStack>
          ) : null}
        </YStack>
      ))}
    </Card>
  );
}

export function EventsCard() {
  const [pr] = useApi<Progress>("/api/progress");
  const [open, setOpen] = useState(false);
  if (!pr) return null;
  const sections = [...new Set(pr.events.map((e) => e.section))];
  return (
    <Card>
      <XStack onPress={() => setOpen((o) => !o)} justifyContent="space-between" alignItems="center" cursor="pointer">
        <Eyebrow>GAME EVENTS</Eyebrow>
        <Text fontSize={18} color="$color10">{open ? "−" : "+"}</Text>
      </XStack>
      {open ? sections.map((sec) => {
        const rows = pr.events.filter((e) => e.section === sec);
        return (
          <YStack key={sec} marginTop={10} gap={4}>
            <Text fontFamily="$mono" fontSize={12} letterSpacing={2} color="$color10">{sec}</Text>
            {rows.map((e) => (
              <XStack key={e.n} gap={8} alignItems="center">
                <Text fontFamily="$mono" fontSize={14} color={e.held ? "$color9" : "$color8"}>{e.held ? "+" : e.held === null ? "?" : "·"}</Text>
                <Text fontSize={15} color={e.held ? "$color12" : "$color8"}>{e.held || e.held === null ? e.name : "Still to come."}</Text>
              </XStack>
            ))}
          </YStack>
        );
      }) : null}
    </Card>
  );
}

export function ProfileScreen() {
  const [p, , error] = useApi<Profile>("/api/profile");
  if (error) return <Small>{error}</Small>;
  if (!p) return <Small>Reading your save…</Small>;
  const id = String(p.trainerId).padStart(5, "0");
  return (
    <YStack gap={14}>
      <Card borderLeftWidth={6} borderLeftColor="$color9" paddingVertical={20}>
        <XStack gap={14} alignItems="flex-end" flexWrap="wrap">   {/* C-127: on a narrow phone the maps go under the sprites */}
          {/* C-125: as the trainer card draws them, and as they walk */}
          <Image source={PLAYER_ART[p.choice ?? "REASON"].card} style={{ width: 128, height: 128 }} resizeMode="contain"
                 accessibilityLabel={`${p.name}, as the trainer card draws them`} />
          <Image source={PLAYER_ART[p.choice ?? "REASON"].walk} style={{ width: 32, height: 64 }} resizeMode="contain"
                 accessibilityLabel="walking" />
          {/* C-127: the two regions, filling in as they are explored */}
          <YStack gap={8} marginLeft="auto" alignItems="flex-end">
            {REGIONS.regions.map((r) => <RegionMap key={r.key} region={r} visited={new Set(p.visited ?? [])}
                                                  open={r.hidden_until !== "game_clear" || p.gameClear} cell={r.maps.length > 1 ? 3 : 5} />)}
          </YStack>
        </XStack>
        <Eyebrow>{p.edition} · ID No. {id}</Eyebrow>
        <Text fontFamily="$mono" fontSize={28} fontWeight="700" letterSpacing={2} color="$color12">{p.name}</Text>
        {p.choice ? <Small>{p.choice}{p.rival ? ` · rival ${p.rival}` : ""}</Small> : null}
        <Small>{p.savedIn?.place ? `Last saved in ${p.savedIn.place}` : "Last saved somewhere the map does not name"}</Small>
        <Small color={p.thisGame === false ? "$color10" : undefined}>
          {p.thisGame === null ? "Not yet synced: the first save you SYNC becomes your companion's game."
            : p.thisGame ? "Your companion's game." : `A different game: your companion hosts daemons from ${p.marriedTo}'s.`}
        </Small>
      </Card>
      <Card>
        <Fact label="PLAY TIME">{p.playTime.hours}:{String(p.playTime.minutes).padStart(2, "0")}</Fact>
        {p.money !== undefined ? <Fact label="MONEY">{p.money.toLocaleString()}</Fact> : null}
        {/* C-149: the CASINO plays with the save's money; what it won or lost reaches the save at the next SYNC (DRAFT) */}
        {p.casino?.table?.length ? (   /* C-151: the boards at the reels now, each by its daemon (DRAFT) */
          <Small color="$color10">{`At the CASINO now: ${p.casino.table.map((t) => t.name).join(", ")}.`}</Small>
        ) : null}
        {p.casino && (p.casino.pending || p.casino.spins) ? (
          <Small color="$color10">{`The CASINO: ${p.casino.pending > 0 ? `+${p.casino.pending.toLocaleString()}` : p.casino.pending < 0 ? `-${(-p.casino.pending).toLocaleString()}` : "even"} over ${p.casino.spins} spin${p.casino.spins === 1 ? "" : "s"}, into your save at the next SYNC (then ${p.casino.balance.toLocaleString()}).`}</Small>
        ) : null}
        {p.shoes !== undefined ? <Fact label="SHOES">{p.shoes ? `${p.shoes}'s` : "not yet"}</Fact> : null}
        <Fact label="INDEX">{p.index.held ? `${p.index.bound} bound · ${p.index.seen} seen` : "not yet held"}</Fact>
        <MarksRow held={p.marks} wisdom={p.wisdom} />
        <Fact label="DIPLOMA">{p.diploma ? "earned" : "not yet"}</Fact>
        <Fact label="OPUS">{p.opus ? "carried" : "not carried"}</Fact>
        {p.gameClear ? <Fact label="THE STORY">told to the end</Fact> : null}
        {p.roots ? <RootsRow held={p.roots} marks={p.marks} wisdom={p.wisdom} /> : null}
      </Card>
      {p.groves ? <GrovesCard found={p.groves} /> : null}
      <EventsCard />
    </YStack>
  );
}
