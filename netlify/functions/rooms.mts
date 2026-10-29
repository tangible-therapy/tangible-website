// /api/rooms — today's "use this room" claims for an office (page: /employeeportal/rooms).
//   GET  ?office=orem                                   → today's claims
//   POST { action: 'claim', building, room, start }     → claims the room from `start` (minutes after midnight)
//                                                         until its next booking on the sheet (or closing time)
//   POST { action: 'release', id }                      → removes a claim (the person who made it, front desk,
//                                                         directors or the owner)
// Same office rules as /api/dashboard: your own office; directors/owner can see and use any office.
import { currentPerson } from '../lib/staff-session.ts';
import { hasDashboard } from '../lib/dashboard.ts';
import { readDay, utahNow, claimRoom, releaseClaim, showClaim } from '../lib/rooms.ts';
import { canManage, OFFICES, type Office } from '../../src/data/staff-access.ts';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' } });

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
    return json({ office, date: now.date, day: now.day, now: now.mins, claims: doc.claims.map((c) => showClaim(c, me)) });
  }

  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  if (req.headers.get('origin') !== url.origin) return json({ error: 'origin' }, 403);
  const b = await req.json().catch(() => ({}) as any);

  if (b.action === 'claim') {
    const r = await claimRoom(office, me, String(b.building || ''), String(b.room || ''), Number(b.start));
    if (r.error) return json({ error: r.error }, r.status || 400);
    return json({ ok: true, claims: r.claims!.map((c) => showClaim(c, me)) });
  }

  if (b.action === 'release') {
    const r = await releaseClaim(office, me, String(b.id || ''));
    if (r.error) return json({ error: r.error }, 400);
    return json({ ok: true, claims: r.claims!.map((c) => showClaim(c, me)) });
  }

  return json({ error: 'Unknown action.' }, 400);
};

export const config = { path: '/api/rooms' };
