import { getCollection } from 'astro:content';

export const STORES = {
  ceus: {
    title: "Virtual CEU's",
    seoTitle: "Free Virtual CEU's | Tangible Therapy",
    description:
      "Free virtual CEU's offered for mental health professionals in Utah. Find CEU's on topics like OCD, imposter syndrome, ethics and suicide prevention.",
    // Default button for CEUs without their own link (set `cta:` in the product's Markdown file)
    cta: { label: 'Learn More', href: '/ceu' },
  },
} as const;

export async function getProducts(store: keyof typeof STORES) {
  return (await getCollection('products', (p) => p.data.collection === store)).sort((a, b) => a.data.order - b.data.order);
}
