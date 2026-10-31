// Submit Hours (/employeeportal/submit-hours) → the "Payroll hours" Apps Script (docs/payroll-hours/), which writes
// to the "Tangible Data" sheet and the payroll company's sheet. Netlify env var PAYROLL_HOURS_SCRIPT = web app URL
// + ?key=... (never in the repo). Without it the page shows the old Google Form instead.
// If Google can't be reached, the submission waits in Netlify Blobs store "payroll-outbox" (key = work email,
// only the latest one per person) and is re-sent on the person's next visit and every 15 minutes
// (netlify/functions/payroll-retry.mts).
import { getStore } from '@netlify/blobs';
import { listHires } from './hires.ts';
import type { StaffRecord } from '../../src/data/staff-access.ts';

export type Period = { tab: string; start: string; end: string };
export type PayrollAnswers = { hours: number; pto: number | ''; meetings: number | ''; noShows: number | '' };
export type ScriptSubmit = PayrollAnswers & {
  action: 'submit';
  email: string;
  names: string[];
  periodTab: string;
  newHire: { first: string; last: string } | null;
  // false = admin-only or billing-only staff: left out of the company's billable hours (Tangible Health).
  billableStaff?: boolean;
};
export type Outboxed = { body: ScriptSubmit; savedAt: string; tries: number; lastError: string };

// A new hire counts as "recent" for this long after their Start a new hire profile / start date.
export const NEW_HIRE_DAYS = 120;

export const payrollConfigured = () => !!Netlify.env.get('PAYROLL_HOURS_SCRIPT');

/** Calls the Payroll hours script. Throws an Error with a readable message. */
export async function callPayroll(body: Record<string, unknown>): Promise<any> {
  const target = Netlify.env.get('PAYROLL_HOURS_SCRIPT');
  if (!target) throw new Error('The payroll sheet connection isn’t set up yet.');
  let r: Response;
  try {
    // Apps Script answers a POST with a redirect to the result; fetch follows it (as a GET).
    r = await fetch(target, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), redirect: 'follow', signal: AbortSignal.timeout(25000) });
  } catch {
    throw new Error('Couldn’t reach the payroll sheet.');
  }
  const out = await r.json().catch(() => null);
  if (!out) throw new Error('Google didn’t send a readable answer.');
  if (out.error) throw new Error(out.error === 'unauthorized' ? 'The payroll sheet connection key doesn’t match.' : String(out.error));
  return out;
}

/** "10.24.26 to 11.6.26" → Period, or null (same format the script reads from the payroll sheet's tab names). */
export function parsePeriodTab(tab: unknown): Period | null {
  const m = /^\s*(\d{1,2})\.(\d{1,2})\.(\d{2,4})\s*(?:to|-|–)\s*(\d{1,2})\.(\d{1,2})\.(\d{2,4})\s*$/i.exec(String(tab ?? ''));
  if (!m) return null;
  const y = (v: string) => (Number(v) < 100 ? 2000 + Number(v) : Number(v));
  const iso = (yy: string, mm: string, dd: string) => `${y(yy)}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  return { tab: String(tab).trim(), start: iso(m[3], m[1], m[2]), end: iso(m[6], m[4], m[5]) };
}

const key2 = (s: string) => {
  const w = s.toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/[^\p{L}\s'-]/gu, ' ').trim().split(/\s+/).filter(Boolean);
  return w.length > 1 ? `${w[0]} ${w[w.length - 1]}` : w[0] || '';
};

/** Their legal name from "Start a new hire" (Reception Onboarding) if that was in the last NEW_HIRE_DAYS days.
 *  This is the check that lets the script add someone who isn't on the payroll sheets yet. */
export async function recentHire(me: StaffRecord): Promise<{ first: string; last: string } | null> {
  const cutoff = Date.now() - NEW_HIRE_DAYS * 864e5;
  const mine = key2(me.name || '');
  for (const h of await listHires().catch(() => [])) {
    const when = Math.max(Date.parse(h.createdAt || '') || 0, Date.parse((h.start || '') + 'T12:00:00Z') || 0);
    if (when < cutoff) continue;
    const sameEmail = !!h.email && h.email.toLowerCase() === me.email.toLowerCase();
    const sameName = !!mine && key2(`${h.first} ${h.last}`) === mine;
    if (sameEmail || sameName) return { first: h.first.trim(), last: h.last.trim() };
  }
  return null;
}

// ---------- outbox (retry when Google can't be reached) ----------
const outbox = () => getStore({ name: 'payroll-outbox', consistency: 'strong' });

export async function queue(body: ScriptSubmit, error: string) {
  const prev = (await outbox().get(body.email, { type: 'json' })) as Outboxed | null;
  await outbox().setJSON(body.email, { body, savedAt: new Date().toISOString(), tries: (prev?.body.periodTab === body.periodTab ? prev.tries : 0) + 1, lastError: error.slice(0, 200) } satisfies Outboxed);
}
export async function queued(email: string): Promise<Outboxed | null> {
  return (await outbox().get(email.toLowerCase(), { type: 'json' })) as Outboxed | null;
}
export async function unqueue(email: string) {
  await outbox().delete(email.toLowerCase());
}
export async function allQueued(): Promise<Outboxed[]> {
  const s = outbox();
  const { blobs } = await s.list();
  return ((await Promise.all(blobs.map((b) => s.get(b.key, { type: 'json' })))) as (Outboxed | null)[]).filter(Boolean) as Outboxed[];
}

/** Sends one waiting submission again. Returns the script's answer, or null if it still failed. */
export async function retry(item: Outboxed): Promise<any | null> {
  try {
    const out = await callPayroll(item.body);
    await unqueue(item.body.email);
    return out;
  } catch (e) {
    await queue(item.body, (e as Error).message);
    return null;
  }
}
