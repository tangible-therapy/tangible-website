// /api/new-hire-folder — "Start a new hire" on /reception-onboarding.
//   POST { first, last, payRate?, startDate? } → { id, url, name, created, payroll } — creates (or finds)
//   "First Last" inside the shared
//   Employee folder on Google Drive, through the "New hire folders" Apps Script web app
//   (docs/new-hire-folder/). Front desk, directors and the owner only.
//   Pay rate + start date (optional) are saved in the folder's description for the automatic payroll email
//   (docs/payroll-email/). They are never logged or stored by the website.
// Protection: this path is behind the staff gate (netlify/edge-functions/staff-gate.ts) like the
// reception pages, so it needs the staff password or, with Google sign-in, a frontdesk/director role.
// Netlify env var NEW_HIRE_FOLDER_SCRIPT = the web app URL + ?key=<FOLDER_KEY>. Never put it in the repo.
import { json, denied, hireName, callScript } from '../lib/new-hire.ts';

export default async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  const no = await denied(req);
  if (no) return no;
  if (!Netlify.env.get('NEW_HIRE_FOLDER_SCRIPT')) return json({ error: 'The Drive folder connection isn’t set up yet (see docs/new-hire-folder).' }, 503);

  const b = await req.json().catch(() => ({}) as any);
  const name = hireName(b.first, b.last);
  if (!name) return json({ error: 'Please enter their first and last name.' }, 400);
  // Pay rate: free text like "$32/hr" or "55,000/yr". Start date: yyyy-mm-dd from the date field.
  const payRate = String(b.payRate ?? '').replace(/[^\p{L}\p{N}\s$.,/%-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 40);
  const startDate = /^\d{4}-\d{2}-\d{2}$/.test(String(b.startDate ?? '')) ? String(b.startDate) : '';

  try {
    const out = await callScript({ action: 'folder', name, payRate, startDate });
    if (!out.url) return json({ error: 'Google didn’t return the folder link.' }, 502);
    return json({ id: out.id ? String(out.id) : null, url: String(out.url), name: String(out.name || name), created: !!out.created, payroll: out.payroll || null });
  } catch (e) {
    return json({ error: (e as Error).message }, 502);
  }
};

export const config = { path: '/api/new-hire-folder' };
