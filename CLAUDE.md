# Tangible Therapy website

Read docs/context/website-context.md before making any change. It explains how the site is built, where things live, the forms and alerts, and the rules below in detail. The website chatbot is documented in docs/context/chatbot.md.

Key rules:
- Work on a new branch, open a pull request, and give the owner the Netlify Deploy Preview link (https://deploy-preview-<PR#>--quiet-unicorn-d26839.netlify.app). Merge to main only after the owner approves; merging publishes the live site.
- Never deploy to Netlify directly.
- Never put passwords, logins, API keys or personal data in the repo. Don't type passwords or approve Google/OAuth permissions for the owner.
- Keep existing URLs; add a 301 in netlify.toml if a page moves or is removed.
- `npm run build` must pass. Check 1440, ~1280, ~1024 and 390px wide before sharing a preview.
- Explain changes in plain, non-technical language.
- Keep Tangie (the chatbot) in sync: if a change affects practice facts (prices, hours, offices, phone, booking, policies), update the PRACTICE text in src/pages/chat-knowledge.json.ts in the same pull request. Insurance plans live in src/data/insurance.ts (feeds the insurance page, its Google FAQ data and Tangie). See docs/context/chatbot.md. Never put staff-portal information in what Tangie knows; a build check (src/lib/chat-safety.ts) stops the build if it does.
- If a change alters how the site works (forms, staff pages, alert recipients, registration flows...), update docs/context/website-context.md in the same pull request and tell the owner to refresh the project file "Website context - read first".
