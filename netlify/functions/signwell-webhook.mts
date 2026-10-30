// /api/signwell-webhook — SignWell posts document events here. The live site registers this address with
// SignWell automatically the first time it sends a contract (ensureWebhook in netlify/lib/signwell.ts). On "document_completed" for a contract sent from /reception-onboarding,
// the signed PDF is saved straight into the new hire's Drive folder — nobody has to open the page.
//
// Public on purpose (SignWell can't sign in), so it never trusts the posted data: it only takes the document
// id, then reads that document from SignWell with our API key and saves it only if SignWell says it's
// completed and it carries our folder_id. The event hash is checked too (HMAC-SHA256 of "<type>@<time>"
// with the webhook id, per SignWell's docs).
// Always answers 200 for events it ignores, so SignWell doesn't keep retrying them.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { saveIfCompleted, listHooks, WEBHOOK_PATH, UUID } from '../lib/signwell.ts';

const ok = (body: Record<string, unknown> = { ok: true }) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export default async (req: Request) => {
  if (req.method !== 'POST') return new Response('SignWell webhook', { status: 200 });
  const p = await req.json().catch(() => null as any);
  const type = String(p?.event?.type || '');
  const id = String(p?.data?.object?.id || '');

  if (type !== 'document_completed' || !UUID.test(id)) return ok({ ok: true, ignored: type || 'no event' });
  if (!Netlify.env.get('SIGNWELL_API_KEY') || !Netlify.env.get('NEW_HIRE_FOLDER_SCRIPT')) return ok({ ok: true, ignored: 'not set up' });

  try {
    // Event hash: HMAC-SHA256 of "<type>@<time>" keyed with the webhook id. The id comes from
    // SIGNWELL_WEBHOOK_ID if set, otherwise from SignWell's own list of this account's webhooks.
    const ids = Netlify.env.get('SIGNWELL_WEBHOOK_ID') ? [Netlify.env.get('SIGNWELL_WEBHOOK_ID') as string]
      : (await listHooks()).filter((h) => h.callback_url.includes(WEBHOOK_PATH)).map((h) => h.id);
    const got = String(p?.event?.hash || '');
    const valid = ids.some((k) => {
      const expected = createHmac('sha256', k).update(`${type}@${p?.event?.time}`).digest('hex');
      return got.length === expected.length && timingSafeEqual(Buffer.from(got), Buffer.from(expected));
    });
    if (!valid) {
      console.warn('[signwell-webhook] bad hash for', type, id);
      return new Response(JSON.stringify({ error: 'bad hash' }), { status: 401, headers: { 'content-type': 'application/json' } });
    }

    const { done, signedUrl } = await saveIfCompleted(id);
    console.log('[signwell-webhook]', id, done ? (signedUrl ? 'saved' : 'completed, not from onboarding') : 'not completed');
    return ok({ ok: true, saved: !!signedUrl });
  } catch (e) {
    console.error('[signwell-webhook]', id, (e as Error).message);
    // 500 so SignWell retries later (e.g. Google was briefly unavailable).
    return new Response(JSON.stringify({ error: 'save failed' }), { status: 500, headers: { 'content-type': 'application/json' } });
  }
};

export const config = { path: '/api/signwell-webhook' };
