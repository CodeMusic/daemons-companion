// C-254: THE MIND -- a look around the daemon's mind (the user, 2026-10-30; decided 2026-10-31: "feelings shown (face,
// colour, the room's weather) with the words behind a tap; the portal opens on NOW"). NOW shows its face, the colour of
// what it feels and the weather in its room; a tap on a feeling shows the words a model is given ("very GLAD") and the
// event behind the strongest. DREAMS sets the companion's last dream beside the one the save carries home (T-462).
// VOICE is the recipe it speaks in, with a line to hear; SELF the sentences a model reads, exactly. REMEMBERED waits on
// the night's memory (C-253). GET /api/mind/portal (server/src/mind.ts). Every word DRAFT.
import { useEffect, useState } from "react";
import { Pressable } from "react-native";
import { Text, XStack, YStack } from "tamagui";
import { api, apiLater } from "../../platform/net";
import type { Spoken } from "../../state/types";
import { Action, Art, Card, Eyebrow, Segments, Small, whenSaid } from "../../ui/ui";
import { useVoice } from "./Daemon";
import { useFresh } from "../../platform/useApi";   // C-344

type FeltName = "GLAD" | "MAD" | "SAD" | "CALM" | "AFRAID" | "RESTLESS";
type Felt = { name: FeltName; value: number; said: string; colour: string };
type Mind = {
  daemon: { nickname: string; slot: number; species: number; expression: string | null } | null;
  now?: { felt: Felt[]; weather: string; colour: string | null; cause: { said: string; at: string; name: FeltName } | null };
  dream?: { title: string; text: string; at: string; quality: string } | null;
  game?: { title: string; quality: string; tucked: boolean; hours: number; nights: number; rested: number } | null;
  remembered?: { yesterday: string | null; month: string | null };
  voice?: { species: number | null; recipe: string; own: string };
  self?: string;
  spirits?: { class: "good" | "as it is" | "low" | null; words: string | null; tone: number;
              totals: Record<Axis, number>; said: Record<Axis, string> };   // C-296
};
type Axis = "kept" | "bond" | "work" | "portion";
type Part = "now" | "dreams" | "voice" | "self" | "remembered";

export function MindScreen() {
  const [m, setM] = useState<Mind | null>(null), [error, setError] = useState("");
  const [part, setPart] = useState<Part>("now");                 // the portal opens on NOW
  const fresh = useFresh();   // C-344: a fresher answer read again in place
  useEffect(() => { api<Mind>("/api/mind/portal").then(setM).catch((e) => setError(e.message)); }, [fresh]);
  if (error) return <Small color="$color8">{/404|not found/i.test(error) ? "THE MIND opens when the app is paired with a companion.  DRAFT" : error}</Small>;
  if (!m) return null;
  if (!m.daemon) return <Card><Small>{"No daemon is carried. Send one from the game, and its mind opens here.  DRAFT"}</Small></Card>;
  return (
    <YStack gap={12}>
      <Small>{`A look around ${m.daemon.nickname}'s mind.  DRAFT`}</Small>
      <Segments value={part} onChange={setPart} options={[["now", "NOW"], ["dreams", "BOTH DREAMS"], ["voice", "VOICE"], ["self", "SELF"], ["remembered", "REMEMBERED"]]} />
      {part === "now" && m.now ? <Now m={m} /> : null}
      {part === "now" && m.spirits ? <SpiritsCard s={m.spirits} /> : null}
      {part === "dreams" ? <Dreams m={m} /> : null}
      {part === "voice" && m.voice ? <Voice v={m.voice} /> : null}
      {part === "self" ? <Card><Eyebrow>{"WHAT A MIND IS GIVEN"}</Eyebrow>
        <Small>{"These are the sentences a model reads before it speaks as your daemon, exactly as it reads them.  DRAFT"}</Small>
        <Text fontFamily="$mono" fontSize={12} lineHeight={18} color="$color12">{m.self ?? ""}</Text></Card> : null}
      {part === "remembered" ? <Remembered r={m.remembered} /> : null}
    </YStack>
  );
}

const faceQuery = (e: string | null) => (e && e !== "awake" ? `?expression=${e}` : "");

function Now({ m }: { m: Mind }) {
  const n = m.now!, d = m.daemon!;
  const [open, setOpen] = useState<FeltName | null>(null);      // the words, behind a tap
  const wash = n.colour ?? "#9aa39a";
  return (
    <YStack gap={12}>
      {/* the room: its weather in the feeling's colour, the face in the middle */}
      <YStack borderRadius={10} overflow="hidden" borderWidth={1} borderColor={wash} backgroundColor={`${wash}22`} alignItems="center"
              paddingVertical={18} gap={8}>
        <Art path={`/art/party/${d.slot}.png${faceQuery(d.expression)}`} size={128} />
        <Text fontFamily="$mono" fontSize={12} letterSpacing={2} color={n.colour ?? "$color10"}>{n.weather.toUpperCase()}</Text>
      </YStack>
      {/* each feeling as a band of its colour, as wide as it is felt; tap one for its words */}
      <YStack gap={8}>
        {n.felt.map((f) => (
          <Pressable key={f.name} onPress={() => setOpen(open === f.name ? null : f.name)} aria-label={`a feeling: tap for its words`}>
            <YStack gap={4}>
              <XStack height={14} borderRadius={7} backgroundColor="$color3" overflow="hidden">
                <YStack width={`${Math.max(3, f.value)}%`} backgroundColor={f.colour} borderRadius={7} />
              </XStack>
              {open === f.name ? (
                <YStack paddingLeft={4} gap={2}>
                  <Text fontFamily="$mono" fontSize={13} fontWeight="700" color={f.colour}>{f.said}</Text>
                  {n.cause && n.cause.name === f.name ? <Small>{`Most of it from this: ${n.cause.said}, ${whenSaid(n.cause.at)}.`}</Small> : null}
                </YStack>
              ) : null}
            </YStack>
          </Pressable>
        ))}
      </YStack>
      <Small color="$color10">{"Tap a colour for its words.  DRAFT"}</Small>
    </YStack>
  );
}

// C-296: its SPIRITS -- the class the save holds, in the game's own words, and the four weeks the companion has seen
const AXES: [Axis, string][] = [["kept", "KEPT"], ["bond", "BOND"], ["work", "WORK"], ["portion", "PORTION"]];
const CLASS_LINE = { good: "In good spirits: its pictures here are a shade lighter.", low: "In low spirits: its pictures here are a shade darker. The way back is always open.",
                     "as it is": "As it is." } as const;
function SpiritsCard({ s }: { s: NonNullable<Mind["spirits"]> }) {
  return (
    <Card>
      <Eyebrow>{"SPIRITS"}</Eyebrow>
      <Small>{s.class ? CLASS_LINE[s.class] : "The save does not say yet. Its spirits arrive with the game's next release."}</Small>
      <YStack gap={6}>
        {AXES.map(([a, label]) => (
          <XStack key={a} gap={10} alignItems="baseline">
            <Text fontFamily="$mono" fontSize={12} letterSpacing={1.5} width={78} color="$color10">{label}</Text>
            <Text fontSize={15} color="$color12" flex={1}>{s.said[a]}</Text>
          </XStack>
        ))}
      </YStack>
      <Small color="$color10">{"The last four weeks here. The game keeps its spirits; the companion only reads them.  DRAFT"}</Small>
    </Card>
  );
}

const HOW: Record<string, string> = { vivid: "A VIVID NIGHT", quiet: "A QUIET NIGHT", broken: "A BROKEN NIGHT" };
function Dreams({ m }: { m: Mind }) {
  return (
    <YStack gap={12}>
      <Card>
        <Eyebrow>{"THE COMPANION'S LAST DREAM"}</Eyebrow>
        {m.dream ? <>
          <Text fontFamily="$mono" fontSize={14} letterSpacing={1.5} fontWeight="700" color="$color12">{m.dream.title}</Text>
          <Small color="$color10">{`${HOW[m.dream.quality] ?? ""} · ${whenSaid(m.dream.at)}`}</Small>
          <Text fontSize={15} color="$color12">{m.dream.text}</Text>
        </> : <Small>{"No night slept here yet. Tuck it in on the watch, the phone or the widget.  DRAFT"}</Small>}
      </Card>
      <Card>
        <Eyebrow>{"THE DREAM THE GAME CARRIES"}</Eyebrow>
        {m.game ? <>
          <Text fontFamily="$mono" fontSize={14} letterSpacing={1.5} fontWeight="700" color="$color12">{m.game.title}</Text>
          <Small>{`${HOW[m.game.quality] ?? ""}, ${m.game.hours} hours${m.game.tucked ? ", tucked in" : ""}. ${m.game.nights === 1 ? "One night" : `${m.game.nights} nights`} since it was last carried home, ${m.game.rested} of them rested.`}</Small>
        </> : <Small>{"The save carries no dream yet. A night slept here goes into the game at the next SYNC.  DRAFT"}</Small>}
      </Card>
    </YStack>
  );
}

const A_LINE = "This is how I sound today.";   // DRAFT
function Voice({ v }: { v: NonNullable<Mind["voice"]> }) {
  const speak = useVoice();
  const [state, setState] = useState("");
  const hear = async () => {
    try {
      setState("Making its voice…");
      const r = await apiLater<Spoken>("/api/ai/speak", { text: A_LINE, daemon: true });
      if (r.error || !r.audioBase64) throw new Error(r.error ?? "No voice came back.");
      setState(""); speak(r.audioBase64);
    } catch (e) { setState((e as Error).message); }
  };
  return (
    <Card>
      <Eyebrow>{v.own ? "THE VOICE YOU GAVE IT" : "THE VOICE OF ITS KIND, AS IT FEELS TODAY"}</Eyebrow>
      <Text fontSize={15} lineHeight={22} color="$color12">{v.recipe}</Text>
      <Action label={`Hear it say "${A_LINE}"`} onPress={hear} />
      {state ? <Small>{state}</Small> : null}
      <Small color="$color10">{"DRAFT"}</Small>
    </Card>
  );
}

function Remembered({ r }: { r?: Mind["remembered"] }) {
  const any = r && (r.yesterday || r.month);
  return (
    <YStack gap={12}>
      {r?.yesterday ? <Card><Eyebrow>{"YESTERDAY"}</Eyebrow><Text fontSize={15} color="$color12">{r.yesterday}</Text></Card> : null}
      {r?.month ? <Card><Eyebrow>{"THE MONTH"}</Eyebrow><Text fontSize={15} color="$color12">{r.month}</Text></Card> : null}
      {!any ? <Card><Small>{"Its days are not yet kept as memory. When the house's mind writes each night's memory, yesterday and the month are read here.  DRAFT"}</Small></Card> : null}
    </YStack>
  );
}
