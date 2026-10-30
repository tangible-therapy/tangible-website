// /api/new-hire-email — "Create their email" (step 3) on /reception-onboarding.
//   GET → { supervisors: [{ email, name }] } (everyone with the Clinical supervisor role, for the New hire box)
//   POST { first, last, personal, office, role, roles?, supervisor?, email? } → { email, created, emailedTo, groups, groupsFailed, groupsSetUp }
//   Creates the new hire's Google Workspace account and adds them to their groups through the "New hire
//   accounts" Apps Script web app (docs/new-hire-email/). The temporary password is emailed by Google straight
//   to their personal address; it never comes back here. Front desk, directors and the owner only.
//   It also adds them to the Employee Portal staff list (approved, orientation not complete, so they get the
//   new-hire checklist) with their roles, office and supervisor. Someone already on the list as current staff
//   (orientation complete) is never changed here.
// Protection: behind the staff gate (netlify/edge-functions/staff-gate.ts) and the reception role rule in
// src/data/staff-access.ts, like /api/new-hire-folder.
// Netlify env var NEW_HIRE_EMAIL_SCRIPT = the web app URL + ?key=<ACCOUNT_KEY>. Never put it in the repo.
import { currentPerson, getPerson, savePerson, listPeople } from '../lib/staff-session.ts';
import { canOpen, isOwner, type Role, type StaffRecord } from '../../src/data/staff-access.ts';

// Roles front desk can give from Reception Onboarding. Director access is only given in Staff Admin.
const PORTAL_ROLES: Role[] = ['therapist', 'associate', 'supervisor', 'frontdesk', 'billing'];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' } });

const clean = (s: unknown) =>
  String(s ?? '').normalize('NFC').replace(/[^\p{L}\p{M}\s'’.-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 60);
const cap = (s: string) => s.replace(/(^|[\s-])(\p{Ll})/gu, (_m, a, c) => a + c.toUpperCase());
const mail = (s: unknown) => String(s ?? '').trim().toLowerCase().slice(0, 120);
const OFFICES = ['orem', 'provo', 'sandy'];
const ROLES = ['therapist', 'associate', 'frontdesk', 'other']; // Google Groups roles (billing → other)

export default async (req: Request) => {
  if (req.method === 'GET') {
    const supervisors = (await listPeople())
      .filter((p) => p.status === 'approved' && p.roles.includes('supervisor'))
      .map((p) => ({ email: p.email, name: p.name || p.email }));
    return json({ supervisors });
  }
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  const url = new URL(req.url);
  if (req.headers.get('origin') !== url.origin) return json({ error: 'origin' }, 403);

  if (Netlify.env.get('STAFF_AUTH') === 'google') {
    const me = await currentPerson(req);
    if (!me || !canOpen('/reception-onboarding', me)) return json({ error: 'Only front desk and directors can do this.' }, 403);
  }

  const target = Netlify.env.get('NEW_HIRE_EMAIL_SCRIPT');
  if (!target) return json({ error: 'The Google account connection isn’t set up yet, so create the email by hand (steps below).' }, 503);

  const b = await req.json().catch(() => ({}) as any);
  const first = cap(clean(b.first)), last = cap(clean(b.last));
  const personal = mail(b.personal), email = mail(b.email);
  if (!first || !last) return json({ error: 'Please enter their first and last name.' }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(personal)) return json({ error: 'Please enter their personal email. Google sends their sign-in details there.' }, 400);
  const office = OFFICES.includes(b.office) ? b.office : 'orem';
  const role = b.role === 'billing' ? 'billing' : ROLES.includes(b.role) ? b.role : 'other';
  const groupRole = role === 'billing' ? 'other' : role;

  try {
    const r = await fetch(target, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ first, last, personal, office, role: groupRole, email }),
      redirect: 'follow',
    });
    const out = await r.json().catch(() => null);
    if (!out) return json({ error: 'Google didn’t send a readable answer.' }, 502);
    if (out.error) return json({ error: out.error === 'unauthorized' ? 'The Google account connection key doesn’t match.' : String(out.error) }, 502);
    if (!out.email) return json({ error: 'Google didn’t return the new email address.' }, 502);
    const list = (x: unknown) => (Array.isArray(x) ? x.map(String).slice(0, 30) : []);

    // Employee Portal access.
    const address = String(out.email).toLowerCase();
    let portal = '', portalRoles: Role[] = [];
    try {
      const roles = (Array.isArray(b.roles) ? b.roles : [role]).filter((r: string) => PORTAL_ROLES.includes(r as Role)) as Role[];
      const supervisor = typeof b.supervisor === 'string' && /^[^\s@]+@tangiblementalhealth\.com$/i.test(b.supervisor.trim()) ? b.supervisor.trim().toLowerCase() : undefined;
      const existing = await getPerson(address);
      if (existing && (existing.orientationComplete || isOwner(address))) portal = 'kept';
      else {
        const rec: StaffRecord = {
          ...(existing || {}),
          email: address,
          name: `${first} ${last}`,
          roles: [...new Set([...(existing?.roles || []).filter((r) => r === 'director'), ...roles])],
          office: office as StaffRecord['office'],
          status: 'approved',
          orientationComplete: false,
          supervisor: supervisor || existing?.supervisor,
          addedBy: existing?.addedBy || (await currentPerson(req))?.email || 'reception-onboarding',
        };
        await savePerson(rec);
        portal = existing ? 'updated' : 'added';
        portalRoles = rec.roles;
      }
    } catch (e) {
      console.error('[new-hire-email] portal access not saved:', String(e).slice(0, 120));
    }

    return json({
      portal,
      portalRoles,
      email: String(out.email),
      created: !!out.created,
      emailedTo: String(out.emailedTo || ''),
      groups: list(out.groups),
      groupsFailed: list(out.groupsFailed),
      groupsSetUp: !!out.groupsSetUp,
    });
  } catch {
    return json({ error: 'Couldn’t reach Google.' }, 502);
  }
};

export const config = { path: '/api/new-hire-email' };
