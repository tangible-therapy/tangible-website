# Payroll email (automatic, from frontdesk@)

Automates the payroll part of step 8 on /reception-onboarding. Script copy: docs/payroll-email/apps-script.gs.
It's a Google Apps Script project **"Payroll email"** in the **frontdesk@tangiblementalhealth.com** account, so
the email to payroll comes from frontdesk@ (and shows in frontdesk@'s Sent folder).

How the pieces fit:
1. On /reception-onboarding, front desk fills the New hire box (name, **pay rate**, **start date**) and clicks
   Start a new hire. The "New hire folders" script (docs/new-hire-folder/) creates/finds their folder and saves
   `Payroll info: pay rate <x> | start date <yyyy-mm-dd>` in the folder's description. Typing a pay rate or
   start date later saves it again (blank values never erase saved ones). The website itself never stores pay.
2. The new hire submits the onboarding form. The "Onboarding file mover" (docs/onboarding-uploads/, brady@)
   files their uploads into the folder and emails frontdesk@ "Onboarding files filed: <Legal Name>" with the
   folder link.
3. Every 10 minutes this script finds those emails (only from brady@, only for folders inside the Employee
   folder), reads the pay rate + start date from the folder description, attaches "<Name> - W-4" and
   "<Name> - Direct Deposit form", and emails **nsbcpayroll@gmail.com** "New employee: <Name>". The filing
   email gets the Gmail label **Payroll sent**.
4. If pay rate, start date or a file is missing, nothing is sent; front desk gets one "Payroll email waiting:
   <Name>" email saying what to fix, and the filing email gets the label **Payroll waiting**. It keeps checking
   for 14 days, so fixing the problem is enough.

Safety: each folder is only ever sent once (remembered in the script's properties). "Some onboarding files NOT
filed" emails are ignored (front desk sends those by hand). Who can see the pay rate: anyone with access to
the Employee folder, the same people who can already see the signed contract in it.

Changing things: payroll address, greeting ("Hey Chelsea,"), sender name and sign-off are at the top of the
script (PAYROLL_TO, GREETING, SIGN_OFF); the by-hand template on the onboarding page uses the same greeting. Run **preview** in the editor to see what would be sent without sending anything.

Status: set up 29 Oct 2026 in frontdesk@'s Apps Script (project "Payroll email", created from frontdesk@'s Drive:
New → More → Google Apps Script; script.google.com's own "New project" link failed with two accounts signed in).
The "New hire folders" web app was redeployed the same day with the payroll-info change.

## Front desk mailer (welcome email from frontdesk@)
The same project also has a small web app, **Front desk mailer** (doPost in the script). "Finish setup" on
/reception-onboarding calls the website's /api/new-hire-welcome, which builds the welcome email from
src/data/welcome-email.ts and asks this web app to send it from frontdesk@ to the new hire's personal and
Tangible addresses. Only the welcome email is accepted (fixed subject), it needs the key, and each person gets
it once (the website also records welcomeSentAt on their staff record).
It also answers kind "payrollStatus" (read-only, needs the key): the script records what happened with each
new hire's payroll email by Drive folder id (Script property pstate:<folderId> = waiting | sent | failed + detail;
"failed" also when the file mover sent a "NOT filed" email). The onboarding page shows it on the "Paperwork
filed and payroll emailed" step and ticks the step itself once it's sent.

Mailer setup (once, owner — Claude can't deploy or handle the key):
1. In the Payroll email project choose **setupMailer** → **Run**. The log shows the mailer key.
2. **Deploy** → **New deployment** → gear → **Web app**. Description "Front desk mailer", Execute as **Me**
   (frontdesk@), Who has access **Anyone**. **Deploy** and copy the **Web app URL**. (Allow if Google asks.)
3. Netlify → Project configuration → Environment variables → **Add a variable**: Key `NEW_HIRE_MAIL_SCRIPT`,
   value = Web app URL + `?key=` + the mailer key, all scopes / deploy contexts. Never put it in the repo.
4. Trigger a new deploy so the website picks it up.
Without it, Finish setup still does everything else and says the welcome email has to be sent by hand.
To cut access: delete MAILER_KEY in Project Settings → Script properties (or archive the deployment).
Changing the code later: Deploy → Manage deployments → edit → Version: New version → Deploy (URL stays).

## One-time setup (front desk account, ~5 minutes — Claude can't do the Google approval)
1. Signed in as **frontdesk@tangiblementalhealth.com**, open https://script.google.com → **New project**. Name it
   **Payroll email**.
2. Paste in everything from docs/payroll-email/apps-script.gs and **Save**.
3. Choose **setup** → **Run** → **Review permissions** → frontdesk@ → **Allow** (Gmail, Drive, triggers).
   The log must say "Running as: frontdesk@tangiblementalhealth.com" and show the Employee folder's name.
4. Run **preview** to check: it lists recent filing emails and what it would send.

Also needed once: the "New hire folders" web app (brady@) must be redeployed with the updated
docs/new-hire-folder/apps-script.gs (Deploy → Manage deployments → edit → Version: New version → Deploy) so
Start a new hire saves the pay rate and start date.

To stop it: in the Payroll email project, Triggers (clock icon) → delete the checkForNewHires trigger.
