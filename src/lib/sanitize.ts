import DOMPurify from 'dompurify';

/**
 * Strips all HTML tags and dangerous content from a plain-text user input.
 * Use this before storing or displaying any free-text from users.
 */
export function sanitizeText(input: string): string {
  // First strip all HTML, then trim whitespace
  return DOMPurify.sanitize(input, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] }).trim();
}
