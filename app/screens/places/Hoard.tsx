// C-501, C-596 (the user, 2026-11-24, 2026-11-27): THE HOARD -- the household's own local cloud storage: files kept on
// the household's own machines, each with an owner and a share. A card on PLACES opens its page, in three parts:
//
//   FILES       yours, and what is shared with you; how much of THE HOARD is used and which machines hold it; a file
//               put in (HoardPut.tsx), and what waits to go
//   JOBS        what the hub is making from a file, one at a time (HoardJobs.tsx)
//   CREATIONS   what was made: texts read aloud, photos that speak, MAGIC VIDEOS (HoardVideo.tsx) and answers
//
// A file opens on its own page (HoardFile.tsx). Nothing here is shown from what the phone kept: THE HOARD is asked
// each time (platform/hoard.ts says why). A phone hosting on its own has no hub, and so no HOARD. Every word DRAFT.
import { useCallback, useEffect, useRef, useState } from "react";
import { Text, XStack, YStack } from "tamagui";
import { looksOf, sizeSaid, type Looks } from "../../../server/src/hoard/rules";
import { filesOf, hoardNow, live, notYet, type Held, type HoardNow, type Machine } from "../../platform/hoard";
import { ALONE } from "../../platform/net";
import { usePlace } from "../../state/place";
import { Action, Card, Choice, Eyebrow, Segments, Small, whenSaid } from "../../shared/ui/ui";
import { FileView } from "./HoardFile";
import { JobsList, KIND_SAID } from "./HoardJobs";
import { Back, sharedShort, useJobs } from "./HoardParts";
import { PutIn, WaitingList } from "./HoardPut";
import { MakeVideo } from "./HoardVideo";

const ABOUT = "The household's own storage: files kept on your own machines, each with an owner and a share.";
const OLDER = "This hub has no HOARD yet. Update it (the hub's deploy), then come back.";
// how much is used, and which machines hold it
const usedSaid = (n: HoardNow) => (n.capacity > 0 ? `${sizeSaid(n.used)} of ${sizeSaid(n.capacity)} used, ${sizeSaid(n.free)} free.`
  : "No machine offers it any room yet: a keeper gives it some in THE ENGINE ROOM.");
const machineSaid = (m: Machine) => `${m.name}${m.state === "retiring" ? " (leaving)" : !m.fresh ? " (away)" : m.rests ? " (resting)" : ""}`;
function heldSaid(n: HoardNow): string {
  const on = n.nodes.filter((m) => m.state !== "gone");
  const main = on.filter((m) => m.kind === "extend").map(machineSaid), twice = on.filter((m) => m.kind === "replica").map(machineSaid);
  if (!main.length && !twice.length) return "";
  return `${main.length ? `Held on ${main.join(", ")}` : "No machine holds its files yet"}${twice.length ? `; a second copy of everything on ${twice.join(", ")}` : ""}.`;
}

// C-344: the last answer, for this run of the app -- the card and the page opened again are drawn at once, at their height
const SEEN: { now: HoardNow | null; files: Held[] | null } = { now: null, files: null };

// the card on PLACES
export function HoardCard({ ink, onOpen }: { ink: string; onOpen: () => void }) {
  const [now, setNow] = useState<HoardNow | null>(SEEN.now), [said, setSaid] = useState("");
  useEffect(() => {
    let gone = false;
    hoardNow().then((n) => { SEEN.now = n; if (!gone) { setNow(n); setSaid(""); } }).catch((e) => { if (!gone) setSaid(notYet(e) ? OLDER : (e as Error).message); });
    return () => { gone = true; };
  }, []);
  return (
    <Card borderLeftWidth={6} borderLeftColor={now && now.capacity > 0 ? "$color9" : "$color5"} minHeight={150}>
      <Eyebrow>THE HOARD</Eyebrow>
      <Small>{ABOUT}</Small>
      <Small color={said && !now ? "$color8" : "$color12"}>{now ? `${usedSaid(now)} ${now.files === 1 ? "One file is" : `${now.files} files are`} yours or shared with you.` : said || "…"}</Small>
      <Action label="OPEN THE HOARD ›" ink={ink} onPress={onOpen} />
      <Small color="$color8">DRAFT</Small>
    </Card>
  );
}

const GLYPH: Record<Looks, string> = { audio: "♪", video: "▶", text: "¶", image: "▣", other: "◇" };
function FileRow({ f, onPress }: { f: Held; onPress: () => void }) {
  return (
    <XStack gap={10} alignItems="center" paddingVertical={8} borderTopWidth={1} borderColor="$color5" cursor="pointer" role="button" onPress={onPress}>
      <YStack width={34} height={34} borderRadius={6} backgroundColor="$color3" alignItems="center" justifyContent="center">
        <Text fontSize={16} color="$color11">{GLYPH[looksOf(f.mime)]}</Text>
      </YStack>
      <YStack flex={1}>
        <Text fontSize={15} fontWeight="600" color="$color12" numberOfLines={1}>{f.name}</Text>
        <Small color="$color10">{[sizeSaid(f.size), whenSaid(new Date(f.added).toISOString()), f.mine ? sharedShort(f) : `from ${f.ownerName}`,
                                  f.protected ? "PROTECTED" : ""].filter(Boolean).join(" · ")}</Small>
      </YStack>
      <Text fontFamily="$mono" fontSize={14} color="$color9">›</Text>
    </XStack>
  );
}

type Seg = "files" | "jobs" | "creations";
type Scope = "mine" | "shared";
const MADE: [string, string][] = [["spoken", "TEXTS READ ALOUD"], ["magic", "PHOTOS THAT SPEAK"], ["video", "MAGIC VIDEOS"], ["answer", "ANSWERS"]];

export function HoardScreen({ ink, onClose }: { ink: string; onClose: () => void }) {
  const [seg, setSeg] = usePlace<Seg>("places.hoard.seg", "files");
  const [scope, setScope] = usePlace<Scope>("places.hoard.scope", "mine");
  const [open, setOpen] = usePlace<string | null>("places.hoard.open", null);
  const [page, setPage] = useState<"" | "put" | "video">("");
  const [now, setNow] = useState<HoardNow | null>(SEEN.now), [files, setFiles] = useState<Held[] | null>(SEEN.files);
  const [error, setError] = useState("");
  const jobs = useJobs();
  const load = useCallback(() => {
    hoardNow().then((n) => { SEEN.now = n; setNow(n); }).catch(() => {});
    filesOf("all").then((l) => { SEEN.files = l; setFiles(l); setError(""); }).catch((e) => setError(notYet(e) ? OLDER : (e as Error).message));
  }, []);
  useEffect(load, [load]);
  // a job finished: what it made is in THE HOARD now
  const finished = jobs.jobs.filter((j) => j.state === "done").length, was = useRef(finished);
  useEffect(() => { if (finished !== was.current) { was.current = finished; load(); } }, [finished, load]);

  if (ALONE) return (
    <YStack gap={12}>
      <Back to="PLACES" onPress={onClose} />
      <Card><Eyebrow>THE HOARD</Eyebrow><Small>THE HOARD is kept by a hub, and this phone is on its own. Pair with a companion in SETTINGS to use it.</Small></Card>
    </YStack>
  );
  const all = files ?? [];
  const opened = open ? all.find((f) => f.id === open) ?? null : null;
  if (opened) return (
    <FileView key={opened.id} f={opened} all={all} ink={ink} onBack={() => setOpen(null)} onOpen={setOpen}
              onChanged={(f) => { setFiles((l) => (l ?? []).map((x) => (x.id === f.id ? f : x))); load(); }}
              onRemoved={() => { setOpen(null); load(); }} onJobs={() => { setOpen(null); setSeg("jobs"); }} />
  );
  if (page === "put") return <PutIn ink={ink} onBack={() => { setPage(""); load(); }} onPut={load} />;
  if (page === "video") return <MakeVideo files={all} ink={ink} onBack={() => setPage("")} onQueued={() => { setPage(""); setSeg("jobs"); }} />;

  const plain = all.filter((f) => f.kind === "file"), made = all.filter((f) => f.kind !== "file");
  const listed = plain.filter((f) => (scope === "mine") === f.mine);
  const inHand = jobs.jobs.filter(live).length;
  return (
    <YStack gap={14}>
      <Back to="PLACES" onPress={onClose} />
      <Card borderLeftWidth={6} borderLeftColor={now && now.capacity > 0 ? "$color9" : "$color5"}>
        <Eyebrow>{"THE HOARD · DRAFT"}</Eyebrow>
        <Small>{ABOUT}</Small>
        {now ? <Small color="$color12">{usedSaid(now)}</Small> : null}
        {now && heldSaid(now) ? <Small color="$color10">{heldSaid(now)}</Small> : null}
        {error ? <Small color="$color8">{error}</Small> : null}
      </Card>
      <Segments<Seg> value={seg} onChange={setSeg} options={[["files", "FILES"], ["jobs", inHand ? `JOBS · ${inHand}` : "JOBS"], ["creations", "CREATIONS"]]} />
      {seg === "files" ? (<>
        <Action label="PUT A FILE IN" ink={ink} onPress={() => setPage("put")} />
        <WaitingList ink={ink} onSent={load} />
        <Card>
          <Choice<Scope> value={scope} ink={ink} onPick={setScope} options={[["mine", "MINE"], ["shared", "SHARED WITH ME"]]} />
          {!files ? <Small color="$color8">{error ? "" : "…"}</Small>
            : listed.length ? listed.map((f) => <FileRow key={f.id} f={f} onPress={() => setOpen(f.id)} />)
            : <Small>{scope === "mine" ? "Nothing of yours is in THE HOARD yet. PUT A FILE IN, above." : "Nobody in the household has shared a file with you yet."}</Small>}
        </Card>
      </>) : null}
      {seg === "jobs" ? <JobsList now={jobs} ink={ink} onOpen={(id) => { load(); setOpen(id); }} /> : null}
      {seg === "creations" ? (<>
        <Action label="MAKE A MAGIC VIDEO" ink={ink} onPress={() => setPage("video")} />
        {!made.length ? <Card><Small>{"Nothing made yet. Open a file to have a text READ ALOUD, to MAKE a picture SPEAK, or to ASK IT something; or MAKE A MAGIC VIDEO, above."}</Small></Card> : null}
        {MADE.map(([kind, title]) => {
          const these = made.filter((f) => f.kind === kind);
          return these.length ? (
            <Card key={kind}>
              <Eyebrow>{title}</Eyebrow>
              {these.map((f) => <FileRow key={f.id} f={f} onPress={() => setOpen(f.id)} />)}
            </Card>
          ) : null;
        })}
        {made.some((f) => !(f.kind in KIND_SAID)) ? (
          <Card><Eyebrow>OTHER CREATIONS</Eyebrow>{made.filter((f) => !(f.kind in KIND_SAID)).map((f) => <FileRow key={f.id} f={f} onPress={() => setOpen(f.id)} />)}</Card>
        ) : null}
      </>) : null}
    </YStack>
  );
}
