/**
 * Tangible website <- "tangible sheets"
 *
 * Paste this into the "tangible sheets" Google Sheet: Extensions > Apps Script.
 * It does two things:
 *   1. doGet(): a private web feed the website reads when it builds. It returns ONLY the
 *      public columns below (never the Clients, NPI, Referalls or password tabs).
 *   2. Auto-rebuild: when the openings / modalities / Insurances tabs are edited, it waits
 *      for edits to settle (5 min) and then asks Netlify to rebuild the site.
 *
 * Setup steps: docs/sheet-sync/README.md in the website repo.
 */

// Tab name -> columns sent to the website. Do not add tabs or columns with client information.
var FEED_TABS = {
  openings: { tab: 'openings', cols: 'B:C' },        // "Name: openings text", credential
  modalities: { tab: 'modalities', cols: 'A:G' },    // name, ages, modalities, style, preferences, specialties, gender
  insurances: { tab: 'Insurances', cols: 'A:L' },    // insurer columns with therapist names / ALL
};
var SETTLE_MINUTES = 5;

function doGet(e) {
  var props = PropertiesService.getScriptProperties();
  var key = props.getProperty('FEED_KEY');
  if (!key || !e || !e.parameter || e.parameter.key !== key) return json_({ error: 'unauthorized' });

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var out = { generatedAt: new Date().toISOString() };
  Object.keys(FEED_TABS).forEach(function (name) {
    var sheet = findSheet_(ss, FEED_TABS[name].tab);
    if (!sheet) { out[name] = []; return; }
    var cols = FEED_TABS[name].cols.split(':');
    var last = Math.max(sheet.getLastRow(), 1);
    out[name] = sheet.getRange(cols[0] + '1:' + cols[1] + last).getDisplayValues();
  });
  return json_(out);
}

// Installable "On edit" / "On change" trigger (created by setup()).
function markChanged(e) {
  try {
    var name = e && e.range ? e.range.getSheet().getName().toLowerCase() : '';
    var watched = Object.keys(FEED_TABS).map(function (k) { return FEED_TABS[k].tab.toLowerCase(); });
    if (name && watched.indexOf(name) === -1) return; // edits on other tabs don't rebuild the site
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
  var ss = SpreadsheetApp.getActiveSpreadsheet();
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
