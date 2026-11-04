// C-262: GLASSES -- the T-Glass, once one is known (the user, 2026-10-31). The glasses show one screen at a time and
// this card chooses it: HOME, the DAEMON, DARK, or a NOTE from the list. A note's row is selected while, and only while,
// the glasses show it -- the selection is the companion's (GET /api/glass), never this card's, so it holds when the app
// is left and clears the moment anything else is sent. CARE shows the daemon's reaction here and lays it over what the
// glasses show for a few seconds. The preview draws what the glasses should be showing, from the same state. A note's
// title is its first line: the editor tints that line, and renaming is editing it. Every word DRAFT.
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, TextInput } from "react-native";
import { Text, XStack, YStack } from "tamagui";
import { api, HANDHELD } from "../../platform/net";
import type { Carried, DeviceRow, Life, Today } from "../../state/types";
import { Action, Art, Card, CareKey, Choice, Eyebrow, Small } from "../../ui/ui";

type Show = "home" | "note" | "daemon" | "dark";
type Note = { id: number; text: string; title: string; updated: string };
type Moment = { kind: string; line: string; until: number };
type Glass = { show: Show; note: number | null; moment: Moment | null; rev: number; notes: Note[]; momentMs: number };

export const GLASS_WORDS = {
  head: "GLASSES",                                                                                   // DRAFT
  about: "What the glasses show, one thing at a time. Tap a note to send it; anything else sent clears it.",   // DRAFT
  preview: "WHAT THE GLASSES SHOULD SHOW",                                                           // DRAFT
  showHead: "SHOW",                                                                                  // DRAFT
  shows: [["home", "HOME"], ["daemon", "DAEMON"], ["dark", "DARK"]] as [Show, string][],             // DRAFT
  careHead: "CARE",                                                                                  // DRAFT
  notesHead: "NOTES",                                                                                // DRAFT
  none: "No notes yet. The first line of a note is its title.",                                      // DRAFT
  newNote: "NEW NOTE", edit: "Edit", save: "Save", cancel: "Cancel", remove: "Remove", removeSure: "Tap again to remove it",   // DRAFT
  titleHint: "Title -- the first line", bodyHint: "The rest of the note",                            // DRAFT
  showing: "ON THE GLASSES",                                                                         // DRAFT
  dark: "dark",                                                                                      // DRAFT
  noStep: "Nothing waiting.",                                                                        // DRAFT
  battery: (p: number, charging: boolean) => `${p}%${charging ? " charging" : ""}`,                 // DRAFT
  seen: (row: DeviceRow) => row.here ? `linked ${row.via ?? ""}`.trim() : "not heard lately",       // DRAFT
  onGlass: "On the glasses: a tap turns a note's page, a hold goes HOME, two taps go DARK.",        // DRAFT
};
const CARES: [string, string][] = [["water", "Drink"], ["feed", "Feed"], ["train", "Train"]];   // the boards' order (C-117)
const POLL_MS = 3000;
const GLASS = /^t-glass/;

// The glasses' square: 126 pixels seen through the prism, drawn here at twice the size. The firmware's layout
// (firmware/esp32/src/glass.cpp) is the same: a title line, five body lines a page, the daemon at 64.
const PX = 2, SIDE = 126 * PX;
const pageOf = (body: string, per = 5, width = 18) => {
  const lines: string[] = [];
  for (const para of body.split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      if ((line + " " + word).trim().length > width) { if (line) lines.push(line); line = word.slice(0, width); }
      else line = (line + " " + word).trim();
    }
    lines.push(line);
  }
  return lines.slice(0, per);
};

function Preview({ g, life, carried, step }: { g: Glass; life: Life | null; carried: Carried | null; step: string }) {
  const now = new Date(), time = now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const art = (size: number) => carried
    ? <Art path={`/art/party/${carried.slot}.png${life?.expression?.name && life.expression.name !== "awake" ? `?expression=${life.expression.name}` : ""}`} size={size} />
    : <YStack width={size} height={size} />;
  const ink = "#e8f4ff", quiet = "#7f8fa6";
  const moment = g.moment && g.moment.until > Date.now() ? g.moment : null;
  const note = g.show === "note" ? g.notes.find((n) => n.id === g.note) : undefined;
  let inside: React.ReactNode = null;
  if (moment) inside = (
    <YStack flex={1} alignItems="center" justifyContent="center" gap={6}>
      {art(64 * PX)}
      <Text color={ink} fontFamily="$mono" fontSize={13} textAlign="center" numberOfLines={2}>{moment.line}</Text>
    </YStack>);
  else if (g.show === "dark") inside = <YStack flex={1} />;
  else if (g.show === "daemon") inside = (
    <YStack flex={1} alignItems="center" justifyContent="center" gap={4}>
      {art(64 * PX)}
      <Text color={ink} fontFamily="$mono" fontSize={14}>{(carried?.nickname ?? "").toUpperCase()}</Text>
      <Text color={quiet} fontFamily="$mono" fontSize={12}>{life?.word ?? ""}</Text>
    </YStack>);
  else if (note) inside = (
    <YStack flex={1} padding={8} gap={4}>
      <Text color={ink} fontFamily="$mono" fontSize={15} fontWeight="700" numberOfLines={1}>{note.title}</Text>
      <YStack height={1} backgroundColor={quiet} />
      {pageOf(note.text.split("\n").slice(1).join("\n").trim()).map((l, i) =>
        <Text key={i} color={ink} fontFamily="$mono" fontSize={13} numberOfLines={1}>{l}</Text>)}
    </YStack>);
  else inside = (
    <YStack flex={1} padding={8} justifyContent="space-between">
      <XStack justifyContent="space-between" alignItems="center">
        <Text color={ink} fontFamily="$mono" fontSize={30} fontWeight="700">{time}</Text>
      </XStack>
      <XStack alignItems="flex-end" gap={6}>
        {art(48 * PX)}
        <Text flex={1} color={quiet} fontFamily="$mono" fontSize={12} numberOfLines={4}>{step}</Text>
      </XStack>
    </YStack>);
  return (
    <YStack alignSelf="center" width={SIDE} height={SIDE} backgroundColor="#000" borderRadius={10} overflow="hidden"
            borderWidth={1} borderColor="$color6" aria-label="what the glasses should show">
      {inside}
      {g.show === "dark" && !moment ? <Text position="absolute" bottom={6} right={8} color="#333" fontFamily="$mono" fontSize={11}>{GLASS_WORDS.dark}</Text> : null}
    </YStack>
  );
}

function Editor({ note, onDone }: { note: Note | null; onDone: (changed: boolean) => void }) {
  const W = GLASS_WORDS;
  const lines = (note?.text ?? "").split("\n");
  const [title, setTitle] = useState(lines[0] ?? ""), [body, setBody] = useState(lines.slice(1).join("\n"));
  const [sure, setSure] = useState(false), [said, setSaid] = useState("");
  const bodyRef = useRef<TextInput>(null);
  const save = async () => {
    try { await api("/api/glass/note", { ...(note ? { id: note.id } : {}), text: `${title}\n${body}` }); onDone(true); }
    catch (e) { setSaid((e as Error).message); }
  };
  const remove = async () => {
    if (!note) return;
    if (!sure) { setSure(true); return; }
    try { await api("/api/glass/note/remove", { id: note.id }); onDone(true); } catch (e) { setSaid((e as Error).message); }
  };
  const field = { color: "#1b1d22", fontSize: 16, paddingHorizontal: 12 } as const;
  return (
    <YStack gap={8}>
      <YStack borderRadius={8} borderWidth={1} borderColor="$color6" overflow="hidden" backgroundColor="#fbfaf6">
        {/* the first line is the title: its own tint, so it reads as one */}
        <TextInput value={title} onChangeText={(t) => {
                     const at = t.indexOf("\n");                         // a pasted note: its first line stays the title
                     if (at < 0) { setTitle(t); return; }
                     setTitle(t.slice(0, at)); setBody(t.slice(at + 1) + (body ? "\n" + body : "")); bodyRef.current?.focus();
                   }}
                   placeholder={W.titleHint} placeholderTextColor="#8a8577" returnKeyType="next" blurOnSubmit={false}
                   onSubmitEditing={() => bodyRef.current?.focus()} autoFocus={!note}
                   style={{ ...field, fontWeight: "700", paddingVertical: 10, backgroundColor: "#ece6d6" }} />
        <TextInput ref={bodyRef} value={body} onChangeText={setBody} multiline placeholder={W.bodyHint} placeholderTextColor="#8a8577"
                   style={{ ...field, minHeight: 120, paddingVertical: 10, textAlignVertical: "top" }} />
      </YStack>
      <XStack gap={8} flexWrap="wrap">
        <Action label={W.save} onPress={save} />
        <Action label={W.cancel} onPress={() => onDone(false)} />
        {note ? <Action label={sure ? W.removeSure : W.remove} onPress={remove} /> : null}
      </XStack>
      {said ? <Small color="$red10">{said}</Small> : null}
    </YStack>
  );
}

export function GlassCard({ ink }: { ink: string }) {
  const W = GLASS_WORDS;
  const [row, setRow] = useState<DeviceRow | null>(null);
  const [g, setG] = useState<Glass | null>(null), [life, setLife] = useState<Life | null>(null);
  const [step, setStep] = useState(""), [said, setSaid] = useState("");
  const [editing, setEditing] = useState<Note | "new" | null>(null);
  const [, tick] = useState(0);

  const load = useCallback(() => {
    api<{ devices: DeviceRow[] }>("/api/devices").then((v) => setRow(v.devices.find((d) => GLASS.test(d.id)) ?? null)).catch(() => {});
    api<Glass>("/api/glass").then(setG).catch(() => {});
    api<Life>("/api/daemon/life").then(setLife).catch(() => {});
    api<Today>("/api/today").then((t) => setStep(t.next?.step.text ?? W.noStep)).catch(() => {});
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(() => { api<Glass>("/api/glass").then(setG).catch(() => {}); tick((n) => n + 1); }, POLL_MS);   // the glasses' own button, the clock
    return () => clearInterval(t);
  }, [load]);
  if (!row || !g) return null;                                // shown once a T-Glass is known

  const sent = (next: Partial<Glass>) => { setG((was) => was && { ...was, ...next }); HANDHELD?.nudge(); };   // the glasses take it now, not in five seconds
  const show = async (what: Show, note?: number) => {
    try { sent(await api<Glass>("/api/glass/show", { show: what, ...(note !== undefined ? { note } : {}) })); setSaid(""); }
    catch (e) { setSaid((e as Error).message); }
  };
  const care = async (kind: string) => {
    try {
      const r = await api<Life & { said?: string; glass: Glass }>("/api/glass/care", { kind });
      setLife(r); sent(r.glass); setSaid(r.said ?? "");
      setTimeout(() => tick((n) => n + 1), (g.momentMs ?? 8000) + 100);   // the moment ends here as on the glasses
    } catch (e) { setSaid((e as Error).message); }
  };
  const done = (changed: boolean) => { setEditing(null); if (changed) api<Glass>("/api/glass").then((v) => { setG(v); HANDHELD?.nudge(); }).catch(() => {}); };

  return (
    <Card gap={12}>
      <XStack justifyContent="space-between" alignItems="center">
        <Eyebrow>{W.head}</Eyebrow>
        <Small>{[W.seen(row), row.battery ? W.battery(row.battery.percent, row.battery.charging) : ""].filter(Boolean).join(" · ")}</Small>
      </XStack>
      <Small>{W.about}</Small>

      <Small color="$color10">{W.preview}</Small>
      <Preview g={g} life={life} carried={row.daemon ?? null} step={step} />

      <Small color="$color10">{W.showHead}</Small>
      <Choice value={g.show === "note" ? null : g.show} options={W.shows} onPick={(v) => v && show(v)} ink={ink} />

      <Small color="$color10">{W.careHead}</Small>
      <XStack gap={8}>{CARES.map(([k, label]) => <CareKey key={k} label={label} onPress={() => care(k)} ink={ink} />)}</XStack>
      {said ? <Text fontSize={16} color="$color12">{said}</Text> : null}

      <XStack justifyContent="space-between" alignItems="center">
        <Small color="$color10">{W.notesHead}</Small>
        {editing ? null : <Action label={W.newNote} onPress={() => setEditing("new")} />}
      </XStack>
      {editing === "new" ? <Editor note={null} onDone={done} /> : null}
      {g.notes.length === 0 && !editing ? <Small>{W.none}</Small> : null}
      {g.notes.map((n) => {
        const on = g.show === "note" && g.note === n.id;          // selected only while the glasses show it
        if (editing && editing !== "new" && editing.id === n.id) return <Editor key={n.id} note={n} onDone={done} />;
        return (
          <Pressable key={n.id} onPress={() => show("note", n.id)} accessibilityRole="button" accessibilityState={{ selected: on }}
                     style={{ textAlign: "left" } as object}>{/* on the web a button centres its words */}
            <XStack padding={10} borderRadius={8} borderWidth={on ? 2 : 1} borderColor={on ? "$color9" : "$color6"}
                    backgroundColor={on ? "$color4" : "$color2"} alignItems="center" gap={8}>
              <YStack flex={1} alignItems="flex-start">
                <Text fontSize={16} fontWeight="700" color="$color12" numberOfLines={1} textAlign="left">{n.title}</Text>
                <Small>{on ? W.showing : n.text.split("\n").slice(1).join(" ").trim().slice(0, 60)}</Small>
              </YStack>
              <Pressable onPress={() => setEditing(n)} hitSlop={8}><Text color="$color10" fontSize={14}>{W.edit}</Text></Pressable>
            </XStack>
          </Pressable>
        );
      })}
      <Small color="$color10">{W.onGlass}</Small>
    </Card>
  );
}
