import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// Therapists — one Markdown file per person in src/content/team/
const team = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/team' }),
  schema: z.object({
    name: z.string(),
    order: z.number().default(999),
    photo: z.string(),
    seoTitle: z.string().optional().default(''),
    seoDescription: z.string().optional().default(''),
    phone: z.string().optional().default(''),
    booking: z.boolean().default(true),
    categories: z.array(z.string()).default([]),
    hidden: z.boolean().default(false),
  }),
});

// Blog posts ("Feel Better Library") — one Markdown file per post in src/content/blog/
const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    author: z.string().optional().default(''),
    image: z.string().optional().default(''),
    // Description of the featured image for screen readers and Google Images
    imageAlt: z.string().optional().default(''),
    excerpt: z.string().optional().default(''),
    seoTitle: z.string().optional().default(''),
    seoDescription: z.string().optional().default(''),
    categories: z.array(z.string()).default([]),
    tags: z.array(z.string()).default([]),
    urlPath: z.string().optional(),
    // Set featured: true on a post to pin it to the top of the blog page
    featured: z.boolean().default(false),
    draft: z.boolean().default(false),
  }),
});

// CEU trainings
const products = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/products' }),
  schema: z.object({
    title: z.string(),
    collection: z.enum(['ceus']),
    slug: z.string(),
    order: z.number().default(999),
    price: z.number().default(0),
    images: z.array(z.string()).default([]),
    options: z.record(z.array(z.string())).default({}),
    categories: z.array(z.string()).default([]),
    seoTitle: z.string().optional().default(''),
    seoDescription: z.string().optional().default(''),
    cta: z.object({ label: z.string(), href: z.string() }).optional(),
  }),
});

export const collections = { team, blog, products };
