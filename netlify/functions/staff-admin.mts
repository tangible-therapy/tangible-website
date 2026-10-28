// /api/staff-admin — the staff list behind /staff-admin. Only owners and directors can use it.
//   GET                      → everyone on the list
//   POST { people: [...] }   → add or update people (email, name, roles, office, status, orientationComplete)
//   DELETE ?email=...        → remove someone (they lose access within a minute)
import { currentPerson, listPeople, getPerson, savePerson, deletePerson } from '../lib/staff-session.ts';
import { canManage, isOwner, isWorkEmail, ROLES, OFFICES, type StaffRecord, type Role, type Office } from '../../src/data/staff-access.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

const roleIds = new Set(ROLES.map((r) => r.id));
const officeIds = new Set(OFFICES.map((o) => o.id));

export default async (req: Request) => {
  const me = await currentPerson(req);
  if (!canManage(me)) return json({ error: 'Only directors can manage staff accounts.' }, 403);
  if (req.method !== 'GET' && req.headers.get('origin') !== new URL(req.url).origin) return json({ error: 'origin' }, 403);

  if (req.method === 'GET') {
    return json({ me: me!.email, people: await listPeople() });
  }

  if (req.method === 'POST') {
    const body = await req.json().catch(() => null);
    const list: any[] = Array.isArray(body?.people) ? body.people : [];
    if (!list.length || list.length > 300) return json({ error: 'Nothing to save.' }, 400);
    const problems: string[] = [];
    const saved: string[] = [];
    for (const raw of list) {
      const email = String(raw.email || '').trim().toLowerCase();
      if (!isWorkEmail(email)) { problems.push(`${email || '(blank)'}: must be an @tangiblementalhealth.com address`); continue; }
      if (isOwner(email) && !isOwner(me!.email)) { problems.push(`${email}: only the owner can change this account`); continue; }
      const existing = await getPerson(email);
      const roles = (Array.isArray(raw.roles) ? raw.roles : []).filter((r: string) => roleIds.has(r as Role)) as Role[];
      const office = (officeIds.has(raw.office) ? raw.office : existing?.office || 'orem') as Office;
      const rec: StaffRecord = {
        ...(existing || {}),
        email,
        name: String(raw.name ?? existing?.name ?? '').trim().slice(0, 120),
        roles,
        office,
        status: raw.status === 'pending' ? 'pending' : 'approved',
        orientationComplete: raw.orientationComplete === undefined ? existing?.orientationComplete : !!raw.orientationComplete,
        addedBy: existing?.addedBy || me!.email,
      };
      if (email === me!.email && (rec.status !== 'approved' || (!isOwner(email) && !roles.includes('director')))) {
        problems.push(`${email}: you can't remove your own director access`);
        continue;
      }
      await savePerson(rec);
      saved.push(email);
    }
    return json({ saved, problems, people: await listPeople() });
  }

  if (req.method === 'DELETE') {
    const email = (new URL(req.url).searchParams.get('email') || '').toLowerCase();
    if (!email) return json({ error: 'Missing email.' }, 400);
    if (isOwner(email)) return json({ error: "The owner account can't be removed." }, 400);
    if (email === me!.email) return json({ error: "You can't remove yourself." }, 400);
    await deletePerson(email);
    return json({ removed: email, people: await listPeople() });
  }

  return json({ error: 'method' }, 405);
};

export const config = { path: '/api/staff-admin' };
