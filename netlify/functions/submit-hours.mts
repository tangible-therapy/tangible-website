// /api/submit-hours — the Employee Portal's Submit Hours page (/employeeportal/submit-hours). Any approved staff
// member signed in with Google.
//   GET  → { setup, name, associate, period, previous, supervised, waiting }  (the pay period comes from the newest
//          tab on the payroll company's sheet; previous = what they already sent for it, to pre-fill the form)
//   POST { hours, pto, meetings, noShows, periodTab, supervised?: { direct, relational, individual, group, observation, other } }
//   (relational = of the direct client care, hours with two or more clients; asked of AMFTs only — license in GET)
// Saving goes through the "Payroll hours" Apps Script (netlify/lib/payroll-hours.ts, docs/payroll-hours/):
// every answer → Tangible Data "Payroll Form" (+ the "Payroll" roster); Hours + PTO only → the payroll company's
// sheet. Submitting again in the same pay period replaces the earlier answers everywhere.
// Associates also send their supervised hours here; they become ONE Supervision Hours (/hours) entry per pay period
// (kind "period"), waiting for their supervisor's approval. Resubmitting replaces it and it waits for approval again.
import { currentPerson } from '../lib/staff-session.ts';
import { readLog, updateLog, cleanPeriodHours, type Entry } from '../lib/hours.ts';
import { callPayroll, payrollConfigured, parsePeriodTab, recentHire, queue, queued, retry, type ScriptSubmit, type Period } from '../lib/payroll-hours.ts';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' } });
const entryId = (p: Period) => `pp-${p.start}`;
const supervised = (e?: Entry) => (e ? { direct: e.direct, individual: e.individual, group: e.group, observation: e.observation, other: e.other || 0, relational: e.relational || 0, status: e.status, updatedAt: e.updatedAt } : null);

export default async (req: Request) => {
  const me = await currentPerson(req);
  if (!me || me.status !== 'approved') return json({ error: 'Please sign in.' }, 401);
  const associate = me.roles.includes('associate');
  if (!payrollConfigured()) return json({ setup: false });

  if (req.method === 'GET') {
    let waiting = await queued(me.email).catch(() => null);
    if (waiting && (await retry(waiting))) waiting = null; // try again now that they're here
    try {
      const info = await callPayroll({ action: 'period', email: me.email });
      const period = info.period as Period;
      const log = associate ? (await readLog(me.email)).log : null;
      const sup = log?.entries.find((e) => e.id === entryId(period));
      return json({ setup: true, name: me.name, associate, license: log?.link?.license || null, period, previous: info.previous || null, supervised: supervised(sup), waiting: waiting ? { period: waiting.body.periodTab, savedAt: waiting.savedAt } : null });
    } catch (e) {
      return json({ setup: true, name: me.name, associate, period: null, error: (e as Error).message, waiting: waiting ? { period: waiting.body.periodTab, savedAt: waiting.savedAt } : null });
    }
  }

  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  if (req.headers.get('origin') !== new URL(req.url).origin) return json({ error: 'origin' }, 403);
  const b = await req.json().catch(() => ({}) as any);

  const n = (v: unknown, required = false): number | '' | null => {
    if (v === '' || v == null) return required ? null : '';
    const x = Math.round(Number(v) * 100) / 100;
    return Number.isFinite(x) && x >= 0 && x <= 300 ? x : null;
  };
  const hours = n(b.hours, true), pto = n(b.pto), meetings = n(b.meetings), noShows = n(b.noShows);
  if (hours === null || hours === '') return json({ error: 'Enter the hours you worked (a number, 0 or more).' }, 400);
  if (pto === null || meetings === null || noShows === null) return json({ error: 'PTO, meetings and no-shows must be numbers (or left blank).' }, 400);
  if (meetings !== '' && meetings > hours) return json({ error: 'Meeting/supervision/consult hours are part of your hours worked, so they can’t be more than that.' }, 400);
  if (noShows !== '' && !Number.isInteger(noShows)) return json({ error: 'No-shows is a count, so use a whole number.' }, 400);

  const asked = parsePeriodTab(b.periodTab);
  if (!asked) return json({ error: 'The pay period is missing. Please reload the page.' }, 400);

  // Supervised hours (associates) are checked before anything is saved, so one mistake doesn't half-save.
  const sup = associate && b.supervised ? cleanPeriodHours(b.supervised, asked.start, asked.end) : null;
  if (sup?.error) return json({ error: sup.error }, 400);

  const newHire = await recentHire(me);
  const names = [...new Set([me.name, newHire ? `${newHire.first} ${newHire.last}` : ''].map((x) => (x || '').trim()).filter(Boolean))];
  if (!names.length) return json({ error: 'Your account has no name yet. Ask a director to add it in Staff Admin.' }, 400);
  const body: ScriptSubmit = { action: 'submit', email: me.email, names, periodTab: asked.tab, newHire, hours, pto, meetings, noShows };

  let sheets: any = null, queuedError = '';
  try {
    sheets = await callPayroll(body);
  } catch (e) {
    queuedError = (e as Error).message;
    await queue(body, queuedError);
  }
  const period: Period = sheets?.period || asked;

  // Hours Tracker: one entry per pay period, replaced on every resubmit.
  let tracker: { status: string; error?: string } | null = null;
  if (associate && sup?.value) {
    const v = sup.value, total = v.direct + v.individual + v.group + v.other;
    const r = await updateLog(me.email, (log) => {
      const now = new Date().toISOString(), id = entryId(period);
      const old = log.entries.find((e) => e.id === id);
      if (!total) { if (old) log.entries = log.entries.filter((e) => e !== old); else return 'none'; return; }
      const fields = { kind: 'period' as const, date: period.start, end: period.end, period: period.tab, ...v, status: 'pending' as const, updatedAt: now };
      if (old) { Object.assign(old, fields); delete old.supervisorNote; delete old.reviewedAt; delete old.reviewedBy; }
      else log.entries.push({ id, ...fields, createdAt: now });
    });
    tracker = r.error === 'none' ? null : r.error ? { status: 'error', error: r.error } : { status: total ? 'saved' : 'removed' };
  }

  return json({
    ok: true,
    period,
    queued: !!queuedError,
    queuedError,
    form: sheets?.form || null,
    payroll: sheets?.payroll || null,
    alerted: !!sheets?.alerted,
    newHire: !!newHire,
    tracker,
  });
};

export const config = { path: '/api/submit-hours' };
