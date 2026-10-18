// C-157 (the review: companion-backups/ grew without end -- a copy of the save, 128 KB, at every SYNC that changed it): which
// of a save's backups may go. Kept: the newest KEEP, and every one younger than DAYS, however many -- a fortnight of SYNCs
// can always be gone back to. Names end in the ISO time they were made with ":" and "." as "-", so they sort by age.
export const KEEP = 60, DAYS = 14;

const timeOf = (name: string, base: string) => {
  const m = name.slice(base.length + 1).match(/^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/);
  return m ? Date.parse(`${m[1]}T${m[2]}:${m[3]}:${m[4]}.${m[5]}Z`) : NaN;
};

export function prunable(names: string[], base: string, now: Date, keep = KEEP, days = DAYS): string[] {
  const mine = names.filter((n) => n.startsWith(`${base}.`) && !Number.isNaN(timeOf(n, base))).sort();
  const old = now.getTime() - days * 86400000;
  return mine.slice(0, Math.max(0, mine.length - keep)).filter((n) => timeOf(n, base) < old);
}
