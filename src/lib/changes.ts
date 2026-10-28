import { micromark } from 'micromark';

// Review highlighting for staff content (Policies & Procedures, Orientation).
//
// In markdown text:
//   {+new or changed text+}   -> highlighted
//   {-removed text-}           -> shown struck through
//   a line ":::new" ... a line ":::"  -> a whole new block (headings, lists, paragraphs)
//
// While REVIEW is true the highlights show on the site so the owner can approve them.
// After approval: set REVIEW to false (removed text disappears, new text shows as normal),
// then optionally delete the markers from the content files.
export const REVIEW = false;

const inline = (html: string) =>
  REVIEW
    ? html
        .replace(/\{\+([\s\S]*?)\+\}/g, '<mark class="chg-add">$1</mark>')
        .replace(/\{-([\s\S]*?)-\}/g, '<del class="chg-del" title="Removed">$1</del>')
    : html.replace(/\{\+([\s\S]*?)\+\}/g, '$1').replace(/\{-([\s\S]*?)-\}\s?/g, '');

// Render markdown that may contain review markers.
export function renderWithChanges(src: string): string {
  const parts = src.split(/^[ \t]*:::(new)?[ \t]*$/m);
  // split with a capture group gives: text, 'new'|undefined, text, 'new'|undefined, ...
  let html = '';
  let inBlock = false;
  for (let i = 0; i < parts.length; i += 2) {
    const chunk = parts[i] ?? '';
    if (chunk.trim()) {
      const body = inline(micromark(chunk));
      html += inBlock && REVIEW ? `<div class="chg-block">${body}</div>` : body;
    }
    if (i + 1 < parts.length) inBlock = parts[i + 1] === 'new';
  }
  return html;
}
