// /api/new-hire-folder — "Start a new hire" on /reception-onboarding.
//   POST { first, last } → { url, name, created } — creates (or finds) "First Last" inside the shared
//   Employee folder on Google Drive, through the "New hire folders" Apps Script web app
//   (docs/new-hire-folder/). Front desk, directors and the owner only.
// Protection: this path is behind the staff gate (netlify/edge-functions/staff-gate.ts) like the
// reception pages, so it needs the staff password or, with Google sign-in, a frontdesk/director role.
// Netlify env var NEW_HIRE_FOLDER_SCRIPT = the web app URL + ?key=<FOLDER_KEY>. Never put it in the repo.
import { currentPerson } from '../lib/staff-session.ts';
import { canOpen } from '../../src/data/staff-access.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' } });

// Keep folder names tidy and safe: letters (any language), spaces, hyphens, apostrophes and periods.
const clean = (s: unknown) =>
  String(s ?? '').normalize('NFC').replace(/[^\p{L}\p{M}\s'’.-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 60);

export default async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  const url = new URL(req.url);
  if (req.headers.get('origin') !== url.origin) return json({ error: 'origin' }, 403);

  // With Google sign-in, double-check the role here too (the gate already does).
  if (Netlify.env.get('STAFF_AUTH') === 'google') {
    const me = await currentPerson(req);
    if (!me || !canOpen('/reception-onboarding', me)) return json({ error: 'Only front desk and directors can do this.' }, 403);
  }

  const target = Netlify.env.get('NEW_HIRE_FOLDER_SCRIPT');
  if (!target) return json({ error: 'The Drive folder connection isn’t set up yet (see docs/new-hire-folder).' }, 503);

  const b = await req.json().catch(() => ({}) as any);
  // Capitalise each word so "jamie rivera" and "Jamie Rivera" end up in the same folder.
  const cap = (s: string) => s.replace(/(^|[\s-])(\p{Ll})/gu, (_m, a, c) => a + c.toUpperCase());
  const first = cap(clean(b.first)), last = cap(clean(b.last));
  if (!first || !last) return json({ error: 'Please enter their first and last name.' }, 400);
  const name = `${first} ${last}`;

  try {
    // Apps Script answers a POST with a redirect to the result; fetch follows it.
    const r = await fetch(target, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }), redirect: 'follow' });
    const out = await r.json().catch(() => null);
    if (!out) return json({ error: 'Google didn’t send a readable answer.' }, 502);
    if (out.error) return json({ error: out.error === 'unauthorized' ? 'The Drive folder connection key doesn’t match.' : String(out.error) }, 502);
    if (!out.url) return json({ error: 'Google didn’t return the folder link.' }, 502);
    return json({ url: String(out.url), name: String(out.name || name), created: !!out.created });
  } catch {
    return json({ error: 'Couldn’t reach Google Drive.' }, 502);
  }
};

export const config = { path: '/api/new-hire-folder' };
