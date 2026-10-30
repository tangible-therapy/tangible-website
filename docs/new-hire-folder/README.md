# New hire folders + employment contracts (Reception Onboarding → Google Drive + SignWell)

On /reception-onboarding, front desk fills in the New hire box and clicks **Start a new hire**. The website:
1. creates a folder named "First Last" inside the shared **Employees** folder on Google Drive
   (https://drive.google.com/drive/folders/1DCzPfLaGhpOIepDvmZ0krxgQl61bahwN), or links the one that's already
   there, and ticks step 1. New folders get the Employees folder's sharing.
2. if a contract type is chosen (Full time / Part time / Part-time evenings): fills in that contract and sends
   it through **SignWell** in this order: the **location director** for their office (Orem: Skyler Anderson,
   Sandy: Arianne Buck), then **Hannah Brown (COO)**, then the new hire at their personal email. Provo's
   director is Hannah, so Provo contracts go Hannah → new hire. Front desk (frontdesk@) is emailed the signed copy. The page shows who still needs to sign ("Check again"), and
   once everyone has signed it saves "Employment Contract - First Last (signed).pdf" into their folder, ticks
   step 2 and turns the Stop banner into Go.

What gets filled in on the contract (from the Word masters in the Management folder — edit those as usual):
- "Employee Name Here" → their name; "8th day of July, 2025" → their **start date** (Effective Date);
  "sixty dollars ($60)" → their pay written out, e.g. "sixty-two dollars and fifty cents ($62.50)";
  "Brady Clegg" → "Hannah Brown"; the three ______ lines → hidden SignWell fields (Hannah's signature, the
  new hire's signature, the new hire's printed name); a "LOCATION DIRECTOR:" signature space with the
  director's printed name is added under the signature block (not for Provo).
- Keep those sample words and the three ______ lines in the masters, or the script stops with a clear message
  ("Couldn't find the pay rate…"). A filled Google Doc copy "(sent for signing)" is left in their folder.

How it fits together:
- Page: src/pages/reception-onboarding.astro. COO signer, location directors, copy-to address and contract
  types: src/data/contracts.ts.
- Website functions (behind the staff gate with the reception role rule — paths in staff-gate.ts config and
  src/data/staff-access.ts): netlify/functions/new-hire-folder.mts (/api/new-hire-folder) and
  netlify/functions/new-hire-contract.mts (/api/new-hire-contract: POST sends, GET ?id= checks status and saves
  the signed PDF). Shared helpers (name cleanup, pay in words, contract date, Apps Script call):
  netlify/lib/new-hire.ts.
- Apps Script web app "New hire folders" (brady@tangiblementalhealth.com, script.google.com):
  docs/new-hire-folder/apps-script.gs is a copy; the live one is in Google. Actions: folder, contract (copies
  the Word master as a Google Doc into their folder, fills it, returns a PDF), saveSigned. Needs the **Drive
  API** advanced service (Services → Drive API v3). It runs as brady@, so that account needs edit access to
  the Employees folder and view access to the contracts.
- SignWell: the PDF is sent with SignWell text tags (white text, so they don't show), apply_signing_order on,
  reminders on. Deploy Previews send in **test mode** (free, watermarked, not legally binding); production
  sends real contracts. Status is checked when someone opens the page (no webhook needed).
- Netlify environment variables (never in the repo): NEW_HIRE_FOLDER_SCRIPT = web app URL + `?key=<FOLDER_KEY>`;
  SIGNWELL_API_KEY = SignWell → Settings → API → API key. Without them the page explains what's missing and
  front desk does that step by hand.

## One-time setup (owner — Claude can't approve Google permissions, create accounts or type API keys)
Google script (done 29 Oct 2026 for folders; redo steps 2–4 when the code changes):
1. Signed in as brady@, open https://script.google.com → **New hire folders**.
2. Replace the code with everything from docs/new-hire-folder/apps-script.gs → **Save**. Under **Services** (+)
   add **Drive API** (v3, identifier `Drive`).
3. Choose **setup** → **Run**. If Google asks, **Review permissions** → brady@ → **Allow** (Drive + Docs).
   The log shows the Employees folder, the three contracts, "Drive API service: on" and the folder key.
   Optional: run **testContract** to make a filled copy in a "Contract test" folder (delete it afterwards).
4. **Deploy → Manage deployments → edit (pencil) → Version: New version → Deploy**. The URL stays the same.
   (First time only: Deploy → New deployment → Web app, Execute as Me, Who has access **Anyone** — needed so
   the website can call it; without the key it refuses everything.)
5. Netlify → Environment variables: `NEW_HIRE_FOLDER_SCRIPT` = Web app URL + `?key=` + folder key.

SignWell:
1. Create a SignWell account (brady@ or frontdesk@) at signwell.com. The free API allowance covers the first
   25 documents a month (then about $0.85 each, Oct 2026); add a card if SignWell asks to enable the API.
2. SignWell → Settings → API → copy the **API key**.
3. Netlify → Environment variables → `SIGNWELL_API_KEY` = that key, all deploy contexts. Redeploy.
4. Test on a Deploy Preview (test mode): Start a new hire with a made-up name and your own email as the
   personal email. Hannah gets the test email first, then you. Delete the test folder afterwards.

To change who signs (COO or a location director) or gets the copy: src/data/contracts.ts. To add a contract type: add the Word file's ID to
CONTRACTS in the script (same sample wording) and the same key to CONTRACT_TYPES in src/data/contracts.ts.
To change the key: delete FOLDER_KEY in Project Settings → Script properties, run setup, update Netlify.
