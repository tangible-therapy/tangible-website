/**
 * "New hire folders" — Google Apps Script web app for the website's Reception Onboarding page.
 *
 * When front desk clicks "Start a new hire" on tangiblementalhealth.com/reception-onboarding, the website
 * asks this script to make a folder named "First Last" inside the shared Employee folder on Google Drive.
 * New folders inherit the Employee folder's sharing, so everyone who has that folder can see them.
 * If a folder with that exact name is already there, it returns that one instead of making a duplicate.
 *
 * It also saves the pay rate and start date front desk typed (when given) in the folder's DESCRIPTION, as a
 * line "Payroll info: pay rate <x> | start date <yyyy-mm-dd>". The "Payroll email" script in frontdesk@'s
 * account reads that line to email payroll (docs/payroll-email/). Blank values never overwrite saved ones.
 * The folder already holds the signed contract with the same pay, so this doesn't widen who can see it.
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
  var pay = String(body.payRate || '').replace(/[|\r\n]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
  var start = /^\d{4}-\d{2}-\d{2}$/.test(String(body.startDate || '')) ? String(body.startDate) : '';

  var lock = LockService.getScriptLock();
  lock.waitLock(20000); // two clicks at once can't make two folders
  try {
    var parent = DriveApp.getFolderById(EMPLOYEE_FOLDER_ID);
    var existing = parent.getFoldersByName(name);
    while (existing.hasNext()) {
      var f = existing.next();
      if (!f.isTrashed()) return json_({ url: f.getUrl(), name: f.getName(), created: false, payroll: savePayroll_(f, pay, start) });
    }
    var folder = parent.createFolder(name);
    return json_({ url: folder.getUrl(), name: folder.getName(), created: true, payroll: savePayroll_(folder, pay, start) });
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

/** Writes/updates the "Payroll info:" line in the folder description. Returns what's now saved. */
function savePayroll_(folder, pay, start) {
  var desc = folder.getDescription() || '';
  var m = /Payroll info: pay rate (.*?) \| start date (\S*)/.exec(desc);
  var oldPay = m && m[1] !== '-' ? m[1] : '', oldStart = m && m[2] !== '-' ? m[2] : '';
  var newPay = pay || oldPay, newStart = start || oldStart;
  if (newPay || newStart) {
    var line = 'Payroll info: pay rate ' + (newPay || '-') + ' | start date ' + (newStart || '-');
    var rest = desc.replace(/Payroll info: .*(\n|$)/, '').trim();
    if (line !== (m && m[0])) folder.setDescription(rest ? rest + '\n' + line : line);
  }
  return { payRate: !!newPay, startDate: newStart };
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
