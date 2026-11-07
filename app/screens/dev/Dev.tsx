// C-275: </> -- DEVELOPER MODE's own tab, after PLACES, only while it is on. The game session as a developer wants to
// see it, section by section: THE BOOKS, GAME EVENTS and CALLOW SCHOOL (each row as the save has it, pre-checked, and
// changeable), THE WITCHING HOUR, YOUR DAEMON (C-269's sliders) and LOGS. Everything here is IN MEMORY ONLY (game/dev.ts):
// never sent to the companion, never in the save or the game; RESTORE THE GAME SESSION, DEVELOPER MODE off or the app shut
// puts the save's own answers back. Every word DRAFT.
import { useEffect, useState } from "react";
import { Text, XStack, YStack } from "tamagui";
import { apiTruth } from "../../platform/net";
import { restoreSession, sessionNow, sessionTouched, setSession, useDev, type Book } from "../../state/dev";
import { mendAgain } from "../../state/mended";   // C-299
import { Logs, PretendPanel } from "../../ui/devpanel";
import { Action, Card, Choice, Eyebrow, Small } from "../../ui/ui";
import type { Life } from "../../state/types";

type Progress = { events: { n: number; name: string; section: string; held: boolean | null }[];
                  school: { textbook: boolean; diploma: boolean } };
const BOOKS: [Book, string, string, (r: any) => boolean][] = [
  ["guide", "THE GUIDE", "/api/guide", (r) => !!r?.held],
  ["subtle", "THE SUBTLE LAYER", "/api/subtle", (r) => !!r?.held],
  ["hermetic", "THE HERMETIC LAYER", "/api/hermetic", (r) => !!r?.held],
  ["eudaimon", "THE EUDAIMON LAYER", "/api/eudaimon", (r) => !!r?.held],   // C-297
  ["unity", "THE UNITY BOOK", "/api/unity", (r) => !!r?.held],   // C-299
  ["play", "PLAY (its instrument)", "/api/play", (r) => !!r?.unlocked],
];

function Tick({ label, on, truth, onPress }: { label: string; on: boolean; truth: boolean | null; onPress: () => void }) {
  const moved = truth !== null && on !== truth;
  return (
    <XStack role="checkbox" aria-checked={on} aria-label={label} cursor="pointer" alignItems="center" gap={10} paddingVertical={5} onPress={onPress}>
      <YStack width={18} height={18} borderRadius={3} borderWidth={2} borderColor="$color9" alignItems="center" justifyContent="center"
              backgroundColor={on ? "$color9" : "transparent"}>
        {on ? <Text fontSize={12} lineHeight={14} fontWeight="800" color="$color1">✓</Text> : null}
      </YStack>
      <Text flex={1} fontFamily="$mono" fontSize={12} letterSpacing={0.5} color="$color12">{label}</Text>
      {moved ? <Text fontFamily="$mono" fontSize={10} color="$color11">{`the save: ${truth ? "held" : "not"}`}</Text>
        : truth === null ? <Text fontFamily="$mono" fontSize={10} color="$color8">the save cannot say</Text> : null}
    </XStack>
  );
}

export function DevScreen({ ink }: { ink: string }) {
  useDev();                                                   // drawn again as the session changes
  const s = sessionNow();
  const [books, setBooks] = useState<Partial<Record<Book, boolean>>>({});
  const [pr, setPr] = useState<Progress | null>(null);
  const [life, setLife] = useState<Life | null>(null);
  const [asked, setAsked] = useState(0);
  useEffect(() => {                                           // the truth, never what </> sets: apiTruth passes devRoute by
    BOOKS.forEach(([b, , path, held]) => apiTruth<any>(path).then((r) => setBooks((was) => ({ ...was, [b]: held(r) }))).catch(() => {}));
    apiTruth<Progress>("/api/progress").then(setPr).catch(() => {});
    apiTruth<Life>("/api/daemon/life").then(setLife).catch(() => {});
  }, [asked]);

  const book = (b: Book) => s.books[b] ?? books[b] ?? false;
  const flip = <K extends string>(map: Partial<Record<K, boolean>>, k: K, now: boolean, truth: boolean | null | undefined) => {
    const next = { ...map };
    if (!now === (truth ?? false)) delete next[k]; else next[k] = !now;   // back to the save's answer: no longer set
    return next;
  };
  const sections = pr ? [...new Set(pr.events.map((e) => e.section))] : [];

  return (
    <YStack gap={14}>
      <Card borderLeftWidth={6} borderLeftColor="$color9">
        <Eyebrow>{"</> THE GAME SESSION · DRAFT"}</Eyebrow>
        <Small>{"What you set here is shown by this app only, for as long as it is open. Nothing reaches the companion, the save or the game. " +
          (sessionTouched() ? "Something here differs from the save." : "Everything here is as the save has it.")}</Small>
        <Action label="Restore the game session" onPress={() => { restoreSession(); setAsked((n) => n + 1); }} ink={ink} />
      </Card>

      <Card>
        <Eyebrow>THE BOOKS</Eyebrow>
        <Small>Checked: held, as the save has it unless you change it. A book held here is read as a preview.</Small>
        {BOOKS.map(([b, label]) => (
          <Tick key={b} label={label} on={book(b)} truth={books[b] ?? null}
                onPress={() => setSession((x) => ({ ...x, books: flip(x.books, b, book(b), books[b]) }))} />
        ))}
        <Action label="Let it mend again" onPress={mendAgain} ink={ink} />{/* C-299: the mending plays once; this plays it again */}
      </Card>

      <Card>
        <Eyebrow>CALLOW SCHOOL</Eyebrow>
        {pr ? (["textbook", "diploma"] as const).map((k) => {
          const truth = pr.school[k], on = s.school[k] ?? truth;
          return <Tick key={k} label={k === "textbook" ? "THE TEXTBOOK" : "THE DIPLOMA"} on={on} truth={truth}
                       onPress={() => setSession((x) => ({ ...x, school: flip(x.school, k, on, truth) }))} />;
        }) : <Small color="$color8">Asking the save...</Small>}
      </Card>

      {sections.map((sec) => (
        <Card key={sec}>
          <Eyebrow>{sec}</Eyebrow>
          {pr!.events.filter((e) => e.section === sec).map((e) => {
            const on = s.events[e.n] ?? e.held ?? false;
            return <Tick key={e.n} label={e.name} on={on} truth={e.held}
                         onPress={() => setSession((x) => ({ ...x, events: flip(x.events as Record<string, boolean>, String(e.n), on, e.held) as Record<number, boolean> }))} />;
          })}
        </Card>
      ))}

      <Card>
        <Eyebrow>THE WITCHING HOUR</Eyebrow>
        <Small>As the clock has it (three to four in the morning), or on or off now. On, it is read as a preview: nothing is kept.</Small>
        <Choice value={s.hour} options={[[null, "As the clock"], [true, "On"], [false, "Off"]]} onPick={(v) => setSession((x) => ({ ...x, hour: v }))} ink={ink} />
      </Card>

      <Card>
        <Eyebrow>THE CREATOR'S HOUR</Eyebrow>
        <Small>As the clock has it (4:24 to 5:12 in the morning), or on now as at its middle -- the light whole and the tone sounding -- or off.</Small>
        <Choice value={s.dawn ?? null} options={[[null, "As the clock"], [true, "On"], [false, "Off"]]} onPick={(v) => setSession((x) => ({ ...x, dawn: v }))} ink={ink} />
      </Card>

      <Card>
        <Eyebrow>NIGHTS OF LIGHT</Eyebrow>
        <Small>The aurora in the den, once THE UNITY BOOK is mended (or held here): as the date has it -- about one night in three, 8 PM to 5 AM, the same nights as the game -- or on now as on a night of light, or off.</Small>
        <Choice value={s.aurora ?? null} options={[[null, "As the date"], [true, "On"], [false, "Off"]]} onPick={(v) => setSession((x) => ({ ...x, aurora: v }))} ink={ink} />
      </Card>

      <Card>
        <Eyebrow>YOUR DAEMON</Eyebrow>
        {life?.care ? <PretendPanel truth={life} onClose={() => {}} />
          : <Small color="$color8">{life ? "No care to set yet: this companion has not looked after a daemon." : "Asking the companion..."}</Small>}
      </Card>

      <Card><YStack height={420}><Logs /></YStack></Card>
    </YStack>
  );
}
