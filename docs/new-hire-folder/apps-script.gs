/**
 * "New hire folders" — Google Apps Script web app for the website's Reception Onboarding page.
 *
 * When front desk clicks "Start a new hire" on tangiblementalhealth.com/reception-onboarding, the website
 * asks this script to make a folder named "First Last" inside the shared Employee folder on Google Drive.
 * New folders inherit the Employee folder's sharing, so everyone who has that folder can see them.
 * If a folder with that exact name is already there, it returns that one instead of making a duplicate.
 *
 * Setup: docs/new-hire-folder/README.md. The key lives only in this script's properties and in the
 * Netlify environment variable NEW_HIRE_FOLDER_SCRIPT — never in the website code.
 */

// The shared "Employee" folder (same link as step 1 on the onboarding page). Change it if the folder moves.
var EMPLOYEE_FOLDER_ID = '1DCzPfLaGhpOIepDvmZ0krxgQl61bahwN';

function doPost(e) {
  var key = PropertiesService.getScriptProperties().getProperty('FOLDER_KEY');
  if (!key || !e || !e.parameter || e.parameter.key !== key) return json_({ error: 'unauthorized' });

  var body = {};
  try { body = JSON.parse((e.postData && e.postData.contents) || '{}'); } catch (err) { return json_({ error: 'Bad request.' }); }
  var name = String(body.name || '').replace(/[\\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim().slice(0, 120);
  if (!name) return json_({ error: 'Missing name.' });

  var lock = LockService.getScriptLock();
  lock.waitLock(20000); // two clicks at once can't make two folders
  try {
    var parent = DriveApp.getFolderById(EMPLOYEE_FOLDER_ID);
    var existing = parent.getFoldersByName(name);
    while (existing.hasNext()) {
      var f = existing.next();
      if (!f.isTrashed()) return json_({ url: f.getUrl(), name: f.getName(), created: false });
    }
    var folder = parent.createFolder(name);
    return json_({ url: folder.getUrl(), name: folder.getName(), created: true });
  } catch (err) {
    return json_({ error: 'Google Drive said: ' + (err && err.message ? err.message : err) });
  } finally {
    lock.releaseLock();
  }
}

// Visiting the web app link in a browser just says it's running (no key needed, nothing is shown).
function doGet() { return json_({ ok: true, service: 'New hire folders' }); }

/** Run once from the editor: makes the key, checks the Employee folder can be opened, and logs the key. */
function setup() {
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('FOLDER_KEY')) props.setProperty('FOLDER_KEY', Utilities.getUuid().replace(/-/g, ''));
  var parent = DriveApp.getFolderById(EMPLOYEE_FOLDER_ID);
  console.log('Employee folder found: "' + parent.getName() + '".');
  console.log('Folder key (add it to the end of the web app URL as ?key=...): ' + props.getProperty('FOLDER_KEY'));
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
