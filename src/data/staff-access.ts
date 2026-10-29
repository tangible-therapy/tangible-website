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
  { id: 'provo', label: 'Provo', director: 'Hannah', directorEmail: 'hannah@tangiblementalhealth.com', dashboard: false },
  { id: 'sandy', label: 'Sandy', director: 'Arianne', directorEmail: 'arianne@tangiblementalhealth.com', dashboard: false },
];

export type StaffRecord = {
  email: string;
  name: string;
  roles: Role[];
  office: Office;
  status: 'approved' | 'pending';
  orientationComplete?: boolean;
  addedBy?: string;
  updatedAt?: string;
  lastSignIn?: string;
};

export const isOwner = (email: string) => OWNER_EMAILS.includes(email.toLowerCase());
export const isWorkEmail = (email?: string | null) => !!email && email.toLowerCase().endsWith('@' + WORK_DOMAIN);

// Can manage the staff list at /staff-admin.
export const canManage = (r: StaffRecord | null) => !!r && r.status === 'approved' && (isOwner(r.email) || r.roles.includes('director'));

// Which roles can open which staff pages. Paths not listed under a role are open to every approved staff member.
const RESTRICTED: { paths: string[]; roles: Role[] }[] = [
  {
    // Reception section
    paths: ['/reception-portal', '/reception-onboarding', '/reception-onboarding-1', '/api/new-hire-folder', '/api/new-hire-email', '/scheduling-new-client', '/scheduling-new-client-1', '/crisis-call'],
    roles: ['frontdesk', 'director'],
  },
  { paths: ['/staff-admin'], roles: ['director'] },
  { paths: ['/hours'], roles: ['associate', 'supervisor'] },
];

// Menu/link visibility: a link with roles is shown only to those roles (owners see everything).
// This is only for tidy menus — the pages themselves are protected by canOpen() in the gate.
export const canSee = (linkRoles: Role[] | undefined, r: StaffRecord | null) =>
  !linkRoles || !linkRoles.length || (!!r && (isOwner(r.email) || linkRoles.some((x) => r.roles.includes(x))));

const matches = (path: string, p: string) => path === p || path === p + '.html' || path.startsWith(p + '/');

export function canOpen(path: string, r: StaffRecord | null): boolean {
  if (!r || r.status !== 'approved') return false;
  if (isOwner(r.email)) return true;
  const rule = RESTRICTED.find((x) => x.paths.some((p) => matches(path, p)));
  return !rule || rule.roles.some((role) => r.roles.includes(role));
}
