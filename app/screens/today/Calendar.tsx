// C-354 (the user, 2026-11-12): THE CALENDAR -- the calendar sprite on TODAY, tapped: the phone's calendar by MONTH, WEEK
// and DAY, its events added, changed and removed here (platform/calendar.ts, EventKit). The month's card at its top
// carries its symbol (C-355): its tone, what the season is doing, the days it leans on; and its own tuning fork brings
// a singing bowl in the month's colours, ringing the month's chord. The week starts on Sunday, as the week of virtues
// does, and each day wears its own colour. Every word DRAFT.
import { useCallback, useEffect, useState } from "react";
import { Input, Text, Theme, XStack, YStack } from "tamagui";
import { Today } from "../../state/types";
import { Action, Card, Choice, Eyebrow, Segments, Small, useDay } from "../../ui/ui";
import { ForkKey, SingingBowl, type BowlOf } from "../../ui/bowl";
import { CalendarSprite } from "../../ui/calendarSprite";
import { mix, PAPER } from "../../ui/pixels";
import { addEvent, calendarBooks, calendarHere, changeEvent, defaultBook, eventsBetween, mayUseCalendar, removeEvent,
         type CalBook, type CalEvent } from "../../platform/calendar";
import { usePlace } from "../../state/place";
import { PALETTE } from "../../state/look";
import { DAYS, RAINBOW_COLOURS, WEEK_COLOURS } from "../../tamagui.config";
import { useMonth } from "../../state/month";

type View = "month" | "week" | "day";
const DAY_MS = 86400000;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const two = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
const hm = (d: Date) => `${two(d.getHours())}:${two(d.getMinutes())}`;
const WEEKDAY = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const weekColour = (i: number) => (PALETTE === "rainbow" ? RAINBOW_COLOURS : WEEK_COLOURS)[DAYS[i]];

function span(view: View, at: Date): [Date, Date] {
  if (view === "day") return [startOfDay(at), addDays(at, 1)];
  if (view === "week") { const s = addDays(at, -at.getDay()); return [s, addDays(s, 7)]; }
  const first = new Date(at.getFullYear(), at.getMonth(), 1), s = addDays(first, -first.getDay());
  return [s, addDays(s, 42)];
}

export function CalendarScreen({ today, onClose, ink }: { today: Today; onClose: () => void; ink: string }) {
  const day = useDay();
  const [view, setView] = usePlace<View>("today.calendar.view", "month");
  const [at, setAt] = useState(() => startOfDay(new Date()));
  const month = useMonth(today, at.getMonth() + 1);
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [allowed, setAllowed] = useState<boolean | null>(calendarHere() ? null : false);
  const [editing, setEditing] = useState<CalEvent | "new" | null>(null);
  const [bowl, setBowl] = useState<BowlOf | null>(null);
  const [note, setNote] = useState("");
  const load = useCallback(async () => {
    if (!calendarHere()) return;
    try {
      const ok = await mayUseCalendar(true); setAllowed(ok);
      if (ok) { const [s, e] = span(view, at); setEvents(await eventsBetween(s, e)); }
    } catch (e) { setNote((e as Error).message); }
  }, [view, at]);
  useEffect(() => { load(); }, [load]);
  const move = (n: number) => setAt((d) => view === "day" ? addDays(d, n) : view === "week" ? addDays(d, 7 * n) : new Date(d.getFullYear(), d.getMonth() + n, 1));
  const on = (d: Date) => events.filter((e) => e.start < addDays(d, 1) && e.end > startOfDay(d) || (e.allDay && sameDay(e.start, d)));
  const monthBowl = (): BowlOf => ({                            // C-354: the month's bowl, ringing its chord
    colours: month.colours, lit: month.leans.map((l) => l.chakra), notes: month.chord,
    title: `${month.name.toUpperCase()} · ${month.chord.join(" + ")}`,
    lines: [`${month.tone} · ${month.movement}`, month.practice],
  });
  const heading = view === "month" ? `${month.name.toUpperCase()} ${at.getFullYear()}`
    : view === "week" ? `THE WEEK OF ${WEEKDAY[0]} ${span("week", at)[0].getDate()} ${month.short}`
    : `${WEEKDAY[at.getDay()]} ${at.getDate()} ${month.short}`;

  if (editing) return <EventForm event={editing === "new" ? null : editing} date={at} ink={ink}
                                 onDone={(said) => { setEditing(null); if (said) setNote(said); load(); }} />;
  return (
    <YStack gap={14}>
      <XStack alignItems="center" gap={8}>
        <YStack role="button" cursor="pointer" onPress={onClose} paddingVertical={4} paddingRight={8}>
          <Text fontFamily="$mono" fontSize={13} letterSpacing={1} color="$color10">‹ TODAY</Text>
        </YStack>
        <Text flex={1} fontFamily="$mono" fontSize={13} letterSpacing={2} fontWeight="700" color="$color12">THE CALENDAR</Text>
      </XStack>
      {/* C-355: the month's symbol */}
      <Card borderLeftWidth={6} borderLeftColor={month.colours[0]}>
        <XStack gap={12} alignItems="flex-start">
          <YStack flex={1} gap={3}>
            <XStack alignItems="center" gap={2}>
              <Eyebrow>{`${month.name.toUpperCase()} · ${month.chord.join(" + ")}`}</Eyebrow>
              <ForkKey colour={month.colours[0]} onPress={() => setBowl(monthBowl())} label={`ring ${month.chord.join(" and ")}, the month's chord`} />
            </XStack>
            <Text fontSize={22} fontWeight="600" color="$color12">{month.tone}</Text>
            <Text fontSize={15} color="$color11">{`${month.movement[0].toUpperCase()}${month.movement.slice(1)}, in the ${month.hemisphere}`}</Text>
            <Small>{month.practice}</Small>
            <Small>{`Its tone from ${month.from}. Its colour ${month.hues.join(" into ")}, ${month.leans.map((l) => `${l.day}'s`).join(" and ")}.`}</Small>
          </YStack>
          <CalendarSprite day={at.getDate()} short={month.short} colours={month.colours} dayColour={weekColour(at.getDay())} />
        </XStack>
      </Card>
      <Segments value={view} onChange={setView} options={[["month", "MONTH"], ["week", "WEEK"], ["day", "DAY"]]} />
      <XStack alignItems="center" gap={8}>
        <Action label="‹" onPress={() => move(-1)} ink={ink} />
        <Text flex={1} textAlign="center" fontFamily="$mono" fontSize={13} letterSpacing={1} fontWeight="700" color="$color12">{heading}</Text>
        <Action label="›" onPress={() => move(1)} ink={ink} />
      </XStack>
      <XStack gap={8} flexWrap="wrap">
        <Action label="Today" onPress={() => setAt(startOfDay(new Date()))} ink={ink} />
        {allowed ? <Action label="+ Add an event" onPress={() => setEditing("new")} ink={ink} /> : null}
      </XStack>
      {allowed === false ? (
        <Small>{calendarHere() ? "DAEMONS may not read the calendar. Allow it in the phone's Settings, under Privacy, Calendars."
          : "THE CALENDAR shows the phone's own calendar, so its events are seen in the app on the phone. Here, the month and its tone."}</Small>
      ) : null}
      {note ? <Small>{note}</Small> : null}

      {view === "month" ? <MonthGrid at={at} on={on} pick={(d) => { setAt(d); setView("day"); }} todayColour={day.colour} monthColours={month.colours} />
        : view === "week" ? <WeekList at={at} on={on} pick={(d) => { setAt(d); setView("day"); }} edit={setEditing} />
        : <DayList at={at} events={on(at)} edit={setEditing} />}
      <Theme reset><SingingBowl bowl={bowl} onClose={() => setBowl(null)} /></Theme>
    </YStack>
  );
}

function MonthGrid({ at, on, pick, todayColour, monthColours }: { at: Date; on: (d: Date) => CalEvent[]; pick: (d: Date) => void; todayColour: string; monthColours: string[] }) {
  const [s] = span("month", at), now = new Date();
  return (
    <Card padding={8} gap={0}>
      <XStack>
        {WEEKDAY.map((w, i) => <Text key={w} flex={1} textAlign="center" fontFamily="$mono" fontSize={10} letterSpacing={1} fontWeight="700" color={weekColour(i)}>{w}</Text>)}
      </XStack>
      {Array.from({ length: 6 }, (_, r) => (
        <XStack key={r}>
          {Array.from({ length: 7 }, (_, c) => {
            const d = addDays(s, r * 7 + c), inMonth = d.getMonth() === at.getMonth(), evs = on(d), isToday = sameDay(d, now);
            return (
              <YStack key={c} flex={1} aspectRatio={0.9} margin={1.5} borderRadius={5} padding={3} role="button" cursor="pointer" onPress={() => pick(d)}
                      borderWidth={isToday ? 2 : 1} borderColor={isToday ? todayColour : "$color4"}
                      backgroundColor={inMonth ? mix(monthColours[0], PAPER, 0.9) : "transparent"} opacity={inMonth ? 1 : 0.45}
                      hoverStyle={{ borderColor: "$color9" }}>
                <Text fontFamily="$mono" fontSize={12} fontWeight={isToday ? "800" : "500"} color={isToday ? todayColour : "#1d2026"}>{d.getDate()}</Text>
                <XStack gap={2} flexWrap="wrap" marginTop={2}>
                  {evs.slice(0, 4).map((e) => <YStack key={e.key} width={6} height={6} borderRadius={3} backgroundColor={e.colour} />)}
                </XStack>
              </YStack>
            );
          })}
        </XStack>
      ))}
    </Card>
  );
}

const EventRow = ({ e, edit }: { e: CalEvent; edit: (e: CalEvent) => void }) => (
  <XStack gap={8} alignItems="center" paddingVertical={6} role="button" cursor="pointer" onPress={() => edit(e)} hoverStyle={{ opacity: 0.8 }}>
    <YStack width={4} alignSelf="stretch" borderRadius={2} backgroundColor={e.colour} />
    <Text width={54} fontFamily="$mono" fontSize={12} color="$color10">{e.allDay ? "ALL DAY" : hm(e.start)}</Text>
    <Text flex={1} fontSize={14} color="$color12" numberOfLines={2}>{e.title}</Text>
  </XStack>
);

function WeekList({ at, on, pick, edit }: { at: Date; on: (d: Date) => CalEvent[]; pick: (d: Date) => void; edit: (e: CalEvent) => void }) {
  const [s] = span("week", at);
  return (
    <YStack gap={8}>
      {Array.from({ length: 7 }, (_, i) => {
        const d = addDays(s, i), evs = on(d);
        return (
          <Card key={i} borderLeftWidth={6} borderLeftColor={weekColour(i)} paddingVertical={10} gap={2}>
            <XStack role="button" cursor="pointer" onPress={() => pick(d)}>
              <Text fontFamily="$mono" fontSize={12} letterSpacing={1} fontWeight="700" color={weekColour(i)}>{`${WEEKDAY[i]} ${d.getDate()}`}</Text>
            </XStack>
            {evs.length ? evs.map((e) => <EventRow key={e.key} e={e} edit={edit} />) : <Small>Nothing in the calendar.</Small>}
          </Card>
        );
      })}
    </YStack>
  );
}

function DayList({ at, events, edit }: { at: Date; events: CalEvent[]; edit: (e: CalEvent) => void }) {
  return (
    <Card borderLeftWidth={6} borderLeftColor={weekColour(at.getDay())}>
      <Eyebrow>{`${["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"][at.getDay()]} ${at.getDate()}`}</Eyebrow>
      {events.length ? events.map((e) => <EventRow key={e.key} e={e} edit={edit} />) : <Small>Nothing in the calendar.</Small>}
    </Card>
  );
}

// adding one, or changing or removing one the calendar lets be changed
function EventForm({ event, date, ink, onDone }: { event: CalEvent | null; date: Date; ink: string; onDone: (said?: string) => void }) {
  const base = event?.start ?? new Date(date.getFullYear(), date.getMonth(), date.getDate(), 9);
  const [title, setTitle] = useState(event?.title ?? "");
  const [day, setDay] = useState(ymd(base));
  const [from, setFrom] = useState(hm(base));
  const [to, setTo] = useState(hm(event?.end ?? new Date(+base + 3600000)));
  const [allDay, setAllDay] = useState(event?.allDay ?? false);
  const [notes, setNotes] = useState(event?.notes ?? "");
  const [books, setBooks] = useState<CalBook[]>([]);
  const [book, setBook] = useState(event?.calendarId ?? "");
  const [sure, setSure] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => { calendarBooks().then((b) => setBooks(b.filter((x) => x.canChange))).catch(() => {});
                    if (!event) defaultBook().then((id) => id && setBook(id)).catch(() => {}); }, [event]);
  const canChange = !event || event.canChange;
  const when = () => {
    const [y, m, d] = day.split("-").map(Number), [fh, fm] = from.split(":").map(Number), [th, tm] = to.split(":").map(Number);
    if (!y || !m || !d) throw new Error("The date is YYYY-MM-DD.");
    if (allDay) return { start: new Date(y, m - 1, d), end: new Date(y, m - 1, d + 1) };
    if ([fh, fm, th, tm].some((n) => Number.isNaN(n))) throw new Error("A time is HH:MM.");
    const start = new Date(y, m - 1, d, fh, fm), end = new Date(y, m - 1, d, th, tm);
    if (end <= start) throw new Error("It ends after it starts.");
    return { start, end };
  };
  const save = async () => {
    try {
      if (!title.trim()) throw new Error("It needs a title.");
      const t = { title: title.trim(), ...when(), allDay, notes };
      if (event) await changeEvent(event, t);
      else { if (!book) throw new Error("Choose a calendar."); await addEvent({ ...t, calendarId: book }); }
      onDone(event ? "Changed." : "Added.");
    } catch (e) { setErr((e as Error).message); }
  };
  const remove = async () => {
    if (!sure) { setSure(true); return; }
    try { await removeEvent(event!); onDone("Removed."); } catch (e) { setErr((e as Error).message); }
  };
  const field = (label: string, value: string, set: (v: string) => void, placeholder = "", multiline = false) => (
    <YStack gap={4}>
      <Text fontFamily="$mono" fontSize={11} letterSpacing={1} color="$color10">{label}</Text>
      <Input value={value} onChangeText={set} placeholder={placeholder} disabled={!canChange} multiline={multiline} minHeight={multiline ? 70 : undefined}
             backgroundColor="$color1" borderColor="$color6" color="$color12" fontSize={14} />
    </YStack>
  );
  return (
    <YStack gap={14}>
      <XStack alignItems="center">
        <YStack role="button" cursor="pointer" onPress={() => onDone()} paddingVertical={4} paddingRight={8}>
          <Text fontFamily="$mono" fontSize={13} letterSpacing={1} color="$color10">‹ THE CALENDAR</Text>
        </YStack>
      </XStack>
      <Card gap={10}>
        <Eyebrow>{event ? (canChange ? "CHANGE AN EVENT" : "AN EVENT") : "ADD AN EVENT"}</Eyebrow>
        {field("TITLE", title, setTitle, "What is it?")}
        {field("DAY", day, setDay, "YYYY-MM-DD")}
        <Choice value={allDay} options={[[false, "At a time"], [true, "All day"]]} onPick={setAllDay} ink={ink} />
        {allDay ? null : <XStack gap={10}><YStack flex={1}>{field("FROM", from, setFrom, "HH:MM")}</YStack><YStack flex={1}>{field("TO", to, setTo, "HH:MM")}</YStack></XStack>}
        {!event && books.length ? <YStack gap={4}>
          <Text fontFamily="$mono" fontSize={11} letterSpacing={1} color="$color10">CALENDAR</Text>
          <Choice value={book} options={books.map((b) => [b.id, b.title] as [string, string])} onPick={setBook} ink={ink} />
        </YStack> : null}
        {field("NOTES", notes, setNotes, "", true)}
        {event?.recurring && canChange ? <Small>This one repeats: a change or removal here is made to this time only.</Small> : null}
        {!canChange ? <Small>This calendar cannot be changed from here.</Small> : null}
        {err ? <Small color="$color11">{err}</Small> : null}
        {canChange ? <XStack gap={8} flexWrap="wrap">
          <Action label={event ? "Save the change" : "Add it"} onPress={save} ink={ink} />
          {event ? <Action label={sure ? "Remove it for good" : "Remove"} onPress={remove} ink={ink} /> : null}
        </XStack> : null}
      </Card>
    </YStack>
  );
}
