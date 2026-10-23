// Links shown on the staff Employee Portal (/employeeportal).
// These pages sit behind the staff password (see netlify/edge-functions/staff-gate.ts).
// Never put usernames or passwords in this file — it is part of the website.

export type StaffLink = { label: string; href: string };

export const employeeLinks: StaffLink[] = [
  { label: 'Submit Hours', href: 'https://docs.google.com/forms/d/e/1FAIpQLScqzjlYy0R3CTIllUWeO3S8ZrC0JPiHJVtlYSYKlogd3t_dYg/viewform' },
  { label: 'Online Learning', href: '/digital-products-2' },
  // TODO: add the paystub portal address (left blank = button hidden)
  { label: 'Paystub Portal', href: '' },
  { label: 'Shared Google Drive', href: 'https://drive.google.com/drive/folders/0ANHdYds9dSG-Uk9PVA' },
  { label: 'Orem Team Dashboard', href: 'https://drive.google.com/drive/folders/0ANHdYds9dSG-Uk9PVA' },
  // Courses now live on the course portal; update these if the addresses change.
  { label: 'Supervisor Training', href: 'https://academy.tangiblementalhealth.com' },
  { label: 'Trainings', href: '/ceu' },
];

export const newEmployeeLinks: StaffLink[] = [
  { label: 'Orientation', href: '/orientation' },
  { label: 'Onboarding', href: '/onboarding' },
];

export const managementLinks: StaffLink[] = [
  { label: 'Orientation', href: 'https://academy.tangiblementalhealth.com' },
];

// Outside learning sites listed on /digital-products-2.
// Logins for these belong in the team password manager, not here.
export const learningSites = [
  { title: 'Free CEU’s for Anxiety, OCD and Panic', href: 'https://www.nocdacademy.com/', image: '/images/untitled-design-12-bfc0f3.png' },
  { title: 'Wisemind', href: 'https://wisemind.com/', image: '/images/screenshot-2024-07-28-at-2-28-24-pm-365f28.png' },
  { title: 'ChatGPT', href: 'https://chatgpt.com/', image: '/images/untitled-design-13-6d6a4a.png' },
  { title: 'Free online DBT course', href: 'https://dialecticalbehaviortherapy.com/', image: '/images/untitled-design-14-02dc01.png' },
];

// Header menu shown on every staff page instead of the public menu.
// Pages listed in staffPaths get this header automatically.
export const staffPaths = ['/orientation', '/employeeportal', '/digital-products-2', '/onboarding', '/reception-portal', '/reception-onboarding', '/scheduling-new-client', '/scheduling-new-client-1', '/reception-onboarding-1', '/crisis-call'];

export const staffNav = [
  // Pulls from the Employee Links list above (blank links are skipped)
  { label: 'Employees', children: [{ label: 'Orientation', href: '/orientation' }, ...employeeLinks.filter((l) => l.href)] },
  { label: 'Directors', children: managementLinks.filter((l) => l.href) },
  { label: 'Reception', children: [
    { label: 'Reception Portal', href: '/reception-portal' },
    { label: 'Reception Onboarding', href: '/reception-onboarding' },
    { label: 'Start of Day Check-in', href: '/scheduling-new-client-1' },
    { label: 'Scheduling New Client', href: '/scheduling-new-client' },
    { label: 'Crisis Call', href: '/crisis-call' },
    { label: 'Payroll', href: '/reception-onboarding-1' },
  ] },
];
