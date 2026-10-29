// /api/new-hire-email — "Create their email" (step 3) on /reception-onboarding.
//   POST { first, last, personal, office, role, email? } → { email, created, emailedTo, groups, groupsFailed, groupsSetUp }
//   Creates the new hire's Google Workspace account and adds them to their groups through the "New hire
//   accounts" Apps Script web app (docs/new-hire-email/). The temporary password is emailed by Google straight
//   to their personal address; it never comes back here. Front desk, directors and the owner only.
// Protection: behind the staff gate (netlify/edge-functions/staff-gate.ts) and the reception role rule in
// src/data/staff-access.ts, like /api/new-hire-folder.
// Netlify env var NEW_HIRE_EMAIL_SCRIPT = the web app URL + ?key=<ACCOUNT_KEY>. Never put it in the repo.
import { currentPerson } from '../lib/staff-session.ts';
import { canOpen } from '../../src/data/staff-access.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' } });

const clean = (s: unknown) =>
  String(s ?? '').normalize('NFC').replace(/[^\p{L}\p{M}\s'’.-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 60);
const cap = (s: string) => s.replace(/(^|[\s-])(\p{Ll})/gu, (_m, a, c) => a + c.toUpperCase());
const mail = (s: unknown) => String(s ?? '').trim().toLowerCase().slice(0, 120);
const OFFICES = ['orem', 'provo', 'sandy'];
const ROLES = ['therapist', 'associate', 'frontdesk', 'other'];

export default async (req: Request) => {
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
  const role = ROLES.includes(b.role) ? b.role : 'other';

  try {
    const r = await fetch(target, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ first, last, personal, office, role, email }),
      redirect: 'follow',
    });
    const out = await r.json().catch(() => null);
    if (!out) return json({ error: 'Google didn’t send a readable answer.' }, 502);
    if (out.error) return json({ error: out.error === 'unauthorized' ? 'The Google account connection key doesn’t match.' : String(out.error) }, 502);
    if (!out.email) return json({ error: 'Google didn’t return the new email address.' }, 502);
    const list = (x: unknown) => (Array.isArray(x) ? x.map(String).slice(0, 30) : []);
    return json({
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
