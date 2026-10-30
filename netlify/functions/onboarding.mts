// /api/onboarding — the new-hire checklist on the Employee Portal dashboard (Google sign-in only).
//   GET                         → { show, steps, done, submittedAt, director, supervisor, headshots, review? }
//   POST { step, done: bool }   → tick/untick one step (slack | orientation | paperwork | headshots | supervision;
//                                 the last two only for therapists/associates, see stepsFor())
//   POST { lessons?: [slug], quizzes?: [{ slug, answers }], skillsReview?: true } → save Orientation progress to the
//        account (any signed-in staff; sent by public/scripts/orientation.js and the skills review page). Quiz answers
//        are re-checked here against src/data/orientation.json and only saved when 100% correct. When every lesson is
//        opened, every quiz is passed and the skills review is passed, the Orientation step ticks itself.
// Shown to approved staff who haven't finished orientation (needsOnboarding in src/data/staff-access.ts), and for
// now to owners as a preview (ONBOARDING_PREVIEW_FOR_OWNERS).
// When every step is ticked the steps lock and the person shows up as "ready for approval" on directors'
// dashboards (GET returns `review` for owners/directors) and in Staff Admin. No email is sent (owner's choice,
// Oct 2026). The director approves at /staff-admin (POST /api/staff-admin { approveOnboarding }), which marks
// orientation complete, so the checklist disappears from the dashboard.
import orientation from '../../src/data/orientation.json';
import { currentPerson, getPerson, savePerson, listPeople } from '../lib/staff-session.ts';
import { showsOnboarding, isOnboardingPreview, stepsFor, HEADSHOTS_CONTACT, ONBOARDING_STEPS, OFFICES, canManage, type OnboardingStep, type StaffRecord } from '../../src/data/staff-access.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' } });

const directorFor = (p: StaffRecord) => {
  const o = OFFICES.find((x) => x.id === p.office) || OFFICES[0];
  return { name: o.director, email: o.directorEmail };
};

type OLesson = { slug: string; sections: { t: string; questions?: { answer: number[] }[] }[][] };
const LESSONS = (orientation as OLesson[]).map((l) => l.slug);
// Answer keys of the on-page quizzes (slug → per question, the correct option indexes).
const QUIZ_KEYS: Record<string, number[][]> = Object.fromEntries(
  (orientation as OLesson[]).flatMap((l) => {
    const q = l.sections.flat().find((i) => i.t === 'quiz');
    return q ? [[l.slug, q.questions!.map((x) => x.answer)]] : [];
  }),
);
const sameSet = (a: unknown, b: number[]) =>
  Array.isArray(a) && a.length === b.length && [...a].map(Number).sort().join() === [...b].sort().join();
const quizPassed = (slug: string, answers: unknown) =>
  !!QUIZ_KEYS[slug] && Array.isArray(answers) && answers.length === QUIZ_KEYS[slug].length && QUIZ_KEYS[slug].every((k, i) => sameSet(answers[i], k));
const orientationFinished = (ob: { lessons?: string[]; quizzes?: Record<string, string>; skillsReview?: string }) =>
  !!ob.skillsReview && LESSONS.every((s) => (ob.lessons || []).includes(s)) && Object.keys(QUIZ_KEYS).every((s) => ob.quizzes?.[s]);

const view = async (p: StaffRecord) => ({
  show: showsOnboarding(p),
  preview: isOnboardingPreview(p),
  steps: stepsFor(p),
  done: p.onboarding?.done || {},
  submittedAt: p.onboarding?.submittedAt || null,
  lessons: p.onboarding?.lessons || [],
  lessonCount: LESSONS.length,
  quizzes: p.onboarding?.quizzes || {},
  quizCount: Object.keys(QUIZ_KEYS).length,
  skillsReview: !!p.onboarding?.skillsReview,
  orientationComplete: !!p.orientationComplete,
  director: directorFor(p),
  supervisor: p.supervisor ? { email: p.supervisor, name: (await getPerson(p.supervisor))?.name || p.supervisor } : null,
  headshots: HEADSHOTS_CONTACT,
});

export default async (req: Request) => {
  const me = await currentPerson(req);
  if (!me || me.status !== 'approved') return json({ error: 'Please sign in.' }, 401);
  if (req.method === 'GET') {
    const out: any = await view(me);
    if (canManage(me)) {
      // Directors/owners: new hires who finished their checklist and are waiting for approval, own office first.
      out.review = (await listPeople())
        .filter((p) => showsOnboarding(p) && p.onboarding?.submittedAt)
        .map((p) => ({ email: p.email, name: p.name || p.email, office: p.office, officeLabel: (OFFICES.find((o) => o.id === p.office)?.label || p.office).replace(/ \(.*\)/, ''), submittedAt: p.onboarding!.submittedAt }))
        .sort((a, b) => (a.office === me.office ? 0 : 1) - (b.office === me.office ? 0 : 1) || a.submittedAt!.localeCompare(b.submittedAt!));
    }
    return json(out);
  }
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  if (req.headers.get('origin') !== new URL(req.url).origin) return json({ error: 'origin' }, 403);

  const b = await req.json().catch(() => ({}) as any);

  // Orientation progress (lessons opened / quizzes passed / skills review passed), saved for anyone signed in.
  if (Array.isArray(b.lessons) || Array.isArray(b.quizzes) || b.skillsReview) {
    const p = (await getPerson(me.email))!;
    const ob = { ...(p.onboarding || {}) };
    const known = new Set(ob.lessons || []);
    const before = known.size;
    for (const s of (Array.isArray(b.lessons) ? b.lessons : []).slice(0, 200)) if (LESSONS.includes(s)) known.add(s);
    const passed = !!b.skillsReview && !ob.skillsReview;
    const quizzes = { ...(ob.quizzes || {}) };
    let newQuiz = false;
    for (const q of (Array.isArray(b.quizzes) ? b.quizzes : []).slice(0, 10)) {
      if (q && typeof q.slug === 'string' && !quizzes[q.slug] && quizPassed(q.slug, q.answers)) {
        quizzes[q.slug] = new Date().toISOString();
        known.add(q.slug);
        newQuiz = true;
      }
    }
    if (known.size === before && !passed && !newQuiz) return json(await view(p));
    ob.lessons = LESSONS.filter((s) => known.has(s));
    ob.quizzes = quizzes;
    if (passed) ob.skillsReview = new Date().toISOString();
    if (showsOnboarding(p) && !ob.submittedAt && orientationFinished(ob)) {
      ob.done = { ...(ob.done || {}), orientation: ob.done?.orientation || new Date().toISOString() };
      if (stepsFor(p).every((s) => ob.done![s.id])) ob.submittedAt = new Date().toISOString();
    }
    const updated: StaffRecord = { ...p, onboarding: ob };
    await savePerson(updated);
    return json(await view(updated));
  }

  const step = b.step as OnboardingStep;
  if (!ONBOARDING_STEPS.some((s) => s.id === step)) return json({ error: 'Unknown step.' }, 400);

  const p = (await getPerson(me.email))!;
  if (!showsOnboarding(p)) return json(await view(p));
  const ob = { ...(p.onboarding || {}) };
  if (ob.submittedAt) return json({ ...(await view(p)), error: 'Your checklist was already sent to your director.' }, 409);
  const done = { ...(ob.done || {}) };
  if (b.done) done[step] = done[step] || new Date().toISOString();
  else delete done[step];
  ob.done = done;

  const finished = stepsFor(p).every((s) => done[s.id]);
  if (finished) ob.submittedAt = new Date().toISOString();
  const updated: StaffRecord = { ...p, onboarding: ob };
  await savePerson(updated);

  return json(await view(updated));
};

export const config = { path: '/api/onboarding' };
