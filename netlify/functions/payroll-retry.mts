// Every 15 minutes (production only): re-send Submit Hours submissions that couldn't reach the payroll sheets
// (Netlify Blobs store "payroll-outbox", see netlify/lib/payroll-hours.ts). Each person's latest one is kept
// until it goes through.
import { allQueued, retry, payrollConfigured } from '../lib/payroll-hours.ts';

export default async () => {
  if (!payrollConfigured()) return;
  for (const item of await allQueued()) {
    const ok = await retry(item);
    console.log(`[payroll-retry] ${item.body.periodTab}: ${ok ? 'sent' : 'still waiting'} (try ${item.tries + (ok ? 0 : 1)})`);
  }
};

export const config = { schedule: '*/15 * * * *' };
