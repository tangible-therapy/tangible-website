// Team collection loader: the Markdown profiles in src/content/team/ PLUS the "website profiles"
// tab of the "tangible sheets" Google Sheet.
//
// For each row in that tab (matched by name, same spelling as the openings tab):
//   - Therapist with no website profile yet -> a new profile at /ourteam/p/<first-last>, but ONLY
//     once the Photo column has a Google Drive photo the feed can open. No photo = not on the site.
//   - Therapist who already has a profile -> any filled cell replaces that part of the profile
//     (photo, bio, credential, SEO description, SimplePractice ID, online booking, show/hide).
//     Blank cells keep what the .md file says.
// Photos are downloaded through the Apps Script feed, resized (max 1200 x 1600) and saved as WebP in
// public/images/team-sheet/ (generated at build time, not committed).
// Without THERAPIST_SHEET_FEED (local builds) the tab is read from the snapshot, but photos can't be
// downloaded, so only rows whose photo is already in public/images/team-sheet/ are used.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import type { Loader, LoaderContext } from 'astro/loaders';
import { loadFeed, fetchPhoto, feedUrl, openingsCredential, profileNameKey, sheetNameKey, slugify, clean, type ProfileRow } from './sheet-feed';

const PHOTO_DIR = 'images/team-sheet';
const yes = (v: string) => /^(y|yes|true|on|1)$/i.test(clean(v));
const no = (v: string) => /^(n|no|false|off|0)$/i.test(clean(v));

// Sheet cell text -> Markdown paragraphs (each line in the cell is a paragraph; "-" / "•" lines stay a list).
export function bioMarkdown(text: string): string {
  const lines = String(text ?? '').replace(/\r/g, '').split('\n').map((l) => l.trim()).filter(Boolean)
    .map((l) => l.replace(/^[•●▪◦*]\s*/, '- '));
  let out = '';
  lines.forEach((l, i) => {
    const bullet = l.startsWith('- ');
    const prevBullet = i > 0 && lines[i - 1].startsWith('- ');
    out += i === 0 ? l : (bullet && prevBullet ? '\n' : '\n\n') + l;
  });
  return out;
}

function seoFrom(name: string, bio: string): string {
  const first = name.split(' ')[0];
  const sentence = clean(bio).split(/(?<=[.!?])\s/)[0] ?? '';
  let s = `${name} is a therapist at Tangible Therapy in Utah. ${sentence}`.trim();
  if (s.length > 155) s = s.slice(0, 152).replace(/\s+\S*$/, '') + '…';
  return s || `Meet ${first}, a therapist at Tangible Therapy in Utah.`;
}

async function savePhoto(ctx: LoaderContext, p: ProfileRow, slug: string): Promise<string | null> {
  const file = `${slug}-${ctx.generateDigest(p.photoId + '|' + p.photoUpdated).slice(0, 8)}.webp`;
  const dir = path.join(fileURLToPath(ctx.config.publicDir), PHOTO_DIR);
  const dest = path.join(dir, file);
  const web = `/${PHOTO_DIR}/${file}`;
  try { await fs.access(dest); return web; } catch { /* not saved yet */ }
  if (!feedUrl()) return null;
  try {
    // Loaded with require: the content config runs inside Vite, which can't import sharp itself.
    const sharp = createRequire(import.meta.url)('sharp');
    const raw = await fetchPhoto(p.photoId);
    await fs.mkdir(dir, { recursive: true });
    await sharp(raw).rotate().resize({ width: 1200, height: 1600, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toFile(dest);
    return web;
  } catch (err) {
    ctx.logger.warn(`[team-sheet] Row ${p.row} (${p.name}): couldn't use the photo (${(err as Error).message}).`);
    return null;
  }
}

export function teamLoader(files: Loader): Loader {
  return {
    name: 'tangible-team',
    load: async (ctx) => {
      await files.load(ctx); // the .md profiles (this also clears entries added from the sheet last time)
      const { feed } = await loadFeed();
      const rows = (feed.profiles ?? []).filter((p) => clean(p.name));
      if (!rows.length) return;

      const byName = new Map<string, string>();
      for (const e of ctx.store.values()) byName.set(profileNameKey(String(e.data.name)), e.id);

      let added = 0, updated = 0, waiting = 0;
      for (const p of rows) {
        const name = clean(p.name);
        const existingId = byName.get(sheetNameKey(name)) ?? byName.get(profileNameKey(name));
        const existing = existingId ? ctx.store.get(existingId) : undefined;
        const slug = existingId ?? slugify(name);

        if (!existing) {
          // New therapist: only once the photo is in.
          if (!p.photoId) { waiting++; continue; }
          if (ctx.store.has(slug)) { ctx.logger.warn(`[team-sheet] Row ${p.row} (${name}): the web address /ourteam/p/${slug} is already used by another profile; skipped.`); continue; }
          const photo = await savePhoto(ctx, p, slug);
          if (!photo) { waiting++; continue; }
          const credential = clean(p.credential) || openingsCredential(feed, name);
          const full = credential ? `${name}, ${credential}` : name;
          const body = bioMarkdown(p.bio);
          const data = await ctx.parseData({
            id: slug,
            data: {
              name: full, photo, order: 900, seoTitle: full,
              seoDescription: clean(p.seoDescription) || seoFrom(name, p.bio),
              booking: !no(p.booking), hidden: no(p.show), categories: [],
              clinicianId: clean(p.clinicianId), source: 'sheet',
            },
          });
          ctx.store.set({ id: slug, data, body, rendered: await ctx.renderMarkdown(body), digest: ctx.generateDigest({ data, body }) });
          added++;
          continue;
        }

        // Existing profile: filled cells replace that part.
        const d = { ...(existing.data as Record<string, unknown>) };
        let body = existing.body ?? '';
        let changed = false;
        if (p.photoId) { const photo = await savePhoto(ctx, p, slug); if (photo) { d.photo = photo; changed = true; } }
        if (clean(p.credential)) {
          const base = String(d.name).split(',')[0].replace(/\s+[A-Z-]{3,}$/, '').trim();
          d.name = `${base}, ${clean(p.credential)}`;
          if (!d.seoTitle || String(d.seoTitle).startsWith(base)) d.seoTitle = d.name;
          changed = true;
        }
        if (clean(p.bio)) { body = bioMarkdown(p.bio); changed = true; }
        if (clean(p.seoDescription)) { d.seoDescription = clean(p.seoDescription); changed = true; }
        if (clean(p.clinicianId)) { d.clinicianId = clean(p.clinicianId); changed = true; }
        if (yes(p.booking) || no(p.booking)) { d.booking = yes(p.booking); changed = true; }
        if (yes(p.show) || no(p.show)) { d.hidden = no(p.show); changed = true; }
        if (!changed) continue;
        d.source = 'sheet';
        const data = await ctx.parseData({ id: slug, data: d });
        ctx.store.set({
          id: slug, data, body, filePath: existing.filePath,
          rendered: body === existing.body ? existing.rendered : await ctx.renderMarkdown(body),
          digest: ctx.generateDigest({ data, body }),
        });
        updated++;
      }
      ctx.logger.info(`[team-sheet] website profiles tab: ${added} new, ${updated} updated, ${waiting} waiting for a photo`);
    },
  };
}
