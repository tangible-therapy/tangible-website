// POST /api/staff-session  { token }  — called by /staff-login after "Sign in with Google".
// Checks the Google sign-in with Netlify Identity, only accepts @tangiblementalhealth.com accounts,
// adds unknown work accounts to the staff list as "pending", and sets the staff session cookie.
import { createSession, getPerson, savePerson, sessionCookieHeader } from '../lib/staff-session.ts';
import { isWorkEmail } from '../../src/data/staff-access.ts';

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers } });

export default async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  const origin = new URL(req.url).origin;
  if (req.headers.get('origin') !== origin) return json({ error: 'origin' }, 403);

  const { token } = await req.json().catch(() => ({}) as any);
  if (!token || typeof token !== 'string') return json({ error: 'missing' }, 400);

  // Ask Netlify Identity who this token belongs to (this is what proves the Google sign-in).
  const res = await fetch(`${origin}/.netlify/identity/user`, { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) return json({ error: 'invalid' }, 401);
  const user = await res.json();
  const email = String(user.email || '').toLowerCase();
  if (!isWorkEmail(email)) return json({ error: 'domain' }, 403);
  if (user.app_metadata?.provider && user.app_metadata.provider !== 'google') return json({ error: 'provider' }, 403);

  const name = String(user.user_metadata?.full_name || user.user_metadata?.name || '');
  let p = await getPerson(email);
  if (!p) {
    p = { email, name, roles: [], office: 'orem', status: 'pending' };
  }
  await savePerson({ ...p, name: p.name || name, lastSignIn: new Date().toISOString() });

  const s = await createSession(email);
  return json({ ok: true, status: p.status }, 200, { 'set-cookie': sessionCookieHeader(s.value, s.maxAge) });
};

export const config = { path: '/api/staff-session' };
