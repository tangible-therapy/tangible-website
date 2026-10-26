import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://tangiblementalhealth.com',
  // Pages build to /about-tangible.html etc. so URLs match Squarespace exactly (no trailing slash).
  build: { format: 'file' },
  trailingSlash: 'never',
  integrations: [
    sitemap({
      filter: (page) => !/\/(404|orientation|employeeportal|digital-products-2|onboarding|reception-portal|reception-onboarding|scheduling-new-client|crisis-call)/.test(page),
    }),
  ],
});
