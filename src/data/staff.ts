// Links shown on the staff Employee Portal (/employeeportal).
// These pages sit behind the staff password (see netlify/edge-functions/staff-gate.ts).
// Never put usernames or passwords in this file — it is part of the website.

import type { Role } from './staff-access';

// roles: show the link only to these roles (everyone if left out). Pages are protected separately (staff-access.ts).
export type StaffLink = { label: string; href: string; roles?: Role[] };

export const employeeLinks: StaffLink[] = [
  { label: 'Policies & Procedures', href: '/employeeportal/policies' },
  // Room finder + "use this room today" claims (src/pages/employeeportal/rooms.astro, /api/rooms)
  { label: 'Find a Room', href: '/employeeportal/rooms' },
  // The "Submit Hours" Google Form is embedded on this page (published form ID: SUBMIT_HOURS_FORM below)
  { label: 'Submit Hours', href: '/employeeportal/submit-hours' },
  { label: 'Online Learning', href: '/digital-products-2' },
  // TODO: add the paystub portal address (left blank = button hidden)
  { label: 'Paystub Portal', href: '' },
  { label: 'Shared Google Drive', href: 'https://drive.google.com/drive/folders/0ANHdYds9dSG-Uk9PVA' },
  // Courses now live on the course portal; update these if the addresses change.
  { label: 'Hours Tracker', href: '/hours', roles: ['associate', 'supervisor'] },
  { label: 'Supervisor Training', href: 'https://academy.tangiblementalhealth.com', roles: ['supervisor', 'director'] },
  { label: 'Trainings', href: '/ceu' },
];

// Published ID of the "Submit Hours" Google Form shown on /employeeportal/submit-hours.
export const SUBMIT_HOURS_FORM = '1FAIpQLScqzjlYy0R3CTIllUWeO3S8ZrC0JPiHJVtlYSYKlogd3t_dYg';

export const newEmployeeLinks: StaffLink[] = [
  { label: 'Orientation', href: '/orientation' },
  { label: 'Onboarding', href: '/onboarding' },
];

export const managementLinks: StaffLink[] = [
  { label: 'Orientation', href: 'https://academy.tangiblementalhealth.com', roles: ['director'] },
  { label: 'Staff Accounts', href: '/staff-admin', roles: ['director'] },
];

// Outside learning sites listed on /digital-products-2.
// Logins for these belong in the team password manager, not here.
export const learningSites = [
  { title: 'Free CEU’s for Anxiety, OCD and Panic', href: 'https://www.nocdacademy.com/', image: '/images/untitled-design-12-bfc0f3.png' },
  { title: 'Wisemind', href: 'https://wisemind.com/', image: '/images/screenshot-2024-07-28-at-2-28-24-pm-365f28.png' },
  { title: 'ChatGPT', href: 'https://chatgpt.com/', image: '/images/untitled-design-13-6d6a4a.png' },
  { title: 'Free online DBT course', href: 'https://dialecticalbehaviortherapy.com/', image: '/images/untitled-design-14-02dc01.png' },
];

// Reception pages (header Reception menu + the portal sidebar's Reception group): front desk + directors.
export const receptionLinks: StaffLink[] = [
  { label: 'Reception Portal', href: '/reception-portal' },
  { label: 'Reception Onboarding', href: '/reception-onboarding' },
  // Add/Update Website Profile: form that updates the tangible sheet (docs/website-profile/README.md)
  { label: 'Website Profiles', href: '/employeeportal/website-profile' },
  { label: 'Start of Day Check-in', href: '/scheduling-new-client-1' },
  { label: 'Scheduling New Client', href: '/scheduling-new-client' },
  { label: 'Crisis Call', href: '/crisis-call' },
  { label: 'Payroll', href: '/reception-onboarding-1' },
];

// Pages that show the Employee Portal sidebar (PortalShell, added by src/layouts/Base.astro): every staff page
// except the courses (/orientation…), which instead get a "Back to dashboard" bar.
export const isCoursePath = (path: string) => path === '/orientation' || path.startsWith('/orientation/');

// Header menu shown on every staff page instead of the public menu.
// Pages listed in staffPaths get this header automatically.
export const staffPaths = ['/orientation', '/employeeportal', '/digital-products-2', '/onboarding', '/reception-portal', '/reception-onboarding', '/scheduling-new-client', '/scheduling-new-client-1', '/reception-onboarding-1', '/crisis-call', '/staff-admin', '/hours'];

export const staffNav = [
  // Pulls from the Employee Links list above (blank links are skipped)
  { label: 'Employees', children: [{ label: 'Orientation', href: '/orientation' }, ...employeeLinks.filter((l) => l.href)] },
  { label: 'Directors', roles: ['director'], children: managementLinks.filter((l) => l.href) },
  { label: 'Reception', roles: ['frontdesk', 'director'], children: receptionLinks },
];
