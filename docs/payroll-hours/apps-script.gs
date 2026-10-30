/**
 * "Payroll hours" — Google Apps Script web app behind the Employee Portal's Submit Hours page
 * (/employeeportal/submit-hours → netlify/functions/submit-hours.mts). Runs in brady@tangiblementalhealth.com's
 * account, which can edit both spreadsheets. Setup and how it works: docs/payroll-hours/README.md.
 *
 * What one submission does:
 *  1. "Tangible Data" → tab "Payroll Form": every answer (hours, PTO, meetings, no-shows, billable hours) is
 *     saved like the old Google Form did, plus the pay period and the person's work email. Submitting again in
 *     the same pay period REPLACES that row instead of adding another one.
 *  2. "Tangible Data" → tab "Payroll" (the roster): their row's number cells are filled in, but only cells
 *     that are typed values. Cells with a formula are never touched.
 *  3. The payroll company's "Brady A Clegg LLC Payroll" → the NEWEST pay-period tab (worked out from the dates
 *     in the tab names, e.g. "10.24.26 to 11.6.26"): ONLY the Hours and Vacation cells of their row are written.
 *     Nothing else on that sheet is changed.
 *  If someone isn't on a sheet yet, they're added (name only, plus their numbers) ONLY when the website has
 *  verified they're a recent new hire (made with "Start a new hire" on Reception Onboarding). Anyone else who
 *  can't be found is saved in step 1 only. Each place is saved on its own: whenever any of the three can't be
 *  saved, the others still are, and front desk gets one email listing what was and wasn't saved.
 *
 * The key lives only in this script's properties and in the Netlify environment variable PAYROLL_HOURS_SCRIPT
 * (web app URL + ?key=...) — never in the website code.
 */

// ---- Spreadsheets (change these if a file is replaced) ----
var DATA_SHEET_ID = '1JFs5ENfbAr4_QFXWTVoEXULX4Xxbhk5NdF9PIjfp-ow';    // "Tangible Data" (brady@)
var FORM_TAB = 'Payroll Form';                                         // where the Google Form saved answers
var ROSTER_TAB = 'Payroll';                                            // the per-person summary
var PAYROLL_SHEET_ID = '14VvM9WbHBolNmk59hroDHpLDncXRVOXT_f3S6te_NQ4'; // "Brady A Clegg LLC Payroll" (payroll company)

// Who hears about hours that couldn't be put on the payroll company's sheet.
var ALERT_TO = 'frontdesk@tangiblementalhealth.com';

// Names that can't be matched automatically: website name (lower case) → name as written on the sheets.
// Usually not needed: last name + first name (or a short form of it, like Abi/Abigail) are matched.
var ALIASES = {
  'noelle berry': 'Elizabeth N. Berry',
};

// ------------------------------------------------------------------------------------------------------------

function doPost(e) {
  var key = PropertiesService.getScriptProperties().getProperty('PAYROLL_KEY');
  if (!key || !e || !e.parameter || e.parameter.key !== key) return json_({ error: 'unauthorized' });
  var body = {};
  try { body = JSON.parse((e.postData && e.postData.contents) || '{}'); } catch (err) { return json_({ error: 'Bad request.' }); }

  var lock = LockService.getScriptLock();
  lock.waitLock(25000); // two submissions at once can't write the same row twice
  try {
    if (body.action === 'period') return json_(periodInfo_(body));
    if (body.action === 'submit') return json_(submit_(body));
    return json_({ error: 'Unknown action.' });
  } catch (err) {
    console.error(err);
    return json_({ error: String(err && err.message || err).slice(0, 300) });
  } finally {
    lock.releaseLock();
  }
}

function doGet() { return json_({ ok: true, service: 'Payroll hours' }); }

// ---------- pay period (from the payroll company's tab names) ----------

/** "10.24.26 to 11.6.26" → { tab, start: '2026-10-24', end: '2026-11-06' }, or null. */
function parseTab_(name) {
  var m = /^\s*(\d{1,2})\.(\d{1,2})\.(\d{2,4})\s*(?:to|-|–)\s*(\d{1,2})\.(\d{1,2})\.(\d{2,4})\s*$/i.exec(name);
  if (!m) return null;
  var y = function (v) { v = Number(v); return v < 100 ? 2000 + v : v; };
  var iso = function (yy, mm, dd) { return y(yy) + '-' + pad2_(mm) + '-' + pad2_(dd); };
  return { tab: name, start: iso(m[3], m[1], m[2]), end: iso(m[6], m[4], m[5]) };
}

/** The newest pay period (latest start date), or a named one if it still exists. */
function period_(wanted) {
  var tabs = SpreadsheetApp.openById(PAYROLL_SHEET_ID).getSheets().map(function (s) { return parseTab_(s.getName()); }).filter(Boolean);
  if (!tabs.length) throw new Error('No pay-period tab (like "10.24.26 to 11.6.26") was found on the payroll sheet.');
  if (wanted) { var w = tabs.filter(function (t) { return t.tab === wanted; })[0]; if (w) return w; }
  tabs.sort(function (a, b) { return a.start < b.start ? 1 : a.start > b.start ? -1 : 0; });
  return tabs[0];
}

/** For the page: which pay period it is, and what this person already submitted for it (to pre-fill). */
function periodInfo_(b) {
  var p = period_();
  var email = String(b.email || '').toLowerCase();
  var sh = tab_(SpreadsheetApp.openById(DATA_SHEET_ID), FORM_TAB);
  var cols = formColumns_(sh);
  var row = email ? findFormRow_(sh, cols, p.tab, email) : 0;
  var previous = null;
  if (row) {
    var v = sh.getRange(row, 1, 1, sh.getLastColumn()).getValues()[0];
    previous = {
      at: v[cols.time] instanceof Date ? v[cols.time].toISOString() : String(v[cols.time] || ''),
      hours: v[cols.hours], pto: v[cols.pto], meetings: v[cols.meetings], noShows: v[cols.noShows],
    };
  }
  return { period: p, previous: previous };
}

// ---------- submit ----------

function submit_(b) {
  var n = function (v) { if (v === '' || v == null) return ''; var x = Number(v); return isFinite(x) && x >= 0 && x <= 300 ? Math.round(x * 100) / 100 : NaN; };
  var hours = n(b.hours), pto = n(b.pto), meetings = n(b.meetings), noShows = n(b.noShows);
  if (hours === '' || [hours, pto, meetings, noShows].some(function (x) { return x !== '' && isNaN(x); })) return { error: 'The hours must be numbers.' };
  var email = String(b.email || '').toLowerCase();
  var names = (Array.isArray(b.names) ? b.names : [b.name]).map(function (x) { return str_(x, 80); }).filter(Boolean);
  if (!email || !names.length) return { error: 'Missing name or email.' };
  var newHire = b.newHire && b.newHire.first && b.newHire.last ? { first: str_(b.newHire.first, 40), last: str_(b.newHire.last, 40) } : null;

  var p = period_(b.periodTab);
  var nums = { hours: hours, pto: pto, meetings: meetings, noShows: noShows, billable: Math.max(0, (hours || 0) - (meetings || 0)) };
  var out = { ok: true, period: p, form: null, roster: null, payroll: null };

  // Each place is saved on its own: if one fails, the others are still saved, and front desk gets ONE email
  // saying what didn't line up so they can fix it by hand.
  var safe = function (fn) { try { return fn(); } catch (err) { return { status: 'error', detail: String(err && err.message || err).slice(0, 300) }; } };
  out.form = safe(function () { return saveFormRow_(p, names[0], email, nums); });
  out.roster = safe(function () { return saveRoster_(names, nums, newHire); });
  out.payroll = safe(function () { return savePayroll_(p, names, nums, newHire); });
  console.log(JSON.stringify({ who: email, period: p.tab, form: out.form, roster: out.roster, payroll: out.payroll }));

  var ok = function (r) { return r && (r.status === 'added' || r.status === 'updated' || r.status === 'written'); };
  var places = [
    ['Payroll company sheet ("' + p.tab + '" tab): Hours ' + hours + ', Vacation ' + (pto === '' ? 0 : pto), out.payroll],
    ['Tangible Data → "' + FORM_TAB + '" tab (all answers)', out.form],
    ['Tangible Data → "' + ROSTER_TAB + '" tab (their row)', out.roster],
  ];
  var failed = places.filter(function (x) { return !ok(x[1]); });
  if (failed.length) {
    try {
      MailApp.sendEmail(ALERT_TO, 'Payroll sheets don\'t match — please fix by hand: ' + names[0],
        names[0] + ' (' + email + ') submitted hours on the Employee Portal for the pay period ' + p.tab + '.\n\n' +
        'What they entered:\n  Hours worked: ' + hours + '\n  PTO: ' + (pto === '' ? 0 : pto) + '\n  Meetings/supervision/consults: ' + (meetings === '' ? 0 : meetings) + '\n  No-shows: ' + (noShows === '' ? 0 : noShows) + '\n\n' +
        'Saved:\n' + (places.filter(function (x) { return ok(x[1]); }).map(function (x) { return '  ✓ ' + x[0]; }).join('\n') || '  (nothing)') + '\n\n' +
        'NOT saved — please add by hand:\n' + failed.map(function (x) { return '  ✗ ' + x[0] + '\n      Reason: ' + (x[1] && (x[1].detail || x[1].status) || 'unknown'); }).join('\n') + '\n\n' +
        'If a name isn\'t found every pay period, add it to ALIASES in the "Payroll hours" script.');
      out.alerted = true;
    } catch (err) { console.error('alert email failed: ' + err); }
  }
  return out;
}

// ---------- 1. Tangible Data → "Payroll Form" ----------

/** Column positions (0-based) in "Payroll Form", adding "Pay period" and "Email" headers if missing. */
function formColumns_(sh) {
  var lastCol = Math.max(sh.getLastColumn(), 1);
  var head = sh.getRange(1, 1, 1, lastCol).getDisplayValues()[0].map(function (h) { return String(h).toLowerCase(); });
  var find = function (test) { for (var i = 0; i < head.length; i++) if (test(head[i])) return i; return -1; };
  var cols = {
    time: find(function (h) { return h.indexOf('timestamp') === 0; }),
    name: find(function (h) { return h === 'name'; }),
    hours: find(function (h) { return h.indexOf('hours worked') === 0; }),
    // Matched by how each question STARTS: the first question's long header also mentions PTO, meetings and
    // no shows, so "contains" would pick the wrong column.
    pto: find(function (h) { return h.indexOf('hours of pto') === 0 || h.indexOf('pto') === 0; }),
    meetings: find(function (h) { return h.indexOf('how many of those hours') === 0 || h.indexOf('meetings') === 0; }),
    noShows: find(function (h) { return h.indexOf('how many no shows') === 0 || h.indexOf('no shows') === 0; }),
    billable: find(function (h) { return h.indexOf('billable') === 0; }),
    period: find(function (h) { return h === 'pay period'; }),
    email: find(function (h) { return h === 'email'; }),
  };
  ['time', 'name', 'hours', 'pto', 'meetings', 'noShows'].forEach(function (k) {
    if (cols[k] < 0) throw new Error('The "' + FORM_TAB + '" tab is missing its "' + k + '" column (headers changed?).');
  });
  var used = {};
  ['time', 'name', 'hours', 'pto', 'meetings', 'noShows'].forEach(function (k) {
    if (used[cols[k]]) throw new Error('Two answers matched the same column on the "' + FORM_TAB + '" tab (headers changed?).');
    used[cols[k]] = true;
  });
  if (cols.period < 0) { cols.period = lastCol; sh.getRange(1, lastCol + 1).setValue('Pay period'); lastCol++; }
  if (cols.email < 0) { cols.email = lastCol; sh.getRange(1, lastCol + 1).setValue('Email'); }
  return cols;
}

function findFormRow_(sh, cols, tabName, email) {
  var last = sh.getLastRow();
  if (last < 2) return 0;
  var per = sh.getRange(2, cols.period + 1, last - 1, 1).getDisplayValues();
  var em = sh.getRange(2, cols.email + 1, last - 1, 1).getDisplayValues();
  for (var i = 0; i < per.length; i++) if (per[i][0] === tabName && String(em[i][0]).toLowerCase() === email) return i + 2;
  return 0;
}

function saveFormRow_(p, name, email, nums) {
  var sh = tab_(SpreadsheetApp.openById(DATA_SHEET_ID), FORM_TAB);
  if (!sh) throw new Error('Tab "' + FORM_TAB + '" not found in Tangible Data.');
  var cols = formColumns_(sh);
  var row = findFormRow_(sh, cols, p.tab, email);
  var updated = !!row;
  if (!row) row = sh.getLastRow() + 1; // new answers go at the bottom, like the Google Form did
  var set = function (c, v) { if (c >= 0) sh.getRange(row, c + 1).setValue(v); };
  set(cols.time, new Date());
  set(cols.name, name);
  set(cols.hours, nums.hours);
  set(cols.pto, nums.pto);
  set(cols.meetings, nums.meetings);
  set(cols.noShows, nums.noShows);
  set(cols.period, p.tab);
  set(cols.email, email);
  if (cols.billable >= 0) {
    // Keep whatever the column already does: a formula filling the whole column → leave it; formulas per row →
    // copy the one from the row above; typed values → hours minus meetings (how it was filled in by hand).
    var top = sh.getRange(2, cols.billable + 1).getFormula();
    var above = row > 2 ? sh.getRange(row - 1, cols.billable + 1).getFormulaR1C1() : '';
    if (/ARRAYFORMULA/i.test(top) || /ARRAYFORMULA/i.test(sh.getRange(1, cols.billable + 1).getFormula())) { /* leave it */ }
    else if (above && !updated) sh.getRange(row, cols.billable + 1).setFormulaR1C1(above);
    else if (!sh.getRange(row, cols.billable + 1).getFormula()) sh.getRange(row, cols.billable + 1).setValue(nums.billable);
  }
  return { status: updated ? 'updated' : 'added', row: row };
}

// ---------- 2. Tangible Data → "Payroll" roster ----------

function saveRoster_(names, nums, newHire) {
  var sh = tab_(SpreadsheetApp.openById(DATA_SHEET_ID), ROSTER_TAB);
  if (!sh) return { status: 'skipped', detail: 'No "' + ROSTER_TAB + '" tab.' };
  var data = sh.getRange(1, 1, Math.min(sh.getLastRow(), 300), Math.min(sh.getLastColumn(), 10)).getDisplayValues();
  var headRow = -1;
  for (var i = 0; i < Math.min(data.length, 15); i++) if (String(data[i][1]).trim().toLowerCase() === 'rate/hr') { headRow = i; break; }
  if (headRow < 0) return { status: 'skipped', detail: 'Roster header (Rate/hr) not found.' };
  var head = data[headRow].map(function (h) { return String(h).trim().toLowerCase(); });
  var col = function (label) { return head.indexOf(label); };
  var map = [[col('hrs worked'), nums.hours], [col('pto used'), nums.pto], [col('meetings'), nums.meetings], [col('no shows'), nums.noShows], [col('billable hours'), nums.billable]];
  var width = Math.max.apply(null, map.map(function (m) { return m[0] + 1; }).concat([2])); // name … billable hours

  var people = [], totalsRow = -1;
  for (var r = headRow + 1; r < data.length; r++) {
    var a = String(data[r][0]).trim();
    if (/^totals?\b/i.test(a)) { totalsRow = r; break; }
    if (a) people.push({ row: r + 1, name: a });
  }
  var m = match_(names, people);
  var added = false;
  if (!m.row) {
    if (!newHire) return { status: m.status, detail: m.detail };
    if (!people.length) return { status: 'skipped', detail: 'Roster is empty.' };
    // Shift only the roster columns down (the history table to the right stays put), inside the range the
    // Totals formulas add up: just above the last person.
    var at = people[people.length - 1].row;
    sh.getRange(at, 1, 1, width).insertCells(SpreadsheetApp.Dimension.ROWS);
    var tmpl = sh.getRange(at - 1, 1, 1, width).getFormulasR1C1()[0];
    for (var k = 0; k < width; k++) if (tmpl[k]) sh.getRange(at, k + 1).setFormulaR1C1(tmpl[k]);
    sh.getRange(at, 1).setValue(newHire.first + ' ' + newHire.last);
    m = { row: at };
    added = true;
  }
  var formulas = sh.getRange(m.row, 1, 1, width).getFormulas()[0];
  map.forEach(function (x) { if (x[0] >= 0 && !formulas[x[0]]) sh.getRange(m.row, x[0] + 1).setValue(x[1]); });
  return { status: added ? 'added' : 'written', row: m.row };
}

// ---------- 3. Payroll company sheet → newest tab, Hours + Vacation only ----------

function savePayroll_(p, names, nums, newHire) {
  var sh = SpreadsheetApp.openById(PAYROLL_SHEET_ID).getSheetByName(p.tab);
  if (!sh) return { status: 'error', detail: 'Tab "' + p.tab + '" not found.' };
  var data = sh.getRange(1, 1, Math.min(sh.getLastRow(), 300), Math.min(sh.getLastColumn(), 12)).getDisplayValues();
  var headRow = -1;
  for (var i = 0; i < Math.min(data.length, 15); i++) if (String(data[i][0]).trim().toLowerCase() === 'name') { headRow = i; break; }
  if (headRow < 0) return { status: 'error', detail: 'Header row ("Name") not found on "' + p.tab + '".' };
  var head = data[headRow].map(function (h) { return String(h).trim().toLowerCase(); });
  var hCol = head.indexOf('hours'), vCol = head.indexOf('vacation');
  if (hCol < 0 || vCol < 0) return { status: 'error', detail: 'The Hours or Vacation column wasn\'t found on "' + p.tab + '".' };

  var people = [];
  for (var r = headRow + 1; r < data.length; r++) {
    var a = String(data[r][0]).trim();
    if (/^total\b/i.test(a)) break;
    if (a) people.push({ row: r + 1, name: a });
  }
  var m = match_(names, people);
  var added = false;
  if (!m.row) {
    if (!newHire) return { status: m.status, detail: m.detail };
    if (!people.length) return { status: 'error', detail: 'No people on "' + p.tab + '".' };
    // Alphabetical by last name, and always above the last person so their Total formulas include the new row.
    var newLast = newHire.last.toLowerCase(), at = people[people.length - 1].row;
    for (var j = 0; j < people.length; j++) { if (parts_(people[j].name).last > newLast) { at = people[j].row; break; } }
    sh.insertRowBefore(at);
    sh.getRange(at, 1).setValue(newHire.first + ' ' + newHire.last);
    m = { row: at };
    added = true;
  }
  sh.getRange(m.row, hCol + 1).setValue(nums.hours);
  sh.getRange(m.row, vCol + 1).setValue(nums.pto === '' || nums.pto === 0 ? '' : nums.pto);
  return { status: added ? 'added' : 'written', row: m.row, name: added ? newHire.first + ' ' + newHire.last : sh.getRange(m.row, 1).getDisplayValue() };
}

// ---------- name matching ----------

/** "Skyler N. Anderson" → { first: 'skyler', middle: 'n', last: 'anderson' } (brackets and dots ignored). */
function parts_(s) {
  var w = String(s || '').replace(/\([^)]*\)/g, ' ').toLowerCase().replace(/[^a-zà-ɏ\s'-]/g, ' ').trim().split(/\s+/).filter(Boolean);
  return { first: w[0] || '', middle: w.length > 2 ? w.slice(1, -1).join(' ') : '', last: w.length > 1 ? w[w.length - 1] : '' };
}

/** Same person? Last names must match, and first names must match or one is a short form of the other
 *  ("Abi"/"Abigail", "Phil"/"Philip"). Middle names aren't guessed (people who go by one: ALIASES). */
function samePerson_(q, c) {
  if (!q.last || q.last !== c.last) return false;
  var a = q.first, b = c.first;
  if (a === b) return true;
  if (a.length >= 3 && b.length >= 3 && (a.indexOf(b) === 0 || b.indexOf(a) === 0)) return true;
  return false;
}

/** Finds exactly one row for any of the names. { row } or { status: 'notFound' | 'ambiguous', detail }. */
function match_(names, people) {
  var tried = [];
  for (var i = 0; i < names.length; i++) {
    var alias = ALIASES[String(names[i]).trim().toLowerCase()];
    if (alias) {
      var exact = people.filter(function (p) { return p.name.toLowerCase().replace(/\s+/g, ' ') === alias.toLowerCase(); });
      if (exact.length === 1) return { row: exact[0].row };
    }
    var q = parts_(names[i]);
    var hits = people.filter(function (p) { return samePerson_(q, parts_(p.name)); });
    if (hits.length === 1) return { row: hits[0].row };
    if (hits.length > 1) return { status: 'ambiguous', detail: 'More than one row matches "' + names[i] + '": ' + hits.map(function (h) { return h.name; }).join(', ') + '.' };
    tried.push(names[i]);
  }
  return { status: 'notFound', detail: 'No row matches ' + tried.map(function (t) { return '"' + t + '"'; }).join(' or ') + '.' };
}

// ---------- setup + helpers ----------

/** Run once from the editor: makes the key, checks both spreadsheets open, shows the newest pay period. */
function setup() {
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('PAYROLL_KEY')) props.setProperty('PAYROLL_KEY', Utilities.getUuid().replace(/-/g, ''));
  var data = SpreadsheetApp.openById(DATA_SHEET_ID);
  console.log('Tangible Data found. "' + FORM_TAB + '" tab: ' + (tab_(data, FORM_TAB) ? 'yes' : 'NO') + ', "' + ROSTER_TAB + '" tab: ' + (tab_(data, ROSTER_TAB) ? 'yes' : 'NO'));
  console.log('Newest pay period on the payroll sheet: ' + period_().tab);
  console.log('Payroll key (add it to the end of the web app URL as ?key=...): ' + props.getProperty('PAYROLL_KEY'));
}

/** Run from the editor to check name matching against the newest tab without writing anything. */
function testNames() {
  var p = period_();
  var sh = SpreadsheetApp.openById(PAYROLL_SHEET_ID).getSheetByName(p.tab);
  var people = sh.getRange(1, 1, sh.getLastRow(), 1).getDisplayValues().map(function (r, i) { return { row: i + 1, name: String(r[0]).trim() }; })
    .filter(function (x) { return x.name && !/^(name|total|brady a clegg)/i.test(x.name); });
  ['Abi Scoma', 'Noelle Berry', 'Phil Childs', 'Hannah Brown', 'Leah Brown', 'Micayla Johnson', 'Joseph Johnson'].forEach(function (n) {
    var m = match_([n], people);
    console.log(n + ' → ' + (m.row ? sh.getRange(m.row, 1).getDisplayValue() : m.status + ' (' + m.detail + ')'));
  });
}

function tab_(ss, name) {
  var sh = ss.getSheetByName(name);
  if (sh) return sh;
  var want = name.trim().toLowerCase();
  return ss.getSheets().filter(function (s) { return s.getName().trim().toLowerCase() === want; })[0] || null;
}
function str_(v, max) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max || 200); }
function pad2_(x) { return ('0' + Number(x)).slice(-2); }
function json_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
