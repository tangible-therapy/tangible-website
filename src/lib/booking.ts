// SimplePractice booking buttons.
// bookingAttrs(slug) returns the data-* attributes for a "Book" link. If the therapist has a
// SimplePractice clinician ID (src/data/simplepractice.json) the widget opens that therapist's own
// booking page; otherwise it opens the practice-wide widget (client picks a therapist).
//
// The attributes deliberately leave out data-spwidget-autobind: SimplePractice's script preloads a
// hidden iframe for every autobind button, which would mean ~20 iframes on the finder. Instead
// <BookingScript /> binds a button the first time it is clicked (see src/components/BookingScript.astro).
import sp from '../data/simplepractice.json';

const clinicians = sp.clinicians as Record<string, { name: string; clinicianId: string }>;

// IDs typed into the sheet's "website profiles" tab (registered by getFinderData() in
// src/lib/therapist-sheet.ts) win over simplepractice.json.
const fromSheet = new Map<string, string>();
export function registerClinician(slug: string, id: string) {
  if (slug && id) fromSheet.set(slug, id);
}

export function clinicianId(slug?: string): string | undefined {
  return slug ? fromSheet.get(slug) || clinicians[slug]?.clinicianId : undefined;
}

export function bookingAttrs(slug?: string): Record<string, string> {
  const id = clinicianId(slug);
  const attrs: Record<string, string> = {
    'data-sp-book': '',
    'data-spwidget-scope-id': sp.practice.scopeId,
    'data-spwidget-scope-uri': sp.practice.scopeUri,
    'data-spwidget-application-id': sp.practice.applicationId,
  };
  if (id) attrs['data-spwidget-clinician-id'] = id;
  else attrs['data-spwidget-scope-global'] = '';
  return attrs;
}
