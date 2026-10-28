/**
 * Tangible website <- "tangible sheets"
 *
 * A STANDALONE Apps Script project (script.google.com > New project, named "Website feed").
 * It is kept separate from the script already attached to the sheet ("New passdown response"),
 * so that script's own web app is untouched. It reads the sheet by ID (SHEET_ID below).
 * It does three things:
 *   1. doGet(): a private web feed the website reads when it builds. It returns ONLY the
 *      public columns below (never the Clients, NPI, Referalls or password tabs), and the
 *      photos linked in the "website profiles" tab (only those files, nothing else in Drive).
 *   2. Auto-rebuild: when the openings / modalities / Insurances / website profiles tabs are
 *      edited, it waits for edits to settle (5 min) and then asks Netlify to rebuild the site.
 *   3. The "website profiles" tab: new therapists' photos and bios (and updates for existing
 *      ones). Run createProfilesTab once to add the tab. Its last column ("Website status") is
 *      filled in by this script after each edit.
 *
 * Setup steps: docs/sheet-sync/README.md in the website repo.
 */

// Tab name -> columns sent to the website. Do not add tabs or columns with client information.
var FEED_TABS = {
  openings: { tab: 'openings', cols: 'B:C' },        // "Name: openings text", credential
  modalities: { tab: 'modalities', cols: 'A:G' },    // name, ages, modalities, style, preferences, specialties, gender
  insurances: { tab: 'Insurances', cols: 'A:L' },    // insurer columns with therapist names / ALL
};
// New therapists / profile updates. Columns A:I (see PROFILE_HEADERS below).
var PROFILES_TAB = 'website profiles';
var PROFILE_HEADERS = ['Name', 'Credential', 'Photo (Google Drive link)', 'Bio', 'SEO description (optional)',
  'SimplePractice clinician ID', 'Online booking', 'Show on website', 'Website status (automatic)'];
var PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
var SETTLE_MINUTES = 5;
// "tangible sheets" (owned by brady@tangiblementalhealth.com). Change this if the sheet is ever replaced.
var SHEET_ID = '1QIrJbIzoNtenFfOqAGBJzyx3nYSPVkLqOu7ECwLx-Kw';
function sheet_() { return SpreadsheetApp.openById(SHEET_ID); }

function doGet(e) {
  var props = PropertiesService.getScriptProperties();
  var key = props.getProperty('FEED_KEY');
  if (!key || !e || !e.parameter || e.parameter.key !== key) return json_({ error: 'unauthorized' });

  var ss = sheet_();
  if (e.parameter.photo) return json_(photo_(ss, String(e.parameter.photo)));
  var out = { generatedAt: new Date().toISOString() };
  Object.keys(FEED_TABS).forEach(function (name) {
    var sheet = findSheet_(ss, FEED_TABS[name].tab);
    if (!sheet) { out[name] = []; return; }
    var cols = FEED_TABS[name].cols.split(':');
    var last = Math.max(sheet.getLastRow(), 1);
    out[name] = sheet.getRange(cols[0] + '1:' + cols[1] + last).getDisplayValues();
  });
  out.profiles = profileRows_(ss);
  return json_(out);
}

// ---------- "website profiles" tab ----------

// Rows of the tab, with the Drive file ID pulled out of the Photo link.
function profileRows_(ss) {
  var sheet = findSheet_(ss, PROFILES_TAB);
  if (!sheet || sheet.getLastRow() < 2) return [];
  var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 8).getDisplayValues();
  var out = [];
  values.forEach(function (r, i) {
    if (!String(r[0]).trim()) return;
    var id = driveId_(r[2]);
    var updated = '';
    if (id) { try { updated = DriveApp.getFileById(id).getLastUpdated().toISOString(); } catch (err) { id = ''; } }
    out.push({ row: i + 2, name: r[0], credential: r[1], photoId: id, photoUpdated: updated, bio: r[3],
      seoDescription: r[4], clinicianId: r[5], booking: r[6], show: r[7] });
  });
  return out;
}

// One photo, only if its link is in the tab (so the feed can't be used to read other Drive files).
function photo_(ss, id) {
  var listed = profileRows_(ss).some(function (p) { return p.photoId === id; });
  if (!listed) return { error: 'not listed' };
  var blob = DriveApp.getFileById(id).getBlob();
  if (PHOTO_TYPES.indexOf(blob.getContentType()) === -1) return { error: 'not a JPG, PNG or WebP photo' };
  return { mimeType: blob.getContentType(), data: Utilities.base64Encode(blob.getBytes()) };
}

function driveId_(link) {
  var s = String(link || '').trim();
  var m = s.match(/\/d\/([\w-]{20,})/) || s.match(/[?&]id=([\w-]{20,})/) || s.match(/^([\w-]{25,})$/);
  return m ? m[1] : '';
}

// Fills the "Website status" column so staff can see what will happen.
function refreshProfileStatus() {
  var sheet = findSheet_(sheet_(), PROFILES_TAB);
  if (!sheet || sheet.getLastRow() < 2) return;
  var n = sheet.getLastRow() - 1;
  var values = sheet.getRange(2, 1, n, 8).getDisplayValues();
  var status = values.map(function (r) {
    if (!String(r[0]).trim()) return [''];
    if (/^(n|no)$/i.test(String(r[7]).trim())) return ['Hidden from the website (Show on website = No)'];
    if (!String(r[2]).trim()) return ['Waiting for photo (a new therapist goes on the website once a photo link is added)'];
    var id = driveId_(r[2]);
    if (!id) return ['Photo: paste the Google Drive link to the photo (Share > Copy link)'];
    try {
      var type = DriveApp.getFileById(id).getMimeType();
      if (PHOTO_TYPES.indexOf(type) === -1) return ['Photo must be a JPG or PNG (iPhone HEIC photos: save as JPG first)'];
    } catch (err) {
      return ["Can't open the photo: share it with brady@tangiblementalhealth.com or put it in his Drive"];
    }
    return ['Ready: the website updates about 15 minutes after the last edit'];
  });
  sheet.getRange(2, 9, n, 1).setValues(status);
}

// Run once: adds the "website profiles" tab (does nothing if it already exists).
function createProfilesTab() {
  var ss = sheet_();
  if (findSheet_(ss, PROFILES_TAB)) { console.log('The "' + PROFILES_TAB + '" tab already exists.'); return; }
  var sheet = ss.insertSheet(PROFILES_TAB);
  sheet.getRange(1, 1, 1, PROFILE_HEADERS.length).setValues([PROFILE_HEADERS])
    .setFontWeight('bold').setBackground('#5f7161').setFontColor('#ffffff').setWrap(true).setVerticalAlignment('middle');
  sheet.setFrozenRows(1);
  [180, 90, 220, 520, 260, 150, 110, 120, 300].forEach(function (w, i) { sheet.setColumnWidth(i + 1, w); });
  var body = sheet.getRange(2, 1, 200, PROFILE_HEADERS.length);
  body.setVerticalAlignment('top');
  sheet.getRange(2, 4, 200, 2).setWrap(true);
  sheet.getRange(2, 9, 200, 1).setFontColor('#6b6b6b').setFontStyle('italic').setWrap(true);
  var yesNo = SpreadsheetApp.newDataValidation().requireValueInList(['Yes', 'No'], true).setAllowInvalid(false).build();
  sheet.getRange(2, 7, 200, 2).setDataValidation(yesNo);
  var notes = [
    'Same spelling as on the openings tab (e.g. Jane Doe). Becomes the web address /ourteam/p/jane-doe.',
    'e.g. LCSW, CMHC, AMFT. Blank = use the credential on the openings tab.',
    'Upload the photo to Google Drive, then Share > Copy link and paste it here. JPG or PNG, portrait, face near the top. A NEW therapist only appears on the website once this is filled in. For an existing therapist, a link here replaces their current photo.',
    'Paste the bio. Press Alt+Enter (Option+Enter on Mac) between paragraphs. For an existing therapist, text here replaces their current bio; blank keeps it.',
    'Optional. The short text Google shows under the page title (about 150 characters). Blank = written automatically from the bio.',
    'Optional. SimplePractice > Settings > Widgets > Appointment request: the clinicianId for this therapist. Lets Book now open their own calendar.',
    'Blank or Yes = Book online button. No = Call button only.',
    'Blank or Yes = on the website. No = hide their profile.',
    'Filled in automatically. Do not type here.',
  ];
  sheet.getRange(1, 1, 1, notes.length).setNotes([notes]);
  console.log('Added the "' + PROFILES_TAB + '" tab.');
}

// Installable "On edit" / "On change" trigger (created by setup()).
function markChanged(e) {
  try {
    var name = e && e.range ? e.range.getSheet().getName().trim().toLowerCase() : '';
    var watched = Object.keys(FEED_TABS).map(function (k) { return FEED_TABS[k].tab.toLowerCase(); }).concat([PROFILES_TAB]);
    if (name && watched.indexOf(name) === -1) return; // edits on other tabs don't rebuild the site
    if (name === PROFILES_TAB && e.range.getColumn() <= 8) refreshProfileStatus();
  } catch (err) { /* onChange events have no range: treat as a change */ }
  PropertiesService.getScriptProperties().setProperty('CHANGED_AT', String(Date.now()));
}

// Time trigger every 10 minutes (created by setup()).
function rebuildIfChanged() {
  var props = PropertiesService.getScriptProperties();
  var changed = Number(props.getProperty('CHANGED_AT') || 0);
  if (!changed) return;
  if (Date.now() - changed < SETTLE_MINUTES * 60 * 1000) return; // still being edited
  var hook = props.getProperty('NETLIFY_BUILD_HOOK');
  if (!hook) { console.warn('NETLIFY_BUILD_HOOK script property is not set'); return; }
  var res = UrlFetchApp.fetch(hook, { method: 'post', muteHttpExceptions: true });
  console.log('Asked Netlify to rebuild: HTTP ' + res.getResponseCode());
  if (res.getResponseCode() < 300) {
    props.deleteProperty('CHANGED_AT');
    props.setProperty('LAST_REBUILD', new Date().toISOString());
  }
}

// Run once (select "setup" and click Run). Safe to run again; it replaces its own triggers.
function setup() {
  var ss = sheet_();
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (['markChanged', 'rebuildIfChanged'].indexOf(t.getHandlerFunction()) !== -1) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('markChanged').forSpreadsheet(ss).onEdit().create();
  ScriptApp.newTrigger('markChanged').forSpreadsheet(ss).onChange().create();
  ScriptApp.newTrigger('rebuildIfChanged').timeBased().everyMinutes(10).create();

  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('FEED_KEY')) props.setProperty('FEED_KEY', Utilities.getUuid().replace(/-/g, ''));
  console.log('Setup done. Feed key (add it to the Netlify THERAPIST_SHEET_FEED value as ?key=...): ' + props.getProperty('FEED_KEY'));
  console.log(props.getProperty('NETLIFY_BUILD_HOOK') ? 'Netlify build hook is set.' : 'Next: add the NETLIFY_BUILD_HOOK script property (see README).');
}

// Optional: run to rebuild the site right now.
function rebuildNow() {
  PropertiesService.getScriptProperties().setProperty('CHANGED_AT', String(Date.now() - SETTLE_MINUTES * 60 * 1000 - 1));
  rebuildIfChanged();
}

function findSheet_(ss, name) {
  var lower = name.toLowerCase();
  var all = ss.getSheets();
  for (var i = 0; i < all.length; i++) if (all[i].getName().trim().toLowerCase() === lower) return all[i];
  return null;
}
function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
