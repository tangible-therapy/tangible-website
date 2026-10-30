// Checklist for each new hire's profile on /reception-onboarding (shown once their employment contract is
// signed). Used by the page and by /api/new-hires, which checks every applicable step is ticked before a
// profile can be marked "Onboarding complete".
// who: 'clinician' = only therapists and associates; 'associate' = only pre-licensed associates.
// auto: done by the two-click "Finish setup" button (all automated steps are bundled into this one item).

export type HireRole = 'therapist' | 'associate' | 'frontdesk' | 'billing' | 'other';
export type OnboardingStepDef = { id: string; title: string; who?: 'clinician' | 'associate'; auto?: boolean };

export const HIRE_STEPS: OnboardingStepDef[] = [
  { id: 'setup', title: 'Automatic setup: email, groups, Employee Portal, welcome email and payroll info', auto: true },
  { id: 'slack', title: 'Joined Slack' },
  { id: 'simple', title: 'Added to SimplePractice', who: 'clinician' },
  { id: 'paperwork', title: 'Paperwork filed and payroll emailed' },
  { id: 'malpractice', title: 'Added to malpractice insurance', who: 'clinician' },
  { id: 'supervision', title: 'Supervision scheduled', who: 'clinician' },
  { id: 'hours', title: 'Linked in the Hours Tracker', who: 'associate' },
  { id: 'photos', title: 'Headshots scheduled', who: 'clinician' },
  { id: 'availibility', title: 'Availability set up in SimplePractice', who: 'clinician' },
  { id: 'booking-id', title: 'SimplePractice booking ID found', who: 'clinician' },
  { id: 'website', title: 'Added to the website', who: 'clinician' },
  { id: 'psychology-today', title: 'Psychology Today profile created', who: 'clinician' },
];

export const isClinician = (role: string) => role === 'therapist' || role === 'associate';

/** The steps that apply to someone with this role. */
export function stepsFor(role: string): OnboardingStepDef[] {
  return HIRE_STEPS.filter((s) => !s.who || (s.who === 'clinician' ? isClinician(role) : role === 'associate'));
}
