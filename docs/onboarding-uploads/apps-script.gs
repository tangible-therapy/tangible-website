/**
 * "Onboarding file mover" — Google Apps Script for the New Employee Onboarding Google Form.
 *
 * Automates step 8 of /reception-onboarding ("File their paperwork"). Every time a new hire submits the
 * onboarding form, this script:
 *   1. reads their name from the form answers,
 *   2. finds their "First Last" folder inside the shared Employee folder on Google Drive (the folder that
 *      "Start a new hire" makes) — or creates it if it isn't there yet,
 *   3. moves every file they uploaded (W-4, direct deposit, license, ...) into that folder, renamed
 *      "First Last - <question>" so they're easy to tell apart,
 *   4. emails front desk a short note with the folder link (or what went wrong, so they can do it by hand).
 *
 * It must be set up in the account that OWNS the form (brady@tangiblementalhealth.com), because uploaded
 * files belong to the form owner and only the owner can move them. Setup: docs/onboarding-uploads/README.md.
 * It is separate from the "Untitled project" alerts script, which keeps sending its normal alert email.
 * No passwords or keys are needed. Nothing is ever deleted.
 */

// New Employee Onboarding form (EDIT id, from /forms/d/<id>/edit).
var FORM_ID = '1kLzKJSbZHlz5cee4f7oRGPO9lwodyPYpkhidu8P5Pto';
// The shared "Employee" folder (same one the "Start a new hire" button uses).
var EMPLOYEE_FOLDER_ID = '1DCzPfLaGhpOIepDvmZ0krxgQl61bahwN';
// Who gets the "filed" / "couldn't file" note. Leave '' to send no email.
var NOTIFY_TO = 'frontdesk@tangiblementalhealth.com';

// How the script recognises the name questions (by question title, not case sensitive).
// Files and folders use the LEGAL name: "Legal First Name" + "Last Name". "Preferred First Name" is only a
// fallback (responses from before the legal-name question existed) and to find a folder front desk made
// under the preferred name.
var LEGAL_FIRST = /\blegal\s*first\s*name\b/i;
var FIRST_NAME = /\bfirst\s*name\b/i;
var LAST_NAME = /\b(last|sur)\s*name\b/i;
var FULL_NAME = /\b(full|legal|your)?\s*name\b/i;
// Name-like questions that are NOT the new hire's own name.
var NOT_THEIR_NAME = /emergency|contact|spouse|parent|supervisor|bank|account|reference|user|e-?mail|company|business|employer/i;

/** Runs on every form submission (installed by setup()). */
function onOnboardingSubmit(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000); // two submissions at once can't make two folders
  try {
    fileResponse_(e.response);
  } finally {
    lock.releaseLock();
  }
}

function fileResponse_(response) {
  var props = PropertiesService.getScriptProperties();
  var doneKey = 'done:' + response.getId();
  if (props.getProperty(doneKey)) return 'already filed';

  var items = response.getItemResponses();
  var name = nameFrom_(items);
  var uploads = [];
  items.forEach(function (ir) {
    if (ir.getItem().getType() !== FormApp.ItemType.FILE_UPLOAD) return;
    var ids = ir.getResponse() || [];
    ids.forEach(function (id) { uploads.push({ id: id, question: ir.getItem().getTitle() }); });
  });
  if (!uploads.length) { props.setProperty(doneKey, '1'); return 'no files'; }

  if (!name) {
    notify_('Onboarding files NOT filed (no name found)',
      'A New Employee Onboarding response came in with ' + uploads.length + ' file(s), but the script couldn\'t ' +
      'find the person\'s name in the answers, so the files were left in the form\'s upload folder.\n\n' +
      'Please move them by hand (step 8 on the Reception Onboarding page).\n\nFiles:\n' + fileLinks_(uploads));
    return 'no name';
  }

  var found = findFolder_(name);
  var folder = found.folder;
  var moved = [], copied = [], failed = [];
  var used = {};
  uploads.forEach(function (u) {
    try {
      var file = DriveApp.getFileById(u.id);
      var base = name.full + ' - ' + cleanTitle_(u.question);
      used[base] = (used[base] || 0) + 1;
      var newName = base + (used[base] > 1 ? ' (' + used[base] + ')' : '') + extension_(file.getName());
      file.setName(newName);
      try {
        file.moveTo(folder);
        moved.push(newName);
      } catch (moveErr) {
        // e.g. Drive won't move it into a Shared drive: put a copy there instead and leave the original.
        file.makeCopy(newName, folder);
        copied.push(newName);
      }
    } catch (err) {
      failed.push(u.question + ': ' + (err && err.message ? err.message : err) + '\n  ' + fileUrl_(u.id));
    }
  });

  if (!failed.length) props.setProperty(doneKey, '1');

  var lines = [];
  lines.push((found.created ? 'Created a new folder' : 'Found their folder') + ': ' + folder.getName());
  lines.push(folder.getUrl());
  if (found.created) lines.push('(No existing folder matched "' + name.full + '". If they already had one under a different spelling, move these files there and delete the new folder.)');
  lines.push('');
  if (moved.length) lines.push('Moved:\n- ' + moved.join('\n- '));
  if (copied.length) lines.push('Copied (Drive wouldn\'t move these; the original is still in the upload folder):\n- ' + copied.join('\n- '));
  if (failed.length) lines.push('Could NOT file these, please do it by hand:\n- ' + failed.join('\n- '));
  lines.push('');
  lines.push('Next: email payroll with the W-4 and direct deposit form attached (step 8 on the Reception Onboarding page).');
  notify_((failed.length ? 'Some onboarding files NOT filed: ' : 'Onboarding files filed: ') + name.full, lines.join('\n'));
  return lines.join('\n');
}

/** Picks the new hire's name out of the answers. Returns {full} or null. */
function nameFrom_(items) {
  var legal = '', first = '', last = '', full = '';
  items.forEach(function (ir) {
    var title = ir.getItem().getTitle();
    var type = ir.getItem().getType();
    if (type !== FormApp.ItemType.TEXT && type !== FormApp.ItemType.PARAGRAPH_TEXT) return;
    if (NOT_THEIR_NAME.test(title)) return;
    var answer = clean_(ir.getResponse());
    if (!answer) return;
    if (LEGAL_FIRST.test(title)) { if (!legal) legal = answer; }
    else if (FIRST_NAME.test(title)) { if (!first) first = answer; }
    else if (LAST_NAME.test(title)) { if (!last) last = answer; }
    else if (FULL_NAME.test(title)) { if (!full) full = answer; }
  });
  var preferred = first && last ? titleCase_(first + ' ' + last) : '';
  if ((legal || first) && last) full = (legal || first) + ' ' + last;
  if (!full) return null;
  full = titleCase_(full);
  return { full: full, alt: preferred && preferred !== full ? preferred : '' };
}

/**
 * Finds their folder in the Employee folder. Matches ignore capitals and extra spaces, and a middle name on
 * either side ("Sarah Jane Smith" matches "Sarah Smith"). Creates "First Last" if nothing matches.
 */
function findFolder_(name) {
  var parent = DriveApp.getFolderById(EMPLOYEE_FOLDER_ID);
  var want = key_(name.full);
  var wantShort = shortKey_(name.full);
  var exact = null, loose = null;
  var it = parent.getFolders();
  while (it.hasNext()) {
    var f = it.next();
    if (f.isTrashed()) continue;
    if (key_(f.getName()) === want) { exact = f; break; }
    if (!loose && shortKey_(f.getName()) === wantShort) loose = f;
  }
  if (exact || loose) return { folder: exact || loose, created: false };
  if (name.alt) { // front desk may have made the folder under their preferred name
    var altFound = findFolder_({ full: name.alt, noCreate: true });
    if (altFound) return altFound;
  }
  if (name.noCreate) return null;
  var parts = name.full.split(' ');
  var folderName = parts.length > 2 ? parts[0] + ' ' + parts[parts.length - 1] : name.full;
  return { folder: parent.createFolder(folderName), created: true };
}

/** One-time setup: checks access, lists the form's questions, and installs the on-submit trigger. */
function setup() {
  var form = FormApp.openById(FORM_ID);
  var parent = DriveApp.getFolderById(EMPLOYEE_FOLDER_ID);
  console.log('Form: "' + form.getTitle() + '"   Employee folder: "' + parent.getName() + '"');
  console.log('Questions (N = used as the name, n = fallback first name, F = file upload):');
  form.getItems().forEach(function (item) {
    var t = item.getTitle(), type = item.getType(), mark = '   ';
    if (type === FormApp.ItemType.FILE_UPLOAD) mark = ' F ';
    else if (LEGAL_FIRST.test(t)) mark = ' N ';
    else if (FIRST_NAME.test(t)) mark = ' n ';
    else if ((type === FormApp.ItemType.TEXT || type === FormApp.ItemType.PARAGRAPH_TEXT) && !NOT_THEIR_NAME.test(t) &&
             (LAST_NAME.test(t) || FULL_NAME.test(t))) mark = ' N ';
    if (type !== FormApp.ItemType.SECTION_HEADER && type !== FormApp.ItemType.PAGE_BREAK) console.log(mark + t);
  });
  ScriptApp.getProjectTriggers().forEach(function (tr) {
    if (tr.getHandlerFunction() === 'onOnboardingSubmit') ScriptApp.deleteTrigger(tr);
  });
  ScriptApp.newTrigger('onOnboardingSubmit').forForm(form).onFormSubmit().create();
  console.log('Done. New onboarding responses will now be filed automatically.');
}

/**
 * One time: adds a required "Legal First Name" question just above "Preferred First Name" (skips if it's
 * already there). Run setup afterwards to check the log.
 */
function addLegalNameQuestion() {
  var form = FormApp.openById(FORM_ID);
  var items = form.getItems();
  for (var i = 0; i < items.length; i++) if (LEGAL_FIRST.test(items[i].getTitle())) { console.log('Already there.'); return; }
  var target = -1;
  for (var j = 0; j < items.length; j++) if (/preferred\s*first\s*name/i.test(items[j].getTitle())) { target = items[j].getIndex(); break; }
  var q = form.addTextItem().setTitle('Legal First Name').setHelpText('As it appears on your W-4 and ID.').setRequired(true);
  if (target >= 0) form.moveItem(q.getIndex(), target);
  console.log('Added "Legal First Name"' + (target >= 0 ? ' above "Preferred First Name".' : ' at the end of the form.'));
}

/**
 * Optional: files responses that came in before setup (last 30 days). Safe to run more than once:
 * responses already filed are skipped.
 */
function fileRecentResponses() {
  var since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  FormApp.openById(FORM_ID).getResponses(since).forEach(function (r) {
    console.log(r.getTimestamp() + ': ' + fileResponse_(r));
  });
}

// ---- helpers ----
function clean_(s) { return String(s || '').replace(/[\\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80); }
function key_(s) { return String(s).toLowerCase().replace(/\s+/g, ' ').trim(); }
function shortKey_(s) { var p = key_(s).split(' '); return p.length > 1 ? p[0] + ' ' + p[p.length - 1] : p[0]; }
function titleCase_(s) {
  // Only fixes all-lowercase / ALL-CAPS answers; leaves "McKay" or "de la Cruz" as typed.
  if (s !== s.toLowerCase() && s !== s.toUpperCase()) return s;
  return s.toLowerCase().replace(/(^|[\s'-])(\S)/g, function (m, a, b) { return a + b.toUpperCase(); });
}
function cleanTitle_(t) {
  // "Upload your completed W-4 (download link on the onboarding page)" -> "W-4"
  var s = String(t || '').replace(/\([^)]*\)/g, ' ');
  s = clean_(s).replace(/^(please\s+)?(upload|attach)\s+(a\s+|your\s+)?(copy\s+of\s+)?(your\s+)?(completed\s+)?/i, '').slice(0, 60);
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Upload';
}
function extension_(n) { var m = /\.[A-Za-z0-9]{1,5}$/.exec(n); return m ? m[0] : ''; }
function fileUrl_(id) { return 'https://drive.google.com/file/d/' + id + '/view'; }
function fileLinks_(uploads) { return uploads.map(function (u) { return '- ' + u.question + ': ' + fileUrl_(u.id); }).join('\n'); }
function notify_(subject, body) {
  console.log(subject + '\n' + body);
  if (NOTIFY_TO) MailApp.sendEmail(NOTIFY_TO, subject, body);
}
