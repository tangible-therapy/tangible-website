import { getCollection } from 'astro:content';

export async function getPosts() {
  const posts = await getCollection('blog', (p) => !p.data.draft);
  return posts
    .map((p) => ({ ...p, data: { ...p.data, urlPath: p.data.urlPath || `/feel-better-blog/${p.id}` } }))
    .sort((a, b) => +b.data.date - +a.data.date);
}

// Squarespace category/tag URLs use "+" for spaces, e.g. /feel-better-blog/category/Overall+Mental+Health
export const termSlug = (t: string) => t.replace(/ /g, '+').toLowerCase();

const plain = (md = '') =>
  md.replace(/<[^>]+>/g, ' ').replace(/!\[[^\]]*\]\([^)]*\)/g, ' ').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[#*_>`|]/g, '').replace(/\s+/g, ' ').trim();

// Short summary for cards: excerpt → SEO description → opening of the post
export function summary(p: { body?: string; data: { excerpt?: string; seoDescription?: string } }, max = 170) {
  const t = p.data.excerpt?.trim() || p.data.seoDescription?.trim() || plain(p.body);
  return t.length > max ? t.slice(0, t.lastIndexOf(' ', max - 3)) + '…' : t;
}
export const readMinutes = (p: { body?: string }) => Math.max(1, Math.round(plain(p.body).split(' ').length / 230));
export const fmtDate = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Denver' });
export const cleanAuthor = (a = '') => a.split(' — ')[0].replace(/ LCSW$/, '').trim();
