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

Changing things: payroll address, sender name and sign-off are at the top of the script (PAYROLL_TO,
SIGN_OFF). Run **preview** in the editor to see what would be sent without sending anything.

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
