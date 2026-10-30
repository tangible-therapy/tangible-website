# Add/Update Website Profile (and onboarding answers → tangible sheet)

Two ways therapists get onto the "tangible sheets" Google Sheet without anyone editing it by hand:

1. **Add/Update Website Profile page** — /employeeportal/website-profile (Reception menu "Website Profiles";
   front desk, directors, owner). A form built into the page (a Google Form with a photo upload can't be
   embedded). Only the name is required: fill in just what's changing (e.g. name + new photo). Blank fields and
   empty checkbox groups keep what's on the sheet; anything filled in replaces it (newer answers win). Typing a
   name looks them up and shows what the sheet has; the name box suggests everyone already on the sheet, and
   the page warns "Not on the sheet yet" before adding someone new (names must match exactly: first + last,
   capitals/extra spaces/middle names/bracket notes ignored, nicknames are NOT guessed).
2. **New Employee Onboarding form** — each response updates the sheet automatically (trigger
   `onOnboardingProfile`): name = Preferred First + Last, "populations" → ages, "modalities" → modalities,
   "comfortable" diagnoses → full specialty list, "specialist in" → focus specialties, Date of Birth → birthday
   (month/day), marketing photo → photo (JPG/PNG only; HEIC is skipped with a log note). LGBTQ/Transgender
   populations become an LGBTQ specialty. Office comes from **Start a new hire** (saved on their Employees
   folder as "Office: orem|provo|sandy"); with no office known they're only added to "website profiles".

## Where things go on the sheet
- **website profiles**: Name, Credential, Photo (Drive link; page uploads are saved in Employees → "Website
  profile photos"), Bio, SEO description, SimplePractice ID, Online booking, Show on website. New rows get
  Online booking = Yes, Show = Yes.
- **modalities**: B ages/populations, C modalities, E full specialty list ("comfortable"), F focus
  specialties, G gender. New people are inserted at the end of their office block (headings Sandy / Orem /
  PROVO / VIRTUAL).
- **openings** (new people only): a highlighted "Name: " line at the end of their office block (Orem → the
  last Orem block, Office B) with the credential in column C. **Front desk types their openings after the
  colon**; until then the website shows them as not accepting.
- **Birthdays** (new private tab, made automatically): Name, Birthday as MM-DD (never the year), Updated.
  Not read by the website build; only /api/birthdays reads it for the staff dashboard's "Upcoming birthdays"
  card (next 30 days, any approved staff).
- Insurance is still edited on the Insurances tab by hand. Moving someone to another office: move their rows.

## Going live
A **new** therapist appears on the website once their "website profiles" row has both a photo and a bio
(src/lib/team-loader.ts). Existing therapists keep their current bio when the cell is blank. The website
rebuilds ~15 minutes after the last sheet edit (docs/sheet-sync). The "Website status" column (Website feed
script) says what's missing.

## Code
- Page: src/pages/employeeportal/website-profile.astro (shrinks photos to max 1600 px JPEG in the browser).
- Functions: netlify/functions/website-profile.mts (/api/website-profile: GET ?names=1, GET ?name=, POST),
  netlify/functions/birthdays.mts (/api/birthdays). Both behind the staff gate (staff-gate.ts config);
  website-profile and the page use the reception role rule (src/data/staff-access.ts).
- Google: the "New hire folders" Apps Script (docs/new-hire-folder/apps-script.gs) — actions profile,
  getProfile, names, birthdays; onOnboardingProfile + setupOnboardingProfiles; saveOffice_ in the folder action.

## One-time setup (owner — Claude can't approve Google permissions)
1. In the "New hire folders" Apps Script project, replace the code with docs/new-hire-folder/apps-script.gs → Save.
2. Choose **setupOnboardingProfiles** → Run → Allow (Sheets + Forms). The log lists the tabs and office blocks
   it found.
3. Deploy → Manage deployments → edit → New version → Deploy (same URL).
4. In the "Website feed" project, replace the code with docs/sheet-sync/apps-script.gs (status text now
   mentions the bio) → Save → Deploy → Manage deployments → New version.
