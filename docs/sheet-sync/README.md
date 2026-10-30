# Therapist finder ⇄ "tangible sheets" Google Sheet

The therapist finder, profiles and carousels get openings, availability, ages, approaches,
gender/language and insurance from the **tangible sheets** Google Sheet. Photos and bios come from
`src/content/team/<slug>.md`, unless the sheet's **website profiles** tab has a photo or bio for that
therapist (see below). New therapists can be added from that tab alone.

## How it works

1. Someone edits the **openings**, **modalities** or **Insurances** tab.
2. The "Website feed" Apps Script notes the change. Every 10 minutes it checks: if there were edits and
   nobody has edited for 5 minutes, it calls a Netlify **build hook**.
3. Netlify rebuilds the site (about 1–2 minutes). During the build, `src/lib/therapist-sheet.ts`
   reads the sheet through the script's private web feed and bakes the data into the HTML.
4. If the feed can't be read, the build fails on purpose and Netlify keeps the previous version live.

Result: changes show up on the site about 10–15 minutes after the last edit. No rebuild happens when
nothing changed.

Only these columns ever leave the sheet: openings **B:C**, modalities **A:G**, Insurances **A:L**,
website profiles **A:H** (plus the photos linked in its Photo column, and no other Drive files).
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

## The "website profiles" tab (new therapists, photos and bios)

Columns: **Name** (same spelling as the openings tab) · **Credential** · **Photo** (Google Drive
link) · **Bio** · **SEO description** (optional) · **SimplePractice clinician ID** (optional) ·
**Online booking** (Yes/No) · **Show on website** (Yes/No) · **Website status** (filled in by the
script). Each header has a note explaining it.

- **New therapist** (no profile on the website yet): add a row. They appear on the website (profile at
  `/ourteam/p/first-last`, the finder, filter pages and carousels) **only once the Photo link and the Bio
  are filled in** and the script can open the photo. Until then the status says "Waiting for photo".
  Office, status, ages, specialties and insurance still come from the openings / modalities /
  Insurances tabs, so add them there too (same name spelling).
- **Existing therapist**: add a row with their name and fill only what should change. A photo link
  replaces their photo, a bio replaces their bio, and so on. Blank cells keep what the website has.
  Deleting the row puts the website's own version back.
- Photos: JPG or PNG (iPhone HEIC must be saved as JPG). Upload to Google Drive, Share → Copy link,
  paste. The photo must be in, or shared with, brady@tangiblementalhealth.com's Drive. The build
  resizes it (max 1200×1600, WebP) into `public/images/team-sheet/` (made at build time, not committed).
  The site crops photos to 4:5 with the face area near the top, like the other team photos.
- Bio: one paragraph per line in the cell (Alt+Enter / Option+Enter between paragraphs). Lines starting
  with "•" or "-" become a bullet list.
- SEO description blank → "<Name> is a therapist at Tangible Therapy in Utah." plus the bio's first
  sentence (kept under ~155 characters).
- SimplePractice clinician ID here wins over `src/data/simplepractice.json`.
- Code: `src/lib/team-loader.ts` (adds/updates the team profiles), `src/lib/sheet-feed.ts` (reads the feed).
  Problems (photo can't be opened, web address already taken) are logged as `[team-sheet]` warnings in
  the Netlify build log; that therapist is skipped, the rest of the site still publishes.
- Local builds without `THERAPIST_SHEET_FEED` don't download photos, so sheet-only therapists don't
  appear there.

### Adding the tab (one time, owner)

1. Open the **Website feed** project in Apps Script, replace its code with the current
   `docs/sheet-sync/apps-script.gs`, and click **Save**.
2. Choose **createProfilesTab** and click **Run**. Google will ask for new permissions (to open the
   photos in Google Drive): click **Allow**. The sheet gets a **website profiles** tab.
3. Choose **setup** and click **Run** once (refreshes the triggers).
4. **Deploy → Manage deployments → Edit (pencil) → Version: New version → Deploy**, so the web feed
   uses the new code. The web app URL stays the same; nothing changes in Netlify.

## One-time setup (owner)

Claude can't do these steps (they need your Google and Netlify logins and permission approvals).

1. Go to **script.google.com → New project** (signed in as brady@tangiblementalhealth.com). Paste the
   contents of `docs/sheet-sync/apps-script.gs`, name the project "Website feed", and click **Save**.
   It's a separate project on purpose: the script already attached to the sheet ("New passdown response")
   has its own web app, and this keeps it untouched. The feed reads the sheet by its ID (`SHEET_ID`).
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
