// C-433 (PRAXIS 6; the user, 2026-11-22, by multiple choice): LEARNING on JOURNEY -- name what you would like to learn and
// THE TUTOR (the household's mind) proposes a syllabus: modules, lessons and review cards, each TAKEN (edited as it is
// taken) or NOT. A lesson is written by the TUTOR when it is first opened; DONE pays 3 ARETE. REVIEW brings back the cards
// due, on a spaced schedule, 1 ARETE each. Without a mind, a course is built by hand (server/src/learning.ts). Every word DRAFT.
import { useEffect, useState } from "react";
import { Text, XStack, YStack } from "tamagui";
import { api } from "../../platform/net";
import { useApi } from "../../platform/useApi";
import { Action, Card, Entry, Eyebrow, Pending, Small } from "../../ui/ui";

type Tree = { id: string; kind: string; title: string; done: boolean; back?: string; due?: string; hasBody?: boolean; writing?: boolean; kids: Tree[] };
type Proposal = { id: string; item: string; kind: string; title: string; parent: string | null; back: string };
type Course = { id: string; title: string; subject: string; tutor: string; error: string | null; done: boolean; modules: Tree[];
                due: number; cards: number; proposals: Proposal[] };
type View = { courses: Course[] };
type Lesson = { id: string; title: string; body: string; writing: boolean; done: boolean; module: string; course: string; cards: { id: string; front: string; back: string }[] };
const INDENT: Record<string, number> = { module: 0, lesson: 14, card: 28 };
const KIND: Record<string, string> = { module: "MODULE", lesson: "LESSON", card: "CARD" };

function Proposals({ c, ink, onView }: { c: Course; ink: string; onView: (v: View) => void }) {
  const [editing, setEditing] = useState<string | null>(null), [title, setTitle] = useState(""), [back, setBack] = useState("");
  const decide = async (body: unknown) => onView(await api<View>("/api/learning/decide", body));
  return (
    <YStack gap={6} marginTop={6} padding={10} borderRadius={8} borderWidth={1} borderColor="$color6" backgroundColor="$color2">
      <XStack justifyContent="space-between" alignItems="center" gap={8} flexWrap="wrap">
        <Eyebrow>THE TUTOR PROPOSES</Eyebrow>
        <XStack gap={8}><Action label="TAKE ALL" ink={ink} onPress={() => decide({ course: c.id })} />
          <Action label="NONE" onPress={() => decide({ course: c.id, accept: false })} /></XStack>
      </XStack>
      {c.proposals.map((p) => (
        <YStack key={p.id} marginLeft={INDENT[p.kind] ?? 0} gap={4}>
          {editing === p.id ? (
            <YStack gap={6}>
              <Entry value={title} onChange={setTitle} onSubmit={() => {}} placeholder="its words" limit={120} />
              {p.kind === "card" ? <Entry value={back} onChange={setBack} onSubmit={() => {}} placeholder="its answer" limit={600} /> : null}
              <XStack gap={8}><Action label="TAKE IT" ink={ink} onPress={() => { setEditing(null); decide({ id: p.id, title, ...(p.kind === "card" ? { back } : {}) }); }} />
                <Action label="CANCEL" onPress={() => setEditing(null)} /></XStack>
            </YStack>
          ) : (
            <XStack gap={8} alignItems="center">
              <YStack flex={1}>
                <Text fontSize={p.kind === "module" ? 15 : 14} fontWeight={p.kind === "module" ? "700" : "400"} color="$color12">
                  <Text fontSize={10} color="$color10">{`${KIND[p.kind]}  `}</Text>{p.title}</Text>
                {p.back ? <Small color="$color10">{p.back}</Small> : null}
              </YStack>
              <Text fontSize={12} color={ink} cursor="pointer" role="button" aria-label={`Take ${p.title}`} onPress={() => decide({ id: p.id })}>TAKE</Text>
              <Text fontSize={12} color="$color10" cursor="pointer" role="button" aria-label={`Change ${p.title}, then take it`}
                    onPress={() => { setEditing(p.id); setTitle(p.title); setBack(p.back); }}>EDIT</Text>
              <Text fontSize={12} color="$color9" cursor="pointer" role="button" aria-label={`Not ${p.title}`} onPress={() => decide({ id: p.id, accept: false })}>NO</Text>
            </XStack>
          )}
        </YStack>
      ))}
    </YStack>
  );
}

function Adder({ kind, parent, ink, onView }: { kind: "module" | "lesson" | "card"; parent: string; ink: string; onView: (v: View) => void }) {
  const [open, setOpen] = useState(false), [title, setTitle] = useState(""), [back, setBack] = useState(""), [said, setSaid] = useState("");
  if (!open) return <Text fontSize={12} color="$color10" cursor="pointer" role="button" onPress={() => setOpen(true)}>{`+ a ${kind}`}</Text>;
  const add = async () => {
    try { onView(await api<View>("/api/learning/add", { kind, parent, title, back })); setOpen(false); setTitle(""); setBack(""); }
    catch (e) { setSaid((e as Error).message); }
  };
  return (
    <YStack gap={6}>
      <Entry value={title} onChange={setTitle} onSubmit={add} placeholder={kind === "card" ? "a question" : `the ${kind}'s title`} limit={120} />
      {kind === "card" ? <Entry value={back} onChange={setBack} onSubmit={add} placeholder="its answer" limit={600} /> : null}
      <XStack gap={8}><Action label="ADD" ink={ink} onPress={add} /><Action label="CANCEL" onPress={() => setOpen(false)} /></XStack>
      {said ? <Small>{said}</Small> : null}
    </YStack>
  );
}

type Quiz = { id: string; lesson: string; passed: boolean; tries: number; by: string; questions: string[]; answers: string[];
              marks: { right: boolean; note: string }[]; right?: number; of?: number; pass?: boolean };
function QuizCard({ lesson, ink, onClose }: { lesson: string; ink: string; onClose: () => void }) {
  const [q, setQ] = useState<Quiz | null>(null), [given, setGiven] = useState<string[]>([]), [said, setSaid] = useState(""), [marking, setMarking] = useState(false);
  const [done, setDone] = useState(false);
  useEffect(() => {
    api<{ quiz: Quiz }>("/api/learning/quiz", { lesson }).then((r) => { setQ(r.quiz); setGiven(r.quiz.questions.map(() => "")); }).catch((e) => setSaid((e as Error).message));
  }, [lesson]);
  if (said && !q) return <Card gap={8}><Eyebrow>QUIZ</Eyebrow><Small>{said}</Small><Action label="BACK" onPress={onClose} /></Card>;
  if (!q) return <Pending title="QUIZ" height={220} />;
  const mark = async () => {
    setMarking(true); setSaid("");
    try { const r = await api<{ quiz: Quiz }>("/api/learning/quiz/answer", { quiz: q.id, answers: given }); setQ(r.quiz); setDone(true); }
    catch (e) { setSaid((e as Error).message); } finally { setMarking(false); }
  };
  return (
    <Card gap={10}>
      <XStack justifyContent="space-between"><Eyebrow>QUIZ</Eyebrow><Small color="$color10">{q.passed ? "passed" : q.tries ? `tried ${q.tries}×` : ""}</Small></XStack>
      {q.questions.map((text, i) => (
        <YStack key={i} gap={4}>
          <Text fontSize={16} fontWeight="600" color="$color12">{`${i + 1}. ${text}`}</Text>
          <Entry value={given[i] ?? ""} onChange={(t) => setGiven((g) => g.map((x, k) => (k === i ? t : x)))} onSubmit={() => {}} placeholder="your answer" limit={300} />
          {done && q.marks[i] ? <Small color={q.marks[i].right ? ink : "$color9"}>{q.marks[i].right ? "Right." : `Not quite: ${q.marks[i].note}`}</Small> : null}
        </YStack>
      ))}
      {done && q.of ? <Text fontSize={17} fontWeight="700" color={ink}>{q.pass ? `${q.right} of ${q.of}: passed. A quiz pays 5 ARETE the first time it is passed.` : `${q.right} of ${q.of}. Two thirds passes: try again when you are ready.`}</Text> : null}
      {done && q.by ? <Small color="$color10">{q.by === "tutor" ? "Marked by THE TUTOR." : "Marked by the words alone."}</Small> : null}
      <XStack gap={8} flexWrap="wrap">
        {!done ? <Action label={marking ? "MARKING…" : "MARK IT"} ink={ink} onPress={mark} />
               : <Action label="TRY AGAIN" ink={ink} onPress={() => { setDone(false); setGiven(q.questions.map(() => "")); }} />}
        <Action label="BACK" onPress={onClose} />
      </XStack>
      {said ? <Small>{said}</Small> : null}
    </Card>
  );
}

function LessonPage({ id, ink, onClose }: { id: string; ink: string; onClose: () => void }) {
  const [l, setL] = useApi<Lesson>(`/api/learning/lesson?id=${encodeURIComponent(id)}`);
  useEffect(() => { if (l && !l.body && !l.writing) api<Lesson>("/api/learning/lesson/write", { id }).then(setL).catch(() => {}); }, [l?.id]);
  useEffect(() => {
    if (!l?.writing) return;
    const t = setInterval(() => { api<Lesson>(`/api/learning/lesson?id=${encodeURIComponent(id)}`).then(setL).catch(() => {}); }, 4000);
    return () => clearInterval(t);
  }, [l?.writing]);
  const [quizzing, setQuizzing] = useState(false);
  if (!l) return <Pending title="A LESSON" height={220} />;
  if (quizzing) return <QuizCard lesson={id} ink={ink} onClose={() => setQuizzing(false)} />;
  return (
    <Card gap={8}>
      <Small color="$color10">{`${l.course} › ${l.module}`}</Small>
      <Text fontSize={20} fontWeight="700" color="$color12">{l.title}</Text>
      {l.body ? <Text fontSize={16} lineHeight={25} color="$color12">{l.body}</Text>
        : <Small>{l.writing ? "THE TUTOR is writing it…" : "No words yet. Read it elsewhere, or ask again when the household's mind is here."}</Small>}
      {l.cards.length ? <YStack gap={2}><Eyebrow>ITS CARDS</Eyebrow>{l.cards.map((c) => <Small key={c.id}>{`${c.front}  —  ${c.back}`}</Small>)}</YStack> : null}
      <Adder kind="card" parent={id} ink={ink} onView={() => { api<Lesson>(`/api/learning/lesson?id=${encodeURIComponent(id)}`).then(setL).catch(() => {}); }} />
      <XStack gap={8} flexWrap="wrap">
        <Action label={l.done ? "NOT DONE" : "DONE"} ink={ink} onPress={async () => setL(await api<Lesson>("/api/learning/lesson/done", { id, done: !l.done }))} />
        {l.cards.length ? <Action label="QUIZ" onPress={() => setQuizzing(true)} /> : null}
        <Action label="BACK" onPress={onClose} />
      </XStack>
    </Card>
  );
}

function Review({ course, ink, onClose }: { course: string; ink: string; onClose: () => void }) {
  const [cards, setCards] = useState<{ id: string; front: string; back: string }[] | null>(null), [shown, setShown] = useState(false), [n, setN] = useState(0);
  useEffect(() => { api<{ cards: { id: string; front: string; back: string }[] }>(`/api/learning/review?course=${encodeURIComponent(course)}`).then((r) => setCards(r.cards)).catch(() => setCards([])); }, [course]);
  if (!cards) return <Pending title="REVIEW" height={200} />;
  const c = cards[0];
  const grade = async (g: "again" | "good" | "easy") => {
    await api("/api/learning/review", { id: c.id, grade: g });
    setShown(false); setN((x) => x + 1);
    setCards((all) => (g === "again" ? [...all!.slice(1), all![0]] : all!.slice(1)));
  };
  return (
    <Card gap={10}>
      <XStack justifyContent="space-between"><Eyebrow>REVIEW</Eyebrow><Small color="$color10">{`${cards.length} left · ${n} done`}</Small></XStack>
      {c ? (
        <>
          <Text fontSize={20} fontWeight="700" color="$color12">{c.front}</Text>
          {shown ? <Text fontSize={17} lineHeight={25} color={ink}>{c.back}</Text> : <Action label="SHOW" ink={ink} onPress={() => setShown(true)} />}
          {shown ? <XStack gap={8} flexWrap="wrap">
            <Action label="AGAIN" onPress={() => grade("again")} /><Action label="GOOD" ink={ink} onPress={() => grade("good")} />
            <Action label="EASY" onPress={() => grade("easy")} /></XStack> : null}
        </>
      ) : <Small>Nothing due. Well kept.</Small>}
      <Action label="BACK" onPress={onClose} />
    </Card>
  );
}

function CourseCard({ c, ink, onView, onLesson, onReview }: { c: Course; ink: string; onView: (v: View) => void; onLesson: (id: string) => void; onReview: () => void }) {
  const [open, setOpen] = useState(true);
  const lessons = c.modules.flatMap((m) => m.kids), done = lessons.filter((l) => l.done).length;
  return (
    <Card gap={6}>
      <XStack onPress={() => setOpen((o) => !o)} cursor="pointer" justifyContent="space-between" alignItems="center" role="button" aria-expanded={open}>
        <YStack flex={1}>
          <Text fontSize={18} fontWeight="700" color="$color12">{c.title}</Text>
          <Small color="$color10">{`${done} of ${lessons.length} lesson${lessons.length === 1 ? "" : "s"} · ${c.cards} card${c.cards === 1 ? "" : "s"}${c.due ? ` · ${c.due} due` : ""}`}</Small>
        </YStack>
        <Text fontSize={18} color="$color10">{open ? "−" : "+"}</Text>
      </XStack>
      {open ? (
        <YStack gap={6}>
          {c.tutor === "asking" ? <Small color={ink}>THE TUTOR is drafting a syllabus…</Small> : null}
          {c.tutor === "failed" ? (
            <XStack gap={8} alignItems="center" flexWrap="wrap"><Small color="$color9">{c.error ?? "It could not be asked."}</Small>
              <Action label="ASK AGAIN" ink={ink} onPress={async () => onView(await api<View>("/api/learning/tutor", { course: c.id }))} /></XStack>
          ) : null}
          {c.tutor === "none" && !c.modules.length ? <Small>No mind is here to propose a syllabus: build it by hand, a module at a time.</Small> : null}
          {c.proposals.length ? <Proposals c={c} ink={ink} onView={onView} /> : null}
          {c.due ? <Action label={`REVIEW ${c.due}`} ink={ink} onPress={onReview} /> : null}
          {c.modules.map((m) => (
            <YStack key={m.id} gap={4} marginTop={4}>
              <Text fontSize={15} fontWeight="700" color="$color12">{m.title}</Text>
              {m.kids.map((l) => (
                <XStack key={l.id} gap={8} marginLeft={14} alignItems="center" cursor="pointer" role="button" onPress={() => onLesson(l.id)}>
                  <Text fontSize={14} color={l.done ? ink : "$color10"}>{l.done ? "✓" : "○"}</Text>
                  <Text flex={1} fontSize={14} color="$color12">{l.title}</Text>
                  <Small color="$color10">{`${l.kids.length} card${l.kids.length === 1 ? "" : "s"} ›`}</Small>
                </XStack>
              ))}
              <YStack marginLeft={14}><Adder kind="lesson" parent={m.id} ink={ink} onView={onView} /></YStack>
            </YStack>
          ))}
          <Adder kind="module" parent={c.id} ink={ink} onView={onView} />
        </YStack>
      ) : null}
    </Card>
  );
}

export function LearningSection({ ink }: { ink: string }) {
  const [v, setV, error] = useApi<View>("/api/learning");
  const [subject, setSubject] = useState(""), [said, setSaid] = useState("");
  const [lesson, setLesson] = useState<string | null>(null), [reviewing, setReviewing] = useState<string | null>(null);
  const asking = !!v?.courses.some((c) => c.tutor === "asking");
  useEffect(() => {                                               // while THE TUTOR drafts, look again every few seconds
    if (!asking) return;
    const t = setInterval(() => { api<View>("/api/learning").then(setV).catch(() => {}); }, 4000);
    return () => clearInterval(t);
  }, [asking]);
  if (error) return <Card><Eyebrow>LEARNING</Eyebrow><Small>{error}</Small></Card>;
  if (!v) return <Pending title="LEARNING" height={[180, 160]} />;
  if (lesson) return <LessonPage id={lesson} ink={ink} onClose={() => { setLesson(null); api<View>("/api/learning").then(setV).catch(() => {}); }} />;
  if (reviewing) return <Review course={reviewing} ink={ink} onClose={() => { setReviewing(null); api<View>("/api/learning").then(setV).catch(() => {}); }} />;
  const start = async () => {
    setSaid("");
    try { setV(await api<View>("/api/learning/course", { subject })); setSubject(""); } catch (e) { setSaid((e as Error).message); }
  };
  return (
    <YStack gap={14}>
      <Card gap={6}>
        <Eyebrow>LEARNING</Eyebrow>
        <Small>Name what you would like to learn. THE TUTOR proposes a syllabus; you take what you want of it. A lesson done is 3 ARETE, a card reviewed 1.</Small>
        <Entry value={subject} onChange={setSubject} onSubmit={start} placeholder="Spanish, knots, the night sky…" limit={80} />
        <Action label="BEGIN" ink={ink} onPress={start} />
        {said ? <Small>{said}</Small> : null}
      </Card>
      {v.courses.map((c) => <CourseCard key={c.id} c={c} ink={ink} onView={setV} onLesson={setLesson} onReview={() => setReviewing(c.id)} />)}
      <Small color="$color8">DRAFT</Small>
    </YStack>
  );
}
