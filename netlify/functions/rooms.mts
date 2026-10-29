// /api/rooms — today's "use this room" claims for an office (page: /employeeportal/rooms).
//   GET  ?office=orem                                   → today's claims
//   POST { action: 'claim', building, room, start }     → claims the room from `start` (minutes after midnight)
//                                                         until its next booking on the sheet (or closing time)
//   POST { action: 'release', id }                      → removes a claim (the person who made it, front desk,
//                                                         directors or the owner)
// Same office rules as /api/dashboard: your own office; directors/owner can see and use any office.
import { currentPerson } from '../lib/staff-session.ts';
import { getDashboard, hasDashboard } from '../lib/dashboard.ts';
import { readDay, updateDay, utahNow, hhmm, OPEN_MIN, CLOSE_MIN, type Claim } from '../lib/rooms.ts';
import { canManage, OFFICES, type Office, type StaffRecord } from '../../src/data/staff-access.ts';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' } });
const canReleaseAny = (me: StaffRecord) => canManage(me) || me.roles.includes('frontdesk');
const firstName = (me: StaffRecord) => (me.name || me.email).split(/[\s@.]/)[0].replace(/^./, (c) => c.toUpperCase());
const show = (c: Claim, me: StaffRecord) => ({ id: c.id, building: c.building, room: c.room, start: c.start, end: c.end, name: c.name, at: c.at, mine: c.email === me.email, canRelease: c.email === me.email || canReleaseAny(me) });

export default async (req: Request) => {
  const me = await currentPerson(req);
  if (!me || me.status !== 'approved') return json({ error: 'Please sign in.' }, 401);
  const url = new URL(req.url);
  const office = (url.searchParams.get('office') || me.office) as Office;
  if (!OFFICES.some((o) => o.id === office)) return json({ error: 'Unknown office.' }, 400);
  if (office !== me.office && !canManage(me)) return json({ error: 'Not your office.' }, 403);
  if (!hasDashboard(office)) return json({ office, available: false, claims: [] });
  const now = utahNow();

  if (req.method === 'GET') {
    const { doc } = await readDay(office, now.date);
    return json({ office, date: now.date, day: now.day, now: now.mins, claims: doc.claims.map((c) => show(c, me)) });
  }

  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  if (req.headers.get('origin') !== url.origin) return json({ error: 'origin' }, 403);
  const b = await req.json().catch(() => ({}) as any);

  if (b.action === 'claim') {
    if (!now.day) return json({ error: 'Rooms can only be claimed on days the office is open.' }, 400);
    const start = Math.round(Number(b.start) / 30) * 30;
    if (!Number.isFinite(start) || start < OPEN_MIN || start >= CLOSE_MIN) return json({ error: 'Please pick a time during office hours.' }, 400);
    if (start + 30 <= now.mins) return json({ error: 'That time has already passed today.' }, 400);
    const d = await getDashboard(office);
    const sched = (d?.data?.schedules || []).find((s: any) => s.name === b.building);
    const room = sched?.rooms?.find((r: any) => r.label === b.room);
    if (!room) return json({ error: 'That room wasn’t found on the schedule. Please refresh the page.' }, 400);
    const blocks: { start: string; end: string }[] = room.days?.[now.day] || [];
    if (blocks.some((x) => hhmm(x.start) <= start && start < hhmm(x.end))) return json({ error: 'That room is booked on the schedule at that time.' }, 409);
    const next = blocks.map((x) => hhmm(x.start)).filter((m) => m > start).sort((a, z) => a - z)[0];
    const end = Math.min(next ?? CLOSE_MIN, CLOSE_MIN);
    const claim: Claim = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), building: sched.name, room: room.label, start, end, email: me.email, name: firstName(me), at: new Date().toISOString() };
    const r = await updateDay(office, now.date, (doc) => {
      const clash = doc.claims.find((c) => c.building === claim.building && c.room === claim.room && c.start < claim.end && start < c.end);
      if (clash) return `${clash.name} already claimed ${claim.room} for that time.`;
      doc.claims.push(claim);
    });
    if (r.error) return json({ error: r.error }, 409);
    return json({ ok: true, claims: r.doc!.claims.map((c) => show(c, me)) });
  }

  if (b.action === 'release') {
    const r = await updateDay(office, now.date, (doc) => {
      const c = doc.claims.find((x) => x.id === b.id);
      if (!c) return 'That claim was already released.';
      if (c.email !== me.email && !canReleaseAny(me)) return 'Only the person who claimed this room (or the front desk) can release it.';
      doc.claims = doc.claims.filter((x) => x.id !== b.id);
    });
    if (r.error) return json({ error: r.error }, 400);
    return json({ ok: true, claims: r.doc!.claims.map((c) => show(c, me)) });
  }

  return json({ error: 'Unknown action.' }, 400);
};

export const config = { path: '/api/rooms' };
