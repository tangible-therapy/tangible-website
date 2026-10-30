// New-hire profiles for /reception-onboarding, shared by everyone at the front desk (Netlify Blobs store
// "new-hires", one JSON per hire). Read and written by /api/new-hires; the SignWell code marks a profile's
// contract as signed when the signed PDF is saved into the hire's folder (markSignedByFolder).
// Pay per billable hour is kept here only while onboarding is open (Finish setup re-saves it for the payroll
// email) and is removed when the profile is marked complete.
import { getStore } from '@netlify/blobs';

export type HireRecord = {
  id: string;
  first: string;
  last: string;
  personal: string;
  email: string; // Tangible email (once made, or typed)
  office: string;
  role: string;
  alsosup: boolean;
  supervisor: string;
  start: string; // yyyy-mm-dd
  pay: string; // per billable hour, as typed
  contractType: string; // CONTRACT_TYPES key or "none"
  folder: { id?: string | null; url: string; name: string; created: boolean; payroll?: { payRate: boolean; startDate: string } | null } | null;
  contract: { id: string; status: string; test?: boolean; docUrl?: string | null; recipients?: { name: string; signed: boolean }[]; signedUrl?: string | null } | null;
  contractSigned: boolean;
  contractSignedBy?: 'signwell' | 'manual';
  contractSignedAt?: string;
  account: Record<string, unknown> | null;
  welcome: { sentAt: string; to: string[]; already?: boolean } | null;
  finish: { ok: boolean; text: string }[];
  // From frontdesk@'s Payroll email script (via the Front desk mailer): waiting | sent | failed.
  payrollStatus?: { state: string; detail: string; at: string } | null;
  done: Record<string, { at: string; by: string }>;
  status: 'active' | 'completed';
  createdAt: string;
  createdBy: string;
  updatedAt?: string;
  completedAt?: string;
  completedBy?: string;
};

const store = () => getStore({ name: 'new-hires', consistency: 'strong' });

export async function listHires(): Promise<HireRecord[]> {
  const s = store();
  const { blobs } = await s.list();
  const out = await Promise.all(blobs.map((b) => s.get(b.key, { type: 'json' }) as Promise<HireRecord | null>));
  return out.filter(Boolean) as HireRecord[];
}

export async function getHire(id: string): Promise<HireRecord | null> {
  if (!/^[a-z0-9-]{8,40}$/.test(id)) return null;
  return (await store().get(id, { type: 'json' })) as HireRecord | null;
}

export async function saveHire(h: HireRecord) {
  await store().setJSON(h.id, { ...h, updatedAt: new Date().toISOString() });
}

export async function deleteHire(id: string) {
  await store().delete(id);
}

/** Called when a signed contract has been saved into a Drive folder: marks the matching profile signed. */
export async function markSignedByFolder(folderId: string, signedUrl: string | null) {
  try {
    for (const h of await listHires()) {
      if (h.status !== 'active' || h.folder?.id !== folderId) continue;
      if (h.contractSigned && (h.contract?.signedUrl || !signedUrl)) continue;
      await saveHire({
        ...h,
        contractSigned: true,
        contractSignedBy: h.contractSignedBy || 'signwell',
        contractSignedAt: h.contractSignedAt || new Date().toISOString(),
        contract: h.contract ? { ...h.contract, status: 'Completed', signedUrl: signedUrl || h.contract.signedUrl || null } : h.contract,
      });
    }
  } catch (e) {
    console.error('[hires] could not mark contract signed:', String(e).slice(0, 120));
  }
}
