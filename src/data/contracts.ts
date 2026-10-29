// Employment contracts sent from "Start a new hire" on /reception-onboarding (via SignWell).
// Used by the page and by netlify/functions/new-hire-contract.mts — keep this file free of imports.
// The contract files themselves are the Word masters in the Management folder on Google Drive; their IDs and
// the wording the script fills in live in docs/new-hire-folder/apps-script.gs (CONTRACTS).

// Signs every employment contract for Tangible (signer 1, before the new hire).
export const CONTRACT_SIGNER = { name: 'Hannah Brown', email: 'hannah@tangiblementalhealth.com', title: 'COO' };
// Gets a copy of every signed contract.
export const CONTRACT_COPY_TO = { name: 'Tangible Front Desk', email: 'frontdesk@tangiblementalhealth.com' };
// Contract types: keys must match CONTRACTS in docs/new-hire-folder/apps-script.gs.
export const CONTRACT_TYPES: Record<string, string> = { fulltime: 'Full time', parttime: 'Part time', evening: 'Part-time evenings' };
