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
