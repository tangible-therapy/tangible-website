// What the website chatbot knows. Built with the site at /chat-knowledge.json, so it refreshes on
// every sheet-triggered rebuild. netlify/functions/chat.mts reads it and sends it to the AI model.
// Public information only (the same details the therapist finder and pages already show).
// To change what the bot says about the practice, edit PRACTICE below; therapist details come from the sheet.
import type { APIRoute } from 'astro';
import { getFinderData } from '../lib/therapist-sheet';
import { site, nav } from '../data/site';
import pageSchema from '../data/page-schema.json';

const STATUS: Record<string, string> = {
  open: 'Accepting new clients',
  wait: 'Waitlist',
  closed: 'Not accepting new clients',
  unknown: 'Not accepting new clients',
};

const PRACTICE = `
Practice: ${site.name} (also called Tangible Mental Health), a therapy practice in Utah.
Phone: ${site.phone} (call for scheduling, insurance and billing questions). Email: ${site.email}.
Office hours: Monday-Friday, 9 AM - 5 PM.
Offices:
${site.offices.map((o) => `- ${o.name}: ${o.address}, ${o.city}, ${o.region} ${o.zip} (page ${o.url})`).join('\n')}
Telehealth (video) sessions are available with most therapists for clients in Utah.
Booking: open a therapist's profile and click "Book online" (shown for therapists accepting new clients), or call ${site.phone}. New clients get a free 15-minute consult with their therapist before booking. Existing clients use the client portal: ${site.clientPortal}
Find a therapist: the therapist finder at /ourteam filters by office, specialty, approach, age, insurance and who is accepting new clients.
Cost: $115 per session without insurance (one of the lowest cash rates in the area). Clients with insurance pay about $25 per session on average; the exact cost depends on the plan, deductible and coinsurance. Call and the billing team can estimate it.
In-network insurance (from /insurance-we-accept): SelectHealth, DMBA, EMI Health, BCBS, Regence, PEHP, TRICARE, United Healthcare and UMR. Not every therapist takes every plan; each therapist's plans are listed below and on their profile. Benefits vary, so suggest calling to confirm coverage.
Out of network: the office can provide a superbill to submit for reimbursement.
For professionals: free CEU trainings at /ceu; job openings at /careers.
Crisis: Tangible is not a crisis service. In an emergency call 911. For a mental health crisis call or text 988 (Suicide & Crisis Lifeline), or use the SafeUT app (Utah).
`.trim();

const stripTags = (s: unknown) => String(s ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

export const GET: APIRoute = async () => {
  const { therapists, sheetUpdated } = await getFinderData();

  const team = therapists.map((t) => {
    let status = STATUS[t.status] ?? STATUS.closed;
    if (t.status === 'wait' && t.statusNote) status += ` (${t.statusNote})`;
    if (t.status === 'open' && t.times.length) status += ` (openings: ${t.times.join(', ').toLowerCase()})`;
    const parts = [
      `${t.name}${t.credential ? ', ' + t.credential : ''}`,
      `profile /ourteam/p/${t.slug}`,
      `where: ${t.locations.join(', ') || 'call to ask'}`,
      `status: ${status}`,
      `ages: ${t.ages.join(', ')}`,
      `sees: ${t.sees.join(', ')}`,
      t.specialties.length ? `specialties: ${t.specialties.join(', ')}` : '',
      t.approaches.length ? `approaches: ${t.approaches.join(', ')}` : '',
      `insurance: ${t.insurance.length ? t.insurance.join(', ') : 'call to check'}`,
      t.gender ? `gender: ${t.gender}` : '',
      t.languages.length > 1 ? `languages: ${t.languages.join(', ')}` : '',
      `online booking: ${t.status === 'open' && t.booking ? 'yes' : 'no, call'}`,
    ];
    return '- ' + parts.filter(Boolean).join(' | ');
  });

  // Quick-check lists of therapists ACCEPTING new clients, so the bot can verify a match.
  const open = therapists.filter((t) => t.status === 'open');
  const names = (list: typeof open) => (list.length ? list.map((t) => t.name).join(', ') : 'none');
  const groups = (label: string, values: string[], pick: (t: (typeof open)[number]) => string[]) =>
    `${label}:\n` + values.map((v) => `- ${v}: ${names(open.filter((t) => pick(t).includes(v)))}`).join('\n');
  const lookups = [
    groups('By office', ['Orem', 'Provo', 'Sandy', 'Telehealth'], (t) => t.locations),
    groups('By insurance (only these therapists take that plan)', [...new Set(therapists.flatMap((t) => t.insurance))].sort(), (t) => t.insurance),
    groups('By age group', ['Kids', 'Teens', 'Adults', 'Older adults'], (t) => t.ages),
    groups('By who they see', ['Couples', 'Families'], (t) => t.sees),
  ].join('\n\n');

  // FAQs already published on the service pages (src/data/page-schema.json), without duplicates.
  const seen = new Set<string>();
  const faqs: string[] = [];
  for (const [path, items] of Object.entries(pageSchema as Record<string, any[]>)) {
    for (const x of items ?? []) {
      if (x?.['@type'] !== 'FAQPage') continue;
      for (const q of x.mainEntity ?? []) {
        const name = stripTags(q?.name);
        const answer = stripTags(q?.acceptedAnswer?.text);
        if (!name || !answer || seen.has(name.toLowerCase())) continue;
        seen.add(name.toLowerCase());
        faqs.push(`Q (${path}): ${name}\nA: ${answer}`);
      }
    }
  }

  const pages = nav
    .flatMap((n) => ('children' in n ? n.children : [n]))
    .map((l) => `- ${l.label}: ${l.href}`);

  const text = [
    '## Practice facts',
    PRACTICE,
    '## Website pages',
    pages.join('\n'),
    `## Therapists (from the scheduling sheet, updated ${sheetUpdated || 'at the last site build'}; accepting therapists listed first)`,
    team.join('\n'),
    '## Quick-check lists (therapists accepting new clients only)',
    lookups,
    '## Frequently asked questions from our pages',
    faqs.join('\n\n'),
  ].join('\n\n');

  return new Response(JSON.stringify({ updated: sheetUpdated || '', text }), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
