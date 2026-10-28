// POST /api/staff-session  { token }  — called by /staff-login after "Sign in with Google".
// Checks the Identity token with Netlify Identity, only accepts @tangiblementalhealth.com Google accounts,
// adds unknown work accounts to the staff list as "pending", and sets the staff session cookie.
// IMPORTANT (Oct 2026): send the token in the request body. Sending it as an Authorization header or the
// nf_jwt cookie made Netlify fail the request before the function ran ("Internal Error") on protected previews.
// The token is checked against Identity on the site's main address (env URL), because preview addresses
// are password-protected and answer server-side requests with a login page. Identity is shared by all deploys.
import { createSession, getPerson, savePerson, sessionCookieHeader } from '../lib/staff-session.ts';
import { isWorkEmail } from '../../src/data/staff-access.ts';

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers } });

async function verifiedUser(req: Request, token: string): Promise<any | null> {
  const bases = [...new Set([Netlify.env.get('URL'), new URL(req.url).origin].filter(Boolean) as string[])];
  for (const base of bases) {
    try {
      const r = await fetch(`${base}/.netlify/identity/user`, { headers: { authorization: `Bearer ${token}` } });
      if (r.status === 401 || r.status === 403) return null;
      if (r.ok && (r.headers.get('content-type') || '').includes('json')) return await r.json();
    } catch {}
  }
  throw new Error('could not reach Netlify Identity');
}

export default async (req: Request) => {
  try {
    if (req.method !== 'POST') return json({ error: 'method' }, 405);
    if (req.headers.get('origin') !== new URL(req.url).origin) return json({ error: 'origin' }, 403);

    const { token } = await req.json().catch(() => ({}) as any);
    if (!token || typeof token !== 'string' || token.length > 4000) return json({ error: 'missing' }, 400);
    const user = await verifiedUser(req, token);
    if (!user) return json({ error: 'invalid' }, 401);
    const email = String(user.email || '').toLowerCase();
    if (!isWorkEmail(email)) return json({ error: 'domain' }, 403);
    const provider = user.app_metadata?.provider;
    if (provider && provider !== 'google') return json({ error: 'provider' }, 403);

    const name = String(user.user_metadata?.full_name || user.user_metadata?.name || '');
    const p = (await getPerson(email)) || { email, name, roles: [], office: 'orem' as const, status: 'pending' as const };
    await savePerson({ ...p, name: p.name || name, lastSignIn: new Date().toISOString() });

    const s = await createSession(email);
    const res = json({ ok: true, status: p.status });
    res.headers.append('set-cookie', sessionCookieHeader(s.value, s.maxAge));
    return res;
  } catch (e: any) {
    console.error('staff-session failed', e);
    return json({ error: 'server: ' + String(e?.message || e).slice(0, 120) }, 500);
  }
};

export const config = { path: '/api/staff-session' };
