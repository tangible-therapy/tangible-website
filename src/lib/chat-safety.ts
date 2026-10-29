// Safety net for Tangie (the website chatbot): everything in /chat-knowledge.json is sent to the AI model and
// can be repeated to any visitor, so it must contain public information only.
// src/pages/chat-knowledge.json.ts runs checkPublicOnly() on the finished file at every build. If anything that
// looks like staff-portal content is found, the BUILD FAILS (the live site keeps its last good version) and the
// Netlify build log says what was found and where, starting with "[tangie-safety]".
// If a match is a false alarm (genuinely public wording), adjust the lists below in a reviewed pull request.
import { staffPaths } from '../data/staff';
import { site } from '../data/site';

// Staff-only addresses: every staff page (src/data/staff.ts) plus other private paths.
const STAFF_PATHS = [...staffPaths, '/files/', '/staff-login', '/staff-logout', '/staff-admin', '/api/'];

// Phrases that only belong to staff material (lower case; matched as whole words/phrases).
const STAFF_PHRASES = [
  'employee portal', 'staff portal', 'staff password', 'password manager', 'staff gate',
  'payroll', 'paystub', 'passdown', 'hours tracker', 'supervisee', 'supervised hours',
  'team dashboard', 'master schedule', 'training meeting', 'skill assignment',
  'reception portal', 'start of day', 'end of day checklist', 'policies & procedures', 'policies and procedures',
  'employee handbook', 'new employee orientation', 'onboarding form', 'direct deposit', 'w-4',
  'practice sandbox', 'skills review', 'room claim', 'use this room',
];

// Private service addresses and settings that must never appear.
const PRIVATE_PATTERNS: [RegExp, string][] = [
  [/script\.google\.com/i, 'a Google Apps Script address'],
  [/docs\.google\.com\/spreadsheets/i, 'a Google Sheet address'],
  [/drive\.google\.com\/(drive\/)?folders/i, 'a Google Drive folder address'],
  [/docs\.google\.com\/forms\/d\/(?!e\/)/i, 'a Google Form edit address'],
  [/\b(STAFF_PASSWORD|STAFF_AUTH|OFFICE_DASHBOARD_FEED|THERAPIST_SHEET_FEED|FEED_KEY|NETLIFY_BUILD_HOOK)\b/, 'a private setting name'],
  [/api\.netlify\.com\/build_hooks/i, 'a Netlify build hook'],
  [/[?&]key=[A-Za-z0-9_-]{8,}/, 'a private key in an address'],
];

// Email addresses Tangie may give out (anything else @ the practice domain fails the build).
const PUBLIC_EMAILS = [site.email.toLowerCase()];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Returns a list of problems (empty = safe). */
export function findStaffContent(text: string): string[] {
  const problems: string[] = [];
  const lower = text.toLowerCase();
  const near = (i: number) => JSON.stringify(text.slice(Math.max(0, i - 50), i + 70));

  for (const p of STAFF_PATHS) {
    // a staff path as a link or address: "/hours", "/hours/…", "/hours?" … but not "/hours-of-operation"
    const re = new RegExp(escape(p.replace(/\/$/, '')) + '(?=$|[/?#)\\s"\'\\],.])', 'gi');
    for (const m of text.matchAll(re)) {
      // ignore matches that are part of a longer public word or address segment (e.g. "/ceus/p/hours-x")
      const before = text[m.index! - 1] || '';
      if (/[A-Za-z0-9_-]/.test(before)) continue;
      problems.push(`staff page address "${p}" near ${near(m.index!)}`);
    }
  }
  for (const phrase of STAFF_PHRASES) {
    const re = new RegExp('(^|[^a-z0-9])' + escape(phrase) + '(?=$|[^a-z0-9])', 'g');
    for (const m of lower.matchAll(re)) problems.push(`staff-only phrase "${phrase}" near ${near(m.index!)}`);
  }
  for (const [re, label] of PRIVATE_PATTERNS) {
    const m = text.match(re);
    if (m) problems.push(`${label} near ${near(m.index!)}`);
  }
  for (const m of text.matchAll(/[A-Z0-9._%+-]+@tangiblementalhealth\.com/gi)) {
    if (!PUBLIC_EMAILS.includes(m[0].toLowerCase())) problems.push(`non-public email "${m[0]}"`);
  }
  return problems;
}

/** Throws (failing the build) if the chatbot information contains anything staff-only. */
export function checkPublicOnly(text: string) {
  const problems = findStaffContent(text);
  if (!problems.length) return;
  const list = problems.slice(0, 20).map((p) => '  - ' + p).join('\n');
  throw new Error(
    `[tangie-safety] The chatbot information (/chat-knowledge.json) contains possible staff-only content, so this build was stopped and the live site was left unchanged:\n${list}\n` +
    'Remove it from the PRACTICE text in src/pages/chat-knowledge.json.ts, the menu (src/data/site.ts), the FAQs (src/data/page-schema.json) or the therapist sheet. See docs/context/chatbot.md.'
  );
}
