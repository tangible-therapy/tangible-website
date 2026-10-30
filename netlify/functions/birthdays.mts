// /api/birthdays — upcoming staff birthdays for the Employee Portal dashboard.
//   GET → { birthdays: [{ name, md: "MM-DD" }] } from the private "Birthdays" tab of the tangible sheet
//         (filled by the onboarding form and the Add/Update Website Profile page; month and day only, never
//         the year), read through the "New hire folders" Apps Script (action "birthdays").
// Any approved staff member (the path is behind the staff gate in staff-gate.ts). Cached for an hour per
// function instance so the dashboard doesn't call Google on every visit.
import { currentPerson } from '../lib/staff-session.ts';
import { json, callScript } from '../lib/new-hire.ts';

let cache: { at: number; birthdays: { name: string; md: string }[] } | null = null;

export default async (req: Request) => {
  if (req.method !== 'GET') return json({ error: 'method' }, 405);
  if (Netlify.env.get('STAFF_AUTH') === 'google') {
    const me = await currentPerson(req);
    if (!me || me.status !== 'approved') return json({ error: 'Please sign in.' }, 401);
  }
  if (!Netlify.env.get('NEW_HIRE_FOLDER_SCRIPT')) return json({ birthdays: [] });
  try {
    if (!cache || Date.now() - cache.at > 3_600_000) {
      const out = await callScript({ action: 'birthdays' });
      const list = (Array.isArray(out.birthdays) ? out.birthdays : [])
        .map((b: any) => ({ name: String(b.name || '').slice(0, 80), md: String(b.md || '') }))
        .filter((b: { name: string; md: string }) => b.name && /^\d{2}-\d{2}$/.test(b.md));
      cache = { at: Date.now(), birthdays: list };
    }
    return json({ birthdays: cache.birthdays });
  } catch (e) {
    return json({ birthdays: cache?.birthdays ?? [], error: (e as Error).message });
  }
};

export const config = { path: '/api/birthdays' };
