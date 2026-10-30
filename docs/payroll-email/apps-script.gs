/**
 * "Payroll email" — Google Apps Script in the frontdesk@tangiblementalhealth.com account.
 *
 * Automates the payroll part of step 8 on /reception-onboarding. Every 10 minutes it looks in frontdesk@'s
 * Gmail for "Onboarding files filed: <name>" emails (sent by the "Onboarding file mover" script in brady@'s
 * account, docs/onboarding-uploads/). For each one it:
 *   1. opens the new hire's folder (must be inside the shared Employee folder),
 *   2. reads the pay rate and start date that "Start a new hire" saved in the folder's description
 *      ("Payroll info: pay rate <x> | start date <yyyy-mm-dd>", docs/new-hire-folder/),
 *   3. finds "<Name> - W-4" and "<Name> - Direct Deposit form" in the folder,
 *   4. emails payroll FROM frontdesk@ with name, pay rate, start date and both files attached,
 *   5. labels the filing email "Payroll sent" so it's never sent twice.
 * If anything is missing it sends nothing and emails front desk once: "Payroll email waiting: <name>",
 * saying what to fix. It keeps checking for 14 days, so fixing it is enough. Nothing is ever deleted.
 *
 * Setup: docs/payroll-email/README.md. No passwords or keys.
 */

var PAYROLL_TO = 'nsbcpayroll@gmail.com';
var FRONT_DESK = 'frontdesk@tangiblementalhealth.com';
// Only filing emails from this sender are trusted (the account that runs "Onboarding file mover").
var FILER = 'brady@tangiblementalhealth.com';
// The shared "Employee" folder. Folders outside it are never used.
var EMPLOYEE_FOLDER_ID = '1DCzPfLaGhpOIepDvmZ0krxgQl61bahwN';
var SENT_LABEL = 'Payroll sent';
var WAIT_LABEL = 'Payroll waiting';
var GREETING = 'Hey Chelsea,';
var SIGN_OFF = 'Thank you!\nTangible Therapy front desk';
var KEEP_TRYING_DAYS = 14;

/** Runs every 10 minutes (installed by setup()). */
function checkForNewHires() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return; // a previous run is still going
  try {
    run_(false);
  } finally {
    lock.releaseLock();
  }
}

/** Run by hand from the editor: logs what WOULD be sent, sends nothing, changes nothing. */
function preview() { run_(true); }

function run_(dryRun) {
  var sent = label_(SENT_LABEL), wait = label_(WAIT_LABEL);
  var threads = GmailApp.search('from:' + FILER + ' subject:"Onboarding files filed" -label:payroll-sent newer_than:' + KEEP_TRYING_DAYS + 'd', 0, 50);
  threads.forEach(function (t) {
    try {
      var r = handle_(t, dryRun);
      console.log((dryRun ? '[preview] ' : '') + r.name + ': ' + r.result);
      if (dryRun) return;
      if (r.result === 'sent' || r.result === 'already sent') { t.addLabel(sent); t.removeLabel(wait); }
      else if (r.result.indexOf('waiting') === 0) t.addLabel(wait);
    } catch (err) {
      console.log('Error on "' + t.getFirstMessageSubject() + '": ' + (err && err.message ? err.message : err));
    }
  });
}

function handle_(thread, dryRun) {
  var props = PropertiesService.getScriptProperties();
  // The filing email itself (not a reply someone added to the thread).
  var msg = thread.getMessages().filter(function (m) {
    return /^Onboarding files filed: /.test(m.getSubject()) && m.getFrom().toLowerCase().indexOf(FILER) !== -1;
  })[0];
  if (!msg) return { name: thread.getFirstMessageSubject(), result: 'skipped (not a filing email from ' + FILER + ')' };
  var name = msg.getSubject().replace(/^Onboarding files filed: /, '').trim();
  var m = /drive\.google\.com\/drive\/folders\/([\w-]+)/.exec(msg.getPlainBody());
  if (!m) return waiting_(thread, name, ['the folder link in the filing email'], dryRun);

  var folder = DriveApp.getFolderById(m[1]);
  if (!inEmployeeFolder_(folder)) return { name: name, result: 'skipped (folder is not in the Employee folder)' };
  if (props.getProperty('sent:' + folder.getId())) return { name: name, result: 'already sent' };

  var info = payrollInfo_(folder.getDescription() || '');
  var w4 = newest_(folder, / - W-4\b/i), dd = newest_(folder, / - Direct Deposit/i);
  var missing = [];
  if (!info.pay) missing.push('their pay rate');
  if (!info.start) missing.push('their start date');
  if (!w4) missing.push('the W-4 file in their folder');
  if (!dd) missing.push('the direct deposit file in their folder');
  if (missing.length) return waiting_(thread, name, missing, dryRun, folder);

  var body = GREETING + '\n\nPlease add our new employee to payroll:\n\n' +
    'Name: ' + name + '\n' +
    'Pay rate: ' + info.pay + '\n' +
    'Start date: ' + prettyDate_(info.start) + '\n\n' +
    'Their W-4 and direct deposit form are attached.\n\n' + SIGN_OFF;
  if (dryRun) {
    console.log('[preview] To ' + PAYROLL_TO + ' — "New employee: ' + name + '"\n' + body + '\nAttachments: ' + w4.getName() + ', ' + dd.getName());
    return { name: name, result: 'ready to send' };
  }
  GmailApp.sendEmail(PAYROLL_TO, 'New employee: ' + name, body, {
    attachments: [w4.getBlob(), dd.getBlob()],
    name: 'Tangible Therapy Front Desk',
  });
  props.setProperty('sent:' + folder.getId(), new Date().toISOString());
  return { name: name, result: 'sent' };
}

/** Emails front desk once per filing email about what's missing; keeps checking until fixed. */
function waiting_(thread, name, missing, dryRun, folder) {
  var key = 'waitnote:' + thread.getId();
  var props = PropertiesService.getScriptProperties();
  var result = 'waiting for ' + missing.join(', ');
  if (dryRun || props.getProperty(key)) return { name: name, result: result };
  var fixPay = missing.some(function (x) { return /pay rate|start date/.test(x); });
  var fixFile = missing.some(function (x) { return /file/.test(x); });
  var body = 'The payroll email for ' + name + ' hasn\'t been sent yet because this is missing:\n- ' + missing.join('\n- ') + '\n\n' +
    (fixPay ? 'Pay rate / start date: on the Reception Onboarding page, type their name, pay rate and start date in the New hire box and click "Start a new hire". It finds their existing folder and saves them.\n\n' : '') +
    (fixFile ? 'Missing file: save it in their folder named "' + name + ' - W-4" or "' + name + ' - Direct Deposit form".\n\n' : '') +
    'The payroll email then goes out by itself within 10 minutes (for the next ' + KEEP_TRYING_DAYS + ' days). ' +
    'Or send it by hand with the button in step 8, and it won\'t be sent again.' +
    (folder ? '\n\nTheir folder: ' + folder.getUrl() : '');
  GmailApp.sendEmail(FRONT_DESK, 'Payroll email waiting: ' + name, body);
  props.setProperty(key, '1');
  return { name: name, result: result };
}

/** Reads "Payroll info: pay rate <x> | start date <yyyy-mm-dd>" from the folder description. */
function payrollInfo_(desc) {
  var m = /Payroll info: pay rate (.*?) \| start date (\S*)/.exec(desc);
  return { pay: m && m[1] !== '-' ? m[1].trim() : '', start: m && /^\d{4}-\d{2}-\d{2}$/.test(m[2]) ? m[2] : '' };
}

function newest_(folder, re) {
  var best = null, it = folder.getFiles();
  while (it.hasNext()) {
    var f = it.next();
    if (f.isTrashed() || !re.test(f.getName())) continue;
    if (!best || f.getDateCreated() > best.getDateCreated()) best = f;
  }
  return best;
}

function inEmployeeFolder_(folder) {
  var parents = folder.getParents();
  while (parents.hasNext()) if (parents.next().getId() === EMPLOYEE_FOLDER_ID) return true;
  return false;
}

function prettyDate_(ymd) {
  var p = ymd.split('-');
  return Utilities.formatDate(new Date(+p[0], +p[1] - 1, +p[2], 12), 'America/Denver', 'MMMM d, yyyy');
}

function label_(n) { return GmailApp.getUserLabelByName(n) || GmailApp.createLabel(n); }

// ---------- "Front desk mailer" web app ----------
// "Finish setup" on /reception-onboarding asks the website (/api/new-hire-welcome) to send the new hire's
// welcome email; the website calls this web app so it goes out FROM frontdesk@. The website builds the text
// (src/data/welcome-email.ts) and only sends to new hires. This side only accepts the welcome email, needs the
// key, and sends each person's welcome once (unless the website asks to resend).
// Deploy → New deployment → Web app, Execute as Me, Who has access Anyone. Netlify env var
// NEW_HIRE_MAIL_SCRIPT = web app URL + ?key=<MAILER_KEY> (run setupMailer to make/see the key).
function doPost(e) {
  var key = PropertiesService.getScriptProperties().getProperty('MAILER_KEY');
  if (!key || !e || !e.parameter || e.parameter.key !== key) return json_({ error: 'unauthorized' });
  var b = {};
  try { b = JSON.parse((e.postData && e.postData.contents) || '{}'); } catch (err) { return json_({ error: 'Bad request.' }); }
  if (b.kind !== 'welcome' || b.subject !== 'Welcome to Tangible!') return json_({ error: 'Only the welcome email can be sent this way.' });
  var to = (Array.isArray(b.to) ? b.to : []).map(function (x) { return String(x).trim().toLowerCase(); })
    .filter(function (x) { return /^[^\s@,;]+@[^\s@,;]+\.[a-z]{2,}$/.test(x); }).slice(0, 2);
  var body = String(b.body || '').slice(0, 4000);
  if (!to.length || !body) return json_({ error: 'Missing recipient or text.' });
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var props = PropertiesService.getScriptProperties(), doneKey = 'welcome:' + to.join(',');
    if (props.getProperty(doneKey) && !b.resend) return json_({ sent: false, already: true, to: to });
    GmailApp.sendEmail(to.join(','), b.subject, body, { name: 'Tangible Therapy' });
    props.setProperty(doneKey, new Date().toISOString());
    return json_({ sent: true, to: to });
  } catch (err) {
    return json_({ error: 'Gmail said: ' + (err && err.message ? err.message : err) });
  } finally {
    lock.releaseLock();
  }
}

// Opening the web app link in a browser just says it's running (nothing else is shown).
function doGet() { return json_({ ok: true, service: 'Front desk mailer' }); }

/** Run once from the editor: makes the mailer key (if needed) and logs it for the Netlify variable. */
function setupMailer() {
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('MAILER_KEY')) props.setProperty('MAILER_KEY', Utilities.getUuid().replace(/-/g, ''));
  console.log('Running as: ' + Session.getActiveUser().getEmail());
  console.log('Mailer key (add it to the end of the web app URL as ?key=...): ' + props.getProperty('MAILER_KEY'));
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** One-time setup: checks access, makes the labels and installs the 10-minute check. */
function setup() {
  var me = Session.getActiveUser().getEmail();
  console.log('Running as: ' + me + (me && me.toLowerCase() !== FRONT_DESK ? '  <-- should be ' + FRONT_DESK + '!' : ''));
  console.log('Employee folder: "' + DriveApp.getFolderById(EMPLOYEE_FOLDER_ID).getName() + '"');
  label_(SENT_LABEL); label_(WAIT_LABEL);
  ScriptApp.getProjectTriggers().forEach(function (tr) {
    if (tr.getHandlerFunction() === 'checkForNewHires') ScriptApp.deleteTrigger(tr);
  });
  ScriptApp.newTrigger('checkForNewHires').timeBased().everyMinutes(10).create();
  console.log('Done. Payroll emails will now go out automatically. Run "preview" any time to see what would be sent.');
}
