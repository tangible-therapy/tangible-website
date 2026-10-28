// POST /.netlify/functions/staff-session  (Authorization: Bearer <Identity token>)
// Called by /staff-login after "Sign in with Google". Netlify checks the Identity token before this runs
// and hands us the verified user (context.clientContext.user), so we never have to call Identity ourselves.
// Only @tangiblementalhealth.com Google accounts are accepted; unknown work accounts are added as "pending".
// This is a classic (v1) function on purpose: v1 is what receives the verified Identity user.
import { connectLambda } from '@netlify/blobs';
import { createSession, getPerson, savePerson, sessionCookieHeader } from '../lib/staff-session.ts';
import { isWorkEmail } from '../../src/data/staff-access.ts';

const reply = (statusCode: number, body: unknown, cookie?: string) => ({
  statusCode,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...(cookie ? { 'set-cookie': cookie } : {}) },
  body: JSON.stringify(body),
});

export const handler = async (event: any, context: any) => {
  try {
    if (event.httpMethod !== 'POST') return reply(405, { error: 'method' });
    const host = event.headers?.host;
    const origin = event.headers?.origin || '';
    if (!host || origin !== `https://${host}`) return reply(403, { error: 'origin' });

    const user = context?.clientContext?.user;
    if (!user) return reply(401, { error: 'invalid' });
    const email = String(user.email || '').toLowerCase();
    if (!isWorkEmail(email)) return reply(403, { error: 'domain' });
    const provider = user.app_metadata?.provider;
    if (provider && provider !== 'google') return reply(403, { error: 'provider' });

    connectLambda(event);
    const name = String(user.user_metadata?.full_name || user.user_metadata?.name || '');
    const p = (await getPerson(email)) || { email, name, roles: [], office: 'orem' as const, status: 'pending' as const };
    await savePerson({ ...p, name: p.name || name, lastSignIn: new Date().toISOString() });

    const s = await createSession(email);
    return reply(200, { ok: true, status: p.status }, sessionCookieHeader(s.value, s.maxAge));
  } catch (e) {
    console.error('staff-session failed', e);
    return reply(500, { error: 'server' });
  }
};
