/**
 * Tangible website <- office "Team Dashboard" sheets
 *
 * A STANDALONE Apps Script project (script.google.com > New project, named "Office dashboard feed"),
 * owned by brady@tangiblementalhealth.com. It reads each office's Team Dashboard sheet by ID and:
 *   1. doGet():  a private feed the website reads every hour (training meetings + who is in which room).
 *   2. doPost(): adds a training-topic suggestion from the website to the "Training Suggestions" tab.
 * It never changes the schedules or the Training Meeting tab.
 *
 * Room schedules are read from the cell COLORS: the key in the top rows ("Arianne" next to a purple
 * square) says whose color is whose, so nobody has to change how they fill in the sheet. Text typed in a
 * schedule cell (e.g. "group") wins over the color. Colors that aren't in the key show as "Booked".
 *
 * Setup steps: docs/office-dashboards/README.md in the website repo.
 */

// office id (matches the website) -> that office's Team Dashboard sheet.
var OFFICE_SHEETS = {
  orem: '12Scfxhll_c7G-_EoVRegjdqJ-qE62yel7-_oSKIlcCA',
  sandy: '10T86giJbKm4oxbZALHsAHXXi1PZzmkDXP_46tR6PjEY',
  provo: '1lDT71w4l9p2yEuxk-4ZfL6QP_myeCNyTef3Z0gfKhp4',
};
var SCHEDULE_TAB_SUFFIX = 'Master Schedule';   // Orem: tabs like "Office A Master Schedule" (one per building)
// Offices whose room schedule tab is named differently. For each building, the FIRST tab in `tabs` that exists
// is used, and `name` is what the website calls the building. Keep `name` the same when the tab changes
// (room claims on the website are saved under it).
var OFFICE_SCHEDULES = {
  sandy: [{ tabs: ['Office Master Schedule'], name: 'Sandy office' }],
  // Provo's new hours start Nov 2 2026. When the old "Hours & Rooms" tab is retired and "nov 2 Hours & Rooms"
  // is renamed to "Hours & Rooms", the second name keeps working with no change here.
  provo: [{ tabs: ['nov 2 Hours & Rooms', 'Hours & Rooms'], name: 'Provo office' }],
};
var COLORS_TAB = 'colors';   // optional extra colour key: names typed in coloured cells (Provo has one)
var TRAINING_TAB = 'Training Meeting';
var SUGGESTIONS_TAB = 'Training Suggestions';

function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function authorized_(e) {
  var key = PropertiesService.getScriptProperties().getProperty('FEED_KEY');
  return key && e && e.parameter && e.parameter.key === key;
}

function doGet(e) {
  if (!authorized_(e)) return json_({ error: 'unauthorized' });
  var office = String(e.parameter.office || 'orem');
  if (!OFFICE_SHEETS[office]) return json_({ error: 'unknown office' });
  return json_(buildFeed_(office));
}

function doPost(e) {
  if (!authorized_(e)) return json_({ error: 'unauthorized' });
  var body = {};
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json_({ error: 'bad request' }); }
  var office = String(body.office || 'orem');
  if (!OFFICE_SHEETS[office]) return json_({ error: 'unknown office' });
  if (body.type === 'suggestion') {
    var topic = String(body.topic || '').trim().slice(0, 500);
    if (!topic) return json_({ error: 'empty' });
    var sh = SpreadsheetApp.openById(OFFICE_SHEETS[office]).getSheetByName(SUGGESTIONS_TAB);
    if (!sh) return json_({ error: 'no suggestions tab' });
    // Starting a value with = + - @ would make Sheets treat it as a formula; prefix with an apostrophe.
    var safe = function (s) { return /^[=+\-@]/.test(s) ? "'" + s : s; };
    sh.appendRow([safe(topic), safe(String(body.by || '').slice(0, 120))]);
    return json_({ ok: true });
  }
  return json_({ error: 'unknown request' });
}

function buildFeed_(office) {
  var ss = SpreadsheetApp.openById(OFFICE_SHEETS[office]);
  var out = { office: office, generatedAt: new Date().toISOString(), timeZone: ss.getSpreadsheetTimeZone(), training: [], schedules: [] };
  var extraKey = {};
  var colorsTab = ss.getSheetByName(COLORS_TAB);
  if (colorsTab) { var cr = colorsTab.getDataRange(); extraKey = parseColorList(cr.getDisplayValues(), cr.getBackgrounds()); }
  var read = function (sh, name) {
    var range = sh.getDataRange();
    out.schedules.push(parseSchedule(name, range.getDisplayValues(), withoutBanding_(sh, range.getBackgrounds()), extraKey));
  };
  if (OFFICE_SCHEDULES[office]) {
    OFFICE_SCHEDULES[office].forEach(function (b) {
      for (var i = 0; i < b.tabs.length; i++) { var sh = ss.getSheetByName(b.tabs[i]); if (sh) { read(sh, b.name); return; } }
      out.schedules.push({ name: b.name, rooms: [], error: 'tab not found: ' + b.tabs.join(' / ') });
    });
  } else {
    ss.getSheets().forEach(function (sh) {
      var name = sh.getName();
      if (name.indexOf(SCHEDULE_TAB_SUFFIX) >= 0) read(sh, name.replace(SCHEDULE_TAB_SUFFIX, '').trim());
    });
  }
  var t = ss.getSheetByName(TRAINING_TAB);
  if (t) out.training = parseTraining(t.getDataRange().getDisplayValues());
  return out;
}

// "Alternating colors" (Format > Alternating colors, used on Provo's sheet) come back as cell colours, so the
// striped rows would look booked. Turn the stripe and header colours back into white inside the striped range.
function withoutBanding_(sh, bgs) {
  var lc = function (c) { return String(c || '').toLowerCase(); };
  sh.getBandings().forEach(function (band) {
    var br = band.getRange(), r0 = br.getRow() - 1, c0 = br.getColumn() - 1;
    var stripes = [lc(band.getFirstRowColor()), lc(band.getSecondRowColor())].filter(String);
    var head = lc(band.getHeaderRowColor());
    for (var r = r0; r < r0 + br.getNumRows() && r < bgs.length; r++) {
      for (var c = c0; c < c0 + br.getNumColumns() && c < bgs[r].length; c++) {
        var bg = lc(bgs[r][c]);
        if (stripes.indexOf(bg) >= 0 || (r === r0 && head && bg === head)) bgs[r][c] = '#ffffff';
      }
    }
  });
  return bgs;
}

// ---------- parsing (plain JavaScript, also tested in the website repo) ----------

function isBlankColor(c) { c = String(c || '').toLowerCase(); return !c || c === '#ffffff' || c === 'white' || c === '#fff'; }

function parseTraining(values) {
  var head = (values[0] || []).map(function (h) { return String(h).toLowerCase(); });
  var col = function (re, fallback) { for (var i = 0; i < head.length; i++) if (re.test(head[i])) return i; return fallback; };
  // Columns are found by their heading (Provo's are in a different order). No "Additional" column = left blank.
  var c = { date: col(/^date/, 0), topic: col(/topic/, 1), trainer: col(/^trainer/, 2), skill: col(/skill/, 3), dsm: col(/^dsm/, 4), extra: col(/additional/, -1) };
  var rows = [];
  for (var r = 1; r < values.length; r++) {
    var v = values[r], d = String(v[c.date] || '').trim();
    var m = d.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) continue;
    var iso = m[3] + '-' + ('0' + m[1]).slice(-2) + '-' + ('0' + m[2]).slice(-2);
    var get = function (k) { return c[k] < 0 ? '' : String(v[c[k]] || '').trim(); };
    rows.push({ date: iso, topic: get('topic'), trainer: get('trainer'), skill: get('skill'), dsm: get('dsm'), extra: get('extra') });
  }
  rows.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
  return rows;
}

function toMinutes(t) {
  var m = String(t || '').trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;
  var h = +m[1] % 12 + (m[3].toUpperCase() === 'PM' ? 12 : 0);
  return h * 60 + +m[2];
}

// A list of names typed in coloured cells (e.g. Provo's "colors" tab) -> { colour: name }.
function parseColorList(values, bgs) {
  var key = {};
  for (var r = 0; r < values.length; r++) for (var c = 0; c < values[r].length; c++) {
    var label = String(values[r][c] || '').trim(), bg = String(bgs[r][c] || '').toLowerCase();
    if (label && !isBlankColor(bg) && !key[bg]) key[bg] = label;
  }
  return key;
}

function parseSchedule(name, values, bgs, extraKey) {
  var DAYS = ['M', 'T', 'W', 'Th', 'F', 'S', 'Su'];
  var head = -1;
  for (var r = 0; r < values.length && head < 0; r++) if (String(values[r][0]).trim().toLowerCase() === 'time') head = r;
  if (head < 1) return { name: name, rooms: [], error: 'no Time row' };

  // Colour key: names in the rows above the room row. A name typed in a coloured cell (Sandy) uses that colour.
  // Otherwise it is matched to a coloured, empty square: to its right (Orem: "Arianne ■"), or to its left when the
  // row starts with a square (Provo: "■ Kade"). Labels ending in ":" ("Full-time:") are headings, not names.
  var legend = {};
  for (var lr = 0; lr < head - 1; lr++) {
    var row = values[lr];
    var isName = function (c) { var t = String(row[c] || '').trim(); return !!t && !/:$/.test(t); };
    var isSquare = function (c) { return c >= 0 && c < row.length && !String(row[c] || '').trim() && !isBlankColor(bgs[lr][c]); };
    var squaresFirst = false;
    for (var f = 0; f < row.length; f++) { if (isName(f)) break; if (isSquare(f)) { squaresFirst = true; break; } }
    for (var c = 0; c < row.length; c++) {
      if (!isName(c)) continue;
      var label = String(row[c]).trim();
      if (!isBlankColor(bgs[lr][c])) { legend[String(bgs[lr][c]).toLowerCase()] = label; continue; }
      if (squaresFirst) {
        for (var kl = c - 1; kl >= 0 && kl >= c - 8; kl--) {
          if (String(row[kl] || '').trim()) break;
          if (isSquare(kl)) { legend[String(bgs[lr][kl]).toLowerCase()] = label; break; }
        }
        continue;
      }
      for (var k = c + 1; k < row.length && k <= c + 8; k++) {
        if (String(row[k] || '').trim()) break;
        if (!isBlankColor(bgs[lr][k])) { legend[String(bgs[lr][k]).toLowerCase()] = label; break; }
      }
      // Key colour to the LEFT of the text (fallback)
      if (c > 0 && !String(row[c - 1] || '').trim() && !isBlankColor(bgs[lr][c - 1]) && !legend[String(bgs[lr][c - 1]).toLowerCase()]) legend[String(bgs[lr][c - 1]).toLowerCase()] = label;
    }
  }

  // Rooms: labels in the row above "Time" (carried across merged cells), day letters in the Time row.
  var rooms = [], current = null;
  for (var col = 1; col < values[head].length; col++) {
    var day = String(values[head][col] || '').trim();
    var roomLabel = String(values[head - 1][col] || '').trim();
    if (roomLabel) { current = { label: roomLabel, days: {} }; rooms.push(current); }
    if (!current || DAYS.indexOf(day) < 0) continue;
    current.days[day] = { col: col };
  }

  // Names from the extra colour list fill in colours the key above doesn't have.
  if (extraKey) Object.keys(extraKey).forEach(function (bg) { if (!legend[bg]) legend[bg] = extraKey[bg]; });

  // Time rows start at the first time label (rows between the day letters and it, like Provo's grey bar, are
  // skipped); every row after it is 30 minutes.
  var start = null, first = head + 1;
  for (var tr = head + 1; tr < values.length && start === null; tr++) { var mm = toMinutes(values[tr][0]); if (mm !== null) { start = mm; first = tr; } }
  if (start === null) return { name: name, rooms: [], error: 'no times' };
  var last = first;
  for (var lr2 = first; lr2 < values.length; lr2++) if (toMinutes(values[lr2][0]) !== null) last = lr2 + 1; // label rows + the half-hour row after
  last = Math.min(last, values.length - 1);
  var fmt = function (m) { return ('0' + Math.floor(m / 60)).slice(-2) + ':' + ('0' + (m % 60)).slice(-2); };

  rooms.forEach(function (room) {
    Object.keys(room.days).forEach(function (day) {
      var col = room.days[day].col, blocks = [], open = null;
      for (var r = first; r <= last; r++) {
        var text = String(values[r][col] || '').trim();
        var bg = String(bgs[r][col] || '').toLowerCase();
        var who = text || (isBlankColor(bg) ? '' : (legend[bg] || 'Booked'));
        var t = start + (r - first) * 30;
        if (open && open.who === who && (who !== 'Booked' || open.color === bg)) { open.end = fmt(t + 30); continue; }
        if (open) blocks.push(open);
        open = who ? { start: fmt(t), end: fmt(t + 30), who: who, color: isBlankColor(bg) ? '' : bg } : null;
      }
      if (open) blocks.push(open);
      room.days[day] = blocks;
    });
  });
  return { name: name, rooms: rooms.filter(function (r) { return Object.keys(r.days).length; }), legend: legend };
}

// ---------- run these from the editor ----------

// Run once after deploying as a web app: creates the private key and logs the feed address for Netlify.
function setup() {
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('FEED_KEY')) props.setProperty('FEED_KEY', Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, ''));
  var url = ScriptApp.getService().getUrl();
  Logger.log(url ? 'Netlify OFFICE_DASHBOARD_FEED = ' + url + '?key=' + props.getProperty('FEED_KEY')
                 : 'Deploy > New deployment > Web app first, then run setup again.');
}

// Shows what the website will receive, so you can check names and rooms look right.
function testFeed() { testOffice_('orem'); testOffice_('sandy'); testOffice_('provo'); }
function testOffice_(office) {
  var f = buildFeed_(office);
  Logger.log('===== ' + office);
  Logger.log('Training meetings: ' + f.training.length + ' (next: ' + JSON.stringify(f.training.filter(function (t) { return t.date >= new Date().toISOString().slice(0, 10); })[0]) + ')');
  f.schedules.forEach(function (s) {
    Logger.log(s.name + ': ' + s.rooms.length + ' rooms' + (s.error ? ' (' + s.error + ')' : '') + '. Colour key: ' + JSON.stringify(s.legend));
    s.rooms.forEach(function (r) { Logger.log('  ' + r.label + ' Monday: ' + JSON.stringify(r.days.M || [])); });
  });
}
