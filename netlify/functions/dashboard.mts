// /api/dashboard — the signed-in person's office dashboard.
//   GET  ?office=orem          → training meetings + room schedules (other offices: directors/owners only)
//   POST { topic }             → adds a training-topic suggestion to the office sheet, signed with their name
import { currentPerson } from '../lib/staff-session.ts';
import { getDashboard, hasDashboard, sendSuggestion } from '../lib/dashboard.ts';
import { canManage, OFFICES, type Office } from '../../src/data/staff-access.ts';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' } });

export default async (req: Request) => {
  const me = await currentPerson(req);
  if (!me || me.status !== 'approved') return json({ error: 'Please sign in.' }, 401);
  const asked = (new URL(req.url).searchParams.get('office') || me.office) as Office;
  if (!OFFICES.some((o) => o.id === asked)) return json({ error: 'Unknown office.' }, 400);
  if (asked !== me.office && !canManage(me)) return json({ error: 'Not your office.' }, 403);
  if (!hasDashboard(asked)) return json({ office: asked, available: false });

  if (req.method === 'GET') {
    const d = await getDashboard(asked);
    if (!d) return json({ office: asked, available: true, error: 'The dashboard sheet could not be read right now.' }, 503);
    return json({ office: asked, available: true, fetchedAt: d.fetchedAt, stale: !!d.stale, training: d.data.training, schedules: d.data.schedules, timeZone: d.data.timeZone });
  }
  if (req.method === 'POST') {
    if (req.headers.get('origin') !== new URL(req.url).origin) return json({ error: 'origin' }, 403);
    const body = await req.json().catch(() => ({}) as any);
    const topic = String(body.topic || '').trim();
    if (topic.length < 3) return json({ error: 'Please type a topic.' }, 400);
    try {
      await sendSuggestion(asked, topic.slice(0, 500), me.name ? `${me.name} (${me.email})` : me.email);
      return json({ ok: true });
    } catch (e) {
      console.error(e);
      return json({ error: 'Your suggestion could not be saved right now. Please try again later.' }, 502);
    }
  }
  return json({ error: 'method' }, 405);
};

export const config = { path: '/api/dashboard' };
