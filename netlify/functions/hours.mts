// /api/hours — supervision hours tracker (page: /hours).
// Associates' pay-period hours come in through Submit Hours (/api/submit-hours, kind "period"); here they only
// add past hours in bulk (a date range) or fix older entries.
// Who can see what:
//   - an associate (role "associate"): logs their own hours ("My hours")
//   - a supervisor (role "supervisor"): links associates as their supervisees and reviews their hours ("My supervisees")
//   - the owner: every log, and can move an associate between supervisors
// GET  ?view=mine | team | log&email=
// POST { action: 'add' | 'edit' | 'delete' | 'review' | 'approveAll' | 'link' | 'unlink' | 'settings', ... }
//   approveAll: approves every entry waiting for approval from all of the caller's OWN supervisees (returned
//   entries are left alone). The owner's button only covers people they supervise themselves.
import { currentPerson, listPeople } from '../lib/staff-session.ts';
import { readLog, updateLog, allLogs, cleanEntry, cleanTargets, defaultTargets, totals, type Log } from '../lib/hours.ts';
import { isOwner, type StaffRecord } from '../../src/data/staff-access.ts';
import { LICENSES, type LicenseId } from '../../src/data/hours.ts';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' } });
const isOverseer = (me: StaffRecord) => isOwner(me.email);
const canSupervise = (me: StaffRecord) => isOverseer(me) || me.roles.includes('supervisor');
const canLog = (me: StaffRecord) => isOverseer(me) || me.roles.includes('associate');
const canView = (me: StaffRecord, log: Log) => log.supervisee === me.email || log.link?.supervisor === me.email || isOverseer(me);
const canReview = (me: StaffRecord, log: Log) => (log.link?.supervisor === me.email || isOverseer(me)) && log.supervisee !== me.email;
const licenseOk = (x: any): x is LicenseId => LICENSES.some((l) => l.id === x);
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

async function names() {
  const people = await listPeople();
  const map: Record<string, string> = {};
  for (const p of people) map[p.email] = p.name || p.email;
  return { people, name: (e?: string) => (e ? map[e] || e : '') };
}

function summary(log: Log, name: (e?: string) => string) {
  return {
    supervisee: log.supervisee, superviseeName: name(log.supervisee),
    supervisor: log.link?.supervisor || null, supervisorName: name(log.link?.supervisor),
    link: log.link, approved: totals(log.entries, 'approved'), pending: totals(log.entries, 'pending'),
    pendingCount: log.entries.filter((e) => e.status === 'pending').length,
    lastEntry: log.entries.reduce((m, e) => (e.date > m ? e.date : m), ''),
  };
}

export default async (req: Request) => {
  const me = await currentPerson(req);
  if (!me || me.status !== 'approved') return json({ error: 'Please sign in.' }, 401);
  const url = new URL(req.url);

  if (req.method === 'GET') {
    const view = url.searchParams.get('view') || 'mine';
    const { people, name } = await names();
    if (view === 'mine') {
      const { log } = await readLog(me.email);
      return json({ me: me.email, canSupervise: canSupervise(me), canLog: canLog(me), log, ...summary(log, name) });
    }
    if (view === 'log') {
      const email = (url.searchParams.get('email') || '').toLowerCase();
      const { log } = await readLog(email);
      if (!canView(me, log)) return json({ error: 'Not one of your supervisees.' }, 403);
      return json({ log, canReview: canReview(me, log), ...summary(log, name) });
    }
    if (view === 'team') {
      if (!canSupervise(me)) return json({ error: 'Only supervisors can see this.' }, 403);
      const logs = await allLogs();
      const linked = new Map(logs.filter((l) => l.link).map((l) => [l.supervisee, l]));
      const mine = logs.filter((l) => l.link && (l.link.supervisor === me.email || isOverseer(me)));
      // People a supervisor could add: approved associates, not themselves, not already supervised by someone else.
      const available = people
        .filter((p) => p.status === 'approved' && p.roles.includes('associate') && p.email !== me.email && (!linked.has(p.email) || isOverseer(me)))
        .filter((p) => linked.get(p.email)?.link?.supervisor !== me.email)
        .map((p) => ({ email: p.email, name: p.name || p.email, supervisor: linked.get(p.email)?.link?.supervisor || null, supervisorName: name(linked.get(p.email)?.link?.supervisor) }));
      return json({ me: me.email, overseer: isOverseer(me), supervisees: mine.map((l) => summary(l, name)), available });
    }
    return json({ error: 'Unknown view.' }, 400);
  }

  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  if (req.headers.get('origin') !== url.origin) return json({ error: 'origin' }, 403);
  const b = await req.json().catch(() => ({}) as any);
  const action = String(b.action || '');
  const { name } = await names();
  const done = (r: { log?: Log; error?: string }) => (r.error ? json({ error: r.error }, 400) : json({ ok: true, log: r.log, ...summary(r.log!, name) }));

  // ----- a supervisee's own entries -----
  if (action === 'add' || action === 'edit' || action === 'delete') {
    if (!canLog(me)) return json({ error: 'Only associates log hours. Ask a director to add the Associate role to your account.' }, 403);
    const c = action === 'delete' ? null : cleanEntry({ ...(b.entry || {}), kind: action === 'add' ? 'bulk' : b.entry?.kind });
    if (c?.error) return json({ error: c.error }, 400);
    return done(await updateLog(me.email, (log) => {
      const now = new Date().toISOString();
      if (action === 'add') {
        if (log.entries.length >= 3000) return 'Too many entries.';
        log.entries.push({ id: newId(), ...c!.value!, status: 'pending', createdAt: now, updatedAt: now });
        return;
      }
      const e = log.entries.find((x) => x.id === String(b.id));
      if (!e) return 'That entry no longer exists.';
      if (e.kind === 'period') return 'Pay-period hours come from Submit Hours. To change them, submit your hours again for that pay period.';
      if (e.status === 'approved') return 'Approved entries are locked. Ask your supervisor to reopen it first.';
      if (action === 'delete') { log.entries = log.entries.filter((x) => x !== e); return; }
      if (!c!.value!.end) delete e.end;
      Object.assign(e, c!.value!, { status: 'pending', updatedAt: now });
      delete e.note;
    }));
  }

  // ----- supervisor actions -----
  if (action === 'approveAll') {
    if (!canSupervise(me)) return json({ error: 'Only supervisors can do this.' }, 403);
    const mine = (await allLogs()).filter((l) => l.link?.supervisor === me.email && l.supervisee !== me.email && l.entries.some((e) => e.status === 'pending'));
    let entries = 0, people = 0;
    const failed: string[] = [];
    for (const l of mine) {
      let n = 0;
      const r = await updateLog(l.supervisee, (log) => {
        if (!canReview(me, log) || log.link?.supervisor !== me.email) return 'Not your supervisee.';
        const now = new Date().toISOString();
        n = 0;
        for (const e of log.entries) {
          if (e.status !== 'pending') continue;
          e.status = 'approved'; e.supervisorNote = undefined; e.reviewedAt = now; e.reviewedBy = me.email; n++;
        }
        if (!n) return 'Nothing to change.';
      });
      if (r.error) { if (r.error !== 'Nothing to change.') failed.push(name(l.supervisee)); continue; }
      entries += n; people++;
    }
    return json({ ok: true, entries, people, failed });
  }

  const target = String(b.email || '').toLowerCase();
  if (!target) return json({ error: 'Missing supervisee.' }, 400);

  if (action === 'review') {
    const decision = String(b.decision);
    if (!['approve', 'return', 'reopen'].includes(decision)) return json({ error: 'Unknown decision.' }, 400);
    const ids = new Set((Array.isArray(b.ids) ? b.ids : [b.id]).map(String));
    return done(await updateLog(target, (log) => {
      if (!canReview(me, log)) return 'Only their supervisor can review these hours.';
      const now = new Date().toISOString();
      let n = 0;
      for (const e of log.entries) {
        if (!ids.has(e.id)) continue;
        if (decision === 'approve' && e.status !== 'approved') { e.status = 'approved'; e.supervisorNote = undefined; }
        else if (decision === 'return' && e.status !== 'approved') { e.status = 'returned'; e.supervisorNote = String(b.note || '').trim().slice(0, 300) || 'Please check this entry.'; }
        else if (decision === 'reopen' && e.status === 'approved') { e.status = 'pending'; }
        else continue;
        e.reviewedAt = now; e.reviewedBy = me.email; n++;
      }
      if (!n) return 'Nothing to change.';
    }));
  }

  if (action === 'link' || action === 'settings') {
    if (!canSupervise(me)) return json({ error: 'Only supervisors can do this.' }, 403);
    if (target === me.email) return json({ error: "You can't supervise yourself." }, 400);
    if (action === 'link') {
      const person = (await listPeople()).find((p) => p.email === target);
      if (!person || person.status !== 'approved' || !person.roles.includes('associate')) return json({ error: 'Only staff with the Associate role can be added as supervisees.' }, 400);
    }
    const license = licenseOk(b.license) ? b.license : 'acmhc';
    const startDate = /^\d{4}-\d{2}-\d{2}$/.test(String(b.startDate || '')) ? String(b.startDate) : undefined;
    return done(await updateLog(target, (log) => {
      const now = new Date().toISOString();
      if (action === 'link') {
        if (log.link && log.link.supervisor !== me.email && !isOverseer(me)) return `Already supervised by ${name(log.link.supervisor)}. Their current supervisor can remove them first, then you can add them.`;
        const supervisor = isOverseer(me) && b.supervisor ? String(b.supervisor).toLowerCase() : me.email;
        log.link = { supervisor, license, targets: b.targets ? cleanTargets(b.targets, license) : defaultTargets(license), startDate, linkedAt: now, linkedBy: me.email };
        return;
      }
      if (!log.link || (log.link.supervisor !== me.email && !isOverseer(me))) return 'Not one of your supervisees.';
      log.link = { ...log.link, license, targets: cleanTargets(b.targets, license), startDate };
    }));
  }

  if (action === 'unlink') {
    return done(await updateLog(target, (log) => {
      if (!log.link) return 'They don’t have a supervisor.';
      if (log.link.supervisor !== me.email && !isOverseer(me)) return 'Not one of your supervisees.';
      log.link = null; // their hours stay in their log
    }));
  }

  return json({ error: 'Unknown action.' }, 400);
};

export const config = { path: '/api/hours' };
