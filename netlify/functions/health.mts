// /api/health — data for the owner-only Tangible Health dashboard (/employeeportal/health).
//   GET → { payroll: [{ date: 'YYYY-MM-DD', paid, billable, noShows }], at }
// payroll = the Date / Total Hours Paid / Billable Hours / No Shows table on Tangible Data's "Payroll" tab (columns
// I–L), read through the "Payroll hours" Apps Script (action "health", docs/payroll-hours/). The script adds a row
// there by itself 5 days after each pay period ends. Kept for 10 minutes in Netlify Blobs so the page loads fast.
import { getStore } from '@netlify/blobs';
import { currentPerson } from '../lib/staff-session.ts';
import { isOwner } from '../../src/data/staff-access.ts';
import { callPayroll, payrollConfigured } from '../lib/payroll-hours.ts';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' } });
const FRESH_MS = 10 * 60 * 1000;

export default async (req: Request) => {
  const me = await currentPerson(req);
  if (!me || me.status !== 'approved' || !isOwner(me.email)) return json({ error: 'Only the owner can see this.' }, 403);
  if (!payrollConfigured()) return json({ error: 'The payroll sheet connection isn’t set up (PAYROLL_HOURS_SCRIPT).' }, 503);
  const store = getStore({ name: 'health', consistency: 'strong' });
  const refresh = new URL(req.url).searchParams.get('refresh') === '1';
  const cached = (await store.get('payroll', { type: 'json' }).catch(() => null)) as { payroll: unknown[]; at: string } | null;
  if (cached && !refresh && Date.now() - Date.parse(cached.at) < FRESH_MS) return json(cached);
  try {
    const out = await callPayroll({ action: 'health' });
    const body = { payroll: out.rows || [], at: new Date().toISOString() };
    await store.setJSON('payroll', body);
    return json(body);
  } catch (e) {
    if (cached) return json({ ...cached, stale: true, error: (e as Error).message });
    return json({ error: (e as Error).message }, 502);
  }
};

export const config = { path: '/api/health' };
