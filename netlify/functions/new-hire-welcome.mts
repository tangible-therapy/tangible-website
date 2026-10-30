// /api/new-hire-welcome — sends the new hire's welcome email from frontdesk@ ("Finish setup" on
// /reception-onboarding). POST { first, email, personal, office, resend? } → { sent, already, to, sentAt }
//
// The text is built HERE from src/data/welcome-email.ts (never taken from the browser), and it only goes to
// a Tangible address that is on the Employee Portal list as a new hire (orientation not complete) plus their
// personal address. So this can't be used to send other messages from frontdesk@.
// Sent once per person: the time is saved on their staff record (welcomeSentAt); a second call answers
// { already: true } unless resend is true.
// Sending is done by the "Front desk mailer" web app in frontdesk@'s "Payroll email" Apps Script project
// (docs/payroll-email/). Netlify env var NEW_HIRE_MAIL_SCRIPT = web app URL + ?key=<MAILER_KEY>. Never in the repo.
// Protection: behind the staff gate + reception role rule, like /api/new-hire-email.
import { json, denied } from '../lib/new-hire.ts';
import { getPerson, savePerson } from '../lib/staff-session.ts';
import { OFFICES } from '../../src/data/staff-access.ts';
import { WELCOME_SUBJECT, welcomeBody } from '../../src/data/welcome-email.ts';

const clean = (s: unknown) =>
  String(s ?? '').normalize('NFC').replace(/[^\p{L}\p{M}\s'’.-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 40);
const mail = (s: unknown) => String(s ?? '').trim().toLowerCase().slice(0, 120);

export default async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  const no = await denied(req);
  if (no) return no;
  const target = Netlify.env.get('NEW_HIRE_MAIL_SCRIPT');
  if (!target) return json({ error: 'The front desk email connection isn’t set up yet, so send the welcome email by hand (under “Doing it by hand” in their profile).' }, 503);

  const b = await req.json().catch(() => ({}) as any);
  const first = clean(b.first), email = mail(b.email), personal = mail(b.personal);
  if (!first) return json({ error: 'Please enter their first name.' }, 400);
  if (!/^[^\s@]+@tangiblementalhealth\.com$/.test(email)) return json({ error: 'Their Tangible email isn’t set up yet. Create it first.' }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(personal)) return json({ error: 'Please enter their personal email.' }, 400);
  const o = OFFICES.find((x) => x.id === b.office) || OFFICES[0];

  const person = await getPerson(email);
  if (!person || person.orientationComplete) return json({ error: 'The welcome email only goes to new hires on the Employee Portal list. Create their email first.' }, 400);
  if (person.welcomeSentAt && !b.resend) return json({ sent: false, already: true, sentAt: person.welcomeSentAt, to: [personal, email] });

  const body = welcomeBody({ first, email, director: o.director, directorEmail: o.directorEmail });
  try {
    const r = await fetch(target, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'welcome', to: [personal, email], subject: WELCOME_SUBJECT, body }),
      redirect: 'follow',
    });
    const out = await r.json().catch(() => null);
    if (!out) return json({ error: 'Google didn’t send a readable answer.' }, 502);
    if (out.error) return json({ error: out.error === 'unauthorized' ? 'The front desk email connection key doesn’t match.' : String(out.error) }, 502);
    const sentAt = new Date().toISOString();
    await savePerson({ ...person, welcomeSentAt: sentAt });
    return json({ sent: true, already: false, sentAt, to: [personal, email] });
  } catch {
    return json({ error: 'Couldn’t reach Gmail.' }, 502);
  }
};

export const config = { path: '/api/new-hire-welcome' };
