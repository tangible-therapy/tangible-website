// Therapist finder data: combines the therapist profiles in src/content/team/
// with the "tangible sheets" Google Sheet (openings, modalities and Insurances tabs).
//
// The sheet is read ONCE per build:
//   - THERAPIST_SHEET_FEED set (Netlify env var) -> fetch the live Apps Script feed.
//     If that fetch fails the build fails, so Netlify keeps the last good version live.
//   - not set (local builds, previews before the feed exists) -> use the snapshot in
//     src/data/therapist-sheet-snapshot.json.
// The feed only ever contains public columns. See docs/sheet-sync/.
import { getCollection } from 'astro:content';
import snapshot from '../data/therapist-sheet-snapshot.json';

export type Status = 'open' | 'wait' | 'closed' | 'unknown';
export type TimeOfDay = 'Mornings' | 'Afternoons' | 'Evenings';

export interface Therapist {
  slug: string;
  name: string; // "Faith Ochoa"
  credential: string; // "LAMFT"
  photo: string;
  order: number;
  locations: string[]; // Orem | Provo | Sandy | Telehealth
  status: Status;
  statusNote: string; // "Tue 1 PM, Wed 2 PM" / "About 4–6 weeks" / "Flexible openings"
  times: TimeOfDay[];
  ages: string[]; // Kids | Teens | Adults | Older adults
  sees: string[]; // Individuals | Couples | Families
  specialties: string[];
  approaches: string[];
  insurance: string[];
  gender: string; // Female | Male | ''
  languages: string[];
  booking: boolean; // false = profile has online booking turned off
}

export interface FinderData {
  therapists: Therapist[];
  source: 'live' | 'snapshot';
  sheetUpdated: string;
  warnings: string[];
}

type Feed = { generatedAt?: string; openings: string[][]; modalities: string[][]; insurances: string[][] };

// ---------- helpers ----------
const clean = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').trim();
const norm = (s: string) =>
  clean(s)
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// Names written differently in the sheet than on the website.
const ALIASES: Record<string, string> = {
  'joseph johnson': 'joe johnson',
  'philip childs': 'phil childs',
  'noelle barry': 'noelle berry',
  'micheala zarbach': 'micheala zarbock',
  'sarah applegarth': 'sarah mendez',
};

export const LOCATIONS = ['Orem', 'Provo', 'Sandy', 'Telehealth'];
export const TIMES: TimeOfDay[] = ['Mornings', 'Afternoons', 'Evenings'];
export const AGES = ['Kids', 'Teens', 'Adults', 'Older adults'];
export const SEES = ['Individuals', 'Couples', 'Families'];

// Website category slug -> specialty label (these also drive the SEO filter pages).
const CATEGORY_SPECIALTY: Record<string, string> = {
  anxiety: 'Anxiety', depression: 'Depression', trauma: 'Trauma/PTSD', ptsd: 'Trauma/PTSD', ocd: 'OCD',
  adhd: 'ADHD', autism: 'Autism', couples: 'Couples', 'faith-transitions': 'Faith transitions',
  lgbt: 'LGBTQ+', lgbtq: 'LGBTQ+', grief: 'Grief', 'eating-disorders': 'Eating disorders',
  'eating-disorder': 'Eating disorders', addiction: 'Addiction',
};
// Words in the sheet's "specialties" column -> the same labels.
const SPECIALTY_WORDS: [string, RegExp][] = [
  ['Anxiety', /anx/i], ['Depression', /depress/i], ['Trauma/PTSD', /trauma|ptsd/i], ['OCD', /\bocd\b/i],
  ['ADHD', /adhd/i], ['Autism', /autis/i], ['Couples', /couple/i], ['Faith transitions', /faith/i],
  ['LGBTQ+', /lgbt/i], ['Grief', /grief|greif/i], ['Eating disorders', /eating/i], ['Addiction', /addiction|substance/i],
];
export const SPECIALTIES = ['Anxiety', 'Depression', 'Trauma/PTSD', 'OCD', 'ADHD', 'Autism', 'Couples', 'Faith transitions', 'LGBTQ+', 'Grief', 'Eating disorders', 'Addiction'];

const APPROACH_WORDS: [string, RegExp][] = [
  ['EMDR', /emdr/i], ['IFS', /\bifs\b|internal family/i], ['CBT', /\bcbt\b|cognitive behav/i], ['DBT', /\bdbt\b|\bdpt\b|dialectical/i],
  ['ACT', /\bact\b|acceptance and commitment/i], ['ERP', /\berp\b|exposure/i], ['EFT', /\beft\b|emotionally focused/i],
  ['Gottman Method', /gottman/i], ['Motivational Interviewing', /motivational|\bmi\b/i], ['Solution-focused', /solution|\bsft\b/i],
  ['Somatic', /somatic|brainspotting/i], ['Family therapy', /family therapy|structural/i], ['Mindfulness', /mindful|mbct/i],
  ['Play therapy', /play therapy/i], ['Narrative therapy', /narrative/i],
];
export const APPROACHES = APPROACH_WORDS.map(([a]) => a);

const INSURER_NAMES: [string, RegExp][] = [
  ['UHC / Optum / UMR', /united|uhc|optum|umr/i], ['SelectHealth', /select/i], ['Aetna', /aetna/i], ['DMBA', /dmba/i],
  ['EMI Health', /\bemi\b/i], ['Regence', /regence/i], ['BCBS', /bcbs|blue cross/i], ['Tricare / TriWest', /tricare|triwest/i],
  ['PEHP', /pehp/i], ['Cigna', /cigna/i],
];

// ---------- openings tab ----------
const DAY = /^(mon|tue|wed|thu|fri|sat|sun)/i;
const DAY_LABEL: Record<string, string> = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };

function hour24(h: number, ampm?: string) {
  if (ampm) return ampm.toLowerCase() === 'pm' ? (h % 12) + 12 : h % 12;
  if (h >= 7 && h <= 11) return h; // no AM/PM written: 7–11 = morning
  if (h === 12) return 12;
  return h + 12; // 1–6 = afternoon/evening
}
function bucket(h: number): TimeOfDay {
  return h < 12 ? 'Mornings' : h < 17 ? 'Afternoons' : 'Evenings';
}
function fmt(h: number, m: string) {
  const ap = h >= 12 ? 'PM' : 'AM';
  const hh = h % 12 || 12;
  return `${hh}${m && m !== '00' ? ':' + m : ''} ${ap}`;
}

export function parseOpening(text: string) {
  const raw = clean(text);
  const t = raw.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim(); // drop internal notes & (B)/(W) codes
  const lower = t.toLowerCase();
  const out = { status: 'unknown' as Status, note: '', times: [] as TimeOfDay[] };
  if (!t) return out;
  if (/no longer accepting|not accepting|\bfull\b|closed/.test(lower)) return { ...out, status: 'closed' as Status };
  const wait = lower.match(/(\d+\s*[-–]\s*\d+|\d+)\s*(week|month)/);
  if (/wait/.test(lower) || (wait && !DAY.test(lower))) {
    return { ...out, status: 'wait' as Status, note: wait ? `About ${wait[1].replace(/\s*[-–]\s*/, '–')} ${wait[2]}s` : '' };
  }
  if (/any white|any opening|flexible/.test(lower)) return { status: 'open' as Status, note: 'Flexible openings', times: [...TIMES] };
  const spots = lower.match(/(\d+)\s*new client/);
  if (spots) return { status: 'open' as Status, note: `${spots[1]} new-client spot${spots[1] === '1' ? '' : 's'}`, times: [] };

  // Day + time slots, e.g. "Mondays 9:00 11:00 AM Friday 1:00"
  const slots: string[] = [];
  const times = new Set<TimeOfDay>();
  let day = '';
  let prev: { h: number; end: number } | null = null; // last time read, to spot ranges like "10 AM-5 PM"
  for (const m of t.matchAll(/([a-z]+)|(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/gi)) {
    if (m[1]) {
      const d = m[1].toLowerCase().slice(0, 3);
      if (DAY.test(m[1])) day = DAY_LABEL[d];
      prev = null;
      continue;
    }
    const h = hour24(Number(m[2]), m[4]);
    const end = (m.index ?? 0) + m[0].length;
    if (h < 6 || h > 21) { prev = null; continue; }
    // Range end ("10 AM-5 PM", "12:30 PM- 3:30"): the range covers its start up to, not including,
    // its end, so a range ending at 5 PM adds afternoons but no evening.
    if (prev && h > prev.h && /^\s*[-–]\s*$/.test(t.slice(prev.end, m.index))) {
      for (let x = prev.h + 1; x < h; x++) times.add(bucket(x));
      slots[slots.length - 1] += `–${fmt(h, m[3] ?? '')}`;
      prev = null;
      continue;
    }
    times.add(bucket(h));
    slots.push(`${day ? day + ' ' : ''}${fmt(h, m[3] ?? '')}`);
    prev = { h, end };
  }
  if (slots.length) return { status: 'open' as Status, note: slots.slice(0, 3).join(', ') + (slots.length > 3 ? ` +${slots.length - 3} more` : ''), times: TIMES.filter((x) => times.has(x)) };
  return out;
}

// ---------- main ----------
let cache: Promise<FinderData> | null = null;
export function getFinderData() {
  cache ??= build();
  return cache;
}

async function loadFeed(): Promise<{ feed: Feed; source: 'live' | 'snapshot' }> {
  const url = process.env.THERAPIST_SHEET_FEED || import.meta.env.THERAPIST_SHEET_FEED;
  if (!url) return { feed: snapshot as unknown as Feed, source: 'snapshot' };
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`Therapist sheet feed returned HTTP ${res.status}`);
  const feed = (await res.json()) as Feed & { error?: string };
  if (feed.error || !Array.isArray(feed.openings) || !Array.isArray(feed.modalities)) {
    throw new Error(`Therapist sheet feed is not in the expected format${feed.error ? ': ' + feed.error : ''}`);
  }
  return { feed, source: 'live' };
}

async function build(): Promise<FinderData> {
  const { feed, source } = await loadFeed();
  const warnings: string[] = [];
  const team = (await getCollection('team')).filter((t) => !t.data.hidden);

  // Name matching
  const byName = new Map<string, string>();
  const byFirst = new Map<string, string[]>();
  for (const t of team) {
    const full = norm(t.data.name.split(',')[0].replace(/\s+[A-Z-]{3,}$/, ''));
    byName.set(full, t.id);
    const first = full.split(' ')[0];
    byFirst.set(first, [...(byFirst.get(first) ?? []), t.id]);
  }
  const match = (rawName: string): string | undefined => {
    let n = norm(rawName);
    n = ALIASES[n] ?? n;
    if (byName.has(n)) return byName.get(n);
    const parts = n.split(' ');
    if (parts.length > 2 && byName.has(`${parts[0]} ${parts[parts.length - 1]}`)) return byName.get(`${parts[0]} ${parts[parts.length - 1]}`);
    const firsts = byFirst.get(parts[0]);
    if (firsts?.length === 1 && parts.length === 1) return firsts[0];
    return undefined;
  };

  // Openings tab: "Name: text" rows grouped under office headings
  const openings = new Map<string, { status: Status; note: string; times: TimeOfDay[]; virtualOnly: boolean; inPersonOnly: boolean; noTeens: boolean; credential: string }>();
  let section = '';
  for (const row of feed.openings ?? []) {
    const cell = String(row[0] ?? '');
    const c = clean(cell);
    if (!c) continue;
    const m = cell.match(/^\s*([A-Za-z][A-Za-z .'’]+?)\s*(\([^)]*\))?\s*(?::|\s-\s|-\s|–)\s*([\s\S]*)$/);
    if (!m) {
      if (/office|virtual|^sandy|^provo|^orem/i.test(c)) section = c.toLowerCase();
      continue;
    }
    const slug = match(m[1]);
    if (!slug) {
      if (!/current openings/i.test(c)) warnings.push(`Openings: no website profile matches "${clean(m[1])}"`);
      continue;
    }
    const parsed = parseOpening(m[3]);
    if (parsed.status === 'unknown' && clean(m[3])) warnings.push(`Openings: couldn't read "${clean(m[3])}" for ${clean(m[1])}`);
    openings.set(slug, {
      ...parsed,
      virtualOnly: /virtual/.test(section),
      inPersonOnly: /in person only|in-person only/i.test(cell),
      noTeens: /no (more )?teens/i.test(cell),
      credential: clean(row[1]),
    });
  }

  // Modalities tab
  const mods = new Map<string, string[]>();
  for (const row of feed.modalities ?? []) {
    const name = clean(row[0]);
    if (!name || row.slice(1).every((x) => !clean(x)) || /^ages/i.test(clean(row[1]))) continue;
    const slug = match(name);
    if (!slug) { warnings.push(`Modalities: no website profile matches "${name}"`); continue; }
    mods.set(slug, row.map(clean));
  }

  // Insurances tab: header row = insurers; cells = therapist names, "ALL" or "minus interns"
  const insurance = new Map<string, Set<string>>();
  const ins = feed.insurances ?? [];
  const header = (ins[0] ?? []).map((h) => INSURER_NAMES.find(([, re]) => re.test(String(h)))?.[0] ?? '');
  for (let col = 1; col < header.length; col++) {
    const insurer = header[col];
    if (!insurer) continue;
    let all = false;
    let noInterns = false;
    const names: string[] = [];
    for (const row of ins.slice(1)) {
      const v = clean(row[col]);
      if (!v) continue;
      if (/^all$/i.test(v)) all = true;
      else if (/intern/i.test(v)) noInterns = true;
      else names.push(v);
    }
    const add = (slug: string) => { if (!insurance.has(slug)) insurance.set(slug, new Set()); insurance.get(slug)!.add(insurer); };
    if (all) team.forEach((t) => add(t.id));
    for (const n of names) {
      const slug = match(n);
      if (slug) add(slug);
      else if (!/linda pomar/i.test(n)) warnings.push(`Insurances (${insurer}): no website profile matches "${n}"`);
    }
    if (noInterns) {
      for (const t of team) {
        const cred = openings.get(t.id)?.credential || t.data.name;
        if (/-I\b|intern/i.test(cred)) insurance.get(t.id)?.delete(insurer);
      }
    }
  }

  const therapists: Therapist[] = team.map((t) => {
    const [first, ...rest] = t.data.name.split(',');
    let name = clean(first);
    let credential = clean(rest.join(','));
    const tail = name.match(/\s([A-Z]{2,}(?:-[A-Z])?)$/); // "Natasha Taylor ACMHC"
    if (!credential && tail) { credential = tail[1]; name = name.slice(0, -tail[0].length); }
    const cats = t.data.categories;
    const body = t.body ?? '';

    // Locations: website categories, adjusted by the sheet (virtual-only / in-person-only)
    const loc = new Set<string>();
    if (cats.some((c) => c.startsWith('orem-office'))) loc.add('Orem');
    if (cats.some((c) => c.startsWith('provo-office'))) loc.add('Provo');
    if (cats.some((c) => c.startsWith('sandy'))) loc.add('Sandy');
    if (cats.some((c) => c.startsWith('telehealth'))) loc.add('Telehealth');
    const o = openings.get(t.id);
    if (o?.virtualOnly) { loc.clear(); loc.add('Telehealth'); }
    if (o?.inPersonOnly) loc.delete('Telehealth');

    // Status: the sheet wins; otherwise fall back to the website's Current Openings tag
    let status: Status = o?.status ?? 'unknown';
    if (status === 'unknown') status = cats.some((c) => /current-openings/.test(c)) ? 'open' : 'closed';

    // Modalities tab
    const r = mods.get(t.id) ?? [];
    const ages = r[1] ?? '';
    const ageSet = new Set<string>();
    if (/kid|child|\b[5-9]\s*\+/i.test(ages)) ageSet.add('Kids');
    if (/teen|pre-?teen|\b1[0-7]\s*\+|13-17|11-12/i.test(ages)) ageSet.add('Teens');
    if (/adult|18/i.test(ages)) ageSet.add('Adults');
    if (/elder|65/i.test(ages)) ageSet.add('Older adults');
    if (!ageSet.size) ageSet.add('Adults');
    if (cats.some((c) => c.endsWith('/teens'))) ageSet.add('Teens');
    if (o?.noTeens) ageSet.delete('Teens');

    const sees = new Set(['Individuals']);
    if (/couple/i.test(ages) || cats.some((c) => c.endsWith('/couples'))) sees.add('Couples');
    if (/famil/i.test(ages) || /family therapy/i.test(r[2] ?? '')) sees.add('Families');

    const spec = new Set<string>();
    for (const c of cats) { const s = CATEGORY_SPECIALTY[c.split('/')[1] ?? '']; if (s) spec.add(s); }
    for (const [label, re] of SPECIALTY_WORDS) if (re.test(r[5] ?? '')) spec.add(label);

    const appr = new Set<string>();
    for (const [label, re] of APPROACH_WORDS) if (re.test(r[2] ?? '')) appr.add(label);
    if (cats.some((c) => c.endsWith('/emdr'))) appr.add('EMDR');
    if (cats.some((c) => c.endsWith('/ifs'))) appr.add('IFS');

    // Gender: sheet, checked against the bio's pronouns
    const she = (body.match(/\b(she|her|hers)\b/gi) ?? []).length;
    const he = (body.match(/\b(he|him|his)\b/gi) ?? []).length;
    const bioGender = she > he * 2 ? 'Female' : he > she * 2 ? 'Male' : '';
    const g = String(r[6] ?? '');
    let gender = /female|woman/i.test(g) ? 'Female' : /male|man/i.test(g) ? 'Male' : '';
    if (gender && bioGender && gender !== bioGender) { warnings.push(`${name}: sheet says ${gender}, bio pronouns suggest ${bioGender} — using ${bioGender}`); gender = bioGender; }
    if (!gender) gender = bioGender;

    const languages = ['English'];
    if (/spanish/i.test(r.join(' ')) || /spanish/i.test(body)) languages.push('Spanish');

    return {
      slug: t.id, name, credential: credential || o?.credential || '', photo: t.data.photo, order: t.data.order,
      locations: LOCATIONS.filter((l) => loc.has(l)), status, statusNote: o?.note ?? '', times: o?.times ?? [],
      ages: AGES.filter((a) => ageSet.has(a)), sees: SEES.filter((s) => sees.has(s)),
      specialties: SPECIALTIES.filter((s) => spec.has(s)), approaches: APPROACHES.filter((a) => appr.has(a)),
      insurance: INSURER_NAMES.map(([n]) => n).filter((n) => insurance.get(t.id)?.has(n)),
      gender, languages, booking: t.data.booking !== false,
    };
  });

  const rank: Record<Status, number> = { open: 0, wait: 1, unknown: 2, closed: 3 };
  therapists.sort((a, b) => rank[a.status] - rank[b.status] || a.order - b.order);

  for (const w of warnings) console.warn(`[therapist-sheet] ${w}`);
  console.log(`[therapist-sheet] ${therapists.length} therapists from ${source} sheet data (${therapists.filter((x) => x.status === 'open').length} accepting)`);
  return { therapists, source, sheetUpdated: feed.generatedAt ?? '', warnings };
}

export const INSURERS = INSURER_NAMES.map(([n]) => n);
