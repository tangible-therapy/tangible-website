// Insurance plans: ONE list used by the Insurance We Accept page (FAQ answer + Google FAQ data)
// and by Tangie, the website chatbot. Change it here and both update on the next build.
// The logo grid on /insurance-we-accept is still placed by hand (add a logo there too).
// Which THERAPIST takes which plan comes from the "tangible sheets" Insurances tab, not from here.
export const insurance = {
  // In-network plans, in the order we list them
  inNetwork: [
    'SelectHealth', 'DMBA', 'EMI Health', 'Blue Cross Blue Shield (BCBS)', 'Regence', 'PEHP',
    'TRICARE', 'United Healthcare', 'UMR', 'Aetna', 'Cigna',
  ],
  // Plans we do NOT accept right now (Tangie tells visitors; not shown on the page).
  // When one becomes accepted: move it to inNetwork, and add a column for it in the sheet's Insurances tab.
  notAccepted: ['Medicaid'],
};

// "SelectHealth, DMBA, ... and Cigna"
export const inNetworkText = (list = insurance.inNetwork) =>
  list.length > 1 ? `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}` : list.join('');
