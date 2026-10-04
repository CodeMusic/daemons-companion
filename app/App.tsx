// C-05: the companion's app -- Today, Goals and Daemon, against the local server (server/, npm start). It runs as a
// local site first (npm run web) and builds to iOS from the same code later. The daemon art is DAEMONS' own, drawn
// pixel for pixel.
// C-20: on Tamagui. The whole app sits in today's theme (tamagui.config.ts): $color9 is the day's colour, $color1 to
// $color8 its tints, $color10 to $color12 its shades -- so the app wears the day, as the device does.
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useState } from "react";
import { Image, Platform } from "react-native";
import { Button, Input, ScrollView, TamaguiProvider, Text, Theme, XStack, YStack } from "tamagui";
import config, { DAYS, WEEK_COLOURS } from "./tamagui.config";

// bindCompanion.sh sets EXPO_PUBLIC_DAEMONS_SERVER: an Android emulator reaches this machine at 10.0.2.2, not 127.0.0.1.
const SERVER = process.env.EXPO_PUBLIC_DAEMONS_SERVER ?? "http://127.0.0.1:4730";
const PIXELATED = Platform.OS === "web" ? ({ imageRendering: "pixelated" } as object) : {};

type Day = { day: string; colour: string; hue: string; note: string; chakra: string; virtue: string };
type Next = { goal: string; subitem: string; step: { id: number; text: string } } | null;
type Today = { date: string; edition: string; day: Day; season: string; next: Next };
type Step = { id: number; text: string; done: boolean };
type Goal = { id: number; title: string; done: boolean; subitems: { id: number; title: string; done: boolean; steps: Step[] }[] };
type Daemon = { slot: number; species: number; name: string; nickname: string; level: number; friendship: number; away: boolean; asked: boolean;
                holding: string | null };

async function api<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(SERVER + path, body === undefined ? undefined
    : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error ?? `the server answered ${r.status}`);
  return j as T;
}

// Words on the day's colour: ink on the light days (Tuesday's yellow), paper on the dark ones.
function onColour(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.3 ? "#1d2026" : "#fbfaf6";
}

const Eyebrow = (p: { children: React.ReactNode }) =>
  <Text fontFamily="$mono" fontSize={11} letterSpacing={1.5} color="$color11">{p.children}</Text>;
const Small = (p: { children: React.ReactNode; struck?: boolean; color?: string }) =>
  <Text fontSize={14} lineHeight={20} color={p.struck ? "$color8" : (p.color ?? "$color11")}
        textDecorationLine={p.struck ? "line-through" : "none"}>{p.children}</Text>;
const Card = (p: React.ComponentProps<typeof YStack>) =>
  <YStack backgroundColor="$color1" borderWidth={1} borderColor="$color5" borderRadius={4} padding={16} gap={6} {...p} />;

function Action({ label, onPress, ink }: { label: string; onPress: () => void; ink: string }) {
  return (
    <Button alignSelf="flex-start" marginTop={8} backgroundColor="$color9" borderRadius={3} paddingHorizontal={18}
            hoverStyle={{ backgroundColor: "$color10" }} pressStyle={{ backgroundColor: "$color10" }} onPress={onPress}>
      <Text fontFamily="$mono" fontSize={13} letterSpacing={1} fontWeight="700" color={ink}>{label}</Text>
    </Button>
  );
}

function TodayScreen({ today, reload, ink }: { today: Today; reload: () => void; ink: string }) {
  const done = async () => { if (today.next) { await api(`/api/steps/${today.next.step.id}/done`, {}); reload(); } };
  return (
    <YStack gap={14}>
      <Card>
        <Eyebrow>{today.day.day.toUpperCase()} · {today.day.note} · {today.season.toUpperCase()}</Eyebrow>
        <Text fontSize={24} fontWeight="600" color="$color12">{today.day.virtue}</Text>
        <Small>{today.day.chakra} · {today.day.hue} · {today.edition}</Small>
      </Card>
      <Card borderLeftWidth={6} borderLeftColor="$color9" paddingVertical={20}>
        <Eyebrow>THE ONE THING</Eyebrow>
        {today.next ? (
          <>
            <Text fontSize={22} fontWeight="600" lineHeight={30} color="$color12">{today.next.step.text}</Text>
            <Small>{today.next.goal} › {today.next.subitem}</Small>
            <Action label="Done" onPress={done} ink={ink} />
          </>
        ) : (
          <Small>Nothing to do yet. Add a goal, and the first step will wait here.</Small>
        )}
      </Card>
    </YStack>
  );
}

function GoalsScreen({ goals, reload, ink }: { goals: Goal[]; reload: () => void; ink: string }) {
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
    <YStack gap={14}>
      <XStack gap={10} alignItems="center" flexWrap="wrap">
        <Input id="new-goal" flexGrow={1} minWidth={220} value={title} onChangeText={setTitle} onSubmitEditing={add}
               placeholder="Something you want to get done" backgroundColor="$color1" borderColor="$color6"
               color="$color12" fontSize={15} />
        <Action label="Break it down" onPress={add} ink={ink} />
      </XStack>
      {note ? <Small>{note}</Small> : null}
      {goals.map((g) => (
        <Card key={g.id}>
          <Text fontSize={17} fontWeight="700" color={g.done ? "$color8" : "$color12"}
                textDecorationLine={g.done ? "line-through" : "none"}>{g.title}</Text>
          {g.subitems.map((si) => (
            <YStack key={si.id} marginTop={6} gap={2}>
              <Text fontSize={15} fontWeight="600" color={si.done ? "$color8" : "$color12"}
                    textDecorationLine={si.done ? "line-through" : "none"}>{si.title}</Text>
              {si.steps.map((st) => <Small key={st.id} struck={st.done}>· {st.text}</Small>)}
            </YStack>
          ))}
        </Card>
      ))}
    </YStack>
  );
}

type Settings = { savePath: string | null; dir: string | null; exists: boolean; valid: boolean; source: string; canPick: boolean };

function DaemonScreen({ ink, goSettings }: { ink: string; goSettings: () => void }) {
  const [party, setParty] = useState<Daemon[] | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<{ name: string; category: string; entry: string } | null>(null);
  const [note, setNote] = useState("");
  const [needPath, setNeedPath] = useState(false);   // C-30: SYNC with no save path set -> a modal that teaches it
  const [canPick, setCanPick] = useState(false);
  const load = useCallback(() => {
    api<{ party: Daemon[] }>("/api/party").then((r) => { setParty(r.party); setError(""); }).catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);
  // C-21: the one SYNC. It reads the save, receives or returns a daemon if the game asked, links the save (so the
  // game shows SEND), and settles a daemon brought home without the app. Close the game first.
  const doSync = async () => {
    const r = await api<{ sameGame: boolean; firstSave: boolean; married: { name: string }; received: string[];
                          returned: string[]; refused: string[]; firstLink: boolean; recalledSeen: boolean }>("/api/sync", {});
    const said: string[] = [];
    if (!r.sameGame) said.push(`This save belongs to a different game. Your companion carries daemons for ${r.married.name}'s.`);
    if (r.firstLink) said.push("Linked. Your game now offers SEND in a daemon's menu.");
    r.received.forEach((n) => said.push(`${n} is with your device now.`));
    r.returned.forEach((n) => said.push(`${n} is home.`));
    r.refused.forEach((n) => said.push(`${n} waits: one daemon at a time.`));
    if (r.recalledSeen) said.push("The daemon you brought home in the game is settled here too.");
    setNote(said.length ? said.join(" ") : "Synced. Nothing was waiting.");
    load();
  };
  // C-30: before syncing, make sure a save is set. If not, teach it rather than fail.
  // Reviewed 2026-10-04: a SYNC that fails (a file that is not a DAEMONS save, a save the game is still writing) used
  // to fail silently; now it says why. And the check is that the file IS a save, not merely that it exists.
  const syncNow = async () => {
    try {
      const s = await api<Settings>("/api/settings");
      setCanPick(s.canPick);
      if (!s.valid) { setNeedPath(true); return; }
      await doSync();
    } catch (e) { setNote(`SYNC did not finish: ${(e as Error).message}`); }
  };
  const pickAndSync = async () => {
    try {
      const r = await api<Settings & { picked: string | null }>("/api/settings/pick", {});
      if (r.picked && r.valid) { setNeedPath(false); await doSync(); }
      else if (r.picked) setNote("That file is not a DAEMONS save. Choose the .sav the game writes.");
    } catch (e) { setNote(`Could not set the save: ${(e as Error).message}`); }
  };
  // The SYNC card is always shown -- when no save is set yet, SYNC is how the user is taught to set one (C-30).
  const asked = party?.some((d) => d.asked) ?? false;
  return (
    <YStack gap={14}>
      {needPath ? (
        <Card borderColor="$color9" borderLeftWidth={6} borderLeftColor="$color9">
          <Eyebrow>FIRST, YOUR SAVE</Eyebrow>
          <Small>To sync, the app needs your DAEMONS save (a .sav file). From an emulator, it is the .sav beside the ROM; from a cartridge, pull the save to your computer first.</Small>
          <XStack gap={8} flexWrap="wrap" marginTop={4}>
            {canPick ? <Action label="Choose a save…" onPress={pickAndSync} ink={ink} /> : null}
            <Action label="Settings" onPress={() => { setNeedPath(false); goSettings(); }} ink={ink} />
          </XStack>
        </Card>
      ) : null}
      <Card borderColor={asked ? "$color9" : "$color5"}>
        <Small>{asked ? "The game is asking. Close it first, then SYNC." : "Close the game, then SYNC to bring your save across."}</Small>
        <Action label="SYNC" onPress={syncNow} ink={ink} />
      </Card>
      {note ? <Small>{note}</Small> : null}
      {error && !needPath ? <Small color="$color8">{error}</Small> : null}
      <XStack flexWrap="wrap" gap={12}>
        {(party ?? []).map((d) => (
          <YStack key={d.slot} width={150} alignItems="center" backgroundColor="$color1" borderWidth={1}
                  borderColor="$color5" borderRadius={4} padding={10} gap={2} opacity={d.away ? 0.45 : 1}
                  cursor="pointer" hoverStyle={{ borderColor: "$color9" }} role="button"
                  onPress={() => api<any>(`/api/species/${d.species}`).then((x) => setOpen({ name: x.name, category: x.category, entry: x.entry }))}>
            <Image source={{ uri: `${SERVER}/art/party/${d.slot}.png` }} style={[{ width: 128, height: 128 }, PIXELATED]} />
            <Text fontFamily="$mono" fontSize={13} fontWeight="700" color="$color12">{d.nickname}</Text>
            <Small>{d.name} · L{d.level}</Small>
            {d.away ? <Small color="$color10">ON YOUR DEVICE</Small> : null}
            {d.holding ? <Small>holding {d.holding}</Small> : null}
            {d.asked ? <Small color="$color10">{d.away ? "ASKED HOME" : "ASKED TO GO"}</Small> : null}
          </YStack>
        ))}
      </XStack>
      {open ? (
        <Card borderColor="$color9">
          <Eyebrow>{open.name} · {open.category} DAEMON</Eyebrow>
          <Text fontSize={16} lineHeight={24} color="$color12">{open.entry}</Text>
        </Card>
      ) : null}
    </YStack>
  );
}

// C-23: the PROFILE -- whichever save was synced: who it belongs to and how far it has gone, as the trainer card says.
type Profile = { name: string; trainerId: number; playTime: { hours: number; minutes: number }; edition: string;
                 index: { held: boolean; seen: number; bound: number }; marks: boolean[]; diploma: boolean; opus: boolean;
                 gameClear: boolean; savedIn: { place: string } | null; thisGame: boolean | null; marriedTo: string | null };

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <XStack justifyContent="space-between" alignItems="baseline" gap={12} paddingVertical={6}
            borderBottomWidth={1} borderBottomColor="$color4">
      <Eyebrow>{label}</Eyebrow>
      <Text fontSize={16} color="$color12" fontVariant={["tabular-nums"]}>{children}</Text>
    </XStack>
  );
}

function ProfileScreen() {
  const [p, setP] = useState<Profile | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { api<Profile>("/api/profile").then(setP).catch((e) => setError(e.message)); }, []);
  if (error) return <Small>{error}</Small>;
  if (!p) return <Small>Reading your save…</Small>;
  const earned = p.marks.filter(Boolean).length;
  const id = String(p.trainerId).padStart(5, "0");
  return (
    <YStack gap={14}>
      <Card borderLeftWidth={6} borderLeftColor="$color9" paddingVertical={20}>
        <Eyebrow>{p.edition} · ID No. {id}</Eyebrow>
        <Text fontFamily="$mono" fontSize={28} fontWeight="700" letterSpacing={2} color="$color12">{p.name}</Text>
        <Small>{p.savedIn?.place ? `Last saved in ${p.savedIn.place}` : "Last saved somewhere the map does not name"}</Small>
        <Small color={p.thisGame === false ? "$color10" : undefined}>
          {p.thisGame === null ? "Not yet synced: the first save you SYNC becomes your companion's game."
            : p.thisGame ? "Your companion's game." : `A different game: your companion carries daemons for ${p.marriedTo}'s.`}
        </Small>
      </Card>
      <Card>
        <Fact label="PLAY TIME">{p.playTime.hours}:{String(p.playTime.minutes).padStart(2, "0")}</Fact>
        <Fact label="INDEX">{p.index.held ? `${p.index.bound} bound · ${p.index.seen} seen` : "not yet held"}</Fact>
        <YStack paddingVertical={8} gap={8}>
          <XStack justifyContent="space-between"><Eyebrow>MARKS</Eyebrow><Text fontSize={16} color="$color12">{earned} of 8</Text></XStack>
          <XStack gap={8}>
            {p.marks.map((m, i) => (
              <YStack key={i} width={22} height={22} borderRadius={3} borderWidth={2} borderColor="$color9"
                      backgroundColor={m ? "$color9" : "transparent"} aria-label={`MARK ${i + 1}${m ? ", earned" : ""}`} />
            ))}
          </XStack>
        </YStack>
        <Fact label="DIPLOMA">{p.diploma ? "earned" : "not yet"}</Fact>
        <Fact label="OPUS">{p.opus ? "carried" : "not carried"}</Fact>
        {p.gameClear ? <Fact label="THE STORY">told to the end</Fact> : null}
      </Card>
    </YStack>
  );
}

// C-29: the save path, set here and kept by the server. The user picks a file once (emulator or cart) and SYNC just
// works; "open the folder" shows where to put a save.
function SettingsScreen({ ink }: { ink: string }) {
  const [s, setS] = useState<Settings | null>(null);
  const [typed, setTyped] = useState("");
  const [note, setNote] = useState("");
  const load = useCallback(() => {
    api<Settings>("/api/settings").then((r) => { setS(r); setTyped(r.savePath ?? ""); }).catch(() => {});
  }, []);
  useEffect(load, [load]);
  const said = (r: Settings) => !r.exists ? "No file at that path yet." : r.valid ? "Save set." : "That file is not a DAEMONS save.";
  const pick = async () => { const r = await api<Settings>("/api/settings/pick", {}); setS(r); setTyped(r.savePath ?? ""); setNote(said(r)); };
  const save = async () => { const r = await api<Settings>("/api/settings", { savePath: typed }); setS(r); setNote(said(r)); };
  const reveal = async () => { await api("/api/settings/reveal", {}); };
  if (!s) return <Small>Loading…</Small>;
  return (
    <YStack gap={14}>
      <Card borderLeftWidth={6} borderLeftColor={s.valid ? "$color9" : "$color5"}>
        <Eyebrow>YOUR DAEMONS SAVE</Eyebrow>
        <Text fontFamily="$mono" fontSize={13} color="$color12" wordWrap="break-word">{s.savePath ?? "not set"}</Text>
        <Small color={s.valid ? "$color10" : "$color8"}>
          {!s.savePath ? "Not set yet." : !s.exists ? "No file at that path yet."
            : !s.valid ? "That file is not a DAEMONS save."
            : `A DAEMONS save${s.source === "config.json" ? " (set in config.json)" : ""}.`}
        </Small>
        <XStack gap={8} flexWrap="wrap" marginTop={4}>
          {s.canPick ? <Action label="Choose a save…" onPress={pick} ink={ink} /> : null}
          {s.dir ? <Action label="Open the folder" onPress={reveal} ink={ink} /> : null}
        </XStack>
      </Card>
      <Card>
        <Eyebrow>OR TYPE THE PATH</Eyebrow>
        <Small>From an emulator, the .sav beside the ROM. From a cartridge, pull the save to your computer first. Point the emulator and the app at the same file and it just works.</Small>
        <XStack gap={8} alignItems="center" flexWrap="wrap" marginTop={4}>
          <Input flexGrow={1} minWidth={220} value={typed} onChangeText={setTyped} onSubmitEditing={save}
                 placeholder="/path/to/your.sav" backgroundColor="$color1" borderColor="$color6" color="$color12" fontSize={13} fontFamily="$mono" />
          <Action label="Save" onPress={save} ink={ink} />
        </XStack>
        {note ? <Small>{note}</Small> : null}
      </Card>
    </YStack>
  );
}

const TABS = ["today", "goals", "daemon", "profile", "settings"] as const;

function Shell() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("today");
  const [today, setToday] = useState<Today | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [error, setError] = useState("");
  const reload = useCallback(() => {
    api<Today>("/api/today").then(setToday).catch((e) => setError(`${e.message} -- is the server running? (./bindCompanion.sh)`));
    api<Goal[]>("/api/goals").then(setGoals).catch(() => {});
  }, []);
  useEffect(reload, [reload]);
  // Today's theme, by name; before the server answers, the paper alone. On the site, ?day=tuesday shows another day's
  // theme, to look at all seven without waiting a week.
  const asked = Platform.OS === "web" ? new URLSearchParams(globalThis.location?.search ?? "").get("day")?.toLowerCase() : null;
  const day = asked && DAYS.includes(asked) ? asked
    : today && DAYS.includes(today.day.day.toLowerCase()) ? today.day.day.toLowerCase() : null;
  const ink = onColour(day ? WEEK_COLOURS[day] : "#5b6b8c");

  const page = (
    <YStack flex={1} backgroundColor="$color2">
      <YStack paddingTop={24} paddingHorizontal={20} borderBottomWidth={3} borderBottomColor="$color9" backgroundColor="$color1">
        <Text fontFamily="$mono" fontSize={13} letterSpacing={2} fontWeight="600" color="$color10">DAEMONS · companion</Text>
        <XStack gap={20} marginTop={12} role="tablist">
          {TABS.map((t) => (
            <YStack key={t} paddingVertical={10} borderBottomWidth={3} cursor="pointer" role="tab"
                    aria-selected={tab === t} borderBottomColor={tab === t ? "$color9" : "transparent"}
                    onPress={() => setTab(t)}>
              <Text fontFamily="$mono" fontSize={12} letterSpacing={1.5} fontWeight={tab === t ? "700" : "400"}
                    color={tab === t ? "$color12" : "$color10"}>{t.toUpperCase()}</Text>
            </YStack>
          ))}
        </XStack>
      </YStack>
      <ScrollView contentContainerStyle={{ padding: 20, maxWidth: 720, width: "100%", alignSelf: "center" }}>
        {error ? <Small>{error}</Small> : null}
        {tab === "today" && today ? <TodayScreen today={today} reload={reload} ink={ink} /> : null}
        {tab === "goals" ? <GoalsScreen goals={goals} reload={reload} ink={ink} /> : null}
        {tab === "daemon" ? <DaemonScreen ink={ink} goSettings={() => setTab("settings")} /> : null}
        {tab === "profile" ? <ProfileScreen /> : null}
        {tab === "settings" ? <SettingsScreen ink={ink} /> : null}
      </ScrollView>
      <StatusBar style="dark" />
    </YStack>
  );
  return day ? <Theme name={day as any}>{page}</Theme> : page;
}

export default function App() {
  return (
    <TamaguiProvider config={config} defaultTheme="light">
      <Shell />
    </TamaguiProvider>
  );
}
