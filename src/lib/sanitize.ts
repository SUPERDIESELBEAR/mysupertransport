import DOMPurify from 'dompurify';

/**
 * Strips all HTML tags and dangerous content from a plain-text user input.
 * Use this before storing or displaying any free-text from users.
 */
export function sanitizeText(input: string): string {
  // First strip all HTML, then trim whitespace
  return DOMPurify.sanitize(input, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] }).trim();
}

/**
 * Sanitize TipTap / rich-text HTML before rendering with dangerouslySetInnerHTML.
 * Allowlists the formatting tags TipTap emits and strips scripts, event handlers,
 * javascript: URLs, and other XSS vectors.
 */
const RICH_TEXT_ALLOWED_TAGS = [
  'p', 'br', 'hr', 'span', 'div',
  'strong', 'b', 'em', 'i', 'u', 's', 'sub', 'sup', 'mark', 'small', 'code', 'pre',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li',
  'blockquote',
  'a',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
  'img',
];

const RICH_TEXT_ALLOWED_ATTR = ['href', 'target', 'rel', 'title', 'class', 'style', 'src', 'alt', 'width', 'height', 'colspan', 'rowspan'];

export function sanitizeRichHtml(input: string | null | undefined): string {
  if (!input) return '';
  return DOMPurify.sanitize(input, {
    ALLOWED_TAGS: RICH_TEXT_ALLOWED_TAGS,
    ALLOWED_ATTR: RICH_TEXT_ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur'],
  });
}
