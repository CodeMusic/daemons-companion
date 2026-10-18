// GOALS -- the one goal, its steps and milestones, and WALKING. (C-157: out of App.tsx.)
import { useCallback, useEffect, useState } from "react";
import { Input, Text, XStack, YStack } from "tamagui";
import { api } from "../net";
import { GoalNow, Step, Walk } from "../types";
import { Action, Card, Entry, Eyebrow, Small } from "../ui";
export function StepRow({ step, onToggle, onRemove }: { step: Step; onToggle: () => void; onRemove: () => void }) {
  return (
    <XStack alignItems="center" gap={10} paddingVertical={4}>
      <YStack role="checkbox" aria-checked={step.done} cursor="pointer" width={20} height={20} borderRadius={3} borderWidth={2}
              borderColor="$color9" backgroundColor={step.done ? "$color9" : "transparent"} onPress={onToggle} />
      <Text flex={1} fontSize={15} color={step.done ? "$color8" : "$color12"} textDecorationLine={step.done ? "line-through" : "none"}
            cursor="pointer" onPress={onToggle}>{step.text}</Text>
      <Text fontSize={13} color="$color8" cursor="pointer" onPress={onRemove} aria-label="remove">✕</Text>
    </XStack>
  );
}

export function WalkCard({ ink }: { ink: string }) {
  const [w, setW] = useState<Walk | null>(null);
  const [typed, setTyped] = useState("");
  useEffect(() => { api<Walk>("/api/walk").then(setW).catch(() => {}); }, []);
  if (!w) return null;
  const save = async (patch: object) => { setW(await api<Walk>("/api/walk", patch)); setTyped(""); };
  return (
    <Card>
      <Eyebrow>WALKING</Eyebrow>
      <Text fontSize={18} fontWeight="600" color="$color12">{`${w.steps.toLocaleString()} of ${w.goal.toLocaleString()} steps today`}</Text>
      <Small>{w.reached ? "Reached: your daemon is glad of the walk." : "Reaching it counts as activity for your daemon. Your phone will count them; for now, type them in."}</Small>
      <XStack gap={8} flexWrap="wrap" alignItems="center" marginTop={4}>
        <Input width={140} value={typed} onChangeText={setTyped} keyboardType="number-pad" placeholder="steps today"
               backgroundColor="$color1" borderColor="$color6" color="$color12" fontSize={14}
               onSubmitEditing={() => Number(typed) >= 0 && save({ steps: Math.round(Number(typed)) })} />
        <Action label="Save" onPress={() => Number(typed) >= 0 && save({ steps: Math.round(Number(typed)) })} ink={ink} />
      </XStack>
      <XStack gap={6} flexWrap="wrap" marginTop={4}>
        {[6000, 8000, 10000, 12000].map((g) => (
          <Text key={g} fontFamily="$mono" fontSize={12} cursor="pointer" paddingHorizontal={8} paddingVertical={4} borderRadius={3}
                borderWidth={1} borderColor={w.goal === g ? "$color9" : "$color6"} color="$color12"
                onPress={() => save({ goal: g })}>{`${g / 1000}k a day`}</Text>
        ))}
      </XStack>
    </Card>
  );
}

export function GoalsScreen({ reload, ink }: { reload: () => void; ink: string }) {
  const [now, setNow] = useState<GoalNow | null>(null);
  const [title, setTitle] = useState(""), [row, setRow] = useState(""), [kind, setKind] = useState<"step" | "milestone">("step");
  const [into, setInto] = useState<Record<number, string>>({});
  const [error, setError] = useState("");
  const load = useCallback(() => { api<GoalNow>("/api/goal").then(setNow).catch((e) => setError(e.message)); }, []);
  useEffect(load, [load]);
  const act = async (f: () => Promise<unknown>) => { try { setError(""); await f(); load(); reload(); } catch (e) { setError((e as Error).message); } };
  if (!now) return <Small>{error || "Loading…"}</Small>;
  const limit = now.limit, g = now.goal;
  const toggle = (st: Step) => act(() => api(`/api/steps/${st.id}/${st.done ? "undo" : "done"}`, {}));
  const remove = (body: object) => act(() => api("/api/goal/remove", body));
  if (!g) return (
    <YStack gap={14}>
      <Card>
        <Eyebrow>YOUR GOAL</Eyebrow>
        <Small>{`One goal at a time. A few words: ${limit} letters at most, on purpose -- simpler is better.`}</Small>
        <XStack gap={8} flexWrap="wrap" alignItems="center" marginTop={4}>
          <Entry value={title} onChange={setTitle} placeholder="Clean the house" limit={limit}
                 onSubmit={() => title.trim() && act(() => api("/api/goal", { title }).then(() => setTitle("")))} />
          <Action label="Set it" onPress={() => title.trim() && act(() => api("/api/goal", { title }).then(() => setTitle("")))} ink={ink} />
        </XStack>
        {error ? <Small color="$color9">{error}</Small> : null}
      </Card>
      <WalkCard ink={ink} />
    </YStack>
  );
  return (
    <YStack gap={14}>
      <Card borderLeftWidth={6} borderLeftColor="$color9">
        <Eyebrow>YOUR GOAL</Eyebrow>
        <Text fontSize={20} fontWeight="700" color="$color12">{g.title}</Text>
        <Small>{`What are its steps? Add a step, or a milestone that holds its own. Each is ${limit} letters at most -- simpler is better.`}</Small>
        {g.subitems.map((m) => m.title ? (
          <YStack key={m.id} marginTop={10} gap={2} paddingLeft={10} borderLeftWidth={2} borderLeftColor={m.done ? "$color6" : "$color9"}>
            <XStack alignItems="center" gap={8}>
              <Text flex={1} fontFamily="$mono" fontSize={12} letterSpacing={1.5} fontWeight="700" color={m.done ? "$color8" : "$color11"}>
                {`${m.title.toUpperCase()}${m.done ? "  ✓" : ""}`}</Text>
              <Text fontSize={13} color="$color8" cursor="pointer" onPress={() => remove({ milestone: m.id })} aria-label="remove milestone">✕</Text>
            </XStack>
            {m.steps.map((st) => <StepRow key={st.id} step={st} onToggle={() => toggle(st)} onRemove={() => remove({ step: st.id })} />)}
            <XStack gap={6} alignItems="center" marginTop={2}>
              <Entry value={into[m.id] ?? ""} onChange={(v) => setInto({ ...into, [m.id]: v })} placeholder={`+ a step in ${m.title}`} limit={limit}
                     onSubmit={() => (into[m.id] ?? "").trim() && act(() => api("/api/goal/step", { text: into[m.id], milestone: m.id })
                       .then(() => setInto({ ...into, [m.id]: "" })))} />
            </XStack>
          </YStack>
        ) : (
          <YStack key={m.id} marginTop={6}>
            {m.steps.map((st) => <StepRow key={st.id} step={st} onToggle={() => toggle(st)} onRemove={() => remove({ step: st.id })} />)}
          </YStack>
        ))}
        <XStack gap={8} flexWrap="wrap" alignItems="center" marginTop={12}>
          <Text fontFamily="$mono" fontSize={18} color="$color9">+</Text>
          {(["step", "milestone"] as const).map((k) => (
            <Text key={k} fontFamily="$mono" fontSize={12} cursor="pointer" paddingHorizontal={8} paddingVertical={4} borderRadius={3}
                  borderWidth={1} borderColor={kind === k ? "$color9" : "$color6"} backgroundColor={kind === k ? "$color9" : "transparent"}
                  color={kind === k ? ink : "$color12"} fontWeight={kind === k ? "700" : "400"} onPress={() => setKind(k)}>{k}</Text>
          ))}
          <Entry value={row} onChange={setRow} placeholder={kind === "step" ? "a step, like: wash the windows" : "a milestone, like: living room"} limit={limit}
                 onSubmit={() => row.trim() && act(() => api(`/api/goal/${kind}`, { text: row, title: row }).then(() => setRow("")))} />
          <Action label="Add" onPress={() => row.trim() && act(() => api(`/api/goal/${kind}`, { text: row, title: row }).then(() => setRow("")))} ink={ink} />
        </XStack>
        {error ? <Small color="$color9">{error}</Small> : null}
      </Card>
      <WalkCard ink={ink} />
    </YStack>
  );
}
