// the LIBRARY -- THE PLAYER'S MANUAL, CALLOW SCHOOL, THE GUIDE, NOTEBOOK, SONGBOOK, STREAM (C-145, C-156, C-233). (C-157: out of App.tsx.)
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioPlayer, useAudioRecorder } from "expo-audio";
import { File } from "expo-file-system";
import { useEffect, useState, type ReactElement } from "react";
import { Image, Linking } from "react-native";
import { Button, Text, XStack, YStack } from "tamagui";
import { BOOK, GUIDE_COVER, lessonParas, letterOf, MARKS, pitch, reflow, SCHOOL, SCREEN } from "../../state/data";
import { useSubtleInk } from "../../state/look";   // C-203
import { api, ON_PHONE } from "../../platform/net";
import { meshTalk } from "../../platform/mesh";   // C-307
import { songSound } from "../../sound/songSound";
import { GuideBookT, Notebook, Profile, Progress, SchoolData, Spoken } from "../../state/types";
import { Action, Art, Card, Entry, Eyebrow, linkLabel, Para, PIXELATED, Points, Small } from "../../ui/ui";
import { useVoice } from "../daemon/Daemon";   // C-209
import { useApi } from "../../platform/useApi";
import { previewQuery } from "../../state/preview";
import { bookForced } from "../../state/dev";   // C-299: the mended book forced held on the </> tab
import { PlayBook } from "./Play";
import { ReadAloud } from "../../ui/readAloud";   // C-208
import { SubtleBook, type SubtleT } from "./Subtle";
import { HermeticBook, type HermeticT } from "../shared/Hermetic";   // C-238
import { DAWN, EudaimonBook, type EudaimonT } from "../shared/Eudaimon";   // C-297
import { Mending, UNITY, UnityBook, type UnityT } from "../shared/Unity";   // C-299
import { seeMending, useMendingSeen } from "../../state/mended";   // C-299: the mending, once
import { ManualBook, manualAbout } from "./Manual";   // C-233
import { Bookcase, type CaseBook, type Shelf } from "./Bookcase";   // C-320: the LIBRARY as a bookcase
import { Listen } from "../../ui/bookAudio";   // C-277
import { usePlace } from "../../state/place";   // C-309: the open book and its page outlive a refresh
import { BookLookProvider, LOOKS } from "../../ui/bookLook";   // C-309: the book brings its look to the library
import { SpokenPara } from "../../ui/spoken";   // C-309: the paragraph being said

// T-218's certificate as the game draws it (DAEMONS src/school_exam.c DrawDiploma): the school's own paper and ink on the
// GBA's black, its 224-pixel windows centred in 240 by 160 -- the game's own words, the player's name and the best mark
const GBA = (r: number, g: number, b: number) => `rgb(${[r, g, b].map((x) => Math.round(x * 255 / 31)).join(",")})`;
const PAPER = GBA(29, 28, 25), INK = GBA(3, 3, 4), FAINT = GBA(23, 22, 19);
function Diploma({ name, best, grade }: { name: string; best: number | null; grade: string }) {
  const line = (t: string, size = 14, weight: "400" | "700" = "400", color = INK) =>
    <Text fontFamily="$mono" fontSize={size} fontWeight={weight} color={color} textAlign="center">{t}</Text>;
  return (
    <YStack width="100%" aspectRatio={240 / 160} backgroundColor="#000" padding="3.3%" marginTop={6} borderRadius={4}>
      <YStack flex={1} backgroundColor={PAPER} borderRadius={2} paddingVertical="4%" justifyContent="space-between" alignItems="center">
        {line("CALLOW SCHOOL", 15, "700")}
        <YStack alignItems="center" gap={4}>
          {line("This is to certify that")}
          {line(name || "you", 17, "700")}
          {line("sat the paper, all seven parts,")}
          {line("and passed it.")}
        </YStack>
        <YStack alignItems="center" gap={2}>
          {best !== null ? line(`MARK  ${best}   ${grade}`, 15, "700") : null}
          {line("A  PUT IT AWAY", 11, "400", FAINT)}
        </YStack>
      </YStack>
    </YStack>
  );
}

export function Floor({ f, reached }: { f: SchoolData["floors"][number]; reached: boolean }) {
  const [open, setOpen] = usePlace(`library.school.floor.${f.floor}`, false);
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
  type Opened = "manual" | "quick" | "companion" | "social" | "tiiny" | "word" | "school" | "guide" | "subtle" | "hermetic" | "eudaimon" | "unity" | "notebook" | "songbook" | "stream";
  const [book, setBook] = usePlace<Opened | null>("library.book", null);   // C-309: kept through a refresh, and the app opened again
  const [sub] = useApi<SubtleT>(`/api/subtle${previewQuery() ? "?preview=1" : ""}`);   // T-423: THE SUBTLE LAYER, once the save holds it
  const [her] = useApi<HermeticT>(`/api/hermetic${previewQuery() ? "?preview=1" : ""}`);   // C-238: THE HERMETIC LAYER, once found
  const [eud] = useApi<EudaimonT>(`/api/eudaimon${previewQuery() ? "?preview=1" : ""}`);   // C-297: THE EUDAIMON LAYER, the dawn half
  const [uni] = useApi<UnityT>(`/api/unity${previewQuery() ? "?preview=1" : ""}`);   // C-299: THE UNITY BOOK, the halves mended
  const mended = !!uni?.held && (uni.how === "game" || bookForced("unity") === true);   // as in the game, the halves leave as the mended book comes
  const mendingSeen = useMendingSeen();                    // C-299: the first time it is found mended, the mending plays once
  const [g, setG] = useState<GuideBookT | null>(null);
  const [pr, setPr] = useState<Progress | null>(null);
  useEffect(() => {
    api<GuideBookT>("/api/guide").then(setG).catch(() => {});
    api<Progress>("/api/progress").then(setPr).catch(() => {});
  }, []);
  const back = <Text fontFamily="$mono" fontSize={13} letterSpacing={2} color="$color10" cursor="pointer" role="button"
                     onPress={() => setBook(null)}>‹ LIBRARY</Text>;
  // C-309: a book held in the save is opened only once the save has said so; while it is being asked again after a refresh
  // the book stays open and says so, rather than dropping to the shelf and losing the page
  const asked = { guide: g, subtle: sub, hermetic: her, eudaimon: eud, unity: uni } as Record<string, { held?: boolean } | null>;
  const opening = book && book in asked && !asked[book];
  if (opening) return <YStack gap={14}>{back}<Small>Opening the book where you left it…</Small></YStack>;   // DRAFT
  // C-309: the open book lends the library its look -- its ink on the way back, its glyph and name, its rule
  const open = (el: ReactElement) => {
    const l = LOOKS[book!];
    if (!l) return <YStack gap={14}>{back}{el}</YStack>;
    return (
      <BookLookProvider look={l}>
        <YStack gap={14}>
          <XStack alignItems="center" gap={10} paddingBottom={8} borderBottomWidth={2} borderBottomColor={l.ink}>
            <Text fontFamily="$mono" fontSize={13} letterSpacing={2} color={l.ink} cursor="pointer" role="button"
                  onPress={() => setBook(null)}>‹ LIBRARY</Text>
            <YStack flex={1} />
            <Text fontFamily="$mono" fontSize={11} letterSpacing={1.5} color="$color10" numberOfLines={1}
                  fontStyle={l.type.italic ? "italic" : "normal"}>{l.name}</Text>
            <Text fontSize={15} color={l.ink}>{l.glyph}</Text>
          </XStack>
          {el}
        </YStack>
      </BookLookProvider>
    );
  };
  if (book === "manual") return open(<ManualBook />);   // C-233
  if (book === "quick") return open(<ManualBook which="quick" />);
  if (book === "companion") return open(<ManualBook which="companion" />);   // C-321
  if (book === "social") return open(<ManualBook which="social" />);
  if (book === "tiiny") return open(<ManualBook which="tiiny" />);
  if (book === "word") return open(<ManualBook which="word" />);   // C-274
  if (book === "school") return open(<SchoolScreen />);
  if (book === "guide" && g?.held) return open(<GuideBook g={g} />);
  if (book === "subtle" && sub?.held) return open(<SubtleBook b={sub} />);
  if (book === "hermetic" && her?.held) return open(<HermeticBook b={her} />);   // C-238
  if (book === "eudaimon" && eud?.held) return open(<EudaimonBook b={eud} />);   // C-297
  if (book === "unity" && uni?.held) return open(<UnityBook b={uni} />);   // C-299
  if (book === "notebook") return open(<NotebookCard skip="SONGBOOK" />);   // C-156: moved here from YOU
  if (book === "songbook") return open(<SongbookBook />);
  if (book === "stream") return open(<StreamBook />);
  // C-320: the bookcase -- a shelf per kind, each book standing by its cover. The game's books stand only once found;
  // the halves leave as the mended book comes, and the mending plays once before it stands. DRAFT
  const game: CaseBook[] = [
    ...(g?.held ? [{ id: "guide", title: "THE GUIDE", about: g.title ?? "", cloth: BOOK.boards, onPress: () => setBook("guide") }] : []),
    ...(sub?.held ? [{ id: "subtle", title: sub.title ?? "THE SUBTLE LAYER", about: sub.subtitle ?? "", cloth: "#1b0f1f", onPress: () => setBook("subtle") }] : []),
    ...(her?.held && !mended ? [{ id: "hermetic", title: her.title ?? "THE HERMETIC LAYER", about: her.subtitle ?? "SPELLCRAFT", cloth: "#1d2a24", onPress: () => setBook("hermetic") }] : []),
    ...(eud?.held && !mended ? [{ id: "eudaimon", title: eud.title ?? "THE EUDAIMON LAYER", about: eud.subtitle ?? "the dawn half", cloth: DAWN.boards, onPress: () => setBook("eudaimon") }] : []),
    ...(uni?.held && mended && mendingSeen === true ? [{ id: "unity", title: uni.title ?? "THE UNITY BOOK", about: uni.subtitle ?? "mended", cloth: UNITY.boards, onPress: () => setBook("unity") }] : []),
  ];
  const s = pr?.school;
  const shelves: Shelf[] = [
    { name: "FOUND IN THE GAME", books: game, empty: "The books you find in the game will stand here." },
    { name: "MANUALS", books: [
      { id: "quick", title: "QUICK START", about: manualAbout("quick"), cloth: "#a6825a", onPress: () => setBook("quick") },
      { id: "player", title: "THE PLAYER'S MANUAL", about: manualAbout(), cloth: "#6b5aa6", onPress: () => setBook("manual") },
      { id: "companion", title: "THE COMPANION", about: manualAbout("companion"), cloth: "#a65a4f", onPress: () => setBook("companion") },   // C-321
      { id: "social", title: "PLAYING TOGETHER", about: manualAbout("social"), cloth: "#5a7fa6", onPress: () => setBook("social") },
      { id: "tiiny", title: "A BIGGER MIND", about: manualAbout("tiiny"), cloth: "#4f8a6e", onPress: () => setBook("tiiny") },
    ] },
    { name: "HISTORY AND STUDY", books: [
      { id: "word", title: "THE OLD WORD", about: manualAbout("word"), cloth: "#8a6a4a", onPress: () => setBook("word") },
      { id: "school", title: "CALLOW SCHOOL", cloth: "#c4932f", onPress: () => setBook("school"),
        about: !s ? "The seven floors, the TEXTBOOK and the paper."
          : s.diploma ? `DIPLOMA${s.best !== null ? ` · MARK ${s.best}` : ""}`
          : s.textbook ? `The TEXTBOOK · ${s.floors.filter(Boolean).length} of ${s.floors.length} floors` : "The seven floors and the paper." },
    ] },
    { name: "YOUR OWN PAGES", books: [
      { id: "notebook", title: "NOTEBOOK", about: "The pages you have found, read as the game keeps them.", cloth: "#7a5a2e", onPress: () => setBook("notebook") },
      { id: "songbook", title: "SONGBOOK", about: "The songs you have learned, in their colours, to hear again.", cloth: "#2d6a74", onPress: () => setBook("songbook") },
      { id: "stream", title: "STREAM", about: "Every lesson a MARK or a ROOT has opened.", cloth: "#3d4f8a", onPress: () => setBook("stream") },
    ] },
  ];
  return (
    <YStack gap={14}>
      {uni?.held && mended && mendingSeen === false ? <Mending b={uni} onDone={seeMending} night={her} dawn={eud} /> : null}
      <Bookcase shelves={shelves} />
    </YStack>
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
  const [open, setOpen] = usePlace<string | null>("library.stream.open", null);
  if (!p) return <Small>Reading your save…</Small>;
  const items = [
    ...MARKS.marks.map((m, i) => ({ id: `m${i}`, held: !!p.marks?.[i], title: m.title.toUpperCase(), from: `the BENCHMARK in ${m.found}`, paras: lessonParas(m.lesson, m.title) })),
    ...MARKS.understandings.map((u, i) => ({ id: `u${i}`, held: !!p.roots?.[i], title: u.name, from: null, paras: lessonParas(u.lesson, u.name) })),   // where it was found: no longer published (the user, 2026-10-24)
  ].filter((x) => x.held && x.paras.length);
  return (
    <Card>
      <Eyebrow>STREAM</Eyebrow>
      {!items.length ? <Small>Each MARK and each ROOT opens a lesson; they are kept here.</Small> : items.map((x) => (
        <YStack key={x.id} borderTopWidth={1} borderColor="$color5" paddingVertical={10} gap={6}>
          <XStack onPress={() => setOpen(open === x.id ? null : x.id)} justifyContent="space-between" alignItems="center" cursor="pointer">
            <YStack flex={1}>
              <Text fontFamily="$mono" fontSize={15} fontWeight="700" letterSpacing={1} color="$color12">{x.title}</Text>
              {x.from ? <Small>{x.from}</Small> : null}
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
// (y 50 of 160); the author at the foot (y 148, clear of the art) -- at the cover's 2x
function CoverTitle({ title, author }: { title: string; author: string }) {
  const words = title.split(" "), big = words.slice(-2).join(" "), rest = words.slice(0, -2);
  let cut = 1, best = Infinity;                        // the small lines split as evenly as the words allow
  for (let k = 1; k < rest.length; k++) {
    const d = Math.abs(rest.slice(0, k).join(" ").length - rest.slice(k).join(" ").length);
    if (d < best) { best = d; cut = k; }
  }
  const line = { allowFontScaling: false, position: "absolute" as const, left: 0, right: 0, textAlign: "center" as const, fontFamily: "$mono" as const, color: "#f3f4f6" };
  return (<>
    <Text {...line} top={10} fontSize={13} lineHeight={16} letterSpacing={1} fontWeight="700">{rest.slice(0, cut).join(" ")}</Text>
    <Text {...line} top={27} fontSize={13} lineHeight={16} letterSpacing={1} fontWeight="700">{rest.slice(cut).join(" ")}</Text>
    <Text {...line} top={50} fontSize={29} lineHeight={34} letterSpacing={2} fontWeight="800">{big}</Text>
    <Text {...line} top={296} fontSize={12} letterSpacing={1} fontWeight="700">{author}</Text>{/* clear of the art (the user, 2026-10-19) */}
  </>);
}
// C-209: ASK THE GUIDE -- a question typed, or held and spoken, answered by the GUIDE from its own pages (on the hub's
// module; the hub says so when it cannot), and said aloud. Every word is DRAFT.
function AskGuide() {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const speak = useVoice();
  const [q, setQ] = useState("");
  const [state, setState] = useState<"" | "listening" | "thinking">("");
  const [said, setSaid] = useState<Spoken | null>(null);
  // C-307: through THE MIND -- heard on the phone where it can, answered by the hub (its pages are there) in the GUIDE's ring
  const ask = async (b: { text?: string; recording?: string }) => {
    setState("thinking");
    try {
      const uri = b.recording;
      const r = await meshTalk({ kind: "guide", name: "THE GUIDE", text: b.text, recording: uri,
                                 audioBase64: uri ? () => new File(uri).base64() : undefined, audioMime: "audio/mp4" });
      setSaid(r); setState("");
      const v = await r.voice;
      if (v?.stream) speak({ stream: v.stream }); else if (v?.audioBase64) speak(v.audioBase64);   // C-317
    }
    catch (e) { setSaid({ error: (e as Error).message }); } finally { setState(""); }
  };
  const typed = () => { const t = q.trim(); if (t && !state) { setSaid({ heard: t }); setQ(""); ask({ text: t }); } };
  const start = async () => {
    const ok = await requestRecordingPermissionsAsync();
    if (!ok.granted) { setSaid({ error: "The microphone is off for this app (Settings, then DAEMONS)." }); return; }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync(); recorder.record(); setState("listening");
  };
  const stop = async () => {
    if (state !== "listening") return;
    await recorder.stop();
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    if (!recorder.uri) { setState(""); return; }
    ask({ recording: recorder.uri });
  };
  const mono = { fontFamily: "$mono" as const, letterSpacing: 2 };
  return (
    <YStack backgroundColor={BOOK.page} borderColor={BOOK.edge} borderWidth={1} borderRadius={4} padding={16} gap={8}>
      <Text {...mono} fontSize={12} color={BOOK.cyan}>ASK THE GUIDE</Text>
      <Small color={BOOK.faint}>Ask it anything; it answers from its own pages.  DRAFT</Small>
      <XStack gap={8} alignItems="center" flexWrap="wrap">
        <Entry value={q} onChange={setQ} onSubmit={typed} placeholder="What do you want to know?" limit={120} />
        <Button size="$3" onPress={typed} disabled={!!state || !q.trim()} backgroundColor={BOOK.cyan}>
          <Text {...mono} fontSize={12} color={BOOK.page}>ASK</Text>
        </Button>
      </XStack>
      {ON_PHONE ? (
        <Button onPressIn={start} onPressOut={stop} disabled={state === "thinking"} borderColor={BOOK.cyan}
                backgroundColor={state === "listening" ? BOOK.cyan : BOOK.page}>
          <Text {...mono} fontSize={12} color={state === "listening" ? BOOK.page : BOOK.cyan}>
            {state === "listening" ? "LISTENING…" : state === "thinking" ? "LOOKING THROUGH ITS PAGES…" : "HOLD TO ASK ALOUD"}
          </Text>
        </Button>
      ) : state === "thinking" ? <Small color={BOOK.faint}>Looking through its pages…</Small> : null}
      {said?.heard ? <Small color={BOOK.faint}>{`“${said.heard}”`}</Small> : null}
      {said?.answer ? <Text fontSize={16} lineHeight={24} color={BOOK.ink}>{said.answer}</Text> : null}
      {said?.error ? <Small color={BOOK.faint}>{said.error}</Small> : null}
    </YStack>
  );
}

export function GuideBook({ g }: { g: GuideBookT }) {
  const flat = (g.sections ?? []).flatMap((sec) => sec.entries.map((e) => ({ sec, e })));
  const [at, setTo] = usePlace<number | null>("library.guide.at", null);   // C-309
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
        <ReadAloud id={`guide-${at}`} paragraphs={[e.title, ...e.paragraphs]} ink={BOOK.cyan} />
        {e.paragraphs.map((p, i) => <SpokenPara key={i} id={`guide-${at}`} i={i + 1}><Text fontSize={16} lineHeight={25} color={BOOK.ink}>{p}</Text></SpokenPara>)}
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
      <Listen which="guide" />
      <AskGuide />
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
  const [shown, setShown] = useState(false);       // the DIPLOMA as the game draws it
  const [p, setP] = useState<Profile | null>(null);
  const [full, setFull] = usePlace("library.school.full", false);   // C-276: PRINCIPLES OF MIND, the TEXTBOOK in full (C-309: kept)
  useEffect(() => {
    api<Progress>("/api/progress").then(setPr).catch(() => {});
    api<Profile>("/api/profile").then(setP).catch(() => {});
  }, []);
  if (full) return (
    <YStack gap={14}>
      <Text fontFamily="$mono" fontSize={13} letterSpacing={2} color="$color10" cursor="pointer" role="button"
            onPress={() => setFull(false)}>‹ CALLOW SCHOOL</Text>
      <Listen which="textbook" />
      <ManualBook which="textbook" />
    </YStack>
  );
  if (!pr) return <Small>Reading your save…</Small>;
  const s = pr.school;
  return (
    <YStack gap={14}>
      <Card borderLeftWidth={6} borderLeftColor="$color9">
        <Eyebrow>CALLOW SCHOOL</Eyebrow>
        {s.diploma ? (
          <YStack gap={4} marginTop={4} cursor="pointer" role="button" onPress={() => setShown((o) => !o)}>
            <XStack justifyContent="space-between" alignItems="center">
              <Text fontFamily="$mono" fontSize={13} letterSpacing={2} color="$color10">DIPLOMA</Text>
              <Text fontSize={18} color="$color10">{shown ? "−" : "+"}</Text>
            </XStack>
            {shown ? <Diploma name={p?.name ?? ""} best={s.best} grade={s.grade ?? ""} /> : (<>
              <Text fontSize={15} lineHeight={22} color="$color12">{`This is to certify that ${p?.name ?? "you"} sat the paper, all seven parts, and passed it.`}</Text>
              {s.best !== null ? <Text fontFamily="$mono" fontSize={18} fontWeight="700" color="$color12">{`MARK ${s.best}  ${s.grade ?? ""}`}</Text> : null}
            </>)}
          </YStack>
        ) : <Small>{s.attempts ? `The paper sat ${s.attempts === 1 ? "once" : `${s.attempts} times`}; best ${s.best}. ${s.passMark} passes.` : "No DIPLOMA yet."}</Small>}
      </Card>
      <Card>
        <Eyebrow>{s.textbook ? "THE TEXTBOOK" : "THE FLOORS"}</Eyebrow>
        {/* the DIPLOMA held, every lesson is open: the paper is passed (the user, 2026-10-28 -- a save given the DIPLOMA
            had stood on no floor, and every lesson read "Not yet stood on") */}
        {SCHOOL.floors.map((f, i) => <Floor key={f.floor} f={f} reached={s.floors[i] || s.diploma} />)}
        {/* C-276 (the user, 2026-11-03): under the seventh board, the whole TEXTBOOK as a university one, PDF. DRAFT */}
        <XStack marginTop={6}><Action label="FULL TEXTBOOK ›" onPress={() => setFull(true)} /></XStack>
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
              {p.acc ? <Text allowFontScaling={false} position="absolute" left={x - 11} top={yOf(p.step) - 9} fontSize={13} color="$color11">{p.acc}</Text> : null}
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
export function NotebookPage({ page, colours, outline, open: startOpen = false }: { page: Notebook["sections"][number]["pages"][number]; colours?: string[]; outline?: string; open?: boolean }) {
  const [open, setOpen] = usePlace(`library.notebook.${page.title}`, startOpen);   // C-309
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
      {open ? (page.kind === "reads" && page.text ? <ReadsLog text={page.text} />   // C-203: THE LOG, a line a row, in the book's purple
        : page.text
        ? page.text.split(/\n\n+/).map((par, i) => <Text key={i} fontSize={15} lineHeight={22} marginBottom={4} color="$color12">{par.replace(/\n/g, " ")}</Text>)
        : page.kind === "song" && page.key && page.notes?.length ? <SongStaff keyName={page.key} notes={page.notes} colours={colours} outline={outline} />
        : <Small>{page.kind === "song" ? "The game draws its notes in the key you played it in." : "Written by the game from your save each time you open it there."}</Small>) : null}
      {open && page.text && page.kind !== "reads" ? (           /* C-208: the page read aloud */
        <ReadAloud id={`page-${page.title}`} paragraphs={[page.title, ...page.text.split(/\n\n+/).map((par) => par.replace(/\n/g, " "))]} />
      ) : null}
      {/* T-402: the page ends on a QR code in the game; here, the song or post it opens (DRAFT) */}
      {open && page.link ? <Action label={linkLabel(page.link)} onPress={() => { Linking.openURL(page.link!).catch(() => {}); }} /> : null}
    </YStack>
  );
}

function ReadsLog({ text }: { text: string }) {
  const ink = useSubtleInk();
  return <YStack gap={2}>{text.split("\n").map((l, i) => <Text key={i} fontSize={15} lineHeight={22} color={ink}>{l}</Text>)}</YStack>;
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
