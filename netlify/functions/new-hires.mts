// /api/new-hires — the new-hire profiles on /reception-onboarding (shared by everyone at the front desk).
//   GET  → { hires: HireRecord[] (in progress), completed: [{ id, name, completedAt, completedBy }] (last 20) }
//   POST { action, ... }:
//     create   { first, last, personal, email, office, role, alsosup, supervisor, start, pay, contractType } → { hire }
//     update   { id, patch }        details and results the page saves (folder, contract, account, welcome, ...)
//     check    { id, step, checked } tick / untick a checklist step (only once the contract is signed)
//     signed   { id }               manual override: "Employee contract signed"
//     complete { id }               only when every step for their role is ticked → moves to Completed
//     remove   { id }               delete a profile made by mistake (in progress only; Drive is untouched)
// The contract is also marked signed automatically when SignWell's signed PDF is saved into their folder
// (netlify/lib/signwell.ts → markSignedByFolder). Storage: netlify/lib/hires.ts.
// Behind the staff gate + reception role rule (staff-gate.ts config + src/data/staff-access.ts).
import { json, denied } from '../lib/new-hire.ts';
import { currentPerson } from '../lib/staff-session.ts';
import { listHires, getHire, saveHire, deleteHire, type HireRecord } from '../lib/hires.ts';
import { HIRE_STEPS, stepsFor } from '../../src/data/onboarding-steps.ts';

const txt = (s: unknown, n = 80) => String(s ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n);
const ROLES = ['therapist', 'associate', 'frontdesk', 'billing', 'other'];
const DETAILS: (keyof HireRecord)[] = ['first', 'last', 'personal', 'email', 'office', 'role', 'alsosup', 'supervisor', 'start', 'pay', 'contractType'];
const RESULTS: (keyof HireRecord)[] = ['folder', 'contract', 'account', 'welcome', 'finish'];

function details(b: any) {
  const out: Partial<HireRecord> = {};
  if ('first' in b) out.first = txt(b.first, 40);
  if ('last' in b) out.last = txt(b.last, 40);
  if ('personal' in b) out.personal = txt(b.personal, 120).toLowerCase();
  if ('email' in b) out.email = txt(b.email, 120).toLowerCase();
  if ('office' in b) out.office = txt(b.office, 20);
  if ('role' in b) out.role = ROLES.includes(b.role) ? b.role : 'other';
  if ('alsosup' in b) out.alsosup = !!b.alsosup;
  if ('supervisor' in b) out.supervisor = txt(b.supervisor, 120).toLowerCase();
  if ('start' in b) out.start = /^\d{4}-\d{2}-\d{2}$/.test(String(b.start)) ? String(b.start) : '';
  if ('pay' in b) out.pay = txt(b.pay, 20);
  if ('contractType' in b) out.contractType = txt(b.contractType, 20);
  return out;
}
// Results the page saves are small JSON objects; keep them small.
function result(v: unknown) {
  if (v == null) return null;
  const s = JSON.stringify(v);
  return s.length > 6000 ? null : JSON.parse(s);
}
// Asks frontdesk@'s Payroll email script (through the Front desk mailer, NEW_HIRE_MAIL_SCRIPT) what happened
// with the payroll email for everyone still waiting on it, and ticks "Paperwork filed and payroll emailed"
// by itself once it was sent. Never blocks the page for long: gives up after 6 seconds.
async function refreshPayroll(all: HireRecord[]) {
  const target = Netlify.env.get('NEW_HIRE_MAIL_SCRIPT');
  const pending = all.filter((h) => h.status === 'active' && h.contractSigned && h.folder?.id && !h.done.paperwork);
  if (!target || !pending.length) return;
  try {
    const r = await fetch(target, {
      method: 'POST', headers: { 'content-type': 'application/json' }, redirect: 'follow', signal: AbortSignal.timeout(6000),
      body: JSON.stringify({ kind: 'payrollStatus', folderIds: pending.map((h) => h.folder!.id) }),
    });
    const out = await r.json().catch(() => null);
    const states = out && out.states && typeof out.states === 'object' ? out.states : {};
    for (const h of pending) {
      const st = states[h.folder!.id as string];
      if (!st || !['waiting', 'sent', 'failed'].includes(st.state)) continue;
      const next = { state: String(st.state), detail: txt(st.detail, 240), at: txt(st.at, 40) };
      if (JSON.stringify(next) === JSON.stringify(h.payrollStatus || null) && !(next.state === 'sent' && !h.done.paperwork)) continue;
      h.payrollStatus = next;
      if (next.state === 'sent') h.done = { ...h.done, paperwork: { at: next.at || new Date().toISOString(), by: 'automatic' } };
      await saveHire(h);
    }
  } catch (e) {
    console.warn('[new-hires] payroll status check failed:', String(e).slice(0, 120));
  }
}
const done = (h: HireRecord) => stepsFor(h.role).every((s) => h.done[s.id]);

export default async (req: Request) => {
  const isPost = req.method === 'POST';
  if (!isPost && req.method !== 'GET') return json({ error: 'method' }, 405);
  const no = await denied(req, isPost);
  if (no) return no;

  const all = await listHires();
  if (!isPost) {
    await refreshPayroll(all);
    const hires = all.filter((h) => h.status === 'active').sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const completed = all.filter((h) => h.status === 'completed').sort((a, b) => String(b.completedAt).localeCompare(String(a.completedAt)))
      .slice(0, 20).map((h) => ({ id: h.id, name: `${h.first} ${h.last}`, role: h.role, completedAt: h.completedAt, completedBy: h.completedBy }));
    return json({ hires, completed, payrollTracking: !!Netlify.env.get('NEW_HIRE_MAIL_SCRIPT') });
  }

  const b = await req.json().catch(() => ({}) as any);
  const by = (await currentPerson(req))?.email || 'front desk';
  const now = new Date().toISOString();

  if (b.action === 'create') {
    const d = details(b);
    if (!d.first || !d.last) return json({ error: 'Please enter their first and last name.' }, 400);
    const h: HireRecord = {
      id: crypto.randomUUID(), first: d.first, last: d.last, personal: d.personal || '', email: d.email || '', office: d.office || 'orem',
      role: d.role || 'therapist', alsosup: !!d.alsosup, supervisor: d.supervisor || '', start: d.start || '', pay: d.pay || '',
      contractType: d.contractType || 'none', folder: null, contract: null, contractSigned: false, account: null, welcome: null,
      finish: [], done: {}, status: 'active', createdAt: now, createdBy: by,
    };
    if (b.import) { // a hire that was only saved in one browser (the old checklist)
      for (const k of RESULTS) if (k in b.import) (h as any)[k] = result(b.import[k]);
      if (b.import.contractSigned) { h.contractSigned = true; h.contractSignedBy = 'manual'; h.contractSignedAt = now; }
      for (const s of HIRE_STEPS) if (b.import.done?.[s.id]) h.done[s.id] = { at: now, by };
    }
    await saveHire(h);
    return json({ hire: h });
  }

  const h = await getHire(String(b.id || ''));
  if (!h) return json({ error: 'That new hire isn’t on the list anymore. Reload the page.' }, 404);

  if (b.action === 'update') {
    const p = b.patch || {};
    const next: HireRecord = { ...h, ...details(p) };
    for (const k of RESULTS) if (k in p) (next as any)[k] = k === 'finish' ? (Array.isArray(p.finish) ? result(p.finish.slice(0, 10)) || [] : []) : result(p[k]);
    // Results that prove a step happened tick it too.
    if (next.welcome && next.account && h.contractSigned && Array.isArray(next.finish) && next.finish.length && next.finish.every((r: any) => r.ok)) next.done.setup = next.done.setup || { at: now, by };
    await saveHire(next);
    return json({ hire: next });
  }
  if (b.action === 'check') {
    if (h.status !== 'active') return json({ error: 'This onboarding is already complete.' }, 400);
    if (!h.contractSigned) return json({ error: 'The employment contract isn’t signed yet.' }, 400);
    if (!HIRE_STEPS.some((s) => s.id === b.step)) return json({ error: 'Unknown step.' }, 400);
    const d = { ...h.done };
    if (b.checked) d[b.step] = { at: now, by }; else delete d[b.step];
    const next = { ...h, done: d };
    await saveHire(next);
    return json({ hire: next });
  }
  if (b.action === 'signed') {
    const next: HireRecord = { ...h, contractSigned: true, contractSignedBy: h.contractSignedBy || 'manual', contractSignedAt: h.contractSignedAt || now };
    await saveHire(next);
    return json({ hire: next });
  }
  if (b.action === 'complete') {
    if (!h.contractSigned || !done(h)) return json({ error: 'Tick every step first.' }, 400);
    const next: HireRecord = { ...h, status: 'completed', completedAt: now, completedBy: by, pay: '' };
    await saveHire(next);
    return json({ hire: next });
  }
  if (b.action === 'remove') {
    if (h.status !== 'active') return json({ error: 'Completed onboardings can’t be removed here.' }, 400);
    await deleteHire(h.id);
    return json({ removed: true });
  }
  return json({ error: 'Unknown action.' }, 400);
};

export const config = { path: '/api/new-hires' };
