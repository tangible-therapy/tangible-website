// POST /api/staff-session  (Authorization: Bearer <Identity token>)
// Called by /staff-login after "Sign in with Google". Netlify verifies the Identity token before this runs
// and exposes the result as globalThis.netlifyIdentityContext (same mechanism @netlify/identity uses).
// Only @tangiblementalhealth.com Google accounts are accepted; unknown work accounts are added as "pending".
import { createSession, getPerson, savePerson, sessionCookieHeader } from '../lib/staff-session.ts';
import { isWorkEmail } from '../../src/data/staff-access.ts';

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers } });

async function verifiedUser(req: Request): Promise<any | null> {
  const ctx = (globalThis as any).netlifyIdentityContext;
  const token = ctx?.token || (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  // Prefer the full user record from Identity (internal URL from Netlify), fall back to the verified token claims.
  if (ctx?.url && token) {
    try {
      const r = await fetch(`${ctx.url}/user`, { headers: { authorization: `Bearer ${token}` } });
      if (r.ok && (r.headers.get('content-type') || '').includes('json')) return await r.json();
    } catch {}
  }
  return ctx?.user || null;
}

export default async (req: Request) => {
  try {
    if (req.method !== 'POST') return json({ error: 'method' }, 405);
    if (req.headers.get('origin') !== new URL(req.url).origin) return json({ error: 'origin' }, 403);

    const user = await verifiedUser(req);
    if (!user) return json({ error: 'invalid' }, 401);
    const email = String(user.email || '').toLowerCase();
    if (!isWorkEmail(email)) return json({ error: 'domain' }, 403);
    const provider = user.app_metadata?.provider;
    if (provider && provider !== 'google') return json({ error: 'provider' }, 403);

    const name = String(user.user_metadata?.full_name || user.user_metadata?.name || '');
    const p = (await getPerson(email)) || { email, name, roles: [], office: 'orem' as const, status: 'pending' as const };
    await savePerson({ ...p, name: p.name || name, lastSignIn: new Date().toISOString() });

    const s = await createSession(email);
    return json({ ok: true, status: p.status }, 200, { 'set-cookie': sessionCookieHeader(s.value, s.maxAge) });
  } catch (e: any) {
    console.error('staff-session failed', e);
    return json({ error: 'server: ' + String(e?.message || e).slice(0, 120) }, 500);
  }
};

export const config = { path: '/api/staff-session' };
