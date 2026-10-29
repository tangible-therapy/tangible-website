# Website chatbot (test version, added 28 Oct 2026)

"Tangie", a chat assistant with a toucan avatar (public/images/tangie-avatar.webp), in the bottom-right corner of every public page. Visitors ask practical questions (who has openings, insurance, cost, offices, booking) and an AI model answers from the website's own information.

## How it works
- **Bubble:** src/components/ChatWidget.astro, added in src/layouts/Base.astro on every page that isn't noindex (so not on staff pages). Turn it off everywhere with `chatbot: false` in src/data/site.ts.
- **What it knows:** src/pages/chat-knowledge.json.ts builds /chat-knowledge.json at every build: practice facts (the PRACTICE text in that file: phone, hours, offices, booking, costs, insurance), the menu pages, every therapist from the finder data (office, status, ages, who they see, specialties, approaches, insurance, gender, profile link) and the FAQs in src/data/page-schema.json. Because the sheet rebuilds the site, the bot's therapist info is as current as the finder. To change a fact the bot gives about the practice, edit PRACTICE.
- **Back end:** netlify/functions/chat.mts at /api/chat. It sends the rules + that information + the last 12 messages to `claude-haiku-5-5` through **Netlify AI Gateway**. No AI account or API key: Netlify injects ANTHROPIC_API_KEY / ANTHROPIC_BASE_URL into functions and bills usage to the team's Netlify credits (180 credits per $1 of model usage). AI features must stay switched on in Netlify team settings.
- **Therapist matching is done in code:** the bot must call a `find_therapists` search (find() in chat.mts) with the visitor's requirements (office, insurance, age, couples/families, specialty, approach, gender) and may only recommend therapists that search returns. Matching uses the same sheet-based data as the finder (therapists/options in /chat-knowledge.json). This was added because the small model mixed up requirements when matching on its own.
- **Rules given to the bot** (RULES in chat.mts): answer only from the site information, no clinical advice, crisis -> 988 / 911 / SafeUT, never ask for personal or health details, suggest up to 3 therapists (accepting first) with profile links, short replies, stay on topic.
- **Crisis messages:** messages matching the CRISIS word list get a fixed reply (988, 911, SafeUT, office phone) without calling the AI.

- **Nudge:** 10 seconds after a page loads, a small "Hi, I'm Tangie! How can I help?" bubble pops up above the avatar, once per visit (sessionStorage key tc.prompted), and not if the visitor already opened the chat. Clicking it opens the chat; the x dismisses it. Change the wait with PROMPT_DELAY and the wording in the .tc-prompt markup in ChatWidget.astro.

## Privacy
- The function does not log or store what visitors type; it only logs token counts per reply ([chat] lines in Netlify > Logs > Functions). Netlify says AI Gateway does not store prompts or outputs.
- The conversation lives only in the visitor's browser tab (sessionStorage key tc.chat.v1) so it survives clicking to another page; it is gone when the tab closes.
- The panel tells visitors not to share personal or health details. Before treating this as more than a test, the owner should confirm whether a BAA is needed/available with Netlify and the model provider.

## Cost controls
- Small model, replies capped at 600 tokens with the model's extended thinking turned off, 600 characters per visitor message, last 12 messages only.
- The long information block is marked for prompt caching (re-reads cost about a tenth).
- Netlify rate limit: 12 messages per minute per visitor (config in chat.mts); only requests from the site's own pages are accepted.
- Rough cost: about 1-3 credits per question (a few cents at most). Check Netlify > Usage; consider turning off credit auto-recharge or setting a budget.

## Testing on a Deploy Preview
The bubble works on Deploy Previews too (the function and AI Gateway run there and use the same credits).
