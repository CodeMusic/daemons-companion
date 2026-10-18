// the LIBRARY -- CALLOW SCHOOL, THE GUIDE, NOTEBOOK, SONGBOOK, STREAM (C-145, C-156). (C-157: out of App.tsx.)
import { setAudioModeAsync, useAudioPlayer } from "expo-audio";
import { useEffect, useState } from "react";
import { Image, Linking } from "react-native";
import { Button, Text, XStack, YStack } from "tamagui";
import { BOOK, GUIDE_COVER, lessonParas, letterOf, MARKS, pitch, reflow, SCHOOL, SCREEN } from "../data";
import { api } from "../net";
import { songSound } from "../songSound";
import { GuideBookT, Notebook, Profile, Progress, SchoolData } from "../types";
import { Action, Art, Card, Eyebrow, linkLabel, Para, PIXELATED, Points, Small, useInk } from "../ui";
import { useApi } from "../useApi";
import { previewQuery } from "../preview";
import { PlayBook } from "./Play";
import { SubtleBook, type SubtleT } from "./Subtle";

export function Floor({ f, reached }: { f: SchoolData["floors"][number]; reached: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <YStack borderTopWidth={1} borderColor="$color5" paddingVertical={10} gap={6} opacity={reached ? 1 : 0.45}>
      <XStack onPress={() => reached && setOpen((o) => !o)} justifyContent="space-between" alignItems="center" cursor={reached ? "pointer" : "default"}>
        <Text fontFamily="$mono" fontSize={15} fontWeight="700" letterSpacing={1} color="$color12">{`${f.floor}  ${f.subject}`}</Text>
        <Text fontSize={18} color="$color10">{reached ? (open ? "−" : "+") : ""}</Text>
      </XStack>
      {!reached ? <Small>Not yet stood on.</Small> : null}
      {open ? (
        <YStack gap={8}>
          {reflow(f.syllabus).map((l, i) => <Small key={`s${i}`}>{l}</Small>)}
          {f.board.map((b) => (
            <YStack key={b.topic} backgroundColor="$color2" borderRadius={4} padding={10} gap={4}>
              <Text fontFamily="$mono" fontSize={13} fontWeight="700" letterSpacing={1} color="$color12">{b.topic}</Text>
              {reflow(b.text).map((l, i) => <Text key={i} fontSize={15} lineHeight={22} color="$color12">{l}</Text>)}
            </YStack>
          ))}
        </YStack>
      ) : null}
    </YStack>
  );
}

export function PracticePaper() {
  const all = SCHOOL.paper.flatMap((s) => s.questions.map((q) => ({ ...q, section: s.section })));
  const [at, setAt] = useState<number | null>(null);
  const [picks, setPicks] = useState<Record<number, number>>({});
  const done = at !== null && at >= all.length;
  if (at === null) return (
    <Card>
      <Eyebrow>THE PAPER, TO SIT AGAIN</Eyebrow>
      <Small>{`Seven sections, ${all.length} questions, ${SCHOOL.pass_mark} to pass. Marked here; your save is never touched.`}</Small>
      <Action label="Sit the paper" onPress={() => { setPicks({}); setAt(0); }} />
    </Card>
  );
  if (done) {
    const right = all.filter((q, i) => picks[i] === q.answer).length, mark = Math.round((right * 100) / all.length);
    return (
      <Card>
        <Eyebrow>MARKED</Eyebrow>
        <Text fontSize={28} fontWeight="800" color="$color12">{`${mark}  ${letterOf(mark)}`}</Text>
        <Small>{mark >= SCHOOL.pass_mark ? "A pass." : "Not a pass, this time."}</Small>
        {all.map((q, i) => picks[i] === q.answer ? null : (
          <Small key={i}>{`${q.section}: ${q.text} -- ${q.choices[q.answer]}`}</Small>
        ))}
        <Action label="Sit it again" onPress={() => { setPicks({}); setAt(0); }} />
      </Card>
    );
  }
  const q = all[at];
  return (
    <Card>
      <Eyebrow>{`${q.section} · ${at + 1} of ${all.length}`}</Eyebrow>
      <Text fontSize={17} lineHeight={24} color="$color12">{q.text}</Text>
      <YStack gap={8} marginTop={6}>
        {q.choices.map((c, i) => (
          <Button key={i} justifyContent="flex-start" backgroundColor="$color3" borderWidth={1} borderColor="$color6"
                  onPress={() => { setPicks((p) => ({ ...p, [at]: i })); setAt(at + 1); }}>
            <Text fontSize={16} color="$color12">{`${"ABCD"[i]}  ${c}`}</Text>
          </Button>
        ))}
      </YStack>
      <XStack gap={8}>
        {at > 0 ? <Action label="Back" onPress={() => setAt(at - 1)} /> : null}
        <Action label="Stop" onPress={() => setAt(null)} />
      </XStack>
    </Card>
  );
}
export function LibraryScreen() {
  const dayInk = useInk();
  const [book, setBook] = useState<"school" | "guide" | "subtle" | "notebook" | "songbook" | "stream" | null>(null);
  const [sub] = useApi<SubtleT>(`/api/subtle${previewQuery() ? "?preview=1" : ""}`);   // T-423: THE SUBTLE LAYER, once the save holds it
  const [g, setG] = useState<GuideBookT | null>(null);
  const [pr, setPr] = useState<Progress | null>(null);
  useEffect(() => {
    api<GuideBookT>("/api/guide").then(setG).catch(() => {});
    api<Progress>("/api/progress").then(setPr).catch(() => {});
  }, []);
  const back = <Text fontFamily="$mono" fontSize={13} letterSpacing={2} color="$color10" cursor="pointer" role="button"
                     onPress={() => setBook(null)}>‹ LIBRARY</Text>;
  if (book === "school") return <YStack gap={14}>{back}<SchoolScreen /></YStack>;
  if (book === "guide" && g?.held) return <YStack gap={14}>{back}<GuideBook g={g} /></YStack>;
  if (book === "subtle" && sub?.held) return <YStack gap={14}>{back}<SubtleBook b={sub} /></YStack>;
  if (book === "notebook") return <YStack gap={14}>{back}<NotebookCard skip="SONGBOOK" /></YStack>;   // C-156: moved here from YOU
  if (book === "songbook") return <YStack gap={14}>{back}<SongbookBook /></YStack>;
  if (book === "stream") return <YStack gap={14}>{back}<StreamBook /></YStack>;
  const s = pr?.school;
  const chapters = g?.sections?.reduce((n, x) => n + x.entries.length, 0) ?? 0;
  return (
    <YStack gap={14}>
      <Card cursor="pointer" role="button" hoverStyle={{ borderColor: "$color9" }} onPress={() => setBook("school")}>
        <XStack gap={14} alignItems="center">
          <YStack width={72} height={48} borderRadius={3} backgroundColor="$color9" alignItems="center" justifyContent="center">
            <Text fontFamily="$mono" fontSize={11} fontWeight="800" letterSpacing={1} color={dayInk}>CALLOW</Text>
          </YStack>
          <YStack flex={1} gap={2}>
            <Text fontFamily="$mono" fontSize={15} fontWeight="700" letterSpacing={1} color="$color12">CALLOW SCHOOL</Text>
            <Small>{!s ? "The seven floors, the TEXTBOOK and the paper."
              : s.diploma ? `DIPLOMA${s.best !== null ? ` · MARK ${s.best}` : ""}`
              : s.textbook ? `The TEXTBOOK · ${s.floors.filter(Boolean).length} of ${s.floors.length} floors` : "The seven floors and the paper."}</Small>
          </YStack>
          <Text fontSize={18} color="$color10">›</Text>
        </XStack>
      </Card>
      {g?.held ? (
        <Card cursor="pointer" role="button" hoverStyle={{ borderColor: "$color9" }} onPress={() => setBook("guide")}>
          <XStack gap={14} alignItems="center">
            <YStack width={72} height={48} alignItems="center" justifyContent="center" backgroundColor={BOOK.boards} borderRadius={3}>
              <YStack width={33} height={40} overflow="hidden">
                <Image source={GUIDE_COVER} style={{ width: 60, height: 40, marginLeft: -13.5 }} resizeMode="stretch"
                       accessibilityLabel="the GUIDE's cover" />
              </YStack>
            </YStack>
            <YStack flex={1} gap={2}>
              <Text fontFamily="$mono" fontSize={15} fontWeight="700" letterSpacing={1} color="$color12">THE GUIDE</Text>
              <Small>{`${g.title ?? ""} · ${chapters} chapters`}</Small>
            </YStack>
            <Text fontSize={18} color="$color10">›</Text>
          </XStack>
        </Card>
      ) : null}
      {sub?.held ? (
        <Card cursor="pointer" role="button" hoverStyle={{ borderColor: "$color9" }} onPress={() => setBook("subtle")}>
          <XStack gap={14} alignItems="center">
            <YStack width={72} height={48} alignItems="center" justifyContent="center" backgroundColor="#1b0f1f" borderRadius={3}>
              <YStack width={33} height={40} overflow="hidden">
                <YStack marginLeft={-13.5}><Art path="/art/subtle/cover.png" size={60} height={40} /></YStack>
              </YStack>
            </YStack>
            <YStack flex={1} gap={2}>
              <Text fontFamily="$mono" fontSize={15} fontWeight="700" letterSpacing={1} color="$color12">{sub.title ?? "THE SUBTLE LAYER"}</Text>
              <Small>{`${sub.subtitle ?? ""} · ${(sub.sections ?? []).reduce((k, x) => k + x.entries.length, 0)} pages`}</Small>
            </YStack>
            <Text fontSize={18} color="$color10">›</Text>
          </XStack>
        </Card>
      ) : null}
      <ShelfBook colour="#7a5a2e" spine="NOTES" title="NOTEBOOK" about="The pages you have found, read as the game keeps them." onPress={() => setBook("notebook")} />
      <ShelfBook colour="#2d6a74" spine="♪" title="SONGBOOK" about="The songs you have learned, in their colours, to hear again." onPress={() => setBook("songbook")} />
      <ShelfBook colour="#3d4f8a" spine="STREAM" title="STREAM" about="Every lesson a MARK or a ROOT has opened." onPress={() => setBook("stream")} />
    </YStack>
  );
}

// C-156: a book on LIBRARY's shelf -- a coloured spine, its name, a line about it
export function ShelfBook({ colour, spine, title, about, onPress }: { colour: string; spine: string; title: string; about: string; onPress: () => void }) {
  return (
    <Card cursor="pointer" role="button" hoverStyle={{ borderColor: "$color9" }} onPress={onPress}>
      <XStack gap={14} alignItems="center">
        <YStack width={72} height={48} borderRadius={3} backgroundColor={colour} alignItems="center" justifyContent="center">
          <Text fontFamily="$mono" fontSize={11} fontWeight="800" letterSpacing={1} color="#fbfaf6">{spine}</Text>
        </YStack>
        <YStack flex={1} gap={2}>
          <Text fontFamily="$mono" fontSize={15} fontWeight="700" letterSpacing={1} color="$color12">{title}</Text>
          <Small>{about}</Small>
        </YStack>
        <Text fontSize={18} color="$color10">›</Text>
      </XStack>
    </Card>
  );
}

// C-156 (the user, 2026-10-18: "songbook should have a section in library where u see the color notes and can ... play to
// hear ones you've learned"): every song the save has learned, its key and motif on the staff in their colours, and PLAY
// for it on the square wave the boards use, each note held as the game holds it (notebook.json's frames). DRAFT.
export function SongbookBook() {
  const [n] = useApi<Notebook>("/api/notebook");
  const player = useAudioPlayer(null);
  const [playing, setPlaying] = useState<string | null>(null);
  if (!n) return <Small>Reading your save…</Small>;
  const songs = n.sections.find((s) => s.name === "SONGBOOK")?.pages.filter((p) => p.kind === "song" && p.notes?.length) ?? [];
  const play = async (p: (typeof songs)[number]) => {
    try {
      await setAudioModeAsync({ playsInSilentMode: true });
      player.replace({ uri: songSound(p.title, p.notes!, p.frames) }); player.play();
      setPlaying(p.title);
      const ms = (p.frames ?? []).reduce((a, f) => a + f, 0) * 1000 / 60 || p.notes!.length * 300;
      setTimeout(() => setPlaying((t) => (t === p.title ? null : t)), ms + 200);
    } catch { setPlaying(null); }
  };
  return (
    <YStack gap={14}>
    <PlayBook />{/* T-426: the save's own instrument, played here */}
    <Card>
      <Eyebrow>SONGBOOK</Eyebrow>
      {!songs.length ? <Small>The songs you learn in the game are kept here, to see and to hear.</Small> : songs.map((p) => (
        <YStack key={p.title} borderTopWidth={1} borderColor="$color5" paddingVertical={10} gap={4}>
          <XStack alignItems="center" justifyContent="space-between" gap={10}>
            <YStack flex={1}>
              <Text fontFamily="$mono" fontSize={15} fontWeight="700" letterSpacing={1} color="$color12">{p.title}</Text>
              {p.about ? <Small>{p.about}</Small> : null}
            </YStack>
            <Action label={playing === p.title ? "♪ …" : "LISTEN"} onPress={() => play(p)} />{/* T-426: PLAY is the instrument's now */}
          </XStack>
          <SongStaff keyName={p.key!} notes={p.notes!} colours={n.keyColours} outline={n.outline} />
        </YStack>
      ))}
    </Card>
    </YStack>
  );
}

// C-156: STREAM -- every lesson the save has opened, a MARK's (its BENCHMARK) and a ROOT's (its understanding), read as the
// MARK and ROOT pages read them: the first box leading, the rest as points. DRAFT.
export function StreamBook() {
  const [p] = useApi<Profile>("/api/profile");
  const [open, setOpen] = useState<string | null>(null);
  if (!p) return <Small>Reading your save…</Small>;
  const items = [
    ...MARKS.marks.map((m, i) => ({ id: `m${i}`, held: !!p.marks?.[i], title: m.title.toUpperCase(), from: `the BENCHMARK in ${m.found}`, paras: lessonParas(m.lesson, m.title) })),
    ...MARKS.understandings.map((u, i) => ({ id: `u${i}`, held: !!p.roots?.[i], title: u.name, from: u.found, paras: lessonParas(u.lesson, u.name) })),
  ].filter((x) => x.held && x.paras.length);
  return (
    <Card>
      <Eyebrow>STREAM</Eyebrow>
      {!items.length ? <Small>Each MARK and each ROOT opens a lesson; they are kept here.</Small> : items.map((x) => (
        <YStack key={x.id} borderTopWidth={1} borderColor="$color5" paddingVertical={10} gap={6}>
          <XStack onPress={() => setOpen(open === x.id ? null : x.id)} justifyContent="space-between" alignItems="center" cursor="pointer">
            <YStack flex={1}>
              <Text fontFamily="$mono" fontSize={15} fontWeight="700" letterSpacing={1} color="$color12">{x.title}</Text>
              <Small>{x.from}</Small>
            </YStack>
            <Text fontSize={18} color="$color10">{open === x.id ? "−" : "+"}</Text>
          </XStack>
          {open === x.id ? (
            <YStack gap={8}>
              <Para lead>{x.paras[0]}</Para>
              {x.paras.length > 1 ? <Points lines={x.paras.slice(1)} /> : null}
            </YStack>
          ) : null}
        </YStack>
      ))}
    </Card>
  );
}

// the GUIDE as the game's reader keeps it: the cover, then CONTENTS (each part, its chapters), then a chapter on one page
// with the next and the last a tap away
// the GUIDE's title set over its cover as the game set it: two small lines, the last two words large, above the cyan rules
// (y 50 of 160); the author at the foot (y 147) -- at the cover's 2x
function CoverTitle({ title, author }: { title: string; author: string }) {
  const words = title.split(" "), big = words.slice(-2).join(" "), rest = words.slice(0, -2);
  let cut = 1, best = Infinity;                        // the small lines split as evenly as the words allow
  for (let k = 1; k < rest.length; k++) {
    const d = Math.abs(rest.slice(0, k).join(" ").length - rest.slice(k).join(" ").length);
    if (d < best) { best = d; cut = k; }
  }
  const line = { position: "absolute" as const, left: 0, right: 0, textAlign: "center" as const, fontFamily: "$mono" as const, color: "#f3f4f6" };
  return (<>
    <Text {...line} top={10} fontSize={13} lineHeight={16} letterSpacing={1} fontWeight="700">{rest.slice(0, cut).join(" ")}</Text>
    <Text {...line} top={27} fontSize={13} lineHeight={16} letterSpacing={1} fontWeight="700">{rest.slice(cut).join(" ")}</Text>
    <Text {...line} top={50} fontSize={29} lineHeight={34} letterSpacing={2} fontWeight="800">{big}</Text>
    <Text {...line} top={288} fontSize={12} letterSpacing={1} fontWeight="700">{author}</Text>
  </>);
}
export function GuideBook({ g }: { g: GuideBookT }) {
  const flat = (g.sections ?? []).flatMap((sec) => sec.entries.map((e) => ({ sec, e })));
  const [at, setTo] = useState<number | null>(null);
  const setAt = (to: number | null) => { setTo(to); SCREEN.scroller?.scrollTo?.({ y: 0, animated: false }); };
  const mono = { fontFamily: "$mono" as const, letterSpacing: 2 };
  if (at !== null && flat[at]) {
    const { sec, e } = flat[at];
    const turn = (label: string, to: number | null) => (
      <Text {...mono} fontSize={12} color={to === null ? BOOK.edge : BOOK.cyan} cursor={to === null ? "default" : "pointer"} role="button"
            onPress={() => to !== null && setAt(to)}>{label}</Text>
    );
    return (
      <YStack backgroundColor={BOOK.page} borderColor={BOOK.edge} borderWidth={1} borderRadius={4} padding={18} gap={12}>
        <Text {...mono} fontSize={11} color={BOOK.faint}>{sec.label.toUpperCase() === sec.heading.toUpperCase() ? sec.label : `${sec.label} · ${sec.heading.toUpperCase()}`}</Text>
        <Text fontSize={20} lineHeight={27} fontWeight="700" color={BOOK.ink}>{e.title}</Text>
        <YStack height={2} backgroundColor={BOOK.cyan} width={48} />
        {e.paragraphs.map((p, i) => <Text key={i} fontSize={16} lineHeight={25} color={BOOK.ink}>{p}</Text>)}
        {/* the game ends the book on a QR code; here, the link it opens */}
        {e.link ? (
          <Text {...mono} fontSize={13} color={BOOK.cyan} cursor="pointer" role="link" marginTop={4}
                onPress={() => { Linking.openURL(e.link!).catch(() => {}); }}>{`${linkLabel(e.link).toUpperCase()} ›`}</Text>
        ) : null}
        <XStack justifyContent="space-between" marginTop={8} paddingTop={12} borderTopWidth={1} borderColor={BOOK.edge}>
          {turn("‹ BACK", at > 0 ? at - 1 : null)}
          <Text {...mono} fontSize={12} color={BOOK.cyan} cursor="pointer" role="button" onPress={() => setAt(null)}>CONTENTS</Text>
          {turn("NEXT ›", at < flat.length - 1 ? at + 1 : null)}
        </XStack>
        <Text {...mono} fontSize={10} color={BOOK.faint} textAlign="center">{`${at + 1} / ${flat.length}`}</Text>
      </YStack>
    );
  }
  let n = 0;
  return (
    <YStack backgroundColor={BOOK.boards} borderRadius={4} padding={14} gap={14}>
      {/* the book itself, cut out of the game's 240x160 screen (x 54..185), at a whole multiple so its pixels stay square; the
          art carries no lettering (the game's font is Nintendo's), so the title and author are set here in our own type */}
      <YStack width={132 * 2} height={160 * 2} overflow="hidden" alignSelf="center" borderRadius={2} position="relative">
        <Image source={GUIDE_COVER} style={{ width: 240 * 2, height: 160 * 2, marginLeft: -54 * 2, ...PIXELATED }}
               resizeMode="stretch" accessibilityLabel={g.title ?? "the GUIDE"} />
        <CoverTitle title={g.title ?? ""} author={g.author ?? ""} />
      </YStack>
      <YStack backgroundColor={BOOK.page} borderColor={BOOK.edge} borderWidth={1} borderRadius={4} padding={16} gap={4}>
        <Text {...mono} fontSize={12} color={BOOK.cyan}>CONTENTS</Text>
        {(g.sections ?? []).map((sec) => (
          <YStack key={sec.key} marginTop={10} gap={2}>
            <Text {...mono} fontSize={10} color={BOOK.faint}>{sec.label}</Text>
            <Text fontSize={15} fontWeight="700" color={BOOK.ink} marginBottom={4}>{sec.heading}</Text>
            {sec.entries.map((e) => {
              const i = n++;
              return (
                <XStack key={e.short} gap={10} paddingVertical={6} borderTopWidth={1} borderColor={BOOK.edge} cursor="pointer" role="button"
                        onPress={() => setAt(i)}>
                  <Text {...mono} fontSize={12} color={BOOK.cyan} flex={1}>{e.short}</Text>
                  <Text fontSize={14} color={BOOK.faint}>›</Text>
                </XStack>
              );
            })}
          </YStack>
        ))}
      </YStack>
    </YStack>
  );
}

export function SchoolScreen() {
  const [pr, setPr] = useState<Progress | null>(null);
  const [p, setP] = useState<Profile | null>(null);
  useEffect(() => {
    api<Progress>("/api/progress").then(setPr).catch(() => {});
    api<Profile>("/api/profile").then(setP).catch(() => {});
  }, []);
  if (!pr) return <Small>Reading your save…</Small>;
  const s = pr.school;
  return (
    <YStack gap={14}>
      <Card borderLeftWidth={6} borderLeftColor="$color9">
        <Eyebrow>CALLOW SCHOOL</Eyebrow>
        {s.diploma ? (
          <YStack gap={4} marginTop={4}>
            <Text fontFamily="$mono" fontSize={13} letterSpacing={2} color="$color10">DIPLOMA</Text>
            <Text fontSize={15} lineHeight={22} color="$color12">{`This is to certify that ${p?.name ?? "you"} sat the paper, all seven parts, and passed it.`}</Text>
            {s.best !== null ? <Text fontFamily="$mono" fontSize={18} fontWeight="700" color="$color12">{`MARK ${s.best}  ${s.grade ?? ""}`}</Text> : null}
          </YStack>
        ) : <Small>{s.attempts ? `The paper sat ${s.attempts === 1 ? "once" : `${s.attempts} times`}; best ${s.best}. ${s.passMark} passes.` : "No DIPLOMA yet."}</Small>}
      </Card>
      <Card>
        <Eyebrow>{s.textbook ? "THE TEXTBOOK" : "THE FLOORS"}</Eyebrow>
        {SCHOOL.floors.map((f, i) => <Floor key={f.floor} f={f} reached={s.floors[i]} />)}
      </Card>
      <PracticePaper />
    </YStack>
  );
}
export function SongStaff({ keyName, notes, colours, outline }: { keyName: string; notes: string[]; colours?: string[]; outline?: string }) {
  const ps = notes.map(pitch).filter(Boolean) as NonNullable<ReturnType<typeof pitch>>[];
  const GAP = 10, HEAD = 12, COL = 26, LEFT = 18;
  const lo = Math.min(0, ...ps.map((p) => p.step)), hi = Math.max(8, ...ps.map((p) => p.step));
  const yOf = (step: number) => (hi - step) * (GAP / 2) + HEAD / 2;
  const colour = (pc: number) => colours?.[pc] ?? "$color12";
  const keyP = pitch(keyName + "4");
  return (
    <YStack gap={6} marginTop={4}>
      <XStack alignItems="center" gap={8}>
        <YStack width={12} height={12} borderRadius={6} backgroundColor={keyP ? colour(keyP.pc) : "$color9"} />
        <Text fontFamily="$mono" fontSize={12} letterSpacing={1.5} color="$color11">{`IN ${keyName.replace("b", "♭")}`}</Text>
      </XStack>
      <YStack height={yOf(lo) + HEAD} width={LEFT + ps.length * COL + 8} position="relative">
        {[0, 2, 4, 6, 8].map((st) => <YStack key={st} position="absolute" left={0} right={0} top={yOf(st)} height={1} backgroundColor="$color8" />)}
        {ps.map((p, i) => {
          const x = LEFT + i * COL, ledgers: number[] = [];
          for (let st = -2; st >= p.step; st -= 2) ledgers.push(st);
          for (let st = 10; st <= p.step; st += 2) ledgers.push(st);
          return (
            <YStack key={i}>
              {ledgers.map((st) => <YStack key={st} position="absolute" left={x - 4} width={HEAD + 8} top={yOf(st)} height={1} backgroundColor="$color8" />)}
              {p.acc ? <Text position="absolute" left={x - 11} top={yOf(p.step) - 9} fontSize={13} color="$color11">{p.acc}</Text> : null}
              <YStack position="absolute" left={x} top={yOf(p.step) - HEAD / 2} width={HEAD} height={HEAD - 2} borderRadius={HEAD / 2}
                      backgroundColor={colour(p.pc)} borderWidth={1} borderColor={outline ?? "#1d2026"} />
            </YStack>
          );
        })}
      </YStack>
    </YStack>
  );
}

// C-125: a NOTEBOOK page, tapped open to read. The game wraps its lines to its text box and re-flows them on a page,
// so a single line break is a space here and a blank line a new paragraph.
export function NotebookPage({ page, colours, outline }: { page: Notebook["sections"][number]["pages"][number]; colours?: string[]; outline?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <YStack borderTopWidth={1} borderColor="$color5" paddingVertical={10} gap={6}>
      <XStack onPress={() => setOpen((o) => !o)} justifyContent="space-between" alignItems="center" gap={10} cursor="pointer">
        <YStack flex={1}>
          <XStack alignItems="center" gap={8}>
            {/* T-403: not yet read in the game -- the game's own NOTEBOOK marks it the same way until it is opened there */}
            {page.unread ? <YStack width={8} height={8} borderRadius={4} backgroundColor="$color9" aria-label="not yet read" /> : null}
            <Text fontFamily="$mono" fontSize={15} fontWeight="700" letterSpacing={1} color="$color12">{page.title}</Text>
          </XStack>
          {page.about ? <Small>{page.about}</Small> : null}
          {open && page.place ? <Small color="$color10">{`Found in ${page.place}.`}</Small> : null}
        </YStack>
        <Text fontSize={18} color="$color10">{open ? "−" : "+"}</Text>
      </XStack>
      {open ? (page.text
        ? page.text.split(/\n\n+/).map((par, i) => <Text key={i} fontSize={15} lineHeight={22} marginBottom={4} color="$color12">{par.replace(/\n/g, " ")}</Text>)
        : page.kind === "song" && page.key && page.notes?.length ? <SongStaff keyName={page.key} notes={page.notes} colours={colours} outline={outline} />
        : <Small>{page.kind === "song" ? "The game draws its notes in the key you played it in." : "Written by the game from your save each time you open it there."}</Small>) : null}
      {/* T-402: the page ends on a QR code in the game; here, the song or post it opens (DRAFT) */}
      {open && page.link ? <Action label={linkLabel(page.link)} onPress={() => { Linking.openURL(page.link!).catch(() => {}); }} /> : null}
    </YStack>
  );
}

export function NotebookCard({ skip }: { skip?: string } = {}) {
  const [n] = useApi<Notebook>("/api/notebook");
  if (!n) return null;
  return (
    <Card>
      <Eyebrow>NOTEBOOK</Eyebrow>
      {!n.held ? <Small>Not carried yet.</Small>
        : !n.sections.length ? <Small>Nothing filed in it yet.</Small>
        : n.sections.filter((s) => s.name !== skip).map((s) => (
            <YStack key={s.name} marginTop={10}>
              <Text fontFamily="$mono" fontSize={12} letterSpacing={2} color="$color10">{s.name}</Text>
              {s.pages.map((pg, i) => <NotebookPage key={`${s.name}-${i}`} page={pg} colours={n.keyColours} outline={n.outline} />)}
            </YStack>
          ))}
    </Card>
  );
}
