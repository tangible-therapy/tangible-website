# Onboarding file mover (New Employee Onboarding form → Employee folder)

Automates step 8 of /reception-onboarding ("File their paperwork and add them to payroll"). When a new hire
submits the **New Employee Onboarding** Google Form (edit ID 1kLzKJSbZHlz5cee4f7oRGPO9lwodyPYpkhidu8P5Pto),
a Google Apps Script:

1. reads their LEGAL name from the answers ("Legal First Name" + "Last Name"; "Legal First Name" was added to
   the form for this on 29 Oct 2026 with addLegalNameQuestion(). Older responses fall back to "Preferred First
   Name"),
2. finds their **First Last** folder inside the shared Employee folder
   (https://drive.google.com/drive/folders/1DCzPfLaGhpOIepDvmZ0krxgQl61bahwN). Matching ignores capitals,
   extra spaces and a middle name. If none matches the legal name it tries the preferred name (in case front
   desk made the folder under it) before creating a new "Legal-first Last" folder,
3. moves every uploaded file (W-4, direct deposit, license...) into that folder, renamed
   "First Last - <question>" (e.g. "Sarah Smith - W-4.pdf"),
4. emails frontdesk@ a note with the folder link and the list of files, or what it couldn't do so front
   desk can finish by hand.

The payroll email (rest of step 8) is sent automatically from frontdesk@ by the "Payroll email" script, which
reacts to this script's "Onboarding files filed" email: see docs/payroll-email/.

Notes:
- It's a separate Apps Script project. The "Untitled project" alerts script keeps sending its normal
  "New response" email; don't edit that one for this.
- It must run in **brady@tangiblementalhealth.com** (the form owner). Uploaded files belong to the form
  owner, so only that account can move them.
- If Drive won't move a file (e.g. the Employee folder is in a Shared drive and the account can't move
  files there) it puts a copy in the folder and leaves the original in the form's upload folder; the email
  says so.
- Each response is filed once (remembered in the script's properties). Nothing is ever deleted.
- No passwords, keys or website settings are involved; the website itself doesn't change.
- If a new hire submits the form twice, the second set of files is filed too (renamed the same way).

Status: set up 29 Oct 2026 in brady@'s Apps Script (project "Onboarding file mover"), trigger installed.
Files are named e.g. "Sarah Smith - W-4.pdf", "Sarah Smith - Professional license.pdf".

## One-time setup (owner, ~5 minutes — Claude can't do the Google approval)
1. Signed in as **brady@tangiblementalhealth.com**, open https://script.google.com → **New project**.
   Name it **Onboarding file mover**.
2. Delete the sample code, paste in everything from docs/onboarding-uploads/apps-script.gs, click **Save**.
3. In the function menu at the top choose **setup** → **Run**. Google asks for permission:
   **Review permissions** → choose the account → **Allow** (Forms, Drive and sending email as you).
4. Check the log at the bottom. It lists the form's questions: **N** marks the ones used for the name,
   **F** the file uploads. If no question has an N (or the wrong one does), tell Claude the exact question
   titles and it will adjust the script.
5. Optional: choose **fileRecentResponses** → **Run** to file responses from the last 30 days that
   came in before setup.
6. Test: submit the form once with a test name and a small test file, check the file lands in a
   "Test Name" folder in the Employee folder and the email arrives, then delete the test folder and the
   test response.

Changing it later: edit the code in Google and Save (no redeploy needed). To change who gets the email,
edit NOTIFY_TO at the top. To stop it: Triggers (clock icon on the left) → delete the onOnboardingSubmit
trigger.
