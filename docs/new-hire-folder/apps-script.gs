/**
 * "New hire folders" — Google Apps Script web app for the website's Reception Onboarding page.
 *
 * The website (netlify/functions/new-hire-folder.mts and new-hire-contract.mts) calls this script to:
 *  - action "folder"   : make (or find) a folder "First Last" inside the shared Employee folder.
 *  - action "contract" : copy the right employment contract (the Word files in the Management folder) into
 *                        that folder as a Google Doc, fill in name / effective date / pay / employer signer,
 *                        add hidden SignWell signature tags, and return it as a PDF for SignWell.
 *  - action "saveSigned": save the signed PDF from SignWell into the employee's folder.
 *  The "folder" action also saves the pay rate and start date front desk typed (when given) in the folder's
 *  DESCRIPTION as "Payroll info: pay rate <x> | start date <yyyy-mm-dd>", for the automatic payroll email sent
 *  from frontdesk@ (docs/payroll-email/). Blank values never overwrite saved ones. It also saves the office
 *  picked in the New hire box as "Office: orem|provo|sandy" (used when their onboarding answers arrive).
 *  - action "profile"   : add or update a therapist on the "tangible sheets" Google Sheet from the website's
 *                        Add/Update Website Profile page (website profiles, modalities, openings and the private
 *                        Birthdays tab). Only filled-in answers change anything; newer answers replace older.
 *  - action "getProfile": what the sheet has now for one therapist (to show on that page).
 *  - action "names"     : everyone already on the sheet (name suggestions on that page).
 *  - action "birthdays" : names + month/day for the staff dashboard (never the year).
 *  A trigger on the New Employee Onboarding form (onOnboardingProfile, installed by setupOnboardingProfiles)
 *  does the same "profile" update from each onboarding response. See docs/website-profile/README.md.
 * New folders and files inherit the Employee folder's sharing.
 *
 * Needs the Drive API advanced service (Services → Drive API, v3) to turn the Word contracts into Google Docs.
 * Setup: docs/new-hire-folder/README.md. The key lives only in this script's properties and in the
 * Netlify environment variable NEW_HIRE_FOLDER_SCRIPT — never in the website code.
 */

// The shared "Employees" folder (same link as step 1 on the onboarding page). Change it if the folder moves.
var EMPLOYEE_FOLDER_ID = '1DCzPfLaGhpOIepDvmZ0krxgQl61bahwN';

// The master contracts in the Management folder (Word files). Edit those files as usual; keep the sample
// wording "Employee Name Here", "8th day of July, 2025", "sixty dollars ($60)", "Brady Clegg" and the three
// signature/printed-name lines (________) so the script can find where things go.
var CONTRACTS = {
  fulltime: { id: '1BOPsbO1PN9X2KtWp9ewNN4VlZ_SFwkQ1', label: 'Full-Time' },
  parttime: { id: '1TG4vase1oRtZheldTlJvkxfHnEUpc-ut', label: 'Part-Time' },
  evening: { id: '1BZcWhfNXo38MdSkMqMzC_mHDB_IaInet', label: 'Part-Time Evening' },
};

function doPost(e) {
  var key = PropertiesService.getScriptProperties().getProperty('FOLDER_KEY');
  if (!key || !e || !e.parameter || e.parameter.key !== key) return json_({ error: 'unauthorized' });

  var body = {};
  try { body = JSON.parse((e.postData && e.postData.contents) || '{}'); } catch (err) { return json_({ error: 'Bad request.' }); }

  var lock = LockService.getScriptLock();
  lock.waitLock(25000); // two clicks at once can't make two folders
  try {
    var action = body.action || 'folder';
    if (action === 'folder') return json_(folder_(body));
    if (action === 'contract') return json_(contract_(body));
    if (action === 'saveSigned') return json_(saveSigned_(body));
    if (action === 'profile') return json_(upsertProfile_(profileFromWebsite_(body)));
    if (action === 'getProfile') return json_(getProfile_(body.name));
    if (action === 'names') return json_({ names: sheetNames_() });
    if (action === 'birthdays') return json_({ birthdays: birthdays_() });
    return json_({ error: 'Unknown action.' });
  } catch (err) {
    return json_({ error: 'Google said: ' + (err && err.message ? err.message : err) });
  } finally {
    lock.releaseLock();
  }
}

// Visiting the web app link in a browser just says it's running (no key needed, nothing is shown).
function doGet() { return json_({ ok: true, service: 'New hire folders' }); }

function cleanName_(s) { return String(s || '').replace(/[\\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim().slice(0, 120); }

function folder_(body) {
  var name = cleanName_(body.name);
  if (!name) return { error: 'Missing name.' };
  var parent = DriveApp.getFolderById(EMPLOYEE_FOLDER_ID);
  var existing = parent.getFoldersByName(name);
  while (existing.hasNext()) {
    var f = existing.next();
    if (!f.isTrashed()) { saveOffice_(f, body.office); return { id: f.getId(), url: f.getUrl(), name: f.getName(), created: false, payroll: savePayroll_(f, body) }; }
  }
  var folder = parent.createFolder(name);
  saveOffice_(folder, body.office);
  return { id: folder.getId(), url: folder.getUrl(), name: folder.getName(), created: true, payroll: savePayroll_(folder, body) };
}

/** Writes/updates the "Payroll info:" line in the folder description. Returns what's now saved. */
function savePayroll_(folder, body) {
  var pay = String(body.payRate || '').replace(/[|\r\n]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
  var start = /^\d{4}-\d{2}-\d{2}$/.test(String(body.startDate || '')) ? String(body.startDate) : '';
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

// The folder must be inside the Employees folder (so the website can't be used to write anywhere else).
function employeeFolder_(id) {
  var folder = DriveApp.getFolderById(String(id || ''));
  var parents = folder.getParents();
  while (parents.hasNext()) if (parents.next().getId() === EMPLOYEE_FOLDER_ID) return folder;
  throw new Error('That folder isn’t inside the Employees folder.');
}

// body: { folderId, type: fulltime|parttime|evening, name, date ("15th day of November, 2026"),
//         pay ("sixty-five dollars ($65)"), signerName ("Hannah Brown"), directorName ("Skyler Anderson" or "") }
function contract_(body) {
  var t = CONTRACTS[body.type];
  if (!t) return { error: 'Unknown contract type.' };
  var name = cleanName_(body.name);
  if (!name || !body.date || !body.pay || !body.signerName) return { error: 'Missing contract details.' };
  var folder = employeeFolder_(body.folderId);

  var title = 'Employment Contract ' + t.label + ' - ' + name + ' (sent for signing)';
  var copy = Drive.Files.copy({ name: title, mimeType: MimeType.GOOGLE_DOCS, parents: [folder.getId()] }, t.id, { supportsAllDrives: true });
  var doc = DocumentApp.openById(copy.id);
  var b = doc.getBody();

  replaceFirst_(b, 'Employee Name Here', name, 'the employee name ("Employee Name Here")');
  replaceFirst_(b, '[0-9]{1,2}(st|nd|rd|th) day of [A-Z][a-z]+, [0-9]{4}', body.date, 'the effective date (like "8th day of July, 2025")');
  // Anchored on "rate of" so only the amount is replaced ("...paid at a rate of sixty dollars ($60) per billable hour").
  replaceFirst_(b, 'rate of [a-z][a-z -]* dollars \\(\\$[0-9][0-9.,]*\\)', 'rate of ' + body.pay, 'the pay rate (like "rate of sixty dollars ($60)")');
  replaceFirst_(b, 'Brady Clegg', body.signerName, 'the employer printed name ("Brady Clegg")');

  // Signers, in SignWell's signing order: location director (if any) → COO → new hire.
  var dir = cleanName_(body.directorName);
  var coo = dir ? 2 : 1, hire = dir ? 3 : 2;

  // Signature block: 1st line = employer (COO) signature, 2nd = employee signature, 3rd = employee printed name.
  // They become SignWell text tags, coloured white so they don't show.
  var runs = [], r = null;
  while ((r = b.findText('_{10,}', r))) runs.push(r);
  if (runs.length !== 3) throw new Error('Expected 3 signature lines (________) in the ' + t.label + ' contract, found ' + runs.length + '.');
  var tags = ['{{s:' + coo + ':y::::180:26}}', '{{s:' + hire + ':y::::180:26}}', '{{af_n:' + hire + ':y::::180:16}}'];
  for (var i = runs.length - 1; i >= 0; i--) { // backwards, because two lines can share one paragraph
    var el = runs[i].getElement().asText(), s = runs[i].getStartOffset(), e = runs[i].getEndOffsetInclusive();
    // Swap only as many underscores as the tag is wide and keep the rest (white), so the line keeps its
    // width and whatever follows it (the EMPLOYEE column) stays where it was.
    var len = e - s + 1, k = Math.min(len, Math.ceil(tagUnits_(tags[i]) / 0.556));
    el.deleteText(s, s + k - 1);
    el.insertText(s, tags[i]);
    var end = s + tags[i].length + (len - k) - 1;
    el.setForegroundColor(s, end, '#ffffff');
    el.setUnderline(s, end, false);
  }
  removeSignatureImages_(b);
  if (dir) addDirectorBlock_(b, dir);
  doc.saveAndClose();

  var pdf = DriveApp.getFileById(copy.id).getAs('application/pdf');
  return { docId: copy.id, docUrl: 'https://docs.google.com/document/d/' + copy.id + '/edit', fileName: 'Employment Contract - ' + name + '.pdf', pdf: Utilities.base64Encode(pdf.getBytes()) };
}

// Approximate width of a text tag in em (Arial), to know how many underscores (0.556em each) it replaces.
function tagUnits_(t) {
  var w = { '{': 0.334, '}': 0.334, ':': 0.278, 's': 0.5, 'y': 0.5, 'f': 0.278, '_': 0.556 }, u = 0;
  for (var i = 0; i < t.length; i++) u += w[t[i]] || 0.556;
  return u;
}

// Adds "LOCATION DIRECTOR:" with a signature space (SignWell signer 1) and their printed name under the
// existing employer/employee signature block (after the last "Printed Name" line).
function addDirectorBlock_(body, name) {
  var hit = null, r = null;
  while ((r = body.findText('Printed Name', r))) hit = r;
  if (!hit) throw new Error('Couldn’t find the "Printed Name" line to add the location director under.');
  var top = hit.getElement();
  while (top.getParent() && top.getParent().getType() !== DocumentApp.ElementType.BODY_SECTION) top = top.getParent();
  var at = body.getChildIndex(top) + 1;
  // Match the font of the existing signature block.
  var ref = hit.getElement().asText(), font = ref.getFontFamily(hit.getStartOffset()) || 'Arial', size = ref.getFontSize(hit.getStartOffset()) || 11;
  var tag = '{{s:1:y::::180:26}}';
  // Same spacing as the employer/employee block, so SignWell's signature box doesn't cover the labels.
  var lines = [['', false], ['LOCATION DIRECTOR:', true], ['', false], [tag, false], ['Signature', false], ['', false], [name, false], ['Printed Name', false]];
  for (var i = 0; i < lines.length; i++) {
    var p = body.insertParagraph(at + i, lines[i][0] || ' ');
    p.setAlignment(DocumentApp.HorizontalAlignment.LEFT).setIndentFirstLine(0).setIndentStart(0).setSpacingBefore(0).setSpacingAfter(0);
    var tx = p.editAsText();
    tx.setFontFamily(font).setFontSize(size).setBold(lines[i][1]).setItalic(false).setUnderline(false).setBackgroundColor(null)
      .setForegroundColor(lines[i][0] === tag ? '#ffffff' : '#000000');
  }
}

// The masters have a pasted image of Brady Clegg's signature in the signature block. Remove any images from
// "IN WITNESS WHEREOF" to the end, so only the real SignWell signatures appear.
function removeSignatureImages_(body) {
  var start = body.findText('IN WITNESS WHEREOF');
  if (!start) return;
  var top = start.getElement();
  while (top.getParent() && top.getParent().getType() !== DocumentApp.ElementType.BODY_SECTION) top = top.getParent();
  for (var i = body.getChildIndex(top); i < body.getNumChildren(); i++) {
    var child = body.getChild(i);
    if (child.getType() === DocumentApp.ElementType.PARAGRAPH || child.getType() === DocumentApp.ElementType.LIST_ITEM) {
      var p = child.getType() === DocumentApp.ElementType.PARAGRAPH ? child.asParagraph() : child.asListItem();
      p.getPositionedImages().forEach(function (img) { p.removePositionedImage(img.getId()); });
    }
    if (child.findElement) {
      var found;
      while ((found = child.findElement(DocumentApp.ElementType.INLINE_IMAGE))) found.getElement().removeFromParent();
    }
  }
}

function replaceFirst_(body, pattern, value, label) {
  var found = body.findText(pattern);
  if (!found) throw new Error('Couldn’t find ' + label + ' in the contract template.');
  var el = found.getElement().asText(), s = found.getStartOffset(), e = found.getEndOffsetInclusive();
  el.deleteText(s, e);
  el.insertText(s, value);
  el.setBackgroundColor(s, s + value.length - 1, null); // drop the yellow "fill me in" highlight
}

// body: { folderId, fileName, pdf (base64) } — skips if a file with that name is already there.
function saveSigned_(body) {
  var folder = employeeFolder_(body.folderId);
  var fileName = cleanName_(body.fileName) || 'Signed employment contract.pdf';
  var existing = folder.getFilesByName(fileName);
  while (existing.hasNext()) {
    var f = existing.next();
    if (!f.isTrashed()) return { id: f.getId(), url: f.getUrl(), created: false };
  }
  var file = folder.createFile(Utilities.newBlob(Utilities.base64Decode(String(body.pdf || '')), 'application/pdf', fileName));
  return { id: file.getId(), url: file.getUrl(), created: true };
}

/** Run once from the editor: makes the key, checks the folders/contracts can be opened, and logs the key. */
function setup() {
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('FOLDER_KEY')) props.setProperty('FOLDER_KEY', Utilities.getUuid().replace(/-/g, ''));
  console.log('Employee folder found: "' + DriveApp.getFolderById(EMPLOYEE_FOLDER_ID).getName() + '".');
  Object.keys(CONTRACTS).forEach(function (k) { console.log('Contract found: "' + DriveApp.getFileById(CONTRACTS[k].id).getName() + '".'); });
  console.log('Drive API service: ' + (typeof Drive !== 'undefined' ? 'on' : 'OFF — add it under Services'));
  console.log('Folder key (add it to the end of the web app URL as ?key=...): ' + props.getProperty('FOLDER_KEY'));
}

/** Run from the editor to try the contract filling without SignWell: makes a filled copy in a "Contract test" folder. */
function testContract() {
  var f = folder_({ name: 'Contract test' });
  var out = contract_({ folderId: f.id, type: 'fulltime', name: 'Test Person', date: '1st day of December, 2026', pay: 'sixty-five dollars ($65)', signerName: 'Hannah Brown', directorName: 'Skyler Anderson' });
  console.log(out.error || ('Filled contract: ' + out.docUrl + ' (PDF ' + Math.round(out.pdf.length * 3 / 4 / 1024) + ' KB). Delete the "Contract test" folder when done.'));
}

// ====================================================================================================
// Website profiles on the "tangible sheets" Google Sheet (docs/website-profile/README.md)
// ====================================================================================================
var THERAPIST_SHEET_ID = '1QIrJbIzoNtenFfOqAGBJzyx3nYSPVkLqOu7ECwLx-Kw';
var ONBOARDING_FORM_ID = '1kLzKJSbZHlz5cee4f7oRGPO9lwodyPYpkhidu8P5Pto';
var PROFILES_TAB = 'website profiles', MODALITIES_TAB = 'modalities', OPENINGS_TAB = 'openings', BIRTHDAYS_TAB = 'Birthdays';
var PHOTOS_FOLDER_NAME = 'Website profile photos'; // made inside the Employees folder
var OFFICES = ['orem', 'provo', 'sandy', 'virtual'];
// Office headings as they appear in column A of "modalities" and column B of "openings".
// New people go at the end of their office's block (for Orem: the last Orem block, Office B).
var MOD_HEADINGS = { orem: /^orem\b/i, provo: /^provo\b/i, sandy: /^sandy\b/i, virtual: /^virtual\b/i };
var OPEN_HEADINGS = { orem: /^orem office/i, provo: /^provo office/i, sandy: /^sandy office/i, virtual: /^virtual only/i };
// "website profiles" columns (1-based): Name, Credential, Photo, Bio, SEO, SimplePractice ID, Online booking, Show.
var PC = { name: 1, credential: 2, photo: 3, bio: 4, seo: 5, spId: 6, booking: 7, show: 8 };
// "modalities" columns: A name, B ages/populations, C modalities, E full specialty list, F focus specialties, G gender.
var MC = { name: 1, ages: 2, modalities: 3, comfortable: 5, specialties: 6, gender: 7 };

function tsheet_() { return SpreadsheetApp.openById(THERAPIST_SHEET_ID); }
function tab_(ss, name) {
  var want = name.toLowerCase();
  var all = ss.getSheets();
  for (var i = 0; i < all.length; i++) if (all[i].getName().trim().toLowerCase() === want) return all[i];
  return null;
}
function str_(v, max) { return String(v == null ? '' : v).replace(/\s+$/g, '').replace(/^\s+/g, '').slice(0, max || 4000); }
function list_(v) { return (Array.isArray(v) ? v : String(v || '').split(/\s*,\s*/)).map(function (x) { return str_(x, 80); }).filter(Boolean); }
function titleCase2_(s) { return String(s || '').toLowerCase().replace(/(^|[\s\-'’])(\S)/g, function (m, a, c) { return a + c.toUpperCase(); }); }
function yesNo_(v) { var t = String(v || '').trim().toLowerCase(); return t === 'yes' || t === 'y' ? 'Yes' : t === 'no' || t === 'n' ? 'No' : ''; }

/** "Grace (Emma) Samuels" / "grace  samuels" -> "grace samuels" (first + last word, no notes in brackets).
 *  Openings lines are "Name: openings" or "Name - openings" / "Name- openings"; hyphenated names have no spaces. */
function nameKey_(s) {
  var t = String(s || '').replace(/\([^)]*\)/g, ' ').split(':')[0].split(/\s+-\s*|\s*-\s+/)[0];
  var w = t.toLowerCase().replace(/[^a-zÀ-ɏ\s'-]/g, ' ').trim().split(/\s+/).filter(Boolean);
  return w.length ? (w.length > 1 ? w[0] + ' ' + w[w.length - 1] : w[0]) : '';
}
/** Row of this person in a tab (same first + last name, ignoring capitals, extra spaces, middle names and
 *  notes), or 0. No guessing on nicknames: a different spelling would add a new person, so the website page
 *  suggests the names already on the sheet and warns before adding someone new. */
function findRow_(sheet, col, key) {
  var n = sheet.getLastRow();
  if (n < 1 || !key) return 0;
  var keys = sheet.getRange(1, col, n, 1).getDisplayValues().map(function (r) { return nameKey_(r[0]); });
  for (var i = 0; i < n; i++) if (keys[i] === key) return i + 1;
  return 0;
}

/** Everyone on the website profiles, modalities and openings tabs (for the page's name suggestions). */
function sheetNames_() {
  var ss = tsheet_(), seen = {}, out = [];
  [[PROFILES_TAB, 1], [MODALITIES_TAB, 1], [OPENINGS_TAB, 2]].forEach(function (t) {
    var sh = tab_(ss, t[0]); if (!sh || sh.getLastRow() < 2) return;
    sh.getRange(2, t[1], sh.getLastRow() - 1, 1).getDisplayValues().forEach(function (r) {
      var raw = String(r[0]).replace(/\([^)]*\)/g, ' ').split(':')[0].split(/\s+-\s*|\s*-\s+/)[0].replace(/\s+/g, ' ').trim();
      var k = nameKey_(raw);
      if (!k || k.indexOf(' ') === -1 || seen[k] || OFFICES.some(function (o) { return MOD_HEADINGS[o].test(raw) || OPEN_HEADINGS[o].test(raw); }) || /current openings|^ages|^name$/i.test(raw)) return;
      seen[k] = 1; out.push(raw);
    });
  });
  return out.sort();
}
/** Last row of an office's block (heading row .. row before the next heading), or 0 if the heading isn't there. */
function officeBlockEnd_(sheet, col, headings, office) {
  var n = sheet.getLastRow(), v = sheet.getRange(1, col, n, 1).getDisplayValues().map(function (r) { return String(r[0]).trim(); });
  var isHeading = function (t) { return OFFICES.some(function (o) { return headings[o].test(t); }); };
  var start = 0;
  for (var i = 0; i < n; i++) if (headings[office].test(v[i])) start = i + 1; // last matching heading
  if (!start) return 0;
  var end = start;
  for (var j = start; j < n; j++) { if (isHeading(v[j])) break; if (v[j]) end = j + 1; }
  return end;
}
function photosFolder_() {
  var parent = DriveApp.getFolderById(EMPLOYEE_FOLDER_ID), it = parent.getFoldersByName(PHOTOS_FOLDER_NAME);
  while (it.hasNext()) { var f = it.next(); if (!f.isTrashed()) return f; }
  return parent.createFolder(PHOTOS_FOLDER_NAME);
}
function saveOffice_(folder, office) {
  office = String(office || '').toLowerCase();
  if (OFFICES.indexOf(office) === -1) return;
  var desc = folder.getDescription() || '';
  var line = 'Office: ' + office;
  if (desc.indexOf(line) !== -1) return;
  var rest = desc.replace(/Office: .*(\n|$)/, '').trim();
  folder.setDescription(rest ? rest + '\n' + line : line);
}
/** Office saved by Start a new hire on their Employees folder ("Office: orem"), or ''. */
function officeFromFolder_(names) {
  var parent = DriveApp.getFolderById(EMPLOYEE_FOLDER_ID);
  for (var i = 0; i < names.length; i++) {
    if (!names[i]) continue;
    var it = parent.getFoldersByName(names[i]);
    while (it.hasNext()) {
      var f = it.next(); if (f.isTrashed()) continue;
      var m = /Office: (\w+)/.exec(f.getDescription() || '');
      if (m && OFFICES.indexOf(m[1]) !== -1) return m[1];
    }
  }
  return '';
}
/** "1990-07-14" / "07/14/1990" / "07-14" -> "07-14" (month-day only; the year is never stored). */
function monthDay_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'MM-dd');
  var s = String(v || '').trim(), m;
  if ((m = /^\d{4}-(\d{1,2})-(\d{1,2})/.exec(s))) return pad2_(m[1]) + '-' + pad2_(m[2]);
  if ((m = /^(\d{1,2})[\/-](\d{1,2})([\/-]\d{2,4})?$/.exec(s))) return pad2_(m[1]) + '-' + pad2_(m[2]);
  return '';
}
function pad2_(x) { return ('0' + Number(x)).slice(-2); }

/** "Lesbian", "Gay", "Bisexual", "Queer", "Transgender", "LGBTQ+" -> one "LGBTQ" in the populations column
 *  (the website shows it as an LGBTQ+ specialty; it's a population, not a diagnosis, so it stays out of E/F). */
function lgbtqPopulation_(list) {
  var re = /lgbt|lesbian|^gay$|bisexual|queer|transgender/i, had = list.some(function (x) { return re.test(x); });
  var out = list.filter(function (x) { return !re.test(x); });
  if (had) out.push('LGBTQ');
  return out;
}

/** Website page -> profile object. photo = { name, type, data (base64) } is saved to Drive first. */
function profileFromWebsite_(b) {
  var p = {
    name: titleCase2_(cleanName_(b.name)), credential: str_(b.credential, 40), office: String(b.office || '').toLowerCase(),
    bio: str_(b.bio, 6000), seo: str_(b.seo, 300), spId: str_(b.spId, 40).replace(/[^\w-]/g, ''),
    booking: yesNo_(b.booking), show: yesNo_(b.show), gender: str_(b.gender, 40),
    ages: list_(b.ages), modalities: list_(b.modalities), comfortable: list_(b.comfortable), specialties: list_(b.specialties),
    birthday: monthDay_(b.birthday), photoUrl: '', source: 'website',
  };
  p.ages = lgbtqPopulation_(p.ages);
  if (b.photo && b.photo.data) {
    var type = String(b.photo.type || '').toLowerCase();
    if (['image/jpeg', 'image/png'].indexOf(type) === -1) throw new Error('The photo must be a JPG or PNG.');
    var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HHmm');
    var file = photosFolder_().createFile(Utilities.newBlob(Utilities.base64Decode(String(b.photo.data)), type, p.name + ' - website photo ' + stamp + (type === 'image/png' ? '.png' : '.jpg')));
    p.photoUrl = file.getUrl();
  }
  return p;
}

/**
 * Adds or updates one therapist. Only non-empty values are written, so a submission with just a name and a
 * photo changes only the photo. New people get a row in "website profiles" and, if their office is known, in
 * "modalities" and "openings" (openings left for front desk to fill, highlighted). Returns what happened.
 */
function upsertProfile_(p) {
  if (!p.name || p.name.split(' ').length < 2) return { error: 'Please give their first and last name.' };
  var ss = tsheet_(), key = nameKey_(p.name), out = { name: p.name, changes: [], notes: [] };

  // website profiles
  var prof = tab_(ss, PROFILES_TAB);
  if (!prof) return { error: 'The "website profiles" tab is missing from the tangible sheet.' };
  var row = findRow_(prof, PC.name, key), isNew = !row;
  var vals = { credential: p.credential, photo: p.photoUrl, bio: p.bio, seo: p.seo, spId: p.spId, booking: p.booking, show: p.show };
  if (isNew) {
    prof.appendRow([p.name, p.credential, p.photoUrl, p.bio, p.seo, p.spId, p.booking || 'Yes', p.show || 'Yes']);
    row = prof.getLastRow();
    out.changes.push('Added to website profiles');
  } else {
    var changed = [];
    Object.keys(vals).forEach(function (k) {
      if (!vals[k]) return;
      var cell = prof.getRange(row, PC[k]);
      if (String(cell.getValue()) !== vals[k]) { cell.setValue(vals[k]); changed.push(k === 'spId' ? 'SimplePractice ID' : k === 'seo' ? 'SEO description' : k); }
    });
    if (changed.length) out.changes.push('Website profile: ' + changed.join(', '));
  }
  var current = prof.getRange(row, 1, 1, 8).getDisplayValues()[0];
  if (!current[PC.photo - 1] || !current[PC.bio - 1]) out.notes.push('A new therapist goes on the website once both a photo and a bio are in. Missing: ' + [!current[PC.photo - 1] && 'photo', !current[PC.bio - 1] && 'bio'].filter(Boolean).join(' and ') + '.');

  // modalities
  var mod = tab_(ss, MODALITIES_TAB);
  var office = OFFICES.indexOf(p.office) !== -1 ? p.office : '';
  if (mod) {
    var mrow = findRow_(mod, MC.name, key);
    var mvals = { ages: p.ages.join(', '), modalities: p.modalities.join(', '), comfortable: p.comfortable.join(', '), specialties: p.specialties.join(', '), gender: p.gender };
    var any = Object.keys(mvals).some(function (k) { return mvals[k]; });
    if (!mrow && any) {
      var end = office ? officeBlockEnd_(mod, MC.name, MOD_HEADINGS, office) : 0;
      if (end) { mod.insertRowAfter(end); mrow = end + 1; mod.getRange(mrow, MC.name).setValue(p.name); out.changes.push('Added to modalities (' + office + ')'); }
      else out.notes.push('Not added to the modalities tab: their office isn’t known. Add them under their office there.');
    }
    if (mrow) {
      var mchanged = [];
      Object.keys(mvals).forEach(function (k) {
        if (!mvals[k]) return;
        var cell = mod.getRange(mrow, MC[k]);
        if (String(cell.getValue()) !== mvals[k]) { cell.setValue(mvals[k]); mchanged.push({ ages: 'populations', modalities: 'modalities', comfortable: 'diagnoses', specialties: 'specialties', gender: 'gender' }[k]); }
      });
      if (mchanged.length) out.changes.push('Modalities tab: ' + mchanged.join(', '));
    }
  }

  // openings (new people only: a line "Name: " under their office for front desk to fill in)
  var op = tab_(ss, OPENINGS_TAB);
  if (op) {
    var orow = findRow_(op, 2, key);
    if (!orow) {
      var oend = office ? officeBlockEnd_(op, 2, OPEN_HEADINGS, office) : 0;
      if (oend) {
        op.insertRowAfter(oend); orow = oend + 1;
        op.getRange(orow, 2).setValue(p.name + ': ').setBackground('#fff2cc').setNote('Added by the website profile form. Front desk: type their openings after the colon (e.g. "Tuesday 1 PM, Thursday 3 PM" or "Waitlist").');
        if (p.credential) op.getRange(orow, 3).setValue(p.credential);
        out.changes.push('Added to openings (' + office + ', openings still to fill in)');
      } else out.notes.push('Not added to the openings tab: their office isn’t known. Add them under their office there.');
    } else if (p.credential && !String(op.getRange(orow, 3).getValue()).trim()) {
      op.getRange(orow, 3).setValue(p.credential);
    }
  }

  // birthdays (private tab, month-day only)
  if (p.birthday) {
    var bt = tab_(ss, BIRTHDAYS_TAB);
    if (!bt) { bt = ss.insertSheet(BIRTHDAYS_TAB); bt.getRange(1, 1, 1, 3).setValues([['Name', 'Birthday (MM-DD)', 'Updated']]).setFontWeight('bold'); bt.setFrozenRows(1); bt.getRange('B:B').setNumberFormat('@'); }
    var brow = findRow_(bt, 1, key);
    var stampNow = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    if (!brow) { bt.appendRow([p.name, p.birthday, stampNow]); out.changes.push('Birthday saved'); }
    else if (String(bt.getRange(brow, 2).getDisplayValue()) !== p.birthday) { bt.getRange(brow, 2, 1, 2).setValues([[p.birthday, stampNow]]); out.changes.push('Birthday updated'); }
  }

  if (!out.changes.length) out.changes.push('Nothing new: the sheet already had these answers');
  out.isNew = isNew;
  return out;
}

/** Current sheet values for one person (shown on the website page so people only fill in changes). */
function getProfile_(name) {
  var key = nameKey_(name), ss = tsheet_(), out = { found: false };
  if (!key) return out;
  var prof = tab_(ss, PROFILES_TAB), row = prof ? findRow_(prof, PC.name, key) : 0;
  if (row) { var r = prof.getRange(row, 1, 1, 9).getDisplayValues()[0]; out.found = true; out.profile = { name: r[0], credential: r[1], photo: r[2], bio: r[3], seo: r[4], spId: r[5], booking: r[6], show: r[7], status: r[8] }; }
  var mod = tab_(ss, MODALITIES_TAB), mrow = mod ? findRow_(mod, MC.name, key) : 0;
  if (mrow) { var m = mod.getRange(mrow, 1, 1, 7).getDisplayValues()[0]; out.found = true; out.modalities = { name: m[0], ages: m[1], modalities: m[2], comfortable: m[4], specialties: m[5], gender: m[6] }; }
  var op = tab_(ss, OPENINGS_TAB), orow = op ? findRow_(op, 2, key) : 0;
  if (orow) { out.found = true; out.openings = { line: op.getRange(orow, 2).getDisplayValue(), credential: op.getRange(orow, 3).getDisplayValue() }; }
  var bt = tab_(ss, BIRTHDAYS_TAB), brow = bt ? findRow_(bt, 1, key) : 0;
  if (brow) out.birthday = bt.getRange(brow, 2).getDisplayValue();
  return out;
}

/** [{ name, md: "MM-DD" }] from the Birthdays tab. */
function birthdays_() {
  var bt = tab_(tsheet_(), BIRTHDAYS_TAB);
  if (!bt || bt.getLastRow() < 2) return [];
  return bt.getRange(2, 1, bt.getLastRow() - 1, 2).getDisplayValues()
    .map(function (r) { return { name: str_(r[0], 80), md: monthDay_(r[1]) }; })
    .filter(function (x) { return x.name && x.md; });
}

// ---------- New Employee Onboarding form -> profile ----------
/** Trigger (installed by setupOnboardingProfiles): each onboarding response updates the tangible sheet. */
function onOnboardingProfile(e) {
  var res = e && e.response;
  if (!res) return;
  var a = {};
  res.getItemResponses().forEach(function (ir) { a[ir.getItem().getTitle().trim().toLowerCase()] = ir.getResponse(); });
  var pick = function (re) { for (var k in a) if (re.test(k)) return a[k]; return ''; };
  var preferred = str_(pick(/^preferred first name/), 60), legal = str_(pick(/^legal first name/), 60), last = str_(pick(/^last name/), 60);
  var name = titleCase2_(cleanName_((preferred || legal) + ' ' + last));
  if (!last || !(preferred || legal)) return;

  var pops = lgbtqPopulation_(list_(pick(/populations/)));
  var comfortable = list_(pick(/comfortable/));

  var photoUrl = '', notes = [];
  var ids = pick(/professional photo/);
  ids = Array.isArray(ids) ? ids : ids ? [ids] : [];
  if (ids.length) {
    try {
      var f = DriveApp.getFileById(ids[0]);
      if (['image/jpeg', 'image/png'].indexOf(f.getMimeType()) !== -1) photoUrl = f.getUrl();
      else notes.push('Their photo isn’t a JPG or PNG (' + f.getMimeType() + '), so it wasn’t used. Upload a JPG on the Add/Update Website Profile page.');
    } catch (err) { notes.push('Couldn’t open their photo: ' + err.message); }
  }
  var office = officeFromFolder_([name, legal ? titleCase2_(cleanName_(legal + ' ' + last)) : '']);
  var out = upsertProfile_({
    name: name, credential: '', office: office, bio: '', seo: '', spId: '', booking: '', show: '', gender: '',
    ages: pops, modalities: list_(pick(/modalities/)), comfortable: comfortable, specialties: list_(pick(/specialist/)),
    birthday: monthDay_(pick(/date of birth|birthday/)), photoUrl: photoUrl, source: 'onboarding',
  });
  console.log('[onboarding profile] ' + name + ': ' + JSON.stringify(out) + (notes.length ? ' ' + notes.join(' ') : ''));
}

/** Run once: installs the onboarding-form trigger (replaces an old one) and checks the sheet tabs. */
function setupOnboardingProfiles() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'onOnboardingProfile') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('onOnboardingProfile').forForm(FormApp.openById(ONBOARDING_FORM_ID)).onFormSubmit().create();
  var ss = tsheet_();
  [PROFILES_TAB, MODALITIES_TAB, OPENINGS_TAB].forEach(function (t) { console.log(t + ' tab: ' + (tab_(ss, t) ? 'found' : 'MISSING')); });
  OFFICES.forEach(function (o) {
    console.log(o + ': modalities block ends at row ' + officeBlockEnd_(tab_(ss, MODALITIES_TAB), MC.name, MOD_HEADINGS, o) + ', openings block ends at row ' + officeBlockEnd_(tab_(ss, OPENINGS_TAB), 2, OPEN_HEADINGS, o));
  });
  console.log('Trigger installed: onboarding answers now update the tangible sheet.');
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
