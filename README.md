# Tangible Therapy website

The tangiblementalhealth.com site, rebuilt from Squarespace as a static [Astro](https://astro.build) site.
Every page, therapist profile, blog post, and URL from the Squarespace site is carried over.

## Run it locally

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # outputs the finished site to dist/
```

## Where things live

| What | File(s) |
|---|---|
| Header menu, phone, email, offices, tracking IDs | `src/data/site.ts` |
| Employee Portal buttons and Online Learning sites | `src/data/staff.ts` |
| Therapists (one file each) | `src/content/team/<slug>.md` |
| Therapist office/specialty filters | `src/data/team-categories.json` |
| Blog posts ("Feel Better Library") | `src/content/blog/<slug>.md` |
| CEU trainings | `src/content/products/ceus--*.md` |
| Regular pages (services, offices, careers…) | `src/pages/<url>.astro` |
| Footer | `src/components/Footer.astro` |
| Colors, fonts, layout styles | `src/styles/global.css` |
| Images | `public/images/` |
| Redirects, headers, hosting config | `netlify.toml` |

### Common edits

- **Add a therapist:** copy an existing file in `src/content/team/` and change the name, photo, bio and `categories` (e.g. `orem-office/anxiety`, `current-openings`). They show up automatically in the directory, the filter pages, and every "current openings" carousel that matches.
- **Remove or hide a therapist:** delete their file, or add `hidden: true` to the front matter.
- **Add a blog post:** create `src/content/blog/my-post.md` with `title`, `date`, `image`, `categories` and `urlPath: "/feel-better-blog/my-post"`.
- **Edit page text:** open the page in `src/pages/`. Each section is a `<section class="sec t-…">` and each block is a `<div class="b" style="--d:…;--m:…">`. The `--d` value is the block's desktop grid position and `--m` is its mobile position, using the same 24-column grid Squarespace used.

### Page building blocks

- `t-white`, `t-light`, `t-black`, `t-bright`, `t-dark` … set the section color theme. These are the same theme names Squarespace used.
- `<Summary kind="team" category="telehealth/anxiety" limit={9} design="carousel" />` shows a live list of therapists.
- `<Divider type="wavy" height={6} fill="#fff" />` adds the curved bottom edge on a section.
- Forms are plain HTML with `data-netlify="true"`. Netlify collects submissions automatically.

## Hosting (Netlify)

1. Push this folder to a GitHub repo.
2. In Netlify, choose **Add new site → Import from Git** and pick the repo. The build settings are read from `netlify.toml`.
3. Under **Forms**, turn on form detection and set up email notifications to frontdesk@.
4. Under **Domain management**, add `tangiblementalhealth.com` and follow the DNS steps.

## Notes from the migration

- Booking still goes through SimplePractice (`tangible.clientsecure.me`), and the widgets are embedded as before.
- Google Tag Manager, both GA4 properties, the Meta Pixel, CallRail and the Elfsight reviews widget are all carried over.
- Staff pages (`/employeeportal`, `/onboarding`, `/digital-products-2`, `/files/*`, `/reception-portal`, `/reception-onboarding`, `/scheduling-new-client`, `/crisis-call`) sit behind one shared staff password, handled by `netlify/edge-functions/staff-gate.ts` (works on Netlify's free plan). Set the password in Netlify → Site configuration → Environment variables → `STAFF_PASSWORD`. Changing it signs everyone out. Still don't store other logins on these pages; use a password manager.
