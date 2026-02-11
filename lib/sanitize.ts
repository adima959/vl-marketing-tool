import DOMPurify, { type Config } from 'dompurify';

/** Allowed tags for rich text content from TipTap editor */
const RICH_TEXT_CONFIG: Config = {
  ALLOWED_TAGS: [
    'p', 'br', 'strong', 'em', 'u', 's', 'del',
    'h1', 'h2', 'h3', 'h4',
    'ul', 'ol', 'li',
    'a', 'blockquote', 'code', 'pre',
    'span', 'div', 'sub', 'sup',
  ],
  ALLOWED_ATTR: ['href', 'target', 'rel', 'class', 'style'],
  ALLOWED_URI_REGEXP: /^(?:(?:f|ht)tps?|mailto|tel):/i,
};

/**
 * Sanitize HTML content from TipTap rich text editor before rendering
 * with dangerouslySetInnerHTML. Strips dangerous tags/attributes while
 * preserving formatting.
 */
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, RICH_TEXT_CONFIG);
}
