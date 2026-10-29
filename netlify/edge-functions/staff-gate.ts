// Gate for internal staff pages. Two modes, chosen by the Netlify environment variable STAFF_AUTH:
//  - STAFF_AUTH=google  → staff sign in with their Google work account (see /staff-login) and each page
//                         checks their role from the staff list (src/data/staff-access.ts, managed at /staff-admin).
//  - anything else      → the old shared password (Netlify env var STAFF_PASSWORD). Changing it signs everyone out.
import type { Config, Context } from '@netlify/edge-functions';
import { readSession, getPerson, getCookie, SESSION_COOKIE, clearSessionCookieHeader } from '../lib/staff-session.ts';
import { canOpen, type StaffRecord } from '../../src/data/staff-access.ts';

const COOKIE = 'tt_staff';
const MAX_AGE = 60 * 60 * 24 * 30; // stay signed in for 30 days

async function token(password: string) {
  const data = new TextEncoder().encode(`tangible-staff:${password}`);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function page(error = '') {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Staff Login | Tangible Therapy</title>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;500&display=swap" rel="stylesheet">
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#acb9ac;font-family:Poppins,sans-serif;font-weight:300;color:#3b3f3c}
form{background:#fff;padding:2.5rem;border-radius:20px;width:min(90vw,360px);text-align:center}
h1{font-weight:500;font-size:1.5rem;margin:0 0 .5rem}p{margin:0 0 1.5rem;font-size:.9rem}
input{width:100%;box-sizing:border-box;padding:.8rem 1rem;border:1px solid #a9b1aa;border-radius:10px;font:inherit;margin-bottom:1rem}
button{width:100%;padding:.9rem;border:0;border-radius:300px;background:#3b3f3c;color:#fff;font:inherit;font-weight:500;cursor:pointer}
.err{color:#b00020;font-size:.85rem;margin:-.5rem 0 1rem}</style></head>
<body><form method="POST"><h1>Staff Only</h1><p>Enter the staff password to continue.</p>
${error ? `<div class="err">${error}</div>` : ''}
<input type="password" name="password" autocomplete="current-password" aria-label="Password" required autofocus>
<button type="submit">Continue</button></form></body></html>`,
    { status: 401, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow' } },
  );
}

// ---------- Google sign-in mode ----------
const cache = new Map<string, { r: StaffRecord | null; t: number }>();
async function person(email: string) {
  const hit = cache.get(email);
  if (hit && Date.now() - hit.t < 30_000) return hit.r;
  const r = await getPerson(email);
  cache.set(email, { r, t: Date.now() });
  return r;
}

const shell = (title: string, body: string, status: number) =>
  new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${title} | Tangible Therapy</title>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;500&display=swap" rel="stylesheet">
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#acb9ac;font-family:Poppins,sans-serif;font-weight:300;color:#3b3f3c}
main{background:#fff;padding:2.5rem;border-radius:20px;width:min(90vw,420px);text-align:center;box-sizing:border-box}
h1{font-weight:500;font-size:1.5rem;margin:0 0 .75rem}p{margin:0 0 1.25rem;font-size:.95rem;line-height:1.6}
a.btn{display:inline-block;padding:.85rem 1.6rem;border-radius:300px;background:#3b3f3c;color:#fff;text-decoration:none;font-weight:500}
a.sub{display:block;margin-top:1rem;color:#3b3f3c;font-size:.85rem}</style></head><body><main>${body}</main></body></html>`,
    { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow' } },
  );

async function googleGate(req: Request, context: Context) {
  const url = new URL(req.url);
  const path = url.pathname;
  const toLogin = (q: string) =>
    new Response(null, { status: 303, headers: { location: `/staff-login?${q}`, 'cache-control': 'no-store', 'set-cookie': clearSessionCookieHeader() } });

  if (path === '/staff-logout') return toLogin('out=1');

  const email = await readSession(getCookie(req, SESSION_COOKIE));
  if (!email) return toLogin('next=' + encodeURIComponent(path + url.search));

  const r = await person(email);
  if (!r) return toLogin('error=removed');
  if (r.status !== 'approved') {
    return shell('Waiting for approval',
      `<h1>Almost there</h1><p>You're signed in as <strong>${email}</strong>, but a director still needs to approve your account and set your role.</p><p>Please let your director know, then refresh this page.</p><a class="btn" href="${path}">Refresh</a><a class="sub" href="/staff-logout">Sign out</a>`, 403);
  }
  if (!canOpen(path, r)) {
    return shell('No access',
      `<h1>This page isn't part of your portal</h1><p>Your account doesn't include access to this page. If you think it should, ask your director to update your role.</p><a class="btn" href="/employeeportal">Go to my portal</a>`, 403);
  }
  const res = await context.next();
  res.headers.set('cache-control', 'private, no-store');
  res.headers.set('x-robots-tag', 'noindex, nofollow');
  return res;
}

// ---------- shared password mode (until launch) ----------
export default async (req: Request, context: Context) => {
  if (Netlify.env.get('STAFF_AUTH') === 'google') return googleGate(req, context);
  if (new URL(req.url).pathname === '/staff-admin') return page('Staff accounts are not switched on yet.');
  if (new URL(req.url).pathname === '/staff-logout') {
    context.cookies.delete({ name: COOKIE, path: '/' });
    return new Response(null, { status: 303, headers: { location: '/', 'cache-control': 'no-store' } });
  }
  const password = Netlify.env.get('STAFF_PASSWORD');
  if (!password) return page('Staff password has not been set up yet.');
  const expected = await token(password);

  if (context.cookies.get(COOKIE) === expected) {
    const res = await context.next();
    res.headers.set('cache-control', 'private, no-store');
    res.headers.set('x-robots-tag', 'noindex, nofollow');
    return res;
  }

  if (req.method === 'POST') {
    const form = await req.formData().catch(() => null);
    if (form && form.get('password') === password) {
      context.cookies.set({ name: COOKIE, value: expected, path: '/', httpOnly: true, secure: true, sameSite: 'Lax', maxAge: MAX_AGE });
      return new Response(null, { status: 303, headers: { location: new URL(req.url).pathname } });
    }
    return page('That password is not right. Please try again.');
  }
  return page();
};

export const config: Config = {
  path: ['/staff-logout', '/orientation', '/orientation/*', '/employeeportal', '/employeeportal/*', '/digital-products-2', '/onboarding', '/files/*', '/reception-portal', '/reception-onboarding', '/scheduling-new-client', '/scheduling-new-client-1', '/reception-onboarding-1', '/crisis-call', '/staff-admin', '/hours', '/api/new-hire-folder'],
};
