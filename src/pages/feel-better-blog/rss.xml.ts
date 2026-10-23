// RSS feed for the Feel Better Library (replaces Squarespace's /feel-better-blog?format=rss)
import type { APIRoute } from 'astro';
import { getPosts } from '../../lib/blog';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const GET: APIRoute = async () => {
  const site = 'https://tangiblementalhealth.com';
  const posts = await getPosts();
  const items = posts
    .map((p) => {
      const url = site + p.data.urlPath;
      return `<item><title>${esc(p.data.title)}</title><link>${url}</link><guid>${url}</guid><pubDate>${p.data.date.toUTCString()}</pubDate>${
        p.data.seoDescription || p.data.excerpt ? `<description>${esc(p.data.seoDescription || p.data.excerpt)}</description>` : ''
      }${p.data.author ? `<dc:creator>${esc(p.data.author)}</dc:creator>` : ''}</item>`;
    })
    .join('');
  const xml = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel><title>Feel Better Library | Tangible Therapy</title><link>${site}/feel-better-blog</link><description>Articles from the therapists at Tangible Therapy.</description>${items}</channel></rss>`;
  return new Response(xml, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } });
};
