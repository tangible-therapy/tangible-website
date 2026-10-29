// Shared sign-in helpers for the staff gate (edge function) and staff API functions.
// Sessions are a signed cookie (tt_session) holding only the person's email and expiry.
// The signing key is generated automatically and kept in Netlify Blobs — it is never in the repo.
// Roles and offices are read fresh from the staff list, so removing someone takes effect within a minute.
import { getStore } from '@netlify/blobs';
import { isOwner, type StaffRecord } from '../../src/data/staff-access.ts';

export const SESSION_COOKIE = 'tt_session';
export const SESSION_DAYS = 7; // after this, staff sign in with Google again (which re-checks their work email)

const store = () => getStore({ name: 'staff-accounts', consistency: 'strong' });
const enc = new TextEncoder();

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

let keyPromise: Promise<CryptoKey> | null = null;
async function signingKey(): Promise<CryptoKey> {
  if (!keyPromise) {
    keyPromise = (async () => {
      const s = store();
      let raw = await s.get('config/session-key');
      if (!raw) {
        const bytes = crypto.getRandomValues(new Uint8Array(32));
        await s.set('config/session-key', b64url(bytes), { onlyIfNew: true } as any);
        raw = (await s.get('config/session-key')) as string;
      }
      return crypto.subtle.importKey('raw', fromB64url(raw), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
    })().catch((e) => {
      keyPromise = null;
      throw e;
    });
  }
  return keyPromise;
}

export async function createSession(email: string): Promise<{ value: string; maxAge: number }> {
  const maxAge = SESSION_DAYS * 24 * 60 * 60;
  const payload = b64url(enc.encode(JSON.stringify({ e: email.toLowerCase(), x: Date.now() + maxAge * 1000 })));
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await signingKey(), enc.encode(payload)));
  return { value: `${payload}.${b64url(sig)}`, maxAge };
}

/** Returns the signed-in email, or null if the cookie is missing, tampered with or expired. */
export async function readSession(cookie: string | undefined | null): Promise<string | null> {
  if (!cookie) return null;
  const [payload, sig] = cookie.split('.');
  if (!payload || !sig) return null;
  try {
    const ok = await crypto.subtle.verify('HMAC', await signingKey(), fromB64url(sig), enc.encode(payload));
    if (!ok) return null;
    const { e, x } = JSON.parse(new TextDecoder().decode(fromB64url(payload)));
    return typeof e === 'string' && typeof x === 'number' && x > Date.now() ? e : null;
  } catch {
    return null;
  }
}

const personKey = (email: string) => `people/${email.toLowerCase()}`;

export async function getPerson(email: string): Promise<StaffRecord | null> {
  const r = (await store().get(personKey(email), { type: 'json' })) as StaffRecord | null;
  if (r) return r;
  // Owners always have a record, even before anyone has set one up.
  if (isOwner(email)) return { email: email.toLowerCase(), name: '', roles: ['director'], office: 'orem', status: 'approved' };
  return null;
}

export async function savePerson(r: StaffRecord) {
  await store().setJSON(personKey(r.email), { ...r, email: r.email.toLowerCase(), updatedAt: new Date().toISOString() });
}

export async function deletePerson(email: string) {
  await store().delete(personKey(email));
}

export async function listPeople(): Promise<StaffRecord[]> {
  const s = store();
  const { blobs } = await s.list({ prefix: 'people/' });
  const people = await Promise.all(blobs.map((b) => s.get(b.key, { type: 'json' }) as Promise<StaffRecord | null>));
  return people.filter(Boolean).sort((a, b) => (a!.name || a!.email).localeCompare(b!.name || b!.email)) as StaffRecord[];
}

export function getCookie(req: Request, name: string): string | null {
  const m = (req.headers.get('cookie') || '').match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}

export const sessionCookieHeader = (value: string, maxAge: number) =>
  `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
export const clearSessionCookieHeader = () => `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

/** For API functions: the signed-in person's record, or null. */
export async function currentPerson(req: Request): Promise<StaffRecord | null> {
  const email = await readSession(getCookie(req, SESSION_COOKIE));
  return email ? getPerson(email) : null;
}
