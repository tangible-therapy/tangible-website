# Tangible Therapy website

Read docs/context/website-context.md before making any change. The website chatbot is documented in docs/context/chatbot.md. It explains how the site is built, where things live, the forms and alerts, and the rules below in detail.

Key rules:
- Work on a new branch, open a pull request, and give the owner the Netlify Deploy Preview link (https://deploy-preview-<PR#>--quiet-unicorn-d26839.netlify.app). Merge to main only after the owner approves; merging publishes the live site.
- Never deploy to Netlify directly.
- Never put passwords, logins, API keys or personal data in the repo. Don't type passwords or approve Google/OAuth permissions for the owner.
- Keep existing URLs; add a 301 in netlify.toml if a page moves or is removed.
- `npm run build` must pass. Check 1440, ~1280, ~1024 and 390px wide before sharing a preview.
- Explain changes in plain, non-technical language.
- If a change alters how the site works (forms, staff pages, alert recipients, registration flows...), update docs/context/website-context.md in the same pull request and tell the owner to refresh the project file "Website context - read first".
