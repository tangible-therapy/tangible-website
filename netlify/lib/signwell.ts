// SignWell API helpers shared by /api/new-hire-contract and /api/signwell-webhook.
// Netlify env var SIGNWELL_API_KEY (never in the repo).
import { callScript } from './new-hire.ts';

const API = 'https://www.signwell.com/api/v1';
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const EMAIL = /^[^\s@<>()]+@[^\s@<>()]+\.[a-z]{2,}$/i;

export async function signwell(path: string, init: RequestInit = {}) {
  const key = Netlify.env.get('SIGNWELL_API_KEY');
  if (!key) throw new Error('SignWell isn’t connected yet (see docs/new-hire-folder).');
  const r = await fetch(API + path, { ...init, headers: { 'X-Api-Key': key, accept: 'application/json', 'content-type': 'application/json', ...(init.headers || {}) } });
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    let err: any = null;
    try { err = JSON.parse(text); } catch {}
    // 422s carry a nested "errors" object, e.g. { errors: { recipients: { recipient_2: { email: ['format is invalid.'] } } } }
    const parts: string[] = [];
    const walk = (v: any, path: string) => {
      if (v == null) return;
      if (typeof v === 'string') parts.push(path ? `${path}: ${v}` : v);
      else if (Array.isArray(v)) v.forEach((x) => walk(x, path));
      else if (typeof v === 'object') Object.entries(v).forEach(([k, x]) => walk(x, path ? `${path} ${k}` : k));
    };
    walk(err?.errors, '');
    const msg = parts.join('; ') || err?.meta?.messages?.join(' ') || err?.message || err?.error || (text && text.slice(0, 300)) || `SignWell answered ${r.status}.`;
    console.error('[signwell]', r.status, path, text.slice(0, 2000));
    throw new Error(r.status === 401 ? 'The SignWell API key isn’t accepted.' : `SignWell (${r.status}): ${msg}`);
  }
  return r;
}

// ---------- webhook (SignWell → /api/signwell-webhook) ----------
export const WEBHOOK_PATH = '/api/signwell-webhook';
let hooksCache: { at: number; hooks: { id: string; callback_url: string }[] } | null = null;

/** The account's registered webhooks (cached for a minute). */
export async function listHooks(): Promise<{ id: string; callback_url: string }[]> {
  if (hooksCache && Date.now() - hooksCache.at < 60_000) return hooksCache.hooks;
  const out = await (await signwell('/hooks')).json();
  const hooks = (Array.isArray(out) ? out : out?.hooks || out?.data || []).map((h: any) => ({ id: String(h.id), callback_url: String(h.callback_url || '') }));
  hooksCache = { at: Date.now(), hooks };
  return hooks;
}

/** Makes sure SignWell posts events to <siteUrl>/api/signwell-webhook. Only for the live site: previews are
 *  password-protected, so SignWell couldn't reach them (the page's "Check again" covers previews). */
export async function ensureWebhook(siteUrl: string): Promise<void> {
  const url = siteUrl.replace(/\/+$/, '') + WEBHOOK_PATH;
  const hooks = await listHooks();
  if (hooks.some((h) => h.callback_url.replace(/\/+$/, '') === url)) return;
  await signwell('/hooks', { method: 'POST', body: JSON.stringify({ callback_url: url }) });
  hooksCache = null;
  console.log('[signwell] webhook registered:', url);
}

/** If the SignWell document is completed and was sent from the onboarding page (metadata.folder_id), saves
 *  "Employment Contract - Name (signed).pdf" into their Drive folder (skipped if it's already there).
 *  Always reads the document from SignWell itself, so it never trusts what a caller says about it. */
export async function saveIfCompleted(id: string): Promise<{ doc: any; done: boolean; signedUrl: string | null }> {
  const doc = await (await signwell(`/documents/${id}`)).json();
  const done = /complete/i.test(String(doc.status || ''));
  let signedUrl: string | null = null;
  const folderId = doc.metadata?.folder_id;
  if (done && folderId) {
    const hire = String(doc.metadata?.hire || doc.recipients?.[doc.recipients.length - 1]?.name || 'employee');
    const pdf = await (await signwell(`/documents/${id}/completed_pdf`, { headers: { accept: 'application/pdf' } })).arrayBuffer();
    const saved = await callScript({ action: 'saveSigned', folderId, fileName: `Employment Contract - ${hire} (signed).pdf`, pdf: Buffer.from(pdf).toString('base64') });
    signedUrl = saved.url || null;
  }
  return { doc, done, signedUrl };
}
