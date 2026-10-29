// /api/new-hire-contract — employment contracts for "Start a new hire" on /reception-onboarding.
//   POST { first, last, personal, type, pay, start, folderId }
//        → fills the right contract in Google (Apps Script "contract" action: copy of the Word master in the
//          Management folder, saved as a Google Doc in their Employees folder) and sends the PDF through
//          SignWell: Hannah (COO) signs first, then the new hire; front desk is copied on the signed version.
//        ← { id, status, docUrl, testMode }
//   GET ?id=<SignWell document id>
//        ← { status, recipients: [{ name, signed }], signedUrl? } — once completed, the signed PDF is saved
//          into their folder (Apps Script "saveSigned", skipped if it's already there).
// Netlify env vars (never in the repo): SIGNWELL_API_KEY, NEW_HIRE_FOLDER_SCRIPT.
// Deploy Previews send in SignWell test mode (free, watermarked, not legally binding); production sends for real.
// Behind the staff gate with the reception role rule (staff-gate.ts config + src/data/staff-access.ts).
import { json, denied, hireName, callScript, payWords, contractDate, CONTRACT_SIGNER, CONTRACT_COPY_TO, CONTRACT_TYPES } from '../lib/new-hire.ts';

const API = 'https://www.signwell.com/api/v1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@<>()]+@[^\s@<>()]+\.[a-z]{2,}$/i;

async function signwell(path: string, init: RequestInit = {}) {
  const key = Netlify.env.get('SIGNWELL_API_KEY');
  if (!key) throw new Error('SignWell isn’t connected yet (see docs/new-hire-folder).');
  const r = await fetch(API + path, { ...init, headers: { 'X-Api-Key': key, accept: 'application/json', 'content-type': 'application/json', ...(init.headers || {}) } });
  if (!r.ok) {
    const err = await r.json().catch(() => null);
    const msg = err?.meta?.messages?.join(' ') || err?.message || err?.error || `SignWell answered ${r.status}.`;
    throw new Error(r.status === 401 ? 'The SignWell API key isn’t accepted.' : `SignWell: ${msg}`);
  }
  return r;
}

const testMode = (context: any) => (context?.deploy?.context ?? Netlify.env.get('CONTEXT')) !== 'production';

export default async (req: Request, context: any) => {
  const isPost = req.method === 'POST';
  if (!isPost && req.method !== 'GET') return json({ error: 'method' }, 405);
  const no = await denied(req, isPost);
  if (no) return no;

  try {
    if (isPost) {
      const b = await req.json().catch(() => ({}) as any);
      const name = hireName(b.first, b.last);
      if (!name) return json({ error: 'Please enter their first and last name.' }, 400);
      const personal = String(b.personal || '').trim();
      if (!EMAIL.test(personal)) return json({ error: 'Enter their personal email. The contract goes there because their Tangible email isn’t set up yet.' }, 400);
      if (!CONTRACT_TYPES[b.type]) return json({ error: 'Choose which contract to send.' }, 400);
      const pay = payWords(b.pay);
      if (!pay) return json({ error: 'Enter their pay per billable hour, like 60.' }, 400);
      const date = contractDate(b.start);
      if (!date) return json({ error: 'Enter their start date. It becomes the contract’s Effective Date.' }, 400);
      if (!b.folderId || typeof b.folderId !== 'string') return json({ error: 'Their Drive folder is missing. Try Start a new hire again.' }, 400);
      if (!Netlify.env.get('SIGNWELL_API_KEY')) return json({ error: 'SignWell isn’t connected yet (see docs/new-hire-folder).' }, 503);

      const filled = await callScript({ action: 'contract', folderId: b.folderId, type: b.type, name, date, pay, signerName: CONTRACT_SIGNER.name });
      if (!filled.pdf) return json({ error: 'Google didn’t return the filled-in contract.' }, 502);

      const first = name.split(' ')[0];
      const test = testMode(context);
      const r = await signwell('/documents', {
        method: 'POST',
        body: JSON.stringify({
          test_mode: test,
          name: `Employment Contract - ${name}`,
          files: [{ name: String(filled.fileName || `Employment Contract - ${name}.pdf`), file_base64: filled.pdf }],
          recipients: [
            {
              id: '1', name: CONTRACT_SIGNER.name, email: CONTRACT_SIGNER.email,
              subject: `Employment contract to sign: ${name}`,
              message: `Please review and sign ${name}'s ${CONTRACT_TYPES[b.type].toLowerCase()} employment contract (pay ${pay}, effective ${date}). Once you sign, it goes to ${first} automatically. If something is wrong, decline it and let front desk know.`,
            },
            { id: '2', name, email: personal },
          ],
          apply_signing_order: true,
          text_tags: true,
          reminders: true,
          allow_reassign: false,
          draft: false,
          subject: 'Your Tangible Therapy employment contract',
          message: `Hi ${first}, welcome to Tangible! Here is your employment contract (${CONTRACT_TYPES[b.type].toLowerCase()}). Please review and sign it. If you have any questions, contact our front desk at ${CONTRACT_COPY_TO.email}.`,
          copied_contacts: [CONTRACT_COPY_TO],
          metadata: { folder_id: b.folderId, hire: name, type: b.type },
        }),
      });
      const doc = await r.json();
      return json({ id: doc.id, status: String(doc.status || 'Sent'), docUrl: filled.docUrl || null, testMode: test });
    }

    // GET: status
    const id = new URL(req.url).searchParams.get('id') || '';
    if (!UUID.test(id)) return json({ error: 'Unknown contract.' }, 400);
    const doc = await (await signwell(`/documents/${id}`)).json();
    const status = String(doc.status || '');
    const done = /complete/i.test(status);
    const recipients = (doc.recipients || []).map((x: any) => ({
      name: String(x.name || x.email || ''),
      signed: done || !!x.signed_at || /signed|complete/i.test(String(x.status || '')),
    }));
    let signedUrl: string | null = null;
    if (done) {
      const folderId = doc.metadata?.folder_id;
      const hire = String(doc.metadata?.hire || recipients[1]?.name || 'employee');
      if (folderId) {
        const pdf = await (await signwell(`/documents/${id}/completed_pdf`, { headers: { accept: 'application/pdf' } })).arrayBuffer();
        const saved = await callScript({ action: 'saveSigned', folderId, fileName: `Employment Contract - ${hire} (signed).pdf`, pdf: Buffer.from(pdf).toString('base64') });
        signedUrl = saved.url || null;
      }
    }
    return json({ status, recipients, signedUrl, testMode: !!doc.test_mode });
  } catch (e) {
    return json({ error: (e as Error).message }, 502);
  }
};

export const config = { path: '/api/new-hire-contract' };
