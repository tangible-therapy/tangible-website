# New hire email accounts (Reception Onboarding step 3 → Google Workspace)

On /reception-onboarding, step 3 has a **Create their email** button. Front desk fills in the New hire box
(first + last name, personal email, office, role; the Tangible email box is optional) and clicks it. The
website then:
- creates their Google Workspace account: first@tangiblementalhealth.com, or first + last initial, or
  first.last if those are taken (or exactly the address typed in the Tangible email box),
- adds them to the Google Groups listed in the script's GROUPS for everyone, their office and their role,
- has Google email their personal address a one-time temporary password. Google makes them choose their own
  password the first time they sign in. The temporary password goes straight from Google to the new hire; it is
  never sent to the website, never logged and never stored.
The button only works after the employment contract step is ticked. Clicking it twice is safe: if the account
already exists with the same personal email it just re-checks the groups and does not send another password.
If any group can't be added, the page says which ones so front desk can add them by hand.

How it fits together:
- Page: src/pages/reception-onboarding.astro (button → POST /api/new-hire-email).
- Website function: netlify/functions/new-hire-email.mts, behind the staff gate and the reception role rule
  (front desk, directors and the owner only), like /api/new-hire-folder.
- Apps Script web app "New hire accounts": docs/new-hire-email/apps-script.gs (a copy; the live one is in
  Google). It runs as the Google account that set it up, which must be a Google Workspace **super admin**.
- Netlify environment variable NEW_HIRE_EMAIL_SCRIPT = web app URL + `?key=<ACCOUNT_KEY>`. Never put it in the
  repo. Without it the button says the connection isn't set up and front desk uses the manual steps.

Security note: this key can create Tangible Google accounts, so treat it like a password. It lives only in the
script's properties and in Netlify. To cut access instantly, delete ACCOUNT_KEY in the script's Project
Settings → Script properties (or archive the deployment).

## One-time setup (owner, ~10 minutes — Claude can't do the Google approval)
1. Signed in as a Google Workspace **super admin** (e.g. brady@), open https://script.google.com →
   **New project**. Name it **New hire accounts**.
2. Delete the sample code, paste in everything from docs/new-hire-email/apps-script.gs, and click **Save**.
3. Left sidebar → **Services** (+) → **Admin SDK API** → **Add** (keep the identifier `AdminDirectory`).
4. In the function menu at the top choose **listGroups** → **Run**. Google asks for permission:
   **Review permissions** → choose the account → **Allow** (it asks to manage users and groups and to send
   email as you). The log at the bottom lists every Google Group address.
5. Fill in GROUPS near the top of the script with those addresses, e.g.
   `all: ['team@tangiblementalhealth.com'], orem: ['orem@tangiblementalhealth.com'], ...` and **Save**.
6. Choose **setup** → **Run**. The log shows "Admin access OK" and a long **account key**. Copy the key.
7. **Deploy** → **New deployment** → gear icon → **Web app**. Description "New hire accounts",
   Execute as **Me**, Who has access **Anyone**. Click **Deploy** and copy the **Web app URL**.
   ("Anyone" is needed so the website can call it; without the key it refuses to do anything.)
8. Netlify → Project configuration → Environment variables → **Add a variable**:
   Key `NEW_HIRE_EMAIL_SCRIPT`, value = the Web app URL + `?key=` + the account key, all scopes / deploy contexts.
   Tick **Contains secret values** if offered.
9. Netlify → Deploys → **Trigger deploy** (or re-run the pull request preview) so the website picks it up.
10. Test on the preview with a made-up person and your own personal email, check the account and groups in
    the Admin console and the email you received, then delete the test user in the Admin console.

Changing groups or code later: edit in Google, then **Deploy → Manage deployments → edit (pencil) → Version: New
version → Deploy**. The URL stays the same. To change the key, delete ACCOUNT_KEY in Project Settings → Script
properties, run setup again, and update the Netlify variable.
