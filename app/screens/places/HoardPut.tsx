// C-576, C-601 (C-596): a file put in THE HOARD -- picked on this device, then COPY (a backup: the device keeps its own)
// or MOVE (to free the space here), who it is shared with, and for how long. A MOVE lets go of this app's own copy
// only once the hub's copy has been checked against it (platform/hoard.ts settle), and says plainly what it could not
// remove: a picked file is a copy, and the one it was picked from is never this app's to delete. A file that WHEN
// (SETTINGS, THE HOARD) holds back waits in a short queue here, each with SEND IT NOW. Every word DRAFT.
import * as DocumentPicker from "expo-document-picker";
import { useEffect, useState } from "react";
import { Text, XStack, YStack } from "tamagui";
import { mimeOf, sizeSaid } from "../../../server/src/hoard/rules";
import { forgetWaiting, onWaiting, putIn, sendWaiting, waiting, type Moved, type Put, type Putting, type Waiting } from "../../platform/hoard";
import { ON_PHONE } from "../../platform/net";
import { hoardKept } from "../../state/hoard";
import { Action, Card, Choice, Eyebrow, Small } from "../../shared/ui/ui";
import { Back, Label, LinkOnce, ShareEditor, sharingAsked, sharingLacks, sharingOf, type Sharing } from "./HoardParts";

const HERE = ON_PHONE ? "this phone" : "this computer";
const HOW: Record<Putting["how"], string> = {
  copy: `A backup: ${HERE} keeps its own.`,
  move: ON_PHONE
    ? "To free the space here. THE HOARD's copy is checked against yours first; then this app lets go of its own copy. The file you pick it from stays where it is: this app is not allowed to remove that one, so it is yours to remove."
    : "To free the space here. THE HOARD's copy is checked against yours first; then it is safe to remove yours. A browser cannot remove a file for you.",
};
/** what became of this device's own copy, said plainly */
export function movedSaid(how: Putting["how"], m: Moved): string {
  if (how !== "move") return "";
  if (m.same === false) return "THE HOARD's copy does not match yours, so nothing was removed here. Remove that one from THE HOARD and put this in again.";
  if (m.same === null) return "THE HOARD has it, but its copy could not be checked against yours here, so nothing was removed. Open it from THE HOARD before you remove your own.";
  return m.removed
    ? "Checked: THE HOARD's copy is the same as yours, byte for byte, and this app has let go of its own copy. The file you picked it from is still there. It is safe to remove it now; this app cannot do that for you."
    : `Checked: THE HOARD's copy is the same as yours, byte for byte. It is safe to remove yours now; ${ON_PHONE ? "this app" : "a browser"} cannot do that for you.`;
}

// what a put brought back: that it is in, what became of the local copy, and a friend's link, its one time
function Done({ name, how, put, moved, ink }: { name: string; how: Putting["how"]; put: Put; moved: Moved; ink: string }) {
  return (
    <YStack gap={4} paddingVertical={6}>
      <Small color="$color12">{`In THE HOARD: ${name}, ${sizeSaid(put.file.size)}.`}</Small>
      {movedSaid(how, moved) ? <Small>{movedSaid(how, moved)}</Small> : null}
      {put.link ? <LinkOnce path={put.link} friend={put.file.friend} ink={ink} /> : null}
    </YStack>
  );
}

export function PutIn({ ink, onBack, onPut }: { ink: string; onBack: () => void; onPut: () => void }) {
  const [picked, setPicked] = useState<Pick<Putting, "uri" | "name" | "mime" | "size" | "blob"> | null>(null);
  const [how, setHow] = useState<Putting["how"]>("copy");
  const [sharing, setSharing] = useState<Sharing>(() => sharingOf(hoardKept().share));
  const [busy, setBusy] = useState(false), [said, setSaid] = useState("");
  const [done, setDone] = useState<{ name: string; how: Putting["how"]; put: Put; moved: Moved } | null>(null);
  const [held, setHeld] = useState<Waiting | null>(null);
  const pick = async () => {
    setSaid("");
    try {
      const r = await DocumentPicker.getDocumentAsync({ type: "*/*", copyToCacheDirectory: true, multiple: false });
      if (r.canceled || !r.assets?.[0]) return;
      const a = r.assets[0];
      setPicked({ uri: a.uri, name: a.name, mime: mimeOf(a.name, a.mimeType), size: a.size ?? null, blob: (a as { file?: Blob }).file });
      setDone(null); setHeld(null);
    } catch (e) { setSaid((e as Error).message); }
  };
  const send = async () => {
    if (!picked || busy) return;
    const lacks = sharingLacks(sharing);
    if (lacks) { setSaid(lacks); return; }
    setBusy(true); setSaid("");
    try {
      const r = await putIn({ ...picked, how, ...sharingAsked(sharing) });
      if ("waiting" in r) setHeld(r.waiting); else { setDone({ name: picked.name, how, put: r.put, moved: r.moved }); onPut(); }
      setPicked(null);
    } catch (e) { setSaid((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <YStack gap={12}>
      <Back to="THE HOARD" onPress={onBack} />
      <Card>
        <Eyebrow>{"PUT A FILE IN · DRAFT"}</Eyebrow>
        {picked ? (<>
          <Text fontSize={17} fontWeight="600" color="$color12">{picked.name}</Text>
          <Small>{`${picked.size !== null ? `${sizeSaid(picked.size)} · ` : ""}${picked.mime}`}</Small>
        </>) : <Small>{`Any file on ${HERE}. It is kept on the household's own machines, and nowhere else.`}</Small>}
        <Action label={picked ? "CHOOSE ANOTHER" : "CHOOSE A FILE"} ink={ink} onPress={pick} />
        {picked ? (<>
          <Label>COPY IT, OR MOVE IT</Label>
          <Choice<Putting["how"]> value={how} ink={ink} onPick={setHow} options={[["copy", "COPY"], ["move", "MOVE"]]} />
          <Small color="$color10">{HOW[how]}</Small>
          <ShareEditor value={sharing} onChange={setSharing} ink={ink} />
          <Action label={busy ? "SENDING…" : "PUT IT IN THE HOARD"} ink={ink} onPress={send} />
          {busy ? <Small color="$color10">{ON_PHONE ? "It carries on if the phone is locked. A long file takes a while." : "Keep this page open until it is in."}</Small> : null}
        </>) : null}
        {said ? <Small color="$color8">{said}</Small> : null}
        {done ? <Done {...done} ink={ink} /> : null}
        {held ? <Small color="$color12">{`${held.name} waits on ${HERE}: ${held.why}. It goes by itself while THE HOARD is open, or SEND IT NOW from its FILES.`}</Small> : null}
      </Card>
    </YStack>
  );
}

// the short queue: what WHEN holds back, or what could not reach the hub. Tried again while the page is open.
export function WaitingList({ ink, onSent }: { ink: string; onSent: () => void }) {
  const [list, setList] = useState<Waiting[]>(() => waiting());
  const [busy, setBusy] = useState(""), [done, setDone] = useState<(Waiting & { put: Put; moved: Moved })[]>([]);
  const go = async (only?: string) => {
    if (only) setBusy(only);
    try { const r = await sendWaiting(only); if (r.sent.length) { setDone((d) => [...r.sent, ...d]); onSent(); } }
    finally { if (only) setBusy(""); }
  };
  useEffect(() => {
    const off = onWaiting(() => setList(waiting()));
    go().catch(() => {});
    const t = setInterval(() => { if (waiting().length) go().catch(() => {}); }, 30_000);
    return () => { off(); clearInterval(t); };
  }, []);
  if (!list.length && !done.length) return null;
  return (
    <Card borderLeftWidth={6} borderLeftColor="$color5">
      {list.length ? (<>
        <Eyebrow>WAITING TO GO</Eyebrow>
        <Small color="$color10">{`Kept on ${HERE} until it may go (SETTINGS, THE HOARD says when).`}</Small>
        {list.map((w) => (
          <XStack key={w.id} gap={8} alignItems="center" flexWrap="wrap" paddingVertical={4} borderTopWidth={1} borderColor="$color5">
            <YStack flex={1} minWidth={160}>
              <Text fontSize={15} color="$color12" numberOfLines={1}>{w.name}</Text>
              <Small color="$color10">{`${w.size !== null ? `${sizeSaid(w.size)} · ` : ""}${w.why}`}</Small>
            </YStack>
            <Action label={busy === w.id ? "SENDING…" : "SEND IT NOW"} ink={ink} onPress={() => go(w.id)} />
            <Action label="FORGET" ink={ink} onPress={() => forgetWaiting(w.id)} />
          </XStack>
        ))}
      </>) : null}
      {done.map((d) => <Done key={d.put.file.id} name={d.name} how={d.how} put={d.put} moved={d.moved} ink={ink} />)}
    </Card>
  );
}
