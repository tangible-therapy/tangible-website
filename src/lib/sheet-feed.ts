// Reading the "tangible sheets" Google Sheet feed (shared by the team collection loader in
// src/content.config.ts and the therapist finder data in src/lib/therapist-sheet.ts).
//
//   - THERAPIST_SHEET_FEED set (Netlify env var) -> fetch the live Apps Script feed.
//     If that fetch fails the build fails, so Netlify keeps the last good version live.
//   - not set (local builds) -> use the snapshot in src/data/therapist-sheet-snapshot.json.
// The feed only ever contains public columns. See docs/sheet-sync/.
//
// This file must not import astro:content (the content config imports it).
import snapshot from '../data/therapist-sheet-snapshot.json';

// One row of the "website profiles" tab, as the Apps Script sends it.
export type ProfileRow = {
  row: number; // sheet row number, for messages
  name: string; // "Jane Doe" (same spelling as the openings tab)
  credential: string; // "LCSW" (blank = use the openings tab's credential column)
  photoId: string; // Google Drive file ID taken from the Photo link ('' = no photo yet)
  photoUpdated: string; // Drive "last updated" time, so a replaced photo gets a new file name
  bio: string; // paragraphs separated by blank lines
  seoDescription: string;
  clinicianId: string; // SimplePractice clinician ID
  booking: string; // "Yes" / "No" / ''
  show: string; // "Yes" / "No" / ''
};

export type Feed = {
  generatedAt?: string;
  openings: string[][];
  modalities: string[][];
  insurances: string[][];
  profiles?: ProfileRow[];
};

export const clean = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').trim();
export const norm = (s: string) =>
  clean(s)
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// Names written differently in the sheet than on the website.
export const ALIASES: Record<string, string> = {
  'joseph johnson': 'joe johnson',
  'philip childs': 'phil childs',
  'noelle barry': 'noelle berry',
  'micheala zarbach': 'micheala zarbock',
  'sarah applegarth': 'sarah mendez',
};

// "Allora Walters, LCMHC" / "Natasha Taylor ACMHC" -> "allora walters"
export const profileNameKey = (name: string) => norm(name.split(',')[0].replace(/\s+[A-Z-]{3,}$/, ''));
export const sheetNameKey = (name: string) => { const n = norm(name); return ALIASES[n] ?? n; };

export const slugify = (s: string) =>
  s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function feedUrl(): string {
  return (typeof process !== 'undefined' && process.env.THERAPIST_SHEET_FEED) || '';
}

let cache: Promise<{ feed: Feed; source: 'live' | 'snapshot' }> | null = null;
export function loadFeed() {
  cache ??= (async () => {
    const url = feedUrl();
    if (!url) return { feed: snapshot as unknown as Feed, source: 'snapshot' as const };
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) throw new Error(`Therapist sheet feed returned HTTP ${res.status}`);
    const feed = (await res.json()) as Feed & { error?: string };
    if (feed.error || !Array.isArray(feed.openings) || !Array.isArray(feed.modalities)) {
      throw new Error(`Therapist sheet feed is not in the expected format${feed.error ? ': ' + feed.error : ''}`);
    }
    return { feed, source: 'live' as const };
  })();
  return cache;
}

// One photo from the "website profiles" tab: the feed only hands out files listed in that tab.
export async function fetchPhoto(photoId: string): Promise<Buffer> {
  const url = feedUrl();
  if (!url) throw new Error('no feed URL');
  const res = await fetch(`${url}&photo=${encodeURIComponent(photoId)}`, { redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const out = (await res.json()) as { data?: string; error?: string };
  if (!out.data) throw new Error(out.error || 'no image data');
  return Buffer.from(out.data, 'base64');
}

// Credential column (C) of the openings tab for a sheet name, e.g. "LCSW".
export function openingsCredential(feed: Feed, name: string): string {
  const want = sheetNameKey(name);
  for (const row of feed.openings ?? []) {
    const m = String(row[0] ?? '').match(/^\s*([A-Za-z][A-Za-z .'’]+?)\s*(\([^)]*\))?\s*(?::|\s-\s|-\s|–)/);
    if (m && sheetNameKey(m[1]) === want) return clean(row[1]);
  }
  return '';
}
