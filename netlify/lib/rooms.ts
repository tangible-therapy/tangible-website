// "Use this room today" claims for the Find a Room page (/employeeportal/rooms).
// Claims are kept in Netlify Blobs store "room-claims", one document per office per day:
//   <office>/<YYYY-MM-DD>  → { claims: Claim[] }
// They are NOT written into the office's Google Sheet (the sheet's Master Schedule stays the planned schedule);
// a claim only shows on the website, for that day, and old days are simply never read again.
// A claim runs from the chosen time until the room's next booking on the sheet's schedule (or closing time).
import { getStore } from '@netlify/blobs';
import { OWNER_EMAILS as OWNERS, type Office, type StaffRecord } from '../../src/data/staff-access.ts';
import { getDashboard } from './dashboard.ts';

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

// ---------------------------------------------------------------------------------------------
// Shared by /api/rooms (Find a Room page) and /api/staff-chat (the staff chatbot).

export const canReleaseAny = (me: StaffRecord) => me.roles.includes('director') || me.roles.includes('frontdesk') || isOwnerEmail(me.email);
const isOwnerEmail = (e: string) => OWNERS.includes(e.toLowerCase());
export const firstNameOf = (me: StaffRecord) => (me.name || me.email).split(/[\s@.]/)[0].replace(/^./, (c) => c.toUpperCase());
export const showClaim = (c: Claim, me: StaffRecord) => ({ id: c.id, building: c.building, room: c.room, start: c.start, end: c.end, name: c.name, at: c.at, mine: c.email === me.email, canRelease: c.email === me.email || canReleaseAny(me) });

/** Claims a room for today from `start` (minutes after midnight) until its next booking (or closing). */
export async function claimRoom(office: Office, me: StaffRecord, building: string, roomLabel: string, startMin: number): Promise<{ claim?: Claim; claims?: Claim[]; error?: string; status?: number }> {
  const now = utahNow();
  if (!now.day) return { error: 'Rooms can only be claimed on days the office is open.', status: 400 };
  const start = Math.round(Number(startMin) / 30) * 30;
  if (!Number.isFinite(start) || start < OPEN_MIN || start >= CLOSE_MIN) return { error: 'Please pick a time during office hours.', status: 400 };
  if (start + 30 <= now.mins) return { error: 'That time has already passed today.', status: 400 };
  const d = await getDashboard(office);
  const sched = (d?.data?.schedules || []).find((s: any) => s.name.toLowerCase() === String(building || '').toLowerCase()) || ((d?.data?.schedules || []).length === 1 ? d!.data.schedules[0] : null);
  const room = sched?.rooms?.find((r: any) => r.label.toLowerCase() === String(roomLabel || '').toLowerCase());
  if (!room) return { error: 'That room wasn’t found on the schedule.', status: 400 };
  const blocks: { start: string; end: string }[] = room.days?.[now.day] || [];
  if (blocks.some((x) => hhmm(x.start) <= start && start < hhmm(x.end))) return { error: 'That room is booked on the schedule at that time.', status: 409 };
  const next = blocks.map((x) => hhmm(x.start)).filter((m) => m > start).sort((a, z) => a - z)[0];
  const end = Math.min(next ?? CLOSE_MIN, CLOSE_MIN);
  const claim: Claim = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), building: sched.name, room: room.label, start, end, email: me.email, name: firstNameOf(me), at: new Date().toISOString() };
  const r = await updateDay(office, now.date, (doc) => {
    const clash = doc.claims.find((c) => c.building === claim.building && c.room === claim.room && c.start < claim.end && start < c.end);
    if (clash) return `${clash.name} already claimed ${claim.room} for that time.`;
    doc.claims.push(claim);
  });
  if (r.error) return { error: r.error, status: 409 };
  return { claim, claims: r.doc!.claims };
}

/** Releases one of today's claims (yours, or anyone's for front desk / directors / owner). */
export async function releaseClaim(office: Office, me: StaffRecord, id: string): Promise<{ claims?: Claim[]; error?: string }> {
  const r = await updateDay(office, utahNow().date, (doc) => {
    const c = doc.claims.find((x) => x.id === id);
    if (!c) return 'That claim was already released.';
    if (c.email !== me.email && !canReleaseAny(me)) return 'Only the person who claimed this room (or the front desk) can release it.';
    doc.claims = doc.claims.filter((x) => x.id !== id);
  });
  return r.error ? { error: r.error } : { claims: r.doc!.claims };
}
