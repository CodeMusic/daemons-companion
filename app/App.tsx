// C-05: the companion's app -- Today, Goals and Daemon, against the local server (server/, npm start). It runs as a
// local site first (npm run web) and builds to iOS from the same code later. The day's colour themes it, as the
// device will be themed; the daemon art is DAEMONS' own, drawn pixel for pixel.
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useState } from "react";
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

const SERVER = "http://127.0.0.1:4730";
const MONO = Platform.select({ web: "ui-monospace, Menlo, monospace", default: "Menlo" });
const PIXELATED = Platform.OS === "web" ? ({ imageRendering: "pixelated" } as object) : {};

type Day = { day: string; colour: string; hue: string; note: string; chakra: string; virtue: string };
type Next = { goal: string; subitem: string; step: { id: number; text: string } } | null;
type Today = { date: string; edition: string; day: Day; season: string; next: Next };
type Step = { id: number; text: string; done: boolean };
type Goal = { id: number; title: string; done: boolean; subitems: { id: number; title: string; done: boolean; steps: Step[] }[] };
type Daemon = { slot: number; species: number; name: string; nickname: string; level: number; friendship: number; away: boolean; asked: boolean };

async function api<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(SERVER + path, body === undefined ? undefined
    : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error ?? `the server answered ${r.status}`);
  return j as T;
}

// C-18: a party daemon's art is the server's -- drawn as the game draws it, its streaks painted for its routines.

function TodayScreen({ today, reload, accent }: { today: Today; reload: () => void; accent: string }) {
  const done = async () => { if (today.next) { await api(`/api/steps/${today.next.step.id}/done`, {}); reload(); } };
  return (
    <View style={s.stack}>
      <View style={[s.card, { borderColor: accent }]}>
        <Text style={s.eyebrow}>{today.day.day.toUpperCase()} · {today.day.note} · {today.season.toUpperCase()}</Text>
        <Text style={s.virtue}>{today.day.virtue}</Text>
        <Text style={s.small}>{today.day.chakra} · {today.day.hue} · {today.edition}</Text>
      </View>
      <View style={[s.card, s.focus, { borderColor: accent }]}>
        <Text style={s.eyebrow}>THE ONE THING</Text>
        {today.next ? (
          <>
            <Text style={s.step}>{today.next.step.text}</Text>
            <Text style={s.small}>{today.next.goal} › {today.next.subitem}</Text>
            <Pressable style={[s.button, { backgroundColor: accent }]} onPress={done} accessibilityRole="button">
              <Text style={s.buttonText}>Done</Text>
            </Pressable>
          </>
        ) : (
          <Text style={s.small}>Nothing to do yet. Add a goal, and the first step will wait here.</Text>
        )}
      </View>
    </View>
  );
}

function GoalsScreen({ goals, reload, accent }: { goals: Goal[]; reload: () => void; accent: string }) {
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const add = async () => {
    if (!title.trim()) return;
    const r = await api<{ breakdown: { example: boolean } | null }>("/api/goals", { title: title.trim(), breakdown: true });
    setNote(r.breakdown?.example ? "Broken down with an example plan -- the AI is off. Edit it to fit." : "");
    setTitle("");
    reload();
  };
  return (
    <View style={s.stack}>
      <View style={s.row}>
        <TextInput nativeID="new-goal" style={s.input} value={title} onChangeText={setTitle} onSubmitEditing={add}
                   placeholder="Something you want to get done" placeholderTextColor="#8a8f98" />
        <Pressable style={[s.button, { backgroundColor: accent }]} onPress={add} accessibilityRole="button">
          <Text style={s.buttonText}>Break it down</Text>
        </Pressable>
      </View>
      {note ? <Text style={s.small}>{note}</Text> : null}
      {goals.map((g) => (
        <View key={g.id} style={s.card}>
          <Text style={[s.goal, g.done && s.struck]}>{g.title}</Text>
          {g.subitems.map((si) => (
            <View key={si.id} style={s.sub}>
              <Text style={[s.subTitle, si.done && s.struck]}>{si.title}</Text>
              {si.steps.map((st) => <Text key={st.id} style={[s.small, st.done && s.struck]}>· {st.text}</Text>)}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

function DaemonScreen({ accent }: { accent: string }) {
  const [party, setParty] = useState<Daemon[] | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<{ name: string; category: string; entry: string } | null>(null);
  const [note, setNote] = useState("");
  const load = useCallback(() => {
    api<{ party: Daemon[] }>("/api/party").then((r) => setParty(r.party)).catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);
  // C-10: the game asks (its party menu's SEND or CALL HOME, then a save); this answers, with the game closed.
  const answer = async () => {
    const r = await api<{ answered: { nickname: string; now: string }[] }>("/api/away/answer", {});
    setNote(r.answered.length
      ? r.answered.map((a) => a.now === "away" ? `${a.nickname} is on your device now.` : `${a.nickname} is home.`).join(" ")
      : "Nothing was asked. In the game, choose SEND or CALL HOME and let it save first.");
    load();
  };
  if (error) return <Text style={s.small}>{error}</Text>;
  if (!party) return <Text style={s.small}>Reading your save…</Text>;
  const asked = party.some((d) => d.asked);
  return (
    <View style={s.stack}>
      {asked ? (
        <View style={[s.card, { borderColor: accent }]}>
          <Text style={s.small}>The game is asking. Close it first, then answer here.</Text>
          <Pressable style={[s.button, { backgroundColor: accent }]} onPress={answer} accessibilityRole="button">
            <Text style={s.buttonText}>Answer the game</Text>
          </Pressable>
        </View>
      ) : null}
      {note ? <Text style={s.small}>{note}</Text> : null}
      <View style={s.grid}>
        {party.map((d) => (
          <Pressable key={d.slot} style={[s.daemon, d.away && s.away]} accessibilityRole="button"
                     onPress={() => api<any>(`/api/species/${d.species}`).then((x) => setOpen({ name: x.name, category: x.category, entry: x.entry }))}>
            <Image source={{ uri: `${SERVER}/art/party/${d.slot}.png` }} style={[s.art, PIXELATED]} />
            <Text style={s.daemonName}>{d.nickname}</Text>
            <Text style={s.small}>{d.name} · L{d.level}</Text>
            {d.away ? <Text style={[s.small, { color: accent }]}>ON YOUR DEVICE</Text> : null}
            {d.asked ? <Text style={[s.small, { color: accent }]}>{d.away ? "ASKED HOME" : "ASKED TO GO"}</Text> : null}
          </Pressable>
        ))}
      </View>
      {open ? (
        <View style={[s.card, { borderColor: accent }]}>
          <Text style={s.eyebrow}>{open.name} · {open.category} DAEMON</Text>
          <Text style={s.entry}>{open.entry}</Text>
        </View>
      ) : null}
    </View>
  );
}

export default function App() {
  const [tab, setTab] = useState<"today" | "goals" | "daemon">("today");
  const [today, setToday] = useState<Today | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [error, setError] = useState("");
  const reload = useCallback(() => {
    api<Today>("/api/today").then(setToday).catch((e) => setError(`${e.message} -- is the server running? (server/: npm start)`));
    api<Goal[]>("/api/goals").then(setGoals).catch(() => {});
  }, []);
  useEffect(reload, [reload]);
  const accent = today?.day.colour ?? "#5b6b8c";

  return (
    <View style={s.page}>
      <View style={[s.bar, { borderBottomColor: accent }]}>
        <Text style={[s.brand, { color: accent }]}>DAEMONS · companion</Text>
        <View style={s.tabs}>
          {(["today", "goals", "daemon"] as const).map((t) => (
            <Pressable key={t} onPress={() => setTab(t)} accessibilityRole="tab" accessibilityState={{ selected: tab === t }}
                       style={[s.tab, tab === t && { borderBottomColor: accent }]}>
              <Text style={[s.tabText, tab === t && s.tabOn]}>{t.toUpperCase()}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      <ScrollView contentContainerStyle={s.body}>
        {error ? <Text style={s.small}>{error}</Text> : null}
        {tab === "today" && today ? <TodayScreen today={today} reload={reload} accent={accent} /> : null}
        {tab === "goals" ? <GoalsScreen goals={goals} reload={reload} accent={accent} /> : null}
        {tab === "daemon" ? <DaemonScreen accent={accent} /> : null}
      </ScrollView>
      <StatusBar style="dark" />
    </View>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#f3f1ea" },
  bar: { paddingTop: 24, paddingHorizontal: 20, borderBottomWidth: 3, backgroundColor: "#faf8f2" },
  brand: { fontFamily: MONO, fontSize: 13, letterSpacing: 2, fontWeight: "600" },
  tabs: { flexDirection: "row", gap: 20, marginTop: 12 },
  tab: { paddingVertical: 10, borderBottomWidth: 3, borderBottomColor: "transparent" },
  tabText: { fontFamily: MONO, fontSize: 12, letterSpacing: 1.5, color: "#7a7f88" },
  tabOn: { color: "#1d2026", fontWeight: "700" },
  body: { padding: 20, maxWidth: 720, width: "100%", alignSelf: "center" },
  stack: { gap: 14 },
  card: { backgroundColor: "#fffdf8", borderWidth: 1, borderColor: "#dcd8cc", borderRadius: 4, padding: 16, gap: 6 },
  focus: { borderLeftWidth: 6, paddingVertical: 20 },
  eyebrow: { fontFamily: MONO, fontSize: 11, letterSpacing: 1.5, color: "#6b7079" },
  virtue: { fontSize: 24, fontWeight: "600", color: "#1d2026" },
  step: { fontSize: 22, fontWeight: "600", color: "#1d2026", lineHeight: 30 },
  small: { fontSize: 14, color: "#5a5f68", lineHeight: 20 },
  button: { alignSelf: "flex-start", paddingVertical: 10, paddingHorizontal: 18, borderRadius: 3, marginTop: 8 },
  buttonText: { color: "#fff", fontFamily: MONO, fontSize: 13, letterSpacing: 1, fontWeight: "700" },
  row: { flexDirection: "row", gap: 10, alignItems: "center", flexWrap: "wrap" },
  input: { flexGrow: 1, minWidth: 220, borderWidth: 1, borderColor: "#cfcabc", borderRadius: 3, padding: 10, fontSize: 15,
           backgroundColor: "#fffdf8", color: "#1d2026" },
  goal: { fontSize: 17, fontWeight: "700", color: "#1d2026" },
  sub: { marginTop: 6, gap: 2 },
  subTitle: { fontSize: 15, fontWeight: "600", color: "#30343b" },
  struck: { textDecorationLine: "line-through", color: "#9a9ea6" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  daemon: { width: 150, alignItems: "center", backgroundColor: "#fffdf8", borderWidth: 1, borderColor: "#dcd8cc",
            borderRadius: 4, padding: 10, gap: 2 },
  away: { opacity: 0.45 },
  art: { width: 128, height: 128 },
  daemonName: { fontFamily: MONO, fontSize: 13, fontWeight: "700", color: "#1d2026" },
  entry: { fontSize: 16, lineHeight: 24, color: "#1d2026" },
});
