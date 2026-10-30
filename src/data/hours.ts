// License types and default hour targets for the supervision hours tracker (/hours).
// Defaults: 3,000 total supervised hours (everything logged counts: direct client care, supervision and other work
// time), plus Utah Code 58-60-405 as of July 1, 2026 (CMHC): 1,200 direct client care hours, 100 hours of
// direct clinical supervision, at least 25 of them direct observation, at most 25 group supervision hours.
// Requirements differ by license and by when the associate license was issued, so supervisors can change
// each supervisee's targets. Confirm current numbers with Utah DOPL before relying on them.
export type LicenseId = 'acmhc' | 'csw' | 'amft';
export const LICENSES: { id: LicenseId; label: string; goal: string; targets: { total: number; direct: number; supervision: number; observation: number; groupMax: number } }[] = [
  { id: 'acmhc', label: 'ACMHC', goal: 'CMHC', targets: { total: 3000, direct: 1200, supervision: 100, observation: 25, groupMax: 25 } },
  { id: 'csw', label: 'CSW', goal: 'LCSW', targets: { total: 3000, direct: 1200, supervision: 100, observation: 25, groupMax: 25 } },
  { id: 'amft', label: 'AMFT', goal: 'LMFT', targets: { total: 3000, direct: 1200, supervision: 100, observation: 25, groupMax: 25 } },
];

// The associate license a website-profile credential points to (credential = the Credential column of the
// "tangible sheets" website profiles / openings tabs, e.g. "ACMHC", "CSW-I", "LAMFT"). Used by /hours to fill in
// the License when a supervisor adds a supervisee. 'licensed' = already fully licensed (LCSW, CMHC, LMFT...),
// null = no credential or one we don't recognise; the supervisor then picks the license by hand.
export function licenseFromCredential(credential: string): LicenseId | 'licensed' | null {
  const c = (credential || '').toUpperCase().replace(/[^A-Z]/g, '');
  if (!c) return null;
  if (/^(LCSW|CMHC|LCMHC|LPC|LMFT|MFT)$/.test(c)) return 'licensed';
  if (/CSW/.test(c)) return 'csw'; // CSW, CSW-I, Intern CSW
  if (/CMHC|MHC/.test(c)) return 'acmhc'; // ACMHC, CMHC intern
  if (/MFT/.test(c)) return 'amft'; // AMFT, LAMFT, MFT-I
  return null;
}

// Brief overview of Utah DOPL licensure requirements shown on "My hours" (/hours), by license.
// Checked against DOPL's application pages and Utah Code 58-60 on 30 Oct 2026. Requirements change; when they
// do, update this and the default targets above together. Sources: DOPL CMHC + LCSW application pages, Utah Code
// 58-60-305 (MFT, 2025), OPLR's SB 26 (2024) explainer.
export const DOPL_RULES = [
  '3,000 total hours of supervised experience',
  '1,200 hours of direct client care',
  '100 hours of direct clinical supervision, in real time',
  'At least 25 of those supervision hours must be direct observation (your supervisor watches a live or recorded session, then you discuss it)',
  'No more than 25 group supervision hours count (group = 3 or more supervisees)',
];
export const DOPL_OLDER_RULE =
  'If your associate license was issued before May 1, 2024, the older rule is 1,000 hours of direct client care and 75 hours of direct clinical supervision (within the 3,000 total). The 2024 law change lets people who started their hours before May 1, 2024 apply under the older rule until January 1, 2027.';
export const DOPL_BY_LICENSE: Record<LicenseId, { exam: string; extra?: string; url: string }> = {
  acmhc: { exam: 'Pass the NCMHCE (National Clinical Mental Health Counseling Examination)', extra: '2 hours of suicide prevention continuing education', url: 'https://commerce.utah.gov/?p=20869' },
  csw: { exam: 'Pass the ASWB Clinical exam', extra: '2 hours of suicide prevention continuing education', url: 'https://commerce.utah.gov/dopl/social-work/apply-for-a-license/licensed-clinical-social-worker/utah-applicants/' },
  amft: { exam: 'Pass the National MFT Exam (AMFTRB)', url: 'https://commerce.utah.gov/dopl/marriage-and-family-therapy/apply-for-a-license/marriage-and-family-therapist/' },
};
