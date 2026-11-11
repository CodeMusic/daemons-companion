// C-319 (the user, 2026-11-10: "a way of visualizing everything that is happening in this mind mesh network, tasks on
// various devices, for various users, for various functions ... (with a toggle to filter tasks for just your own user,
// all users, or specific user) maybe even to visualize not just present task but past (or future if we ever add it), it
// would be both a visualization, and also a way to manage mind tasks"): THE MIND AT WORK, in THE MIND's card.
//   - THE WEB: the hub at the middle, every mind on a ring around it (lit if it answers), every device that asked on the
//     outer ring; a task thinking now is a spark running the line from its device to its mind, what finished lately a
//     faint thread
//   - THE RIVER: one lane per mind across the time picked (an hour, a day, a week), each task a bar from start to end in
//     its kind's colour; the live run on to NOW; past NOW, LATER -- empty until the mind can be given work for later
//   - THE LIST: what is thinking now, with STOP; what finished, with TRY AGAIN and FORGET
// MINE, EVERYONE or one user; the ledger is the hub's (/api/mind/tasks, server/src/ai/tasks.ts). Every word DRAFT.
import { useEffect, useMemo, useState } from "react";
import { Text, XStack, YStack } from "tamagui";
import type { Task } from "../../../server/src/ai/tasks";
import { api } from "../../platform/net";
import { me, whoAmI } from "../../state/me";
import { Action, Card, Eyebrow, Small } from "../../ui/ui";

type View = { tasks: Task[]; users: string[]; minds: { name: string; ok: boolean }[]; load: { running: number; waiting: number }; at: string };
const KIND: Record<string, { colour: string; said: string }> = {                    // DRAFT
  talk: { colour: "#5a7fa6", said: "TALK" }, guide: { colour: "#00a8d6", said: "THE GUIDE" },
  dream: { colour: "#8E3F80", said: "DREAMS" }, whatsnew: { colour: "#d9a74a", said: "WHAT'S NEW" },
  journal: { colour: "#6fae6a", said: "JOURNAL" }, meeting: { colour: "#c9784a", said: "MEETINGS" },   // C-319 next
  voice: { colour: "#b48ce0", said: "VOICES" }, chatter: { colour: "#4f6b8a", said: "CHATTER" },
};
// how much a task was given and gave back, and its tokens when the mind counted them -- DRAFT
const kb = (n?: number) => (n === undefined ? "?" : n < 1000 ? `${n} chars` : `${(n / 1000).toFixed(1)}k chars`);
const sizeSaid = (t: Task) => [t.size ? `${kb(t.size.in)} in, ${t.size.out !== undefined ? kb(t.size.out) : "nothing yet"} out` : "",
                               t.tokens ? `${t.tokens.in ?? "?"} → ${t.tokens.out ?? "?"} tokens` : ""].filter(Boolean).join(" · ");
const kindOf = (k: string) => KIND[k] ?? { colour: "#7a7f8a", said: k.toUpperCase() };
const STATE_SAID: Record<Task["state"], string> = { waiting: "waiting", thinking: "thinking", done: "done", failed: "failed", stopped: "stopped" };
const LIVE = (t: Task) => t.state === "waiting" || t.state === "thinking";
const WINDOWS = [["hour", 3600e3, "AN HOUR"], ["day", 86400e3, "A DAY"], ["week", 7 * 86400e3, "A WEEK"]] as const;
const ago = (iso: string, now: number) => {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)}m ago` : s < 86400 ? `${Math.round(s / 3600)}h ago` : `${Math.round(s / 86400)}d ago`;
};
const took = (ms?: number) => (ms === undefined ? "" : ms < 1000 ? `${ms}ms` : ms < 60_000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms / 60_000)}m`);

function Pill({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <YStack role="button" cursor="pointer" onPress={onPress} paddingHorizontal={10} paddingVertical={4} borderRadius={999}
            borderWidth={1.5} borderColor={on ? "$color11" : "$color6"} backgroundColor={on ? "$color4" : "transparent"}>
      <Text fontFamily="$mono" fontSize={10} letterSpacing={1} color={on ? "$color12" : "$color10"}>{label}</Text>
    </YStack>
  );
}

// THE WEB: positions on two rings around the hub, a spark for each task thinking now
function Web({ tasks, minds, devices, w, tick, pick, queued }: { tasks: Task[]; minds: { name: string; ok: boolean | null }[]; devices: string[];
                                                                 w: number; tick: number; pick: (t: Task) => void; queued: number }) {
  const H = 250, cx = w / 2, cy = H / 2, r1 = Math.min(cx, cy) * 0.5, r2 = Math.min(cx - 34, cy - 18);
  const at = (i: number, n: number, r: number, turn = 0) => {
    const a = -Math.PI / 2 + turn + (2 * Math.PI * i) / Math.max(1, n);
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  };
  const mindAt = new Map(minds.map((m, i) => [m.name, at(i, minds.length, r1)]));
  const devAt = new Map(devices.map((d, i) => [d, at(i, devices.length, r2, Math.PI / Math.max(2, devices.length))]));
  const ends = (t: Task) => ({ a: devAt.get(t.device) ?? { x: cx, y: cy }, b: (t.mind && mindAt.get(t.mind)) || { x: cx, y: cy } });
  const line = (a: { x: number; y: number }, b: { x: number; y: number }, colour: string, o: number, thick = 1.5) => {
    const len = Math.hypot(b.x - a.x, b.y - a.y), ang = Math.atan2(b.y - a.y, b.x - a.x);
    return <YStack position="absolute" left={(a.x + b.x) / 2 - len / 2} top={(a.y + b.y) / 2 - thick / 2} width={len} height={thick}
                   backgroundColor={colour} opacity={o} style={{ transform: [{ rotate: `${ang}rad` }] }} />;
  };
  const recent = tasks.filter((t) => !LIVE(t)).slice(0, 14), live = tasks.filter(LIVE);
  return (
    <YStack height={H} width={w} borderRadius={10} backgroundColor="#0f1420" overflow="hidden" position="relative">
      {[...mindAt.values()].map((p, i) => <YStack key={`h${i}`}>{line({ x: cx, y: cy }, p, "#3a4466", 0.9, 1)}</YStack>)}
      {recent.map((t) => { const { a, b } = ends(t); return <YStack key={`r${t.id}`}>{line(a, b, t.state === "failed" ? "#e5534b" : kindOf(t.kind).colour, 0.28)}</YStack>; })}
      {live.map((t) => { const { a, b } = ends(t); return <YStack key={`l${t.id}`}>{line(a, b, kindOf(t.kind).colour, 0.75, 2)}</YStack>; })}
      {/* the hub */}
      <YStack position="absolute" left={cx - 22} top={cy - 22} width={44} height={44} borderRadius={22} borderWidth={2} borderColor="#d9a74a"
              backgroundColor="#1d2436" alignItems="center" justifyContent="center">
        <Text fontFamily="$mono" fontSize={9} letterSpacing={1} color="#d9a74a">HUB</Text>
      </YStack>
      {queued ? <Depth x={cx + 14} y={cy - 26} n={queued} colour="#d9a74a" /> : null}
      {minds.map((m) => { const p = mindAt.get(m.name)!, depth = live.filter((t) => t.mind === m.name).length, busy = depth > 0; return (
        <YStack key={m.name} position="absolute" left={p.x - 45} top={p.y - 9} width={90} alignItems="center">
          {depth > 1 ? <Depth x={53} y={-8} n={depth} colour="#3fb950" /> : null}
          <YStack width={busy ? 16 : 13} height={busy ? 16 : 13} borderRadius={8} borderWidth={2}
                  borderColor={m.ok === null ? "#6c7696" : m.ok ? "#3fb950" : "#e5534b"}
                  backgroundColor={busy ? `rgba(63,185,80,${0.35 + 0.35 * Math.abs(Math.sin(tick / 4))})` : "#0f1420"} />
          <Text fontFamily="$mono" fontSize={9} color="#d8deea" numberOfLines={1} textAlign="center">{m.name}</Text>
        </YStack>
      ); })}
      {devices.map((d) => { const p = devAt.get(d)!; return (
        <YStack key={d} position="absolute" left={p.x - 40} top={p.y - 8} width={80} alignItems="center">
          <YStack width={11} height={11} borderRadius={2} borderWidth={1.5} borderColor="#9aa6c4" backgroundColor="#0f1420" />
          <Text fontSize={9} color="#9aa6c4" numberOfLines={1} textAlign="center">{d}</Text>
        </YStack>
      ); })}
      {/* a spark for each task thinking now, running from its device to its mind (waiting: held at the device) */}
      {live.map((t, i) => { const { a, b } = ends(t); const f = t.state === "waiting" ? 0.08 : ((tick / 18 + i * 0.37) % 1);
        return <YStack key={`s${t.id}`} position="absolute" left={a.x + (b.x - a.x) * f - 6} top={a.y + (b.y - a.y) * f - 6} width={12} height={12}
                       borderRadius={6} backgroundColor={kindOf(t.kind).colour} borderWidth={2} borderColor="#ffffff" role="button" cursor="pointer"
                       aria-label={t.title} onPress={() => pick(t)} />; })}
      {!live.length ? <Text position="absolute" bottom={6} left={0} right={0} textAlign="center" fontSize={10} color="#6c7696">nothing thinking right now</Text> : null}
    </YStack>
  );
}

// THE RIVER: a lane per mind, the window's time across, NOW near the right and LATER after it
function River({ tasks, minds, span, w, now, pick, picked }: { tasks: Task[]; minds: string[]; span: number; w: number; now: number;
                                                               pick: (t: Task) => void; picked: string | null }) {
  const LABEL = 76, LATER = 34, plot = Math.max(60, w - LABEL - LATER), from = now - span;
  const xOf = (iso: string) => LABEL + Math.max(0, Math.min(1, (Date.parse(iso) - from) / span)) * plot;
  const lanes = minds.length ? minds : ["(no mind)"];
  return (
    <YStack width={w} marginTop={4} position="relative">
      {lanes.map((m) => (
        <XStack key={m} height={22} alignItems="center" borderBottomWidth={1} borderBottomColor="$color4" position="relative">
          <Text width={LABEL - 6} fontFamily="$mono" fontSize={9} color="$color10" numberOfLines={1}>{m}</Text>
          <YStack position="absolute" left={0} top={0} width={w} height={22}>
            {tasks.filter((t) => (t.mind ?? "(no mind)") === m && Date.parse(t.ended ?? new Date(now).toISOString()) >= from).map((t) => {
              const a = xOf(t.started ?? t.at), b = LIVE(t) ? LABEL + plot : xOf(t.ended ?? t.at);
              return <YStack key={t.id} position="absolute" left={a} top={5} width={Math.max(4, b - a)} height={12} borderRadius={3}
                             backgroundColor={kindOf(t.kind).colour} opacity={LIVE(t) ? 0.95 : t.state === "done" ? 0.7 : 0.35}
                             borderWidth={picked === t.id ? 2 : t.state === "failed" ? 1.5 : 0} borderColor={picked === t.id ? "$color12" : "#e5534b"}
                             role="button" cursor="pointer" aria-label={t.title} onPress={() => pick(t)} />;
            })}
          </YStack>
        </XStack>
      ))}
      <YStack position="absolute" left={LABEL + plot} top={0} bottom={14} width={1.5} backgroundColor="#d9a74a" />
      <YStack position="absolute" left={LABEL + plot + 2} top={0} bottom={14} width={LATER - 2} borderWidth={1} borderStyle="dashed" borderColor="$color6" borderRadius={3} />
      <XStack height={14} marginTop={2}>
        <Text width={LABEL} />
        <Text flex={1} fontSize={9} color="$color9">{`${ago(new Date(from).toISOString(), now)}`}</Text>
        <Text fontSize={9} color="#d9a74a" width={30} textAlign="right">NOW</Text>
        <Text fontSize={9} color="$color8" width={LATER} textAlign="right">LATER</Text>
      </XStack>
    </YStack>
  );
}

// C-319 next: how deep a mind's queue is -- its live tasks (the hub's: its talk queue waiting), as a small count
function Depth({ x, y, n, colour }: { x: number; y: number; n: number; colour: string }) {
  return (
    <YStack position="absolute" left={x} top={y} minWidth={16} height={16} paddingHorizontal={3} borderRadius={8}
            backgroundColor={colour} alignItems="center" justifyContent="center" aria-label={`${n} in its queue`}>
      <Text fontFamily="$mono" fontSize={9} fontWeight="700" color="#0f1420">{n}</Text>
    </YStack>
  );
}
export function MindAtWork({ ink }: { ink: string }) {
  const [v, setV] = useState<View | null>(null);
  const [who, setWho] = useState<"mine" | "all" | string>("all");
  const [win, setWin] = useState<(typeof WINDOWS)[number][0]>("hour");
  const [w, setW] = useState(320);
  const [tick, setTick] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [mine, setMine] = useState(me());
  const read = () => api<View>("/api/mind/tasks").then(setV).catch((e) => setNote((e as Error).message));
  useEffect(() => { whoAmI().then(setMine); read(); }, []);
  const anyLive = !!v?.tasks.some(LIVE);
  useEffect(() => { const id = setInterval(read, anyLive ? 2000 : 5000); return () => clearInterval(id); }, [anyLive]);
  useEffect(() => { if (!anyLive) return; const id = setInterval(() => setTick((n) => n + 1), 100); return () => clearInterval(id); }, [anyLive]);
  const now = Date.now(), span = WINDOWS.find((x) => x[0] === win)![1];
  const shown = useMemo(() => (v?.tasks ?? []).filter((t) => who === "all" || (who === "mine" ? t.user === mine : t.user === who)), [v, who, mine]);
  const inWindow = shown.filter((t) => LIVE(t) || Date.parse(t.ended ?? t.at) >= now - span);
  const minds = useMemo(() => {
    const known = new Map((v?.minds ?? []).map((m) => [m.name, m.ok as boolean | null]));
    for (const t of inWindow) if (t.mind && !known.has(t.mind)) known.set(t.mind, null);
    return [...known].map(([name, ok]) => ({ name, ok }));
  }, [v, inWindow.length]);
  const devices = useMemo(() => [...new Set(inWindow.map((t) => t.device))].slice(0, 10), [inWindow.length]);
  if (!v) return note ? <Small color="$color10">{`THE MIND AT WORK: ${note}`}</Small> : null;

  const act = async (t: Task, a: "stop" | "retry" | "forget") => {
    try { await api("/api/mind/tasks", { id: t.id, act: a }); setNote(""); read(); } catch (e) { setNote((e as Error).message); }
  };
  const sel = v.tasks.find((t) => t.id === picked) ?? null;
  const live = inWindow.filter(LIVE), done = inWindow.filter((t) => !LIVE(t));
  const others = v.users.filter((u) => u !== mine);
  return (
    <Card>
      <Eyebrow>THE MIND AT WORK</Eyebrow>
      <Small color="$color10">{`${live.length ? `${live.length} thinking now` : "Quiet"} · ${done.length} finished in ${WINDOWS.find((x) => x[0] === win)![2].toLowerCase()}` +
                               `${v.load.waiting ? ` · ${v.load.waiting} in the hub's queue` : ""}`}</Small>
      <XStack gap={6} flexWrap="wrap" marginTop={4}>
        <Pill label={`MINE${mine ? ` (${mine})` : ""}`} on={who === "mine"} onPress={() => setWho("mine")} />
        <Pill label="EVERYONE" on={who === "all"} onPress={() => setWho("all")} />
        {others.map((u) => <Pill key={u} label={u.toUpperCase()} on={who === u} onPress={() => setWho(u)} />)}
      </XStack>
      <YStack marginTop={8} onLayout={(e: any) => setW(Math.max(240, e.nativeEvent.layout.width))}>
        <Web tasks={inWindow} minds={minds} devices={devices} w={w} tick={tick} pick={(t) => setPicked(t.id)} queued={v.load.waiting} />
      </YStack>
      <XStack gap={6} marginTop={10} alignItems="center">
        <Text fontFamily="$mono" fontSize={10} letterSpacing={1} color="$color10" flex={1}>THE RIVER</Text>
        {WINDOWS.map(([k, , said]) => <Pill key={k} label={said} on={win === k} onPress={() => setWin(k)} />)}
      </XStack>
      <River tasks={inWindow} minds={minds.map((m) => m.name)} span={span} w={w} now={now} pick={(t) => setPicked(t.id)} picked={picked} />
      <XStack gap={10} flexWrap="wrap" marginTop={4}>
        {Object.entries(KIND).map(([k, x]) => (
          <XStack key={k} gap={4} alignItems="center"><YStack width={10} height={10} borderRadius={2} backgroundColor={x.colour} />
            <Text fontSize={10} color="$color10">{x.said}</Text></XStack>
        ))}
      </XStack>
      {sel ? (
        <YStack marginTop={10} padding={10} borderRadius={8} borderWidth={1.5} borderColor={kindOf(sel.kind).colour} gap={3}>
          <Text fontSize={14} fontWeight="700" color="$color12">{sel.title}</Text>
          <Small color="$color10">{`${kindOf(sel.kind).said} · ${STATE_SAID[sel.state]}${sel.ms !== undefined ? ` in ${took(sel.ms)}` : ""} · ${ago(sel.at, now)}`}</Small>
          <Small color="$color10">{`for ${sel.user}, from ${sel.device}${sel.mind ? `, on ${sel.mind}` : ""}${sel.source === "trace" ? " (reported by the phone)" : sel.source === "queue" ? " (the hub's talk queue)" : ""}`}</Small>
          {sizeSaid(sel) ? <Small color="$color10">{sizeSaid(sel)}</Small> : null}
          {sel.error ? <Small color="#e5534b">{sel.error}</Small> : null}
          <XStack gap={6} marginTop={4} flexWrap="wrap">
            {sel.can?.stop && LIVE(sel) ? <Action label="Stop" ink={ink} onPress={() => act(sel, "stop")} /> : null}
            {sel.can?.retry && (sel.state === "failed" || sel.state === "stopped") ? <Action label="Try again" ink={ink} onPress={() => act(sel, "retry")} /> : null}
            {sel.source === "ledger" && !LIVE(sel) ? <Action label="Forget" ink={ink} onPress={() => { act(sel, "forget"); setPicked(null); }} /> : null}
            <Action label="Close" ink={ink} onPress={() => setPicked(null)} />
          </XStack>
        </YStack>
      ) : null}
      {[["NOW", live], ["BEFORE", done.slice(0, 8)]].map(([head, list]) => (list as Task[]).length ? (
        <YStack key={head as string} marginTop={10} gap={4}>
          <Text fontFamily="$mono" fontSize={10} letterSpacing={1} color="$color10">{head as string}</Text>
          {(list as Task[]).map((t) => (
            <XStack key={t.id} gap={8} alignItems="center" role="button" cursor="pointer" onPress={() => setPicked(t.id)}>
              <YStack width={8} height={8} borderRadius={4} backgroundColor={t.state === "failed" ? "#e5534b" : kindOf(t.kind).colour} />
              <Text flex={1} fontSize={12} color="$color12" numberOfLines={1}>{t.title}</Text>
              <Text fontSize={10} color="$color10">{LIVE(t) ? STATE_SAID[t.state] : `${took(t.ms)} · ${ago(t.ended ?? t.at, now)}`}</Text>
            </XStack>
          ))}
        </YStack>
      ) : null)}
      <XStack gap={6} marginTop={8}>
        <Action label="Clear finished" ink={ink} onPress={async () => {
          try { await api("/api/mind/tasks", { act: "clear", ...(who === "all" ? {} : { user: who === "mine" ? mine : who }) }); read(); } catch (e) { setNote((e as Error).message); }
        }} />
      </XStack>
      {note ? <Small color="$color10">{note}</Small> : null}
      <Small color="$color9">DRAFT</Small>
    </Card>
  );
}
