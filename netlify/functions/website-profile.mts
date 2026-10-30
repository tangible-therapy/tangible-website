// /api/website-profile — the "Add/Update Website Profile" page (/employeeportal/website-profile).
//   GET  ?names=1          → { names } everyone already on the tangible sheet (name suggestions)
//   GET  ?name=First Last  → what the sheet has now for that person ({ found, profile, modalities, openings, birthday })
//   POST { name, credential, office, bio, seo, spId, booking, show, gender, ages[], modalities[], comfortable[],
//          specialties[], birthday, photo: { type, data (base64) } }
//        → adds or updates them on the sheet through the "New hire folders" Apps Script (action "profile"):
//          only filled-in answers change anything, newer answers replace older ones.
// Front desk, directors and the owner (reception role rule in src/data/staff-access.ts; path in staff-gate.ts).
// The website picks up sheet changes on its own ~15 minutes later (docs/sheet-sync).
import { json, denied, callScript } from '../lib/new-hire.ts';

const MAX_PHOTO_BASE64 = 6_000_000; // ~4.5 MB; the page shrinks photos to ~1600 px first

const text = (v: unknown, max: number) => String(v ?? '').replace(/\r\n/g, '\n').trim().slice(0, max);
const list = (v: unknown) => (Array.isArray(v) ? v : []).map((x) => text(x, 80)).filter(Boolean).slice(0, 60);

export default async (req: Request) => {
  const isPost = req.method === 'POST';
  if (!isPost && req.method !== 'GET') return json({ error: 'method' }, 405);
  const no = await denied(req, isPost);
  if (no) return no;
  if (!Netlify.env.get('NEW_HIRE_FOLDER_SCRIPT')) return json({ error: 'The Google connection isn’t set up yet (see docs/new-hire-folder).' }, 503);

  try {
    if (!isPost) {
      const q = new URL(req.url).searchParams;
      if (q.get('names')) return json(await callScript({ action: 'names' }));
      const name = text(q.get('name'), 80);
      if (!name) return json({ error: 'Missing name.' }, 400);
      return json(await callScript({ action: 'getProfile', name }));
    }

    const b = await req.json().catch(() => ({}) as any);
    const name = text(b.name, 80).replace(/[^\p{L}\p{M}\s'’.-]/gu, '').replace(/\s+/g, ' ');
    if (name.split(' ').length < 2) return json({ error: 'Enter their first and last name.' }, 400);
    let photo: { type: string; data: string } | undefined;
    if (b.photo?.data) {
      const type = String(b.photo.type || '').toLowerCase();
      if (!['image/jpeg', 'image/png'].includes(type)) return json({ error: 'The photo must be a JPG or PNG.' }, 400);
      const data = String(b.photo.data).replace(/^data:[^,]+,/, '');
      if (!/^[A-Za-z0-9+/=]+$/.test(data) || data.length > MAX_PHOTO_BASE64) return json({ error: 'That photo is too big. Try a smaller one.' }, 400);
      photo = { type, data };
    }
    const office = ['orem', 'provo', 'sandy', 'virtual'].includes(String(b.office)) ? String(b.office) : '';
    const yn = (v: unknown) => (/^(yes|no)$/i.test(String(v)) ? String(v) : '');
    const out = await callScript({
      action: 'profile', name, office, photo,
      credential: text(b.credential, 40), bio: text(b.bio, 6000), seo: text(b.seo, 300), spId: text(b.spId, 40),
      booking: yn(b.booking), show: yn(b.show), gender: text(b.gender, 40), birthday: text(b.birthday, 10),
      ages: list(b.ages), modalities: list(b.modalities), comfortable: list(b.comfortable), specialties: list(b.specialties),
    });
    return json(out);
  } catch (e) {
    return json({ error: (e as Error).message }, 502);
  }
};

export const config = { path: '/api/website-profile' };
