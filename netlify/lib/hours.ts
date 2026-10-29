// Supervision hours tracker. Data lives in Netlify Blobs store "supervision-hours" (never in the repo):
//   log/<supervisee email> → { link, entries[] }   one document per supervisee
// link = who supervises them, license type and targets. Entries hold HOURS ONLY — no client information.
// Saves use the blob's etag so two people saving at once never overwrite each other (retry on conflict).
import { getStore } from '@netlify/blobs';
import { LICENSES, type LicenseId } from '../../src/data/hours.ts';

export type Kind = 'week' | 'session';
export type Status = 'pending' | 'approved' | 'returned';
export type Entry = {
  id: string;
  kind: Kind;
  date: string;              // YYYY-MM-DD (week: the Monday of that week)
  direct: number;            // direct client care hours
  individual: number;        // individual supervision hours
  group: number;             // group supervision hours
  observation: number;       // of the supervision above, direct observation hours
  other?: number;            // other work time that week (notes, admin, trainings…); counts toward the total only
  note?: string;             // no longer collected (removed so nobody is tempted to add client details); old values are dropped on save
  status: Status;
  supervisorNote?: string;
  createdAt: string;
  updatedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
};
export type Targets = { total: number; direct: number; supervision: number; observation: number; groupMax: number };
export type Link = { supervisor: string; license: LicenseId; targets: Targets; startDate?: string; linkedAt: string; linkedBy: string };
export type Log = { supervisee: string; link: Link | null; entries: Entry[] };

const store = () => getStore({ name: 'supervision-hours', consistency: 'strong' });
const key = (email: string) => `log/${email.toLowerCase()}`;

export async function readLog(email: string): Promise<{ log: Log; etag?: string }> {
  const r = await store().getWithMetadata(key(email), { type: 'json' });
  if (!r) return { log: { supervisee: email.toLowerCase(), link: null, entries: [] } };
  return { log: r.data as Log, etag: r.etag };
}

/** Read-modify-write with conflict retry. `change` returns an error string to abort. */
export async function updateLog(email: string, change: (log: Log) => string | void): Promise<{ log?: Log; error?: string }> {
  for (let i = 0; i < 5; i++) {
    const { log, etag } = await readLog(email);
    const err = change(log);
    if (err) return { error: err };
    const res = etag
      ? await store().setJSON(key(email), log, { onlyIfMatch: etag })
      : await store().setJSON(key(email), log, { onlyIfNew: true });
    if (res?.modified !== false) return { log };
  }
  return { error: 'Someone else was saving at the same time. Please try again.' };
}

export async function allLogs(): Promise<Log[]> {
  const s = store();
  const { blobs } = await s.list({ prefix: 'log/' });
  const logs = await Promise.all(blobs.map((b) => s.get(b.key, { type: 'json' }) as Promise<Log | null>));
  return logs.filter(Boolean) as Log[];
}

const num = (v: unknown) => {
  const n = Math.round(Number(v) * 4) / 4; // quarter hours
  return Number.isFinite(n) && n >= 0 && n <= 168 ? n : NaN;
};

/** Validates hours fields from the browser. Returns the clean fields or an error message. */
export function cleanEntry(raw: any): { value?: Pick<Entry, 'kind' | 'date' | 'direct' | 'individual' | 'group' | 'observation' | 'other'>; error?: string } {
  const kind: Kind = raw?.kind === 'session' ? 'session' : 'week';
  const date = String(raw?.date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(Date.parse(date + 'T12:00:00Z'))) return { error: 'Please choose a date.' };
  const today = new Date(Date.now() - 7 * 3600e3).toISOString().slice(0, 10); // Utah-ish
  if (date > today) return { error: "The date can't be in the future." };
  const v = { kind, date: kind === 'week' ? mondayOf(date) : date, direct: num(raw.direct ?? 0), individual: num(raw.individual ?? 0), group: num(raw.group ?? 0), observation: num(raw.observation ?? 0), other: num(raw.other ?? 0) };
  if ([v.direct, v.individual, v.group, v.observation, v.other].some(Number.isNaN)) return { error: 'Hours must be numbers between 0 and 168 (quarter hours are fine).' };
  if (v.direct + v.individual + v.group + v.other === 0) return { error: 'Please enter some hours.' };
  if (v.direct + v.individual + v.group + v.other > 168) return { error: 'That adds up to more than 168 hours (a whole week).' };
  if (v.observation > v.individual + v.group) return { error: "Direct observation hours are part of supervision, so they can't be more than the supervision hours." };
  return { value: v };
}

export function mondayOf(iso: string) {
  const d = new Date(iso + 'T12:00:00Z');
  const back = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}

export function totals(entries: Entry[], status: Status | 'all' = 'approved') {
  const t = { direct: 0, individual: 0, group: 0, observation: 0, other: 0, supervision: 0, total: 0 };
  for (const e of entries) {
    if (status !== 'all' && e.status !== status) continue;
    t.direct += e.direct; t.individual += e.individual; t.group += e.group; t.observation += e.observation; t.other += e.other || 0;
  }
  t.supervision = t.individual + t.group;
  t.total = t.direct + t.supervision + t.other; // observation is part of supervision, so not added again
  return t;
}

export function defaultTargets(license: LicenseId): Targets {
  return { ...(LICENSES.find((l) => l.id === license) || LICENSES[0]).targets };
}

export function cleanTargets(raw: any, license: LicenseId): Targets {
  const d = defaultTargets(license);
  const n = (v: unknown, fb: number) => { const x = Math.round(Number(v)); return Number.isFinite(x) && x >= 0 && x <= 20000 ? x : fb; };
  return { total: n(raw?.total, d.total), direct: n(raw?.direct, d.direct), supervision: n(raw?.supervision, d.supervision), observation: n(raw?.observation, d.observation), groupMax: n(raw?.groupMax, d.groupMax) };
}
