// Office dashboards: data comes from each office's "Team Dashboard" Google Sheet through the
// "Office dashboard feed" Apps Script (docs/office-dashboards). The feed address + key live only in the
// Netlify environment variable OFFICE_DASHBOARD_FEED. A copy is kept in Netlify Blobs and refreshed hourly.
import { getStore } from '@netlify/blobs';
import { OFFICES, type Office } from '../../src/data/staff-access.ts';

const store = () => getStore({ name: 'dashboards', consistency: 'strong' });
const MAX_AGE_MS = 75 * 60 * 1000; // older than this → fetch fresh on the next visit

export const feedUrl = () => Netlify.env.get('OFFICE_DASHBOARD_FEED') || '';
export const hasDashboard = (office: Office) => !!OFFICES.find((o) => o.id === office)?.dashboard;

export async function fetchFeed(office: Office): Promise<any> {
  const base = feedUrl();
  if (!base) throw new Error('OFFICE_DASHBOARD_FEED is not set');
  const u = new URL(base);
  u.searchParams.set('office', office);
  const r = await fetch(u, { redirect: 'follow' });
  const data = await r.json().catch(() => null);
  if (!r.ok || !data || data.error || !Array.isArray(data.training)) throw new Error('feed: ' + (data?.error || r.status));
  return data;
}

export async function refresh(office: Office) {
  const data = await fetchFeed(office);
  await store().setJSON(office, { fetchedAt: Date.now(), data });
  return data;
}

/** Cached dashboard data; refreshes when older than ~an hour (previews have no scheduled refresh). */
export async function getDashboard(office: Office): Promise<{ data: any; fetchedAt: number; stale?: boolean } | null> {
  const cached = (await store().get(office, { type: 'json' })) as { fetchedAt: number; data: any } | null;
  if (cached && Date.now() - cached.fetchedAt < MAX_AGE_MS) return cached;
  try {
    const data = await refresh(office);
    return { data, fetchedAt: Date.now() };
  } catch (e) {
    console.error('dashboard refresh failed', office, e);
    return cached ? { ...cached, stale: true } : null;
  }
}

export async function sendSuggestion(office: Office, topic: string, by: string) {
  const base = feedUrl();
  if (!base) throw new Error('OFFICE_DASHBOARD_FEED is not set');
  // Apps Script answers POSTs with a redirect to the result; follow it.
  const r = await fetch(base, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify({ type: 'suggestion', office, topic, by }), redirect: 'follow' });
  const data = await r.json().catch(() => null);
  if (!data?.ok) throw new Error('suggestion: ' + (data?.error || r.status));
}
