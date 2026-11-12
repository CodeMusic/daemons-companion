// C-354 (the user, 2026-11-12): the phone's own calendar, through EventKit (expo-calendar) -- its events by a span of
// days, and adding, changing and removing them. Asked for once (the purpose string is in app.json and in the iOS
// project's Info.plist). Only on the phone: the site has no calendar of the phone's to read, and says so.
import { ON_PHONE } from "./net";

type Cal = typeof import("expo-calendar");
let mod: Cal | null | undefined;
function cal(): Cal | null {
  if (mod !== undefined) return mod;
  try { mod = ON_PHONE ? (require("expo-calendar") as Cal) : null; } catch { mod = null; }   // a build without the module
  return mod;
}

export type CalEvent = { id: string; key: string; calendarId: string; title: string; start: Date; end: Date; allDay: boolean; notes: string;
                         location: string | null; colour: string; canChange: boolean; recurring: boolean };
export type CalBook = { id: string; title: string; colour: string; canChange: boolean };
export type EventDraft = { title: string; start: Date; end: Date; allDay: boolean; notes: string; calendarId: string };

// the occurrences as EventKit gave them, so a repeating event is changed or removed at the time that was tapped (EKSpan
// .thisEvent), never at its first
type Native = InstanceType<Cal["ExpoCalendarEvent"]>;
const NATIVE = new Map<string, Native>();

export const calendarHere = () => cal() !== null;

/** Asks once; true when the calendar may be read and written. */
export async function mayUseCalendar(ask = true): Promise<boolean> {
  const c = cal(); if (!c) return false;
  const now = await c.getCalendarPermissions();
  if (now.granted) return true;
  if (!ask || !now.canAskAgain) return false;
  return (await c.requestCalendarPermissions()).granted;
}

export async function calendarBooks(): Promise<CalBook[]> {
  const c = cal(); if (!c) return [];
  const all = await c.getCalendars(c.EntityTypes.EVENT);
  return all.map((b) => ({ id: b.id, title: b.title, colour: b.color ?? "#888888", canChange: b.allowsModifications }));
}

export async function defaultBook(): Promise<string | null> {
  const c = cal(); if (!c) return null;
  try { return c.getDefaultCalendarSync().id; } catch { return (await calendarBooks()).find((b) => b.canChange)?.id ?? null; }
}

export async function eventsBetween(start: Date, end: Date): Promise<CalEvent[]> {
  const c = cal(); if (!c) return [];
  const books = await calendarBooks();
  if (!books.length) return [];
  const byId = Object.fromEntries(books.map((b) => [b.id, b]));
  const evs = await c.listEvents(books.map((b) => b.id), start, end);
  return evs.map((e) => {
    const key = `${e.id}@${new Date(e.startDate).getTime()}`;
    NATIVE.set(key, e);
    return {
    id: e.id, key, calendarId: e.calendarId, title: e.title || "(no title)", start: new Date(e.startDate), end: new Date(e.endDate),
    allDay: e.allDay, notes: e.notes ?? "", location: e.location ?? null, colour: byId[e.calendarId]?.colour ?? "#888888",
    canChange: byId[e.calendarId]?.canChange ?? false, recurring: !!e.recurrenceRule,
  }; }).sort((a, b) => +a.start - +b.start);
}

export async function addEvent(d: EventDraft) {
  const c = cal(); if (!c) throw new Error("The calendar is on the phone.");
  const book = await c.ExpoCalendar.get(d.calendarId);
  await book.createEvent({ title: d.title, startDate: d.start, endDate: d.end, allDay: d.allDay, notes: d.notes });
}

const occurrence = async (c: Cal, e: Pick<CalEvent, "id" | "key">) => NATIVE.get(e.key) ?? (await c.ExpoCalendarEvent.get(e.id));

export async function changeEvent(ev: Pick<CalEvent, "id" | "key">, d: Omit<EventDraft, "calendarId">) {
  const c = cal(); if (!c) throw new Error("The calendar is on the phone.");
  const e = await occurrence(c, ev);
  await e.update({ title: d.title, startDate: d.start, endDate: d.end, allDay: d.allDay, notes: d.notes });
}

export async function removeEvent(ev: Pick<CalEvent, "id" | "key">) {
  const c = cal(); if (!c) throw new Error("The calendar is on the phone.");
  await (await occurrence(c, ev)).delete();
}
