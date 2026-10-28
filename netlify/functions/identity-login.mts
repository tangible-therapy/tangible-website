// Netlify Identity calls this automatically on every login. It turns away any account that isn't
// a Google @tangiblementalhealth.com work account, so personal emails can't even create an account.
import { isWorkEmail } from '../../src/data/staff-access.ts';

export const handler = async (event: { body: string | null }) => {
  try {
    const { user } = JSON.parse(event.body || '{}');
    if (!isWorkEmail(user?.email)) return { statusCode: 403, body: 'Please sign in with your Tangible work Google account.' };
  } catch {
    return { statusCode: 403, body: 'Sign-in could not be checked.' };
  }
  return { statusCode: 200, body: '' };
};
