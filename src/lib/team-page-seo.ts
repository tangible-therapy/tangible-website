// Titles, headings, descriptions and intro lines for the /ourteam/<office>/<specialty> filter pages.
// Each page gets its own wording (office + specialty) so Google doesn't treat them as duplicates.
// Category slugs come from src/data/team-categories.json.
import { site } from '../data/site';

type Office = { key: string; city: string; place: string; near: string; office?: (typeof site.offices)[number] };
const OFFICES: Record<string, Office> = {
  'orem-office': { key: 'orem-office', city: 'Orem', place: 'Orem, UT', near: 'Orem, Provo and Utah County', office: site.offices.find((o) => o.city === 'Orem') },
  'provo-office': { key: 'provo-office', city: 'Provo', place: 'Provo, UT', near: 'Provo, BYU and Utah County', office: site.offices.find((o) => o.city === 'Provo') },
  sandy: { key: 'sandy', city: 'Sandy', place: 'Sandy, UT', near: 'Sandy, Draper and the Salt Lake Valley', office: site.offices.find((o) => o.city === 'Sandy') },
};

// How each specialty reads in a title ("{x} in Orem, UT") and in a sentence ("help with {y}").
const SPEC: Record<string, { title: string; help: string }> = {
  addiction: { title: 'Addiction Therapists', help: 'addiction and recovery' },
  adhd: { title: 'ADHD Therapists', help: 'ADHD' },
  anxiety: { title: 'Anxiety Therapists', help: 'anxiety, worry and panic' },
  autism: { title: 'Autism Therapists', help: 'autism in kids, teens and adults' },
  couples: { title: 'Couples Therapists', help: 'couples counseling and relationships' },
  depression: { title: 'Depression Therapists', help: 'depression' },
  'eating-disorders': { title: 'Eating Disorder Therapists', help: 'eating disorders and body image' },
  'eating-disorder': { title: 'Eating Disorder Therapists', help: 'eating disorders and body image' },
  emdr: { title: 'EMDR Therapists', help: 'EMDR therapy' },
  'faith-transitions': { title: 'Faith Transition Therapists', help: 'faith transitions and religious questions' },
  grief: { title: 'Grief Therapists', help: 'grief and loss' },
  ifs: { title: 'IFS Therapists', help: 'Internal Family Systems (IFS) therapy' },
  lgbt: { title: 'LGBTQ+ Affirming Therapists', help: 'LGBTQ+ affirming care' },
  lgbtq: { title: 'LGBTQ+ Affirming Therapists', help: 'LGBTQ+ affirming care' },
  ocd: { title: 'OCD Therapists', help: 'OCD and intrusive thoughts' },
  ptsd: { title: 'PTSD Therapists', help: 'PTSD' },
  teens: { title: 'Therapists for Teens', help: 'teens and their families' },
  trauma: { title: 'Trauma Therapists', help: 'trauma' },
  'current-openings': { title: 'Therapists Accepting New Clients', help: '' },
  'current-openings-1': { title: 'Therapists Accepting New Clients', help: '' },
};

export type TeamPageSeo = { title: string; heading: string; description: string; intro: string };

export function teamPageSeo(category: string): TeamPageSeo {
  const [top, sub = ''] = category.split('/');
  const office = OFFICES[top];
  const isTele = top === 'telehealth';
  const openings = /^current-openings/.test(sub) || top === 'current-openings';
  const spec = SPEC[sub];
  const where = office ? `in ${office.place}` : isTele ? 'Online in Utah (Telehealth)' : 'in Utah';

  // Heading (also the start of the title)
  let heading: string;
  if (openings) heading = `${isTele ? 'Telehealth ' : ''}Therapists Accepting New Clients ${office ? `in ${office.place}` : 'in Utah'}`;
  else if (spec) heading = `${spec.title} ${where}`;
  else if (office) heading = `Therapists in ${office.place}`;
  else if (isTele) heading = 'Telehealth Therapists in Utah';
  else heading = 'Therapists in Utah';

  const title = `${heading} | Tangible Therapy`;

  // Descriptions stay under ~155 characters so Google shows them in full.
  const street = office?.office ? ` (${office.office.address})` : '';
  let description: string;
  let intro: string;
  if (openings) {
    description = office
      ? `Tangible Therapy therapists in ${office.place} with openings now. Check your insurance and book a free 15-minute consult online.`
      : isTele
        ? 'Tangible Therapy telehealth therapists with openings now, anywhere in Utah. Check your insurance and book a free 15-minute consult online.'
        : 'Tangible Therapy therapists with openings now in Orem, Provo, Sandy and by telehealth. Check your insurance and book a free consult.';
    intro = office
      ? `These therapists at our ${office.city} office${street} have openings right now. The list updates as their schedules change.`
      : 'These therapists have openings right now. The list updates as their schedules change.';
  } else if (spec) {
    description = office
      ? `Tangible Therapy therapists for ${spec.help} in ${office.place}, serving ${office.near}. Book online.`
      : `Tangible Therapy therapists for ${spec.help} by secure video, anywhere in Utah. See who has openings and book online.`;
    intro = office
      ? `Therapists who help with ${spec.help} at our ${office.city} office${street}. Change the filters to see more of our team.`
      : `Therapists who help with ${spec.help} by secure video, anywhere in Utah. Change the filters to see more of our team.`;
  } else if (office) {
    description = `Meet the therapists at Tangible Therapy in ${office.place}, serving ${office.near}. Filter by specialty and insurance, and book online.`;
    intro = `Our therapists at the ${office.city} office${street}. Use the filters to narrow it down, or switch on "Accepting only" to see who has openings.`;
  } else {
    description = "Meet Tangible Therapy's telehealth therapists, by secure video anywhere in Utah. Filter by specialty and insurance, and book online.";
    intro = 'Therapists who see clients by secure video anywhere in Utah. Use the filters to narrow it down.';
  }
  return { title, heading, description, intro };
}
