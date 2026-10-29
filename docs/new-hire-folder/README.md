# New hire folders (Reception Onboarding → Google Drive)

On /reception-onboarding, front desk fills in the New hire box and clicks **Start a new hire**. The website
then creates a folder named "First Last" inside the shared **Employee** folder on Google Drive
(https://drive.google.com/drive/folders/1DCzPfLaGhpOIepDvmZ0krxgQl61bahwN) and ticks step 1. New folders get
the Employee folder's sharing, so everyone who can see that folder can see them. If a folder with the same
name already exists, the page links to it instead of making a duplicate.

How it fits together:
- Page: src/pages/reception-onboarding.astro (button → POST /api/new-hire-folder with first + last name).
- Website function: netlify/functions/new-hire-folder.mts. It's behind the staff gate like the reception
  pages (path listed in staff-gate.ts config and in the reception rule in src/data/staff-access.ts), so only
  front desk, directors and the owner can use it. It forwards the name to the Apps Script.
- Apps Script web app "New hire folders": docs/new-hire-folder/apps-script.gs (a copy; the live one is in
  Google). It runs as the Google account that set it up, so that account needs edit access to the Employee
  folder. If the Employee folder is in a Shared drive, the folders belong to the Shared drive, not the person.
- Netlify environment variable NEW_HIRE_FOLDER_SCRIPT = web app URL + `?key=<FOLDER_KEY>`. Never put it in
  the repo. Without it the button says the connection isn't set up and front desk makes the folder by hand.

## One-time setup (owner, ~5 minutes — Claude can't do the Google approval)
1. Signed in to a Google account that can add folders to the Employee folder, open https://script.google.com
   → **New project**. Name it **New hire folders**.
2. Delete the sample code, paste in everything from docs/new-hire-folder/apps-script.gs, and click **Save**.
3. In the function menu at the top choose **setup** → **Run**. Google asks for permission: **Review
   permissions** → choose the account → **Allow** (it asks to see and manage Google Drive files).
   The log at the bottom shows the Employee folder's name and a long **folder key**. Copy the key.
4. **Deploy** → **New deployment** → gear icon → **Web app**. Description "New hire folders",
   Execute as **Me**, Who has access **Anyone**. Click **Deploy** and copy the **Web app URL**.
   ("Anyone" is needed so the website can call it; without the key it refuses to do anything.)
5. Netlify → Project configuration → Environment variables → **Add a variable**:
   Key `NEW_HIRE_FOLDER_SCRIPT`, value = the Web app URL + `?key=` + the folder key
   (e.g. `https://script.google.com/macros/s/AKfy…/exec?key=0123abcd…`), all scopes / deploy contexts.
6. Netlify → Deploys → **Trigger deploy** (or re-run the pull request preview) so the website picks it up.
7. Test on the preview: fill in a test name, click Start a new hire, check the folder appears in Drive, then
   delete the test folder.

Changing the code later: edit in Google, then **Deploy → Manage deployments → edit (pencil) → Version: New
version → Deploy**. The URL stays the same. To change the key, delete FOLDER_KEY in Project Settings → Script
properties, run setup again, and update the Netlify variable.
