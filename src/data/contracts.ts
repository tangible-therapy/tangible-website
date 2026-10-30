// Employment contracts sent from "Start a new hire" on /reception-onboarding (via SignWell).
// Used by the page and by netlify/functions/new-hire-contract.mts — keep this file free of imports.
// The contract files themselves are the Word masters in the Management folder on Google Drive; their IDs and
// the wording the script fills in live in docs/new-hire-folder/apps-script.gs (CONTRACTS).

// Signing order: the new hire's location director → the COO → the new hire.
// Signs every employment contract for Tangible (after the location director, before the new hire).
export const CONTRACT_SIGNER = { name: 'Hannah Brown', email: 'hannah@tangiblementalhealth.com', title: 'COO' };
// Location directors, by the office picked in the New hire box (same offices as src/data/staff-access.ts).
// When the director is the COO (Provo), they sign once and the contract has no separate director line.
export const LOCATION_DIRECTORS: Record<string, { name: string; email: string }> = {
  orem: { name: 'Skyler Anderson', email: 'skyler@tangiblementalhealth.com' },
  provo: { name: 'Hannah Brown', email: 'hannah@tangiblementalhealth.com' },
  sandy: { name: 'Arianne Buck', email: 'arianne@tangiblementalhealth.com' },
};
// Gets a copy of every signed contract.
export const CONTRACT_COPY_TO = { name: 'Tangible Front Desk', email: 'frontdesk@tangiblementalhealth.com' };
// Contract types: keys must match CONTRACTS in docs/new-hire-folder/apps-script.gs.
export const CONTRACT_TYPES: Record<string, string> = { fulltime: 'Full time', parttime: 'Part time', evening: 'Part-time evenings' };
