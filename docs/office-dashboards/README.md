# Office dashboards ⇄ "Team Dashboard" Google Sheets

The Employee Portal (/employeeportal) shows each person their home office's dashboard:

- **Next training meeting** (and the next few) from the **Training Meeting** tab — date, topic, trainer,
  skill assignment, DSM and "Additional Items". If the signed-in person's first name is in the trainer,
  skill assignment or DSM column, it's highlighted for them.
- **Find a Room** (separate page) from the **… Master Schedule** tabs (one per building, e.g. Office A, Office B).
  The schedules are read from the cell **colors**: the key in the top rows (a name next to a colored square)
  says whose color is whose. Text typed in a schedule cell (e.g. "group") is used instead of the color.
  A color that isn't in the key shows as "Booked". So keep every color in the key.
- **Suggest a training topic**: adds a row to the **Training Suggestions** tab (topic, "Name (email)").

Find a Room is its own page, /employeeportal/rooms. There, staff can also tap **Use this room** to claim a room for today; claims are
saved by the website (Netlify Blobs store "room-claims", /api/rooms), not written into the sheet, so the Master Schedule is
never changed. Associates also see their supervised hours on the dashboard (from the Hours Tracker).

Only Orem is connected so far (`dashboard: true` in `src/data/staff-access.ts`). Directors and the owner
can view other offices with the "View office" picker.

## How it works

1. A standalone Apps Script, **"Office dashboard feed"** (in brady@tangiblementalhealth.com's account), reads
   the office sheets by ID. Its code is `docs/office-dashboards/apps-script.gs` (keep the two in sync).
2. The Netlify environment variable **OFFICE_DASHBOARD_FEED** holds the script's web app address with its
   private key (`…/exec?key=…`). Never put that address in the repo.
3. Every hour, `netlify/functions/dashboard-refresh.mts` copies the data into Netlify Blobs (store
   "dashboards"). Visits read that copy. If it's more than ~75 minutes old (or on Deploy Previews, which don't
   run scheduled functions), the first visit fetches fresh data. If the sheet can't be reached, the last copy is
   shown with a note. No site rebuild happens, so this uses no deploy credits.
4. `/api/dashboard` (netlify/functions/dashboard.mts) serves the data only to signed-in staff, for their own
   office (directors/owner: any office), and sends suggestions to the script.

## One-time setup (owner)

1. Go to script.google.com → **New project**. Name it "Office dashboard feed".
2. Replace the code with everything in `docs/office-dashboards/apps-script.gs`. Save.
3. **Deploy → New deployment** → type **Web app** → Execute as **Me**, Who has access **Anyone** → Deploy.
   Google will ask you to allow access to your sheets — click Allow (only the owner should do this).
4. In the editor, choose **setup** in the function menu and click **Run**. Open **Execution log** and copy the
   line `Netlify OFFICE_DASHBOARD_FEED = https://script.google.com/…/exec?key=…`.
5. Netlify → Project configuration → Environment variables → **Add** `OFFICE_DASHBOARD_FEED` with that address
   (all deploy contexts). Then trigger a new deploy (or ask Claude to rebuild the preview).
6. Optional check: run **testFeed** in the editor; the log lists the training meetings, each building's rooms
   and the color key it found.

If you change the script later: **Deploy → Manage deployments → Edit → Version: New version → Deploy**
(the address stays the same).

## Adding Provo or Sandy

1. Add the office's sheet ID to `OFFICE_SHEETS` in the script (and in apps-script.gs), redeploy a new version.
   The sheet needs the same tab names: "… Master Schedule", "Training Meeting", "Training Suggestions".
2. Set `dashboard: true` for that office in `src/data/staff-access.ts`.
