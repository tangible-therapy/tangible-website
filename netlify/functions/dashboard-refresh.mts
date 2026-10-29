// Every hour (production only): copy each connected office's Team Dashboard sheet into Netlify Blobs,
// so the portal loads fast and doesn't depend on Google at visit time. No site rebuild, so no deploy credits.
import { refresh } from '../lib/dashboard.ts';
import { OFFICES } from '../../src/data/staff-access.ts';

export default async () => {
  for (const o of OFFICES.filter((x) => x.dashboard)) {
    try { await refresh(o.id); } catch (e) { console.error('dashboard refresh failed', o.id, e); }
  }
};

export const config = { schedule: '@hourly' };
