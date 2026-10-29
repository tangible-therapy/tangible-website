// "Use this room today" claims for the Find a Room page (/employeeportal/rooms).
// Claims are kept in Netlify Blobs store "room-claims", one document per office per day:
//   <office>/<YYYY-MM-DD>  → { claims: Claim[] }
// They are NOT written into the office's Google Sheet (the sheet's Master Schedule stays the planned schedule);
// a claim only shows on the website, for that day, and old days are simply never read again.
// A claim runs from the chosen time until the room's next booking on the sheet's schedule (or closing time).
import { getStore } from '@netlify/blobs';
import type { Office } from '../../src/data/staff-access.ts';

export type Claim = { id: string; building: string; room: string; start: number; end: number; email: string; name: string; at: string };
type DayDoc = { claims: Claim[] };

export const OPEN_MIN = 7 * 60;   // first bookable slot (7:00 AM)
export const CLOSE_MIN = 22 * 60; // closing time (10:00 PM); last slot starts 9:30 PM
export const DAY_CODES: Record<string, string> = { Mon: 'M', Tue: 'T', Wed: 'W', Thu: 'Th', Fri: 'F', Sat: 'S' };

const store = () => getStore({ name: 'room-claims', consistency: 'strong' });
const key = (office: Office, date: string) => `${office}/${date}`;

/** Today's date, weekday and minutes since midnight in Utah. */
export function utahNow() {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Denver', weekday: 'short', hour: 'numeric', minute: 'numeric', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const g: Record<string, string> = {};
  f.forEach((p) => (g[p.type] = p.value));
  return { date: `${g.year}-${g.month}-${g.day}`, day: DAY_CODES[g.weekday] || '', mins: (+g.hour % 24) * 60 + +g.minute };
}

export const hhmm = (s: string) => { const [h, m] = s.split(':'); return +h * 60 + +m; };

export async function readDay(office: Office, date: string): Promise<{ doc: DayDoc; etag?: string }> {
  const r = await store().getWithMetadata(key(office, date), { type: 'json' });
  return r ? { doc: r.data as DayDoc, etag: r.etag } : { doc: { claims: [] } };
}

/** Read-modify-write with conflict retry, so two people claiming at once can't both get the same room. */
export async function updateDay(office: Office, date: string, change: (doc: DayDoc) => string | void): Promise<{ doc?: DayDoc; error?: string }> {
  for (let i = 0; i < 5; i++) {
    const { doc, etag } = await readDay(office, date);
    const err = change(doc);
    if (err) return { error: err };
    const res = etag
      ? await store().setJSON(key(office, date), doc, { onlyIfMatch: etag })
      : await store().setJSON(key(office, date), doc, { onlyIfNew: true });
    if (res?.modified !== false) return { doc };
  }
  return { error: 'Someone else was saving at the same time. Please try again.' };
}
