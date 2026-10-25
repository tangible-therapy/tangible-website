# Therapist finder ⇄ "tangible sheets" Google Sheet

The therapist finder (preview at `/ourteam-preview`) gets openings, availability, ages, approaches,
gender/language and insurance from the **tangible sheets** Google Sheet. Names, photos, bios and
office/specialty tags still come from `src/content/team/<slug>.md`.

## How it works

1. Someone edits the **openings**, **modalities** or **Insurances** tab.
2. An Apps Script in the sheet notes the change. Every 10 minutes it checks: if there were edits and
   nobody has edited for 5 minutes, it calls a Netlify **build hook**.
3. Netlify rebuilds the site (about 1–2 minutes). During the build, `src/lib/therapist-sheet.ts`
   reads the sheet through the script's private web feed and bakes the data into the HTML.
4. If the feed can't be read, the build fails on purpose and Netlify keeps the previous version live.

Result: changes show up on the site about 10–15 minutes after the last edit. No rebuild happens when
nothing changed.

Only these columns ever leave the sheet: openings **B:C**, modalities **A:G**, Insurances **A:L**.
The Clients, NPI, Referalls and password tabs are never read. Never put client information in those
columns.

## How the sheet is read

- **openings** — rows like `Name: text` under office headings (`Orem Office A`, `PROVO OFFICE`,
  `SANDY OFFICE`, `VIRTUAL ONLY`). Column C = credential.
  - "no longer accepting" → not accepting (no tag)
  - "waitlist", "4-6 week waitlist", "6-8 weeks" → **Waitlist**
  - "any white" → **Accepting**, all times of day
  - "1 new client" → **Accepting**
  - day/time slots, e.g. `Tuesday 1 PM(b) Wednesday 2 PM` → **Accepting** + Mornings/Afternoons/Evenings
    (times without AM/PM: 7–11 = morning, 12 and 1–6 = afternoon/evening; before 12 = morning,
    12–5 PM = afternoon, 5 PM+ = evening)
  - anything in (parentheses) is ignored, so internal notes and (B)/(W) codes never show.
    "(in person only)" removes Telehealth; "(No more teens)" removes Teens.
  - therapists under **VIRTUAL ONLY** show as Telehealth only.
- **modalities** — B ages (kids/teens/adults/elders, couples, families), C approaches, F specialties,
  G gender (checked against the bio's pronouns), "Spanish" anywhere → Spanish-speaking.
- **Insurances** — row 1 = insurer names; each column lists therapist names, `ALL`, or
  `minus interns` (removes CSW-I / MFT-I / Intern therapists from that insurer).
- Names are matched to website profiles. Sheet spellings that differ from the website are listed in
  `ALIASES` in `src/lib/therapist-sheet.ts` (e.g. Joseph → Joe Johnson, Noelle Barry → Berry).
  Unmatched names show as "sheet notes" on the preview page and in the Netlify build log.
- Therapists not found in the openings tab fall back to the website's `current-openings` tag.

## One-time setup (owner)

Claude can't do these steps (they need your Google and Netlify logins and permission approvals).

1. Open **tangible sheets** → **Extensions → Apps Script**. Paste the contents of
   `docs/sheet-sync/apps-script.gs`, name the project "Website feed", and click **Save**.
2. Choose **setup** in the function menu and click **Run**. Approve the permissions Google asks for.
   The log shows a **feed key** — copy it.
3. Click **Deploy → New deployment → Web app**. Execute as: **Me**. Who has access: **Anyone**.
   Click **Deploy** and copy the **Web app URL** (ends in `/exec`).
   (The key keeps the feed private: without it the feed returns only `unauthorized`.)
4. In Netlify: **Project configuration → Build & deploy → Build hooks → Add build hook**,
   name "Sheet update", branch **main**. Copy the hook URL.
5. Back in Apps Script: **Project Settings (gear) → Script properties → Add**:
   `NETLIFY_BUILD_HOOK` = the hook URL. Save.
6. In Netlify: **Project configuration → Environment variables → Add a variable**:
   `THERAPIST_SHEET_FEED` = `<Web app URL>?key=<feed key>`, all scopes/contexts.
7. In Netlify, **Deploys → Trigger deploy**. The preview banner on `/ourteam-preview` should now say
   "Live data".

If you later change the script code, use **Deploy → Manage deployments → Edit → New version** so the
web app URL stays the same.

## Updating the fallback copy

`src/data/therapist-sheet-snapshot.json` is used when `THERAPIST_SHEET_FEED` isn't set (local builds).
To refresh it, open the feed URL in a browser and save the JSON over that file.
