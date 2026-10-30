# Submit Hours → payroll sheets (and Supervision Hours)

/employeeportal/submit-hours is a form built into the Employee Portal (it replaced the embedded "Payroll"
Google Form on 30 Oct 2026). It needs Google sign-in, so it always knows who is submitting.

## What happens when someone clicks Submit hours
The page shows the pay period first, taken from the **newest tab** on the payroll company's sheet (tab names like
"10.24.26 to 11.6.26"; newest = latest start date, not the last tab). Then the "Payroll hours" Apps Script
(apps-script.gs here, brady@'s account) writes:

1. **Tangible Data → "Payroll Form"** (where the Google Form used to save): every answer — hours worked, PTO,
   meetings/supervision/consult hours, no-shows, billable hours (hours − meetings, or the column's own formula
   if it has one) — plus two columns the script adds: **Pay period** and **Email**. Submitting again in the same
   pay period **replaces that row** (matched by pay period + email). New rows go at the bottom, like the form.
2. **Tangible Data → "Payroll"** (roster): their row's Hrs Worked / PTO Used / Meetings / No Shows / Billable
   Hours are filled in — only cells that are typed values; cells with formulas are never touched.
3. **"Brady A Clegg LLC Payroll"** (owned by the payroll company, nsbcpayroll@gmail.com): on the newest tab,
   **only the Hours and Vacation cells** of their row. Nothing else on that sheet is changed.

Associates (Associate role) also fill in **Supervised hours** (direct client care, individual/group supervision,
observation, other). These become ONE Supervision Hours entry (/hours, called Hours Tracker before 30 Oct 2026) per pay period ("Pay period Oct 24 – Nov 6, 2026"),
waiting for their supervisor. Resubmitting replaces it and it waits for approval again, even if it was already
approved. Supervised hours are never sent to Google. On /hours associates now only **Add past hours** in bulk
(a date range: catching up the new tracker, or hours outside a pay period); pay-period entries can't be edited
there.

## Finding people on the sheets
Names are matched by last name + first name, where a short form counts ("Abi" = "Abigail M.", "Phil" =
"Philip M."); middle initials are ignored. People who go by a different name are listed in ALIASES at the top
of the script (e.g. Noelle Berry → Elizabeth N. Berry). The website sends the person's Staff Admin name and,
for new hires, their legal name from "Start a new hire".

**Not found?** The website checks whether they're a recent new hire: a Reception Onboarding profile (Start a new
hire) with their work email or name, made or starting within the last 120 days (NEW_HIRE_DAYS in
netlify/lib/payroll-hours.ts). Only then does the script add them — name only, plus their numbers — to the
payroll company's tab (alphabetically by last name, always above the last person so the Total row still adds
them up; pay rate left blank for payroll) and to the Tangible Data roster (just above the last person; only
the roster columns shift, the history table on the right stays put; formulas copied from the row above).
Anyone else who can't be found (or matches two rows) is still saved in "Payroll Form", and **front desk gets
an email** "Hours need to be added to payroll by hand: <name>" (ALERT_TO in the script). The person is told
front desk will handle it.

## If one place can't be saved
The three places are saved separately. If any of them fails (name not found, a header changed, a tab missing…),
the others are still saved, and front desk (ALERT_TO) gets ONE email, "Payroll sheets don't match — please fix
by hand: <name>", listing what they entered, what was saved and what wasn't (with the reason). The person sees
which part front desk will fix. Each submission is also written to the script's Executions log.

## If Google can't be reached
The submission is saved in Netlify Blobs store "payroll-outbox" (latest one per person) and re-sent on their next
visit and every 15 minutes (netlify/functions/payroll-retry.mts). The person sees "saved, will be sent
automatically". If the sheet can't be reached when the page opens, the old Google Form is shown as a backup.
Without the PAYROLL_HOURS_SCRIPT env var the page simply shows the old Google Form (SUBMIT_HOURS_FORM).

## One-time setup (owner, ~5 minutes — Claude can't do the Google approval)
1. Signed in as **brady@tangiblementalhealth.com**, open https://script.google.com → **New project**. Name it
   **Payroll hours**.
2. Paste in everything from docs/payroll-hours/apps-script.gs and **Save**.
3. Choose **setup** → **Run** → **Review permissions** → brady@ → **Allow** (Sheets, sending email). The log
   shows the newest pay period it found and the **payroll key**. Optional: run **testNames** to see how names
   match on the newest tab (writes nothing).
4. **Deploy** → **New deployment** → gear → **Web app**. Description "Payroll hours", Execute as **Me**, Who has
   access **Anyone**. **Deploy**, copy the **Web app URL**.
5. Netlify → Project configuration → Environment variables → **Add a variable**: Key `PAYROLL_HOURS_SCRIPT`,
   value = Web app URL + `?key=` + the payroll key, all scopes / deploy contexts. Never put it in the repo.
6. Trigger a new deploy. The Submit Hours page now uses the built-in form.
7. Optional: turn off the old Google Form ("Payroll", form Settings → Responses → Accepting responses off) once
   everyone uses the new page, or keep it as the backup it is now.

Changing the code later: Deploy → Manage deployments → edit → Version: New version → Deploy (URL stays).
To cut access: delete PAYROLL_KEY in Project Settings → Script properties.

## Watch out for
- The payroll company makes the next tab. Someone who submits after the next tab already exists lands on the
  newer tab (the page always shows which pay period it is, so they can tell front desk).
- If the payroll company renames tabs or the "Name" / "Hours" / "Vacation" headers, writing stops and front desk
  gets the "by hand" email for each submission until the script is adjusted.
- If the "Payroll Form" headers change (Timestamp, Name, Hours Worked…, PTO, meetings, no shows), saving stops
  with an error the person sees.
