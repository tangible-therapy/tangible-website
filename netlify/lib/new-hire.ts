// Shared helpers for "Start a new hire" on /reception-onboarding:
//   /api/new-hire-folder   (netlify/functions/new-hire-folder.mts)   — Drive folder
//   /api/new-hire-contract (netlify/functions/new-hire-contract.mts) — employment contract via SignWell
// Both paths are behind the staff gate with the reception role rule (staff-gate.ts + src/data/staff-access.ts).
import { currentPerson } from './staff-session.ts';
import { canOpen } from '../../src/data/staff-access.ts';

export { CONTRACT_SIGNER, CONTRACT_COPY_TO, CONTRACT_TYPES, LOCATION_DIRECTORS } from '../../src/data/contracts.ts';

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' } });

/** Same-origin + (with Google sign-in) front desk / director / owner. Returns an error Response or null. */
export async function denied(req: Request, checkOrigin = true): Promise<Response | null> {
  const url = new URL(req.url);
  if (checkOrigin && req.headers.get('origin') !== url.origin) return json({ error: 'origin' }, 403);
  if (Netlify.env.get('STAFF_AUTH') === 'google') {
    const me = await currentPerson(req);
    if (!me || !canOpen('/reception-onboarding', me)) return json({ error: 'Only front desk and directors can do this.' }, 403);
  }
  return null;
}

// Keep names tidy and safe: letters (any language), spaces, hyphens, apostrophes and periods.
const clean = (s: unknown) =>
  String(s ?? '').normalize('NFC').replace(/[^\p{L}\p{M}\s'’.-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 60);
// Capitalise each word so "jamie rivera" and "Jamie Rivera" end up in the same folder.
const cap = (s: string) => s.replace(/(^|[\s-])(\p{Ll})/gu, (_m, a, c) => a + c.toUpperCase());

/** "jamie" + "rivera" → "Jamie Rivera", or null if either part is missing. */
export function hireName(first: unknown, last: unknown): string | null {
  const f = cap(clean(first)), l = cap(clean(last));
  return f && l ? `${f} ${l}` : null;
}

/** Calls the "New hire folders" Apps Script (docs/new-hire-folder). Throws an Error with a readable message. */
export async function callScript(body: Record<string, unknown>): Promise<any> {
  const target = Netlify.env.get('NEW_HIRE_FOLDER_SCRIPT');
  if (!target) throw new Error('The Google Drive connection isn’t set up yet (see docs/new-hire-folder).');
  let r: Response;
  try {
    // Apps Script answers a POST with a redirect to the result; fetch follows it (as a GET).
    r = await fetch(target, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), redirect: 'follow' });
  } catch {
    throw new Error('Couldn’t reach Google Drive.');
  }
  const out = await r.json().catch(() => null);
  if (!out) throw new Error('Google didn’t send a readable answer.');
  if (out.error) throw new Error(out.error === 'unauthorized' ? 'The Google Drive connection key doesn’t match.' : String(out.error));
  return out;
}

// ---------- contract wording ----------
const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
function words(n: number): string {
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? '-' + ONES[n % 10] : '');
  if (n < 1000) return ONES[Math.floor(n / 100)] + ' hundred' + (n % 100 ? ' ' + words(n % 100) : '');
  return words(Math.floor(n / 1000)) + ' thousand' + (n % 1000 ? ' ' + words(n % 1000) : '');
}

/** "65" → "sixty-five dollars ($65)"; "62.5" → "sixty-two dollars and fifty cents ($62.50)". null if not a sensible rate. */
export function payWords(input: unknown): string | null {
  const v = Number(String(input ?? '').replace(/[$,\s]/g, '').replace(/\/.*$/, ''));
  if (!Number.isFinite(v) || v <= 0 || v >= 10000) return null;
  const cents = Math.round(v * 100);
  const d = Math.floor(cents / 100), c = cents % 100;
  if (d === 0) return null;
  const text = words(d) + (d === 1 ? ' dollar' : ' dollars') + (c ? ` and ${words(c)} ${c === 1 ? 'cent' : 'cents'}` : '');
  return `${text} ($${d.toLocaleString('en-US')}${c ? '.' + String(c).padStart(2, '0') : ''})`;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** "2026-12-01" → "1st day of December, 2026" (the contracts' "Effective Date" wording). */
export function contractDate(iso: unknown): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? ''));
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 2020 || y > 2100) return null;
  const sfx = d % 100 >= 11 && d % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][d % 10] || 'th';
  return `${d}${sfx} day of ${MONTHS[mo - 1]}, ${y}`;
}
