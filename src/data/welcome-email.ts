// The new hire's welcome email (Reception Onboarding). One template for both:
//  - the preview / "Open in Gmail" on /reception-onboarding (the page fills the {{tokens}} in the browser), and
//  - the automatic send from frontdesk@ by "Finish setup" (netlify/functions/new-hire-welcome.mts).
// Edit the wording here only.

export const WELCOME_SUBJECT = 'Welcome to Tangible!';

export type WelcomeFields = { first: string; email: string; director: string; directorEmail: string };

export function welcomeBody(f: WelcomeFields): string {
  return 'Hi ' + f.first + ',\n\n' +
    'Welcome to the Tangible team! We’re excited to have you on board.\n\n' +
    'To get started, go to the Employee Portal and sign in with your new Tangible email (' + f.email + '):\n' +
    'https://tangiblementalhealth.com/employeeportal\n\n' +
    'You should already have an email from Google with your sign-in details. Once you’re in, your dashboard has a short checklist that walks you through everything: joining our team Slack, Orientation and your onboarding paperwork. When it’s all done, your practice director, ' + f.director + ', will set up a time with you to finish onboarding.\n\n' +
    'If you have any questions, just reach out to ' + f.director + ' (' + f.directorEmail + ') and we’ll help you through it.\n\n' +
    'Welcome aboard!';
}

/** The same text with {{first}}, {{email}}, {{director}}, {{directorEmail}} left in, for the page to fill. */
export const WELCOME_TEMPLATE = welcomeBody({ first: '{{first}}', email: '{{email}}', director: '{{director}}', directorEmail: '{{directorEmail}}' });
