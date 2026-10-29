// Builds what the STAFF chatbot ("Ask the Handbook", netlify/functions/staff-chat.mts) knows, after every site build.
//
// PRIVATE: the file is written to generated/staff-knowledge.json, OUTSIDE dist/, so it is never part of the
// public website and can't be opened by any web address. Netlify packages it with the staff-chat function only
// (included_files in netlify.toml), which checks the staff sign-in on every message and only uses the sections
// the person's role may open (canOpen in src/data/staff-access.ts, by each section's page path).
// Tangie (the public chatbot) never sees this file (see src/lib/chat-safety.ts).
//
// Sources (rebuilt automatically when they change):
//   - Policies & Procedures: src/data/policies.md (one section per "## " heading, linked to its place on the page)
//   - Orientation lessons: src/data/orientation.json
//   - The text of the other staff pages below, read from the built pages (reception scripts, onboarding, etc.)
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

// Staff pages whose text the chatbot reads (page path → built file). Access is decided per path at chat time.
export const STAFF_PAGES = [
  '/reception-portal', '/reception-onboarding', '/reception-onboarding-1', '/scheduling-new-client', '/scheduling-new-client-1',
  '/crisis-call', '/onboarding', '/digital-products-2', '/hours', '/employeeportal/rooms', '/employeeportal/submit-hours',
];

const OUT = 'generated/staff-knowledge.json';

const slug = (s) => s.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
// Review markers (src/lib/changes.ts): drop removed text, keep new text, drop ::: block lines.
const clean = (s) => s.replace(/\{-[\s\S]*?-\}\s?/g, '').replace(/\{\+([\s\S]*?)\+\}/g, '$1').replace(/^[ \t]*:::(new)?[ \t]*$/gm, '').replace(/\n{3,}/g, '\n\n').trim();
const decode = (s) => s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&#x27;|&rsquo;/g, '’').replace(/&ldquo;|&rdquo;/g, '"').replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(+n));

// Main text of a built staff page (inside the portal content area), with links kept as [text](href).
function pageText(html) {
  const m = html.match(/<div class="portal-main">([\s\S]*)<\/main>/) || html.match(/<main[^>]*>([\s\S]*)<\/main>/);
  let t = m ? m[1] : '';
  t = t.replace(/<(script|style|svg|select|noscript)[^>]*>[\s\S]*?<\/\1>/gi, ' ');
  t = t.replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href, text) => {
    const label = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    return label && !href.startsWith('#') && !href.startsWith('javascript') ? ` [${label}](${href}) ` : ` ${label} `;
  });
  t = t.replace(/<\/(p|li|h[1-6]|div|section|tr|summary)>|<br\s*\/?>/gi, '\n').replace(/<li[^>]*>/gi, '\n- ');
  t = decode(t.replace(/<[^>]+>/g, ' '));
  // Repeated marquee text ("Reception Portal Reception Portal ✺ …") and blank runs
  const lines = t.replace(/✺/g, ' ').split('\n').map((l) => l.replace(/\s+/g, ' ').trim().replace(/(\b[\w’' ]{4,40}?)(?: \1){2,}/g, '$1')).filter(Boolean);
  return lines.filter((l, i) => l !== lines[i - 1]).join('\n');
}

export async function buildStaffKnowledge(root, distDir) {
  const sections = [];

  // Policies & Procedures
  const raw = await readFile(join(root, 'src/data/policies.md'), 'utf8');
  const fm = raw.match(/^---\n([\s\S]*?)\n---\n/);
  const updated = (fm?.[1].match(/updated:\s*(.+)/) || [])[1] || '';
  const body = fm ? raw.slice(fm[0].length) : raw;
  for (const block of body.split(/^# (?!#)/m).filter((b) => b.trim())) {
    const [chTitle, ...rest] = block.split('\n');
    for (const sec of rest.join('\n').split(/^## (?!#)/m).filter((b) => b.trim())) {
      const [t, ...lines] = sec.split('\n');
      const text = clean(lines.join('\n'));
      if (!text) continue;
      sections.push({ source: 'Policies & Procedures', title: `${chTitle.trim()} › ${t.trim()}`, path: '/employeeportal/policies', link: `/employeeportal/policies#${slug(chTitle)}--${slug(t)}`, text });
    }
  }

  // Orientation lessons
  const lessons = JSON.parse(await readFile(join(root, 'src/data/orientation.json'), 'utf8'));
  for (const l of lessons) {
    const parts = [];
    for (const items of l.sections) for (const i of items) {
      if (i.t === 'text') parts.push(clean(i.md));
      else if (i.t === 'sandbox') parts.push(`${i.title}: ${i.text}`);
      else if (i.t === 'form') parts.push('(This lesson ends with a quiz form.)');
    }
    const text = parts.filter(Boolean).join('\n\n').replace(/!\[[^\]]*\]\([^)]*\)/g, '').trim();
    if (text) sections.push({ source: 'Orientation', title: `${l.chapter} › ${l.title}`, path: '/orientation', link: `/orientation/${l.slug}`, text });
  }

  // Other staff pages, from the built HTML
  for (const p of STAFF_PAGES) {
    const html = await readFile(join(distDir, p.slice(1) + '.html'), 'utf8').catch(() => '');
    if (!html) continue;
    const title = decode((html.match(/<title>([^<|]+)/) || [])[1] || p).trim();
    const text = pageText(html);
    if (text) sections.push({ source: 'Staff page', title, path: p, link: p, text });
  }

  const out = { builtAt: new Date().toISOString(), policiesUpdated: updated, sections };
  const file = join(root, OUT);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(out));
  return { file, count: sections.length, chars: sections.reduce((n, s) => n + s.text.length, 0) };
}

export default function staffKnowledge() {
  return {
    name: 'staff-knowledge',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        const root = process.cwd();
        const distDir = fileURLToPath(dir);
        if (join(root, OUT).startsWith(distDir)) throw new Error('[staff-knowledge] must not be written inside the public site folder');
        const r = await buildStaffKnowledge(root, distDir);
        logger.info(`staff chatbot knowledge: ${r.count} sections, ${Math.round(r.chars / 1000)}k characters → ${OUT} (private, not published)`);
      },
    },
  };
}
