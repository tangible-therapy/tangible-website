// /api/onboarding — the new-hire checklist on the Employee Portal dashboard (Google sign-in only).
//   GET                         → { show, steps, done, submittedAt, director, review? }
//   POST { step, done: bool }   → tick/untick one step (slack | orientation | paperwork)
// Shown to approved staff who haven't finished orientation (needsOnboarding in src/data/staff-access.ts).
// When every step is ticked the steps lock and the person shows up as "ready for approval" on directors'
// dashboards (GET returns `review` for owners/directors) and in Staff Admin. No email is sent (owner's choice,
// Oct 2026). The director approves at /staff-admin (POST /api/staff-admin { approveOnboarding }), which marks
// orientation complete, so the checklist disappears from the dashboard.
import { currentPerson, getPerson, savePerson, listPeople } from '../lib/staff-session.ts';
import { needsOnboarding, ONBOARDING_STEPS, OFFICES, canManage, type OnboardingStep, type StaffRecord } from '../../src/data/staff-access.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' } });

const directorFor = (p: StaffRecord) => {
  const o = OFFICES.find((x) => x.id === p.office) || OFFICES[0];
  return { name: o.director, email: o.directorEmail };
};

const view = (p: StaffRecord) => ({
  show: needsOnboarding(p),
  steps: ONBOARDING_STEPS,
  done: p.onboarding?.done || {},
  submittedAt: p.onboarding?.submittedAt || null,
  director: directorFor(p),
});

export default async (req: Request) => {
  const me = await currentPerson(req);
  if (!me || me.status !== 'approved') return json({ error: 'Please sign in.' }, 401);
  if (req.method === 'GET') {
    const out: any = view(me);
    if (canManage(me)) {
      // Directors/owners: new hires who finished their checklist and are waiting for approval, own office first.
      out.review = (await listPeople())
        .filter((p) => needsOnboarding(p) && p.onboarding?.submittedAt)
        .map((p) => ({ email: p.email, name: p.name || p.email, office: p.office, officeLabel: (OFFICES.find((o) => o.id === p.office)?.label || p.office).replace(/ \(.*\)/, ''), submittedAt: p.onboarding!.submittedAt }))
        .sort((a, b) => (a.office === me.office ? 0 : 1) - (b.office === me.office ? 0 : 1) || a.submittedAt!.localeCompare(b.submittedAt!));
    }
    return json(out);
  }
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  if (req.headers.get('origin') !== new URL(req.url).origin) return json({ error: 'origin' }, 403);

  const b = await req.json().catch(() => ({}) as any);
  const step = b.step as OnboardingStep;
  if (!ONBOARDING_STEPS.some((s) => s.id === step)) return json({ error: 'Unknown step.' }, 400);

  const p = (await getPerson(me.email))!;
  if (!needsOnboarding(p)) return json(view(p));
  const ob = { ...(p.onboarding || {}) };
  if (ob.submittedAt) return json({ ...view(p), error: 'Your checklist was already sent to your director.' }, 409);
  const done = { ...(ob.done || {}) };
  if (b.done) done[step] = done[step] || new Date().toISOString();
  else delete done[step];
  ob.done = done;

  const finished = ONBOARDING_STEPS.every((s) => done[s.id]);
  if (finished) ob.submittedAt = new Date().toISOString();
  const updated: StaffRecord = { ...p, onboarding: ob };
  await savePerson(updated);

  return json(view(updated));
};

export const config = { path: '/api/onboarding' };
