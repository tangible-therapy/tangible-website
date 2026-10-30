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
 *  from frontdesk@ (docs/payroll-email/). Blank values never overwrite saved ones.
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
    if (!f.isTrashed()) return { id: f.getId(), url: f.getUrl(), name: f.getName(), created: false, payroll: savePayroll_(f, body) };
  }
  var folder = parent.createFolder(name);
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

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
