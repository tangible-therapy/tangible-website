// /api/new-hire-contract — employment contracts for "Start a new hire" on /reception-onboarding.
//   POST { first, last, personal, office, type, pay, start, folderId }
//        → fills the right contract in Google (Apps Script "contract" action: copy of the Word master in the
//          Management folder, saved as a Google Doc in their Employees folder) and sends the PDF through
//          SignWell: location director (by office) → Hannah (COO) → the new hire.
//        ← { id, status, docUrl, testMode, recipients }
//   GET ?id=<SignWell document id>
//        ← { status, recipients: [{ name, signed }], signedUrl? } — once completed, the signed PDF is saved
//          into their folder (Apps Script "saveSigned", skipped if it's already there). /api/signwell-webhook
//          does the same the moment SignWell reports a completed contract.
// Netlify env vars (never in the repo): SIGNWELL_API_KEY, NEW_HIRE_FOLDER_SCRIPT.
// Deploy Previews send in SignWell test mode (free, watermarked, not legally binding); production sends for real.
// Behind the staff gate with the reception role rule (staff-gate.ts config + src/data/staff-access.ts).
import { json, denied, hireName, callScript, payWords, contractDate, CONTRACT_SIGNER, CONTRACT_COPY_TO, CONTRACT_TYPES, LOCATION_DIRECTORS } from '../lib/new-hire.ts';
import { signwell, saveIfCompleted, ensureWebhook, UUID, EMAIL } from '../lib/signwell.ts';
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

      const office = LOCATION_DIRECTORS[b.office] ? String(b.office) : null;
      if (!office) return json({ error: 'Choose their office. Its location director signs the contract.' }, 400);
      // Location director signs first, unless they're the COO (Provo), who then signs once.
      const director = LOCATION_DIRECTORS[office].email.toLowerCase() === CONTRACT_SIGNER.email.toLowerCase() ? null : LOCATION_DIRECTORS[office];

      const filled = await callScript({ action: 'contract', folderId: b.folderId, type: b.type, name, date, pay, signerName: CONTRACT_SIGNER.name, directorName: director ? director.name : '' });
      if (!filled.pdf) return json({ error: 'Google didn’t return the filled-in contract.' }, 502);

      const first = name.split(' ')[0];
      const kind = CONTRACT_TYPES[b.type].toLowerCase();
      const summary = `${name}'s ${kind} employment contract (pay ${pay} per billable hour, effective ${date})`;
      const signers: any[] = [];
      if (director) signers.push({
        name: director.name, email: director.email,
        subject: `Employment contract to approve and sign: ${name}`,
        message: `Please review and sign ${summary} as location director. Next it goes to ${CONTRACT_SIGNER.name} (${CONTRACT_SIGNER.title}), then to ${first}. If something is wrong, decline it and let front desk know.`,
      });
      signers.push({
        name: CONTRACT_SIGNER.name, email: CONTRACT_SIGNER.email,
        subject: `Employment contract to sign: ${name}`,
        message: `Please review and sign ${summary}.${director ? ` ${director.name} has signed as location director.` : ''} Once you sign, it goes to ${first} automatically. If something is wrong, decline it and let front desk know.`,
      });
      if (signers.some((x) => x.email.toLowerCase() === personal.toLowerCase())) {
        return json({ error: `The new hire's personal email is the same as ${signers.find((x) => x.email.toLowerCase() === personal.toLowerCase()).name}'s. Each signer needs a different email.` }, 400);
      }
      signers.push({ name, email: personal });
      // Front desk copy: only when it fits. SignWell's trial/free plan allows 3 people per document including
      // copied contacts (director + COO + new hire = 3), and it rejects a copied contact who is also a signer.
      // The signed PDF is saved into their Drive folder either way, and SignWell emails the account owner.
      const maxPeople = Number(Netlify.env.get('SIGNWELL_MAX_RECIPIENTS') || 3);
      const copyTo = signers.length < maxPeople && !signers.some((x) => x.email.toLowerCase() === CONTRACT_COPY_TO.email.toLowerCase()) ? [CONTRACT_COPY_TO] : [];
      // Text tags in the PDF refer to signers by their position in this list (1, 2, 3).
      const recipients = signers.map((s, i) => ({ id: String(i + 1), ...s }));
      const test = testMode(context);
      const r = await signwell('/documents', {
        method: 'POST',
        body: JSON.stringify({
          test_mode: test,
          name: `Employment Contract - ${name}`,
          files: [{ name: String(filled.fileName || `Employment Contract - ${name}.pdf`), file_base64: filled.pdf }],
          recipients,
          apply_signing_order: true,
          text_tags: true,
          reminders: true,
          allow_reassign: false,
          draft: false,
          subject: 'Your Tangible Therapy employment contract',
          message: `Hi ${first}, welcome to Tangible! Here is your employment contract (${CONTRACT_TYPES[b.type].toLowerCase()}). Please review and sign it. If you have any questions, contact our front desk at ${CONTRACT_COPY_TO.email}.`,
          copied_contacts: copyTo,
          metadata: { folder_id: b.folderId, hire: name, type: b.type, office },
        }),
      });
      const doc = await r.json();
      // Live site only: make sure SignWell will tell /api/signwell-webhook when this contract is fully signed.
      if (!test) await ensureWebhook(Netlify.env.get('URL') || new URL(req.url).origin).catch((e) => console.error('[signwell] webhook setup failed:', (e as Error).message));
      return json({ id: doc.id, status: String(doc.status || 'Sent'), docUrl: filled.docUrl || null, testMode: test, recipients: recipients.map((x) => ({ name: x.name, signed: false })) });
    }

    // GET: status
    const id = new URL(req.url).searchParams.get('id') || '';
    if (!UUID.test(id)) return json({ error: 'Unknown contract.' }, 400);
    const { doc, done, signedUrl } = await saveIfCompleted(id);
    const status = String(doc.status || '');
    const recipients = (doc.recipients || []).map((x: any) => ({
      name: String(x.name || x.email || ''),
      signed: done || !!x.signed_at || /signed|complete/i.test(String(x.status || '')),
    }));
    return json({ status, recipients, signedUrl, testMode: !!doc.test_mode });
  } catch (e) {
    return json({ error: (e as Error).message }, 502);
  }
};

export const config = { path: '/api/new-hire-contract' };
