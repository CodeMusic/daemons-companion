// THE HOARD's shared pieces (C-596), for its page and the pages it opens: the way back, who a file is shared with and
// for how long (the same choices when a file is put in and when its owner changes them, C-576), a friend's link shown
// its one time, a daemon picked from the ones you have (the reader of a text, the speaker of a scene), the three dots
// of a making, and the JOBS as a page watches them. Every word DRAFT.
import { useEffect, useState } from "react";
import { Platform, Share as Sheet } from "react-native";
import { Input, Text, XStack, YStack } from "tamagui";
import { minutesOf, MOST_MINUTES, type Share } from "../../../server/src/hoard/rules";
import { linkOf, onJobs, type Held, type Job, type JobsNow } from "../../platform/hoard";
import { api } from "../../platform/net";
import { Action, Art, Choice, Entry, Small, whenSaid } from "../../shared/ui/ui";
import type { Daemon, Index } from "../../state/types";

export const Back = ({ to, onPress }: { to: string; onPress: () => void }) =>
  <Text fontFamily="$mono" fontSize={13} letterSpacing={2} fontWeight="700" color="$color12" cursor="pointer" role="link" onPress={onPress}>{`‹ ${to}`}</Text>;
export const Label = ({ children }: { children: React.ReactNode }) =>
  <Text fontFamily="$mono" fontSize={11} letterSpacing={1} color="$color10" marginTop={6}>{children}</Text>;

// ---- who it is shared with, and for how long ----
export type Lasts = "always" | "time" | "once";
export type Sharing = { share: Share; friend: string; lasts: Lasts; days: string; hours: string; minutes: string };
export const sharingOf = (share: Share = "me", f?: Held): Sharing => {
  const left = f?.until ? Math.max(0, Math.round((f.until - Date.now()) / 60_000)) : 0;
  return { share: f?.shareNow ?? share, friend: f?.friend ?? "", lasts: f && !f.ended && f.once ? "once" : left ? "time" : "always",
           days: left ? String(Math.floor(left / 1440)) : "", hours: left ? String(Math.floor((left % 1440) / 60)) : "", minutes: left ? String(left % 60) : "" };
};
const timeOf = (s: Sharing) => Math.min(MOST_MINUTES, minutesOf(Number(s.days) || 0, Number(s.hours) || 0, Number(s.minutes) || 0));
/** what is still to be said before these can be sent ("" when nothing is) */
export const sharingLacks = (s: Sharing) =>
  s.share === "friend" && !s.friend.trim() ? "Your friend's name first."
  : s.share !== "me" && s.lasts === "time" && timeOf(s) < 1 ? "For how long? Days, hours or minutes." : "";
/** the choices as the hub takes them */
export const sharingAsked = (s: Sharing) => ({
  share: s.share, ...(s.share === "friend" ? { friend: s.friend.trim() } : {}),
  minutes: s.share !== "me" && s.lasts === "time" ? timeOf(s) : null, once: s.share !== "me" && s.lasts === "once",
});
const WHO: Record<Share, string> = {
  me: "Only you see it: a backup of your own.",
  household: "Everyone in the household sees it and can open it.",
  friend: "A link is made for your friend. Whoever holds the link can download it, and nobody else.",
};
const LASTS: Record<Lasts, string> = {
  always: "Until you change it.",
  time: "When the time is up it is yours alone again. It is not removed.",
  once: "The first time someone other than you downloads it whole, its share ends. It is not removed.",
};
const day = (ms: number) => whenSaid(new Date(ms).toISOString());
/** how a file is shared now, in a sentence */
export function sharedSaid(f: Held): string {
  if (f.ended) return `Only ${f.mine ? "you" : f.ownerName} now: its share ${f.once && f.taken ? `ended when it was downloaded, ${day(f.taken)}` : "has run out"}.`;
  if (f.shareNow === "me") return f.mine ? "Only you." : `Only ${f.ownerName}.`;
  const lasts = [f.until ? `until ${day(f.until)}` : "", f.once ? "until it has been downloaded once" : ""].filter(Boolean).join(", or ");
  return `${f.shareNow === "household" ? "The household" : `${f.friend ?? "A friend"}, by a link`}${lasts ? `, ${lasts}` : ", for always"}.`;
}

/** the same, in a few words, for a row in a list */
export const sharedShort = (f: Held) => (f.ended ? "its share has ended" : f.shareNow === "me" ? "only you" : f.shareNow === "household" ? "the household" : `with ${f.friend ?? "a friend"}`);

const Count = ({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) => (
  <XStack alignItems="center" gap={6}>
    <Input width={64} value={value} onChangeText={(v) => onChange(v.replace(/[^0-9]/g, "").slice(0, 3))} placeholder="0" keyboardType="number-pad"
           backgroundColor="$color1" borderColor="$color6" color="$color12" fontSize={15} textAlign="center" />
    <Text fontFamily="$mono" fontSize={11} letterSpacing={1} color="$color10">{label}</Text>
  </XStack>
);
export function ShareEditor({ value: s, onChange, ink }: { value: Sharing; onChange: (s: Sharing) => void; ink: string }) {
  const set = (p: Partial<Sharing>) => onChange({ ...s, ...p });
  return (
    <YStack gap={4}>
      <Label>WHO IT IS SHARED WITH</Label>
      <Choice<Share> value={s.share} ink={ink} onPick={(share) => set({ share })}
                     options={[["me", "ONLY YOU"], ["household", "THE HOUSEHOLD"], ["friend", "A FRIEND"]]} />
      <Small color="$color10">{WHO[s.share]}</Small>
      {s.share === "friend" ? <Entry value={s.friend} onChange={(friend) => set({ friend })} onSubmit={() => {}} placeholder="your friend's name" limit={60} /> : null}
      {s.share !== "me" ? (<>
        <Label>FOR HOW LONG</Label>
        <Choice<Lasts> value={s.lasts} ink={ink} onPick={(lasts) => set({ lasts })}
                       options={[["always", "ALWAYS"], ["time", "A LIMITED TIME"], ["once", "UNTIL THEY HAVE DOWNLOADED IT"]]} />
        {s.lasts === "time" ? (
          <XStack gap={12} flexWrap="wrap" marginTop={4}>
            <Count label="DAYS" value={s.days} onChange={(days) => set({ days })} />
            <Count label="HOURS" value={s.hours} onChange={(hours) => set({ hours })} />
            <Count label="MINUTES" value={s.minutes} onChange={(minutes) => set({ minutes })} />
          </XStack>
        ) : null}
        <Small color="$color10">{LASTS[s.lasts]}</Small>
      </>) : null}
    </YStack>
  );
}

// a friend's link: the hub says it once and keeps only what proves it, so it is shown here until the page is left
export function LinkOnce({ path, friend, ink }: { path: string; friend: string | null; ink: string }) {
  const link = linkOf(path);
  const [said, setSaid] = useState("");
  const hand = async () => {
    if (Platform.OS !== "web") { await Sheet.share({ message: link }); return; }
    try { await navigator.clipboard.writeText(link); setSaid("Copied."); } catch { setSaid("Select it above and copy it."); }
  };
  return (
    <YStack gap={4} backgroundColor="$color2" borderRadius={6} padding={12} marginTop={6}>
      <Small color="$color12">{`The link for ${friend || "your friend"}. It is shown this once: ${Platform.OS === "web" ? "copy" : "send"} it now.`}</Small>
      <Text fontFamily="$mono" fontSize={13} color="$color12" {...(Platform.OS === "web" ? { userSelect: "text" } : { selectable: true })}>{link}</Text>
      <Action label={Platform.OS === "web" ? "COPY THE LINK" : "SEND THE LINK"} ink={ink} onPress={hand} />
      <Small color="$color10">{said || "It opens wherever this hub can be reached at that address."}</Small>
    </YStack>
  );
}

// ---- a daemon of yours, picked: the party first, then every one bound in the INDEX ----
export type Had = { species: number; name: string };
let HAD: Had[] | null = null;                                // for this run of the app: a picker opened again is drawn at once
export function useDaemons(): Had[] | null {
  const [had, setHad] = useState<Had[] | null>(HAD);
  useEffect(() => {
    let gone = false;
    Promise.all([api<{ party: Daemon[] }>("/api/party").catch(() => ({ party: [] as Daemon[] })),
                 api<Index>("/api/index").catch(() => null)]).then(([p, ix]) => {
      const out: Had[] = [], seen = new Set<number>();
      const add = (species: number, name: string) => { if (!seen.has(species)) { seen.add(species); out.push({ species, name }); } };
      for (const d of p.party) add(d.species, d.nickname || d.name);
      for (const e of ix?.entries ?? []) if (e.bound) add(e.species, e.name);
      HAD = out;
      if (!gone) setHad(out);
    });
    return () => { gone = true; };
  }, []);
  return had;
}
const FIRST = 12;
export function DaemonPick({ value, onPick }: { value: number | null; onPick: (species: number) => void }) {
  const had = useDaemons();
  const [all, setAll] = useState(false);
  if (!had) return <Small color="$color8">…</Small>;
  if (!had.length) return <Small color="$color10">No daemon yet: SYNC your save, and the ones you have are here.</Small>;
  const shown = all ? had : [...had.slice(0, FIRST), ...had.slice(FIRST).filter((d) => d.species === value)];
  return (
    <XStack gap={2} flexWrap="wrap" alignItems="flex-start">
      {shown.map((d) => (
        <YStack key={d.species} role="button" cursor="pointer" width={72} gap={2} padding={2} borderRadius={6} alignItems="center" aria-label={d.name}
                borderWidth={2} borderColor={value === d.species ? "$color9" : "transparent"} onPress={() => onPick(d.species)}>
          <Art path={`/art/species/${d.species}.png`} size={48} />
          <Text fontFamily="$mono" fontSize={10} numberOfLines={1} fontWeight={value === d.species ? "800" : "500"} color="$color12">{d.name}</Text>
        </YStack>
      ))}
      {!all && had.length > shown.length ? (
        <Text fontFamily="$mono" fontSize={11} letterSpacing={1} color="$color9" cursor="pointer" role="button" alignSelf="center" padding={8}
              onPress={() => setAll(true)}>{`ALL ${had.length} ›`}</Text>
      ) : null}
    </XStack>
  );
}
export const daemonSaid = (had: Had[] | null, species: number | null | undefined) => had?.find((d) => d.species === species)?.name ?? "a daemon";

// ---- the JOBS, as a page watches them; a bar; the three dots of a making ----
export function useJobs(): JobsNow {
  const [j, setJ] = useState<JobsNow>({ jobs: [], now: null, asked: false, missing: false, error: "" });
  useEffect(() => onJobs(setJ), []);
  return j;
}
export const Bar = ({ part }: { part: number }) => (
  <XStack height={8} borderRadius={4} backgroundColor="$color4" overflow="hidden">
    <YStack width={`${Math.round(Math.max(0, Math.min(1, part || 0)) * 100)}%`} backgroundColor="$color9" />
  </XStack>
);
export const STAGES = ["THINKING", "FINDING ITS VOICE", "SPEAKING"];
/** Which of the three an answer is at. The hub says where a making is (its `stage`: seeing, thinking, voice, making,
 *  keeping); the third dot, SPEAKING, is the answer played here once it is made. An older hub says it only in words. */
export function stageOf(j: Job): number {
  if (j.state === "done") return 2;
  if (j.state !== "making") return -1;
  if (j.stage) return j.stage === "voice" ? 1 : j.stage === "making" || j.stage === "keeping" ? 2 : 0;
  return /voice/i.test(j.step ?? "") ? 1 : j.progress >= 0.92 ? 2 : 0;
}
export function Dots({ at }: { at: number }) {
  return (
    <XStack gap={14} flexWrap="wrap" alignItems="center" paddingVertical={4}>
      {STAGES.map((word, i) => (
        <XStack key={word} gap={6} alignItems="center">
          <YStack width={10} height={10} borderRadius={5} borderWidth={1.5} borderColor="$color9"
                  backgroundColor={i <= at ? "$color9" : "transparent"} opacity={i < at ? 0.45 : 1} />
          <Text fontFamily="$mono" fontSize={11} letterSpacing={1} fontWeight={i === at ? "800" : "400"} color={i === at ? "$color12" : "$color10"}>{word}</Text>
        </XStack>
      ))}
    </XStack>
  );
}
