// GET /api/me — who is signed in (used to tidy menus and personalise the portal). No sign-in → 401.
import { currentPerson } from '../lib/staff-session.ts';
import { isOwner, canManage, OFFICES } from '../../src/data/staff-access.ts';

export default async (req: Request) => {
  const p = await currentPerson(req);
  if (!p || p.status !== 'approved') return new Response(JSON.stringify({ error: 'signed out' }), { status: 401, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
  const office = OFFICES.find((o) => o.id === p.office);
  const body = { email: p.email, name: p.name, firstName: (p.name || p.email).split(/[\s@.]/)[0], roles: p.roles, office: p.office, officeLabel: office?.label || p.office, owner: isOwner(p.email), manage: canManage(p), orientationComplete: !!p.orientationComplete };
  return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' } });
};

export const config = { path: '/api/me' };
