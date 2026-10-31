// Staff accounts: roles, offices and which staff pages each role can open.
// Used by the website pages AND by the sign-in gate (netlify/edge-functions/staff-gate.ts),
// so keep this file free of imports.
// People's names/emails are NOT stored here — they live in the staff list managed at /staff-admin.

export const WORK_DOMAIN = 'tangiblementalhealth.com';

// Owners always have full access and can't be removed or edited by directors.
export const OWNER_EMAILS = ['brady@tangiblementalhealth.com'];

export type Role = 'therapist' | 'associate' | 'supervisor' | 'director' | 'frontdesk' | 'billing';
export const ROLES: { id: Role; label: string }[] = [
  { id: 'therapist', label: 'Therapist' },
  { id: 'associate', label: 'Associate (pre-licensed)' },
  { id: 'supervisor', label: 'Clinical supervisor' },
  { id: 'director', label: 'Director' },
  { id: 'frontdesk', label: 'Admin / front desk' },
  { id: 'billing', label: 'Billing' },
];

export type Office = 'orem' | 'provo' | 'sandy';
// director = who gets that office's orientation-completion emails. Telehealth-only staff use Orem.
// dashboard = that office's Team Dashboard sheet is connected to the website (docs/office-dashboards).
export const OFFICES: { id: Office; label: string; director: string; directorEmail: string; dashboard: boolean }[] = [
  { id: 'orem', label: 'Orem (and telehealth)', director: 'Skyler', directorEmail: 'skyler@tangiblementalhealth.com', dashboard: true },
  { id: 'provo', label: 'Provo', director: 'Hannah', directorEmail: 'hannah@tangiblementalhealth.com', dashboard: true },
  { id: 'sandy', label: 'Sandy', director: 'Arianne', directorEmail: 'arianne@tangiblementalhealth.com', dashboard: true },
];

export type StaffRecord = {
  email: string;
  name: string;
  roles: Role[];
  office: Office;
  status: 'approved' | 'pending';
  orientationComplete?: boolean;
  supervisor?: string; // email of their clinical supervisor (set by Reception Onboarding or Staff Admin)
  onboarding?: Onboarding;
  welcomeSentAt?: string; // when Reception Onboarding's welcome email went out (sent once)
  addedBy?: string;
  updatedAt?: string;
  lastSignIn?: string;
};

// New-hire checklist on the Employee Portal dashboard (/api/onboarding). Shown to approved staff who haven't
// finished orientation; when every step is ticked they show up on directors' dashboards, and once a director
// approves at /staff-admin, orientationComplete becomes true and the checklist disappears.
export type OnboardingStep = 'slack' | 'orientation' | 'paperwork' | 'headshots' | 'supervision' | 'inperson';
// clinician: only for therapists and associates.
export const ONBOARDING_STEPS: { id: OnboardingStep; label: string; clinician?: boolean }[] = [
  { id: 'slack', label: 'Join Slack' },
  { id: 'orientation', label: 'Complete Orientation' },
  { id: 'paperwork', label: 'Complete Onboarding' },
  { id: 'headshots', label: 'Schedule headshots', clinician: true },
  { id: 'supervision', label: 'Schedule supervision', clinician: true },
  // Always last, and can only be ticked once every other step is done (checked in /api/onboarding).
  { id: 'inperson', label: 'Schedule In-Person Onboarding' },
];
// Who takes headshots (the new hire messages her on Slack).
export const HEADSHOTS_CONTACT = 'Julie Clegg';
export const isClinician = (r: StaffRecord | null) => !!r && (r.roles.includes('therapist') || r.roles.includes('associate'));
// The steps this person's checklist has (owners previewing it see every step).
export const stepsFor = (r: StaffRecord | null) =>
  ONBOARDING_STEPS.filter((s) => !s.clinician || isClinician(r) || isOnboardingPreview(r));
export type Onboarding = {
  done?: Partial<Record<OnboardingStep, string>>; // step → when it was ticked (ISO)
  lessons?: string[]; // orientation lessons opened (slugs), from any device
  quizzes?: Record<string, string>; // orientation quiz lesson slug → when it was passed with 100% (checked on the server)
  skillsReview?: string; // when the SimplePractice skills review was passed
  submittedAt?: string; // all steps ticked; waiting for a director's approval
  approvedAt?: string;
  approvedBy?: string;
};
export const needsOnboarding = (r: StaffRecord | null) => !!r && r.status === 'approved' && !isOwner(r.email) && !r.orientationComplete;
// Owner preview of the checklist (used for testing in Oct 2026; turned off 30 Oct 2026). true = owners also see
// the checklist; their finished checklist shows up for approval, and approving it just resets it.
export const ONBOARDING_PREVIEW_FOR_OWNERS = false;
export const isOnboardingPreview = (r: StaffRecord | null) => ONBOARDING_PREVIEW_FOR_OWNERS && !!r && isOwner(r.email);
export const showsOnboarding = (r: StaffRecord | null) => needsOnboarding(r) || isOnboardingPreview(r);

export const isOwner = (email: string) => OWNER_EMAILS.includes(email.toLowerCase());
export const isWorkEmail = (email?: string | null) => !!email && email.toLowerCase().endsWith('@' + WORK_DOMAIN);

// Can manage the staff list at /staff-admin.
export const canManage = (r: StaffRecord | null) => !!r && r.status === 'approved' && (isOwner(r.email) || r.roles.includes('director'));

// Which roles can open which staff pages. Paths not listed under a role are open to every approved staff member.
const RESTRICTED: { paths: string[]; roles: Role[] }[] = [
  {
    // Reception section
    paths: ['/reception-portal', '/reception-onboarding', '/api/new-hire-folder', '/api/new-hire-email', '/api/new-hire-contract', '/api/new-hire-welcome', '/api/new-hires', '/api/website-profile', '/employeeportal/website-profile', '/scheduling-new-client', '/scheduling-new-client-1', '/crisis-call'],
    roles: ['frontdesk', 'director'],
  },
  { paths: ['/staff-admin', '/employeeportal/bugs'], roles: ['director'] },
  { paths: ['/hours'], roles: ['associate', 'supervisor'] },
  // Owner only (no role opens it; owners can open everything): Tangible Health dashboard.
  { paths: ['/employeeportal/health', '/api/health'], roles: [] },
];

// Menu/link visibility: a link with roles is shown only to those roles (owners see everything).
// This is only for tidy menus — the pages themselves are protected by canOpen() in the gate.
export const canSee = (linkRoles: (Role | 'owner')[] | undefined, r: StaffRecord | null) =>
  !linkRoles || !linkRoles.length || (!!r && (isOwner(r.email) || linkRoles.some((x) => (r.roles as string[]).includes(x))));

const matches = (path: string, p: string) => path === p || path === p + '.html' || path.startsWith(p + '/');

export function canOpen(path: string, r: StaffRecord | null): boolean {
  if (!r || r.status !== 'approved') return false;
  if (isOwner(r.email)) return true;
  const rule = RESTRICTED.find((x) => x.paths.some((p) => matches(path, p)));
  return !rule || rule.roles.some((role) => r.roles.includes(role));
}
