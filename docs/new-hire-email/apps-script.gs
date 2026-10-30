/**
 * "New hire accounts" — Google Apps Script web app for the website's Reception Onboarding page (step 3).
 *
 * When front desk clicks "Create their email" on tangiblementalhealth.com/reception-onboarding, the website
 * asks this script to:
 *   1. create the person's Google Workspace account (first@tangiblementalhealth.com, or first + last initial,
 *      or first.last if those are taken; or exactly the address front desk typed),
 *   2. add them to the Google Groups listed in GROUPS below for everyone, their office and their role,
 *   3. email their PERSONAL address a welcome message with a one-time temporary password. Google makes them
 *      choose their own password the first time they sign in.
 * The temporary password goes straight from Google to the new hire. It is never sent back to the website,
 * never logged and never stored.
 *
 * It must be set up by a Google Workspace SUPER ADMIN (it runs as that person) with the "Admin SDK API"
 * advanced service turned on. Setup: docs/new-hire-email/README.md. The key lives only in this script's
 * properties and in the Netlify environment variable NEW_HIRE_EMAIL_SCRIPT — never in the website code.
 *
 * Clicking the button twice is safe: if the account already exists with the same personal email, the script
 * just makes sure the groups are right and does not email a new password.
 */

var DOMAIN = 'tangiblementalhealth.com';

// Which Google Groups new people join. Fill in the group addresses (run listGroups once to see them all).
// "all" = everyone; then by office (orem / provo / sandy) and by role (therapist / associate / frontdesk / other).
var GROUPS = {
  all: [],
  orem: [],
  provo: [],
  sandy: [],
  therapist: [],
  associate: [],
  frontdesk: [],
  other: [],
};

var OFFICE_LABEL = { orem: 'Orem', provo: 'Provo', sandy: 'Sandy' };

function doPost(e) {
  var key = PropertiesService.getScriptProperties().getProperty('ACCOUNT_KEY');
  if (!key || !e || !e.parameter || e.parameter.key !== key) return json_({ error: 'unauthorized' });

  var b = {};
  try { b = JSON.parse((e.postData && e.postData.contents) || '{}'); } catch (err) { return json_({ error: 'Bad request.' }); }
  var first = name_(b.first), last = name_(b.last);
  var personal = String(b.personal || '').trim().toLowerCase();
  var office = OFFICE_LABEL[b.office] ? b.office : 'orem';
  var role = GROUPS.hasOwnProperty(b.role) && b.role !== 'all' ? b.role : 'other';
  var wanted = String(b.email || '').trim().toLowerCase();
  if (!first || !last) return json_({ error: 'Please enter their first and last name.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(personal)) return json_({ error: 'Please enter their personal email (Google sends their sign-in details there).' });
  if (personal.slice(-DOMAIN.length - 1) === '@' + DOMAIN) return json_({ error: 'The personal email must be outside Tangible (their own Gmail, etc.).' });
  if (wanted && !new RegExp('^[a-z0-9._-]+@' + DOMAIN.replace(/\./g, '\\.') + '$').test(wanted)) {
    return json_({ error: 'The Tangible email must end in @' + DOMAIN + ' and use only letters, numbers, dots or hyphens.' });
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(25000); // two clicks at once can't make two accounts
  try {
    var created = false, address = '';

    // Same person clicked again? Reuse their account (matched by address + personal email).
    var candidates = wanted ? [wanted] : suggestions_(first, last);
    for (var i = 0; i < candidates.length && !address; i++) {
      var u = getUser_(candidates[i]);
      if (!u) { address = candidates[i]; break; }
      if (sameRecovery_(u, personal)) { address = u.primaryEmail; created = null; break; }
      if (wanted) return json_({ error: wanted + ' is already used by someone else. Clear the Tangible email box to let it pick one, or type a different one.' });
    }
    if (!address) return json_({ error: 'All the usual addresses for this name are taken. Type the address you want in the Tangible email box.' });

    if (created !== null) {
      var temp = password_();
      AdminDirectory.Users.insert({
        primaryEmail: address,
        name: { givenName: first, familyName: last },
        password: temp,
        changePasswordAtNextLogin: true,
        recoveryEmail: personal,
        emails: [{ address: personal, type: 'home' }],
      });
      created = true;
      welcome_(personal, first, address, temp);
      temp = null;
    }

    var groups = [].concat(GROUPS.all, GROUPS[office] || [], GROUPS[role] || []).filter(function (g, i, a) { return g && a.indexOf(g) === i; });
    var added = [], failed = [];
    groups.forEach(function (g) {
      try {
        AdminDirectory.Members.insert({ email: address, role: 'MEMBER' }, g);
        added.push(g);
      } catch (err) {
        if (/already exists|duplicate/i.test(String(err && err.message))) added.push(g);
        else failed.push(g);
      }
    });

    return json_({ email: address, created: !!created, emailedTo: created ? personal : '', groups: added, groupsFailed: failed, groupsSetUp: groups.length > 0 });
  } catch (err) {
    return json_({ error: 'Google said: ' + (err && err.message ? err.message : err) });
  } finally {
    lock.releaseLock();
  }
}

// Visiting the web app link in a browser just says it's running (no key needed, nothing is shown).
function doGet() { return json_({ ok: true, service: 'New hire accounts' }); }

/** Run once from the editor: makes the key, checks admin access, and logs the key. */
function setup() {
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('ACCOUNT_KEY')) props.setProperty('ACCOUNT_KEY', Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, ''));
  AdminDirectory.Users.list({ domain: DOMAIN, maxResults: 1 }); // fails here if this account isn't a super admin
  console.log('Admin access OK for ' + DOMAIN + '.');
  console.log('Account key (add it to the end of the web app URL as ?key=...): ' + props.getProperty('ACCOUNT_KEY'));
}

/** Run from the editor to see every Google Group address, to fill in GROUPS above. */
function listGroups() {
  var token, out = [];
  do {
    var page = AdminDirectory.Groups.list({ domain: DOMAIN, maxResults: 200, pageToken: token });
    (page.groups || []).forEach(function (g) { out.push(g.email + '  —  ' + g.name); });
    token = page.nextPageToken;
  } while (token);
  console.log(out.length ? out.join('\n') : 'No groups found.');
}

// ---- helpers ----

function name_(s) {
  return String(s || '').normalize('NFC').replace(/[^A-Za-z\u00C0-\u024F\s'\u2019.-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
}

// first@, then first + last initial, then first.last (letters only, accents removed).
function suggestions_(first, last) {
  var plain = function (s) { return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]/g, ''); };
  var f = plain(first.split(' ')[0]), l = plain(last);
  var out = [f, f + l.charAt(0), f + '.' + l].filter(function (x, i, a) { return x && a.indexOf(x) === i; });
  return out.map(function (x) { return x + '@' + DOMAIN; });
}

// The user (or a user with that address as an alias), or null if the address is free.
function getUser_(email) {
  try { return AdminDirectory.Users.get(email); }
  catch (err) {
    if (/not found|does not exist|404/i.test(String(err && err.message))) {
      try { AdminDirectory.Groups.get(email); return { primaryEmail: email, group: true }; } // a group owns the address
      catch (e2) { return null; }
    }
    throw err;
  }
}

function sameRecovery_(u, personal) {
  if (!u || u.group) return false;
  if (String(u.recoveryEmail || '').toLowerCase() === personal) return true;
  return (u.emails || []).some(function (m) { return String(m.address || '').toLowerCase() === personal; });
}

// 16 characters, no look-alikes (0/O, 1/l/I), always letters + digits + a symbol.
function password_() {
  var sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789', '!@#$%*?'];
  var all = sets.join(''), out = [];
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + Utilities.getUuid() + Date.now());
  for (var i = 0; i < 16; i++) {
    var pool = i < 4 ? sets[i] : all;
    out.push(pool.charAt((bytes[i] + 256) % pool.length));
  }
  for (var j = out.length - 1; j > 0; j--) { var k = (bytes[j + 16 - out.length + 15] + 256) % (j + 1); var t = out[j]; out[j] = out[k]; out[k] = t; }
  return out.join('');
}

function welcome_(to, first, address, temp) {
  var body =
    'Hi ' + first + ',\n\n' +
    'Your Tangible Therapy work email is ready.\n\n' +
    'Email: ' + address + '\n' +
    'Temporary password: ' + temp + '\n\n' +
    'Sign in at https://mail.google.com with these details. Google will ask you to choose your own password right away; ' +
    'the temporary one stops working after that.\n\n' +
    'Please delete this email once you have signed in. If you didn’t expect this message, reply and let us know.\n\n' +
    'Welcome to Tangible!';
  MailApp.sendEmail({ to: to, subject: 'Your Tangible Therapy email account', body: body, name: 'Tangible Therapy' });
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
