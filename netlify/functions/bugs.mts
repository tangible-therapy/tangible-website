// /api/bugs — "Report an issue" (the ladybug button on every staff page, src/components/BugReport.astro) and the
// directors' Bug jar (/employeeportal/bugs).
//   POST { what, wrong, severity, page, device }  → any staff (the staff gate covers /api/bugs) files a report
//   GET                                           → directors + owner: every report, newest first
//   PATCH { id, status }                          → directors + owner: new | squashing | squashed
//   DELETE ?id=                                   → directors + owner: removes a report
// Reports live in Netlify Blobs store "bug-reports" (key bug/<id>, one document each), never in the repo.
// No email is sent; directors check the Bug jar. Reporters are asked not to include client information.
import { getStore } from '@netlify/blobs';
import { currentPerson } from '../lib/staff-session.ts';
import { canManage } from '../../src/data/staff-access.ts';

export type Severity = 'tiny' | 'medium' | 'big';
export type BugStatus = 'new' | 'squashing' | 'squashed';
type Bug = {
  id: string; at: string; what: string; wrong: string; severity: Severity; page: string; device: string;
  reporter: { name: string; email: string } | null; status: BugStatus; updatedAt?: string; updatedBy?: string;
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' } });
const store = () => getStore({ name: 'bug-reports', consistency: 'strong' });
const text = (v: unknown, max: number) => String(v ?? '').replace(/\u0000/g, '').trim().slice(0, max);
const SEVERITIES: Severity[] = ['tiny', 'medium', 'big'];
const STATUSES: BugStatus[] = ['new', 'squashing', 'squashed'];

export default async (req: Request) => {
  const url = new URL(req.url);
  const me = await currentPerson(req).catch(() => null);

  if (req.method === 'POST') {
    if (req.headers.get('origin') !== url.origin) return json({ error: 'origin' }, 403);
    const b = await req.json().catch(() => ({}) as any);
    const wrong = text(b.wrong, 2000);
    if (wrong.length < 3) return json({ error: 'Tell us what went wrong.' }, 400);
    let page = text(b.page, 300);
    if (!page.startsWith('/')) page = '';
    const bug: Bug = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      at: new Date().toISOString(),
      what: text(b.what, 200),
      wrong,
      severity: SEVERITIES.includes(b.severity) ? b.severity : 'medium',
      page,
      device: text(b.device, 300),
      reporter: me && me.status === 'approved' ? { name: me.name || me.email, email: me.email } : null,
      status: 'new',
    };
    await store().setJSON(`bug/${bug.id}`, bug);
    return json({ ok: true });
  }

  if (!canManage(me)) return json({ error: 'Only directors can see the bug jar.' }, 403);

  if (req.method === 'GET') {
    const s = store();
    const { blobs } = await s.list({ prefix: 'bug/' });
    const bugs = ((await Promise.all(blobs.map((x) => s.get(x.key, { type: 'json' })))) as (Bug | null)[]).filter(Boolean) as Bug[];
    bugs.sort((a, b) => b.at.localeCompare(a.at));
    return json({ bugs });
  }

  if (req.method !== 'PATCH' && req.method !== 'DELETE') return json({ error: 'method' }, 405);
  if (req.headers.get('origin') !== url.origin) return json({ error: 'origin' }, 403);
  const id = req.method === 'DELETE' ? url.searchParams.get('id') || '' : String(((await req.clone().json().catch(() => ({}))) as any).id || '');
  if (!/^[a-z0-9]{6,20}$/.test(id)) return json({ error: 'Unknown report.' }, 400);
  const key = `bug/${id}`;
  const bug = (await store().get(key, { type: 'json' })) as Bug | null;
  if (!bug) return json({ error: 'That report is gone already.' }, 404);
  if (req.method === 'DELETE') { await store().delete(key); return json({ ok: true }); }

  const b = await req.json().catch(() => ({}) as any);
  if (!STATUSES.includes(b.status)) return json({ error: 'Unknown status.' }, 400);
  const updated: Bug = { ...bug, status: b.status, updatedAt: new Date().toISOString(), updatedBy: me!.name || me!.email };
  await store().setJSON(key, updated);
  return json({ ok: true, bug: updated });
};

export const config = {
  path: '/api/bugs',
  // Plenty for real use; stops a stuck button or script from flooding the jar.
  rateLimit: { action: 'rate_limit', aggregateBy: ['ip', 'domain'], windowSize: 60, windowLimit: 20 },
};
