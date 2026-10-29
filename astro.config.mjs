import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import staffKnowledge from './src/integrations/staff-knowledge.mjs';

export default defineConfig({
  site: 'https://tangiblementalhealth.com',
  // Pages build to /about-tangible.html etc. so URLs match Squarespace exactly (no trailing slash).
  build: { format: 'file' },
  trailingSlash: 'never',
  integrations: [
    // Private information file for the staff chatbot (generated/staff-knowledge.json, never published)
    staffKnowledge(),
    sitemap({
      filter: (page) => !/\/(404|orientation|employeeportal|digital-products-2|onboarding|reception-portal|reception-onboarding|scheduling-new-client|crisis-call|staff-admin|staff-login|hours)/.test(page),
    }),
  ],
});
