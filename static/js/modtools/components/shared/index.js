/**
 * Shared components barrel export
 *
 * These components provide consistent UI patterns across all modtools.
 */
export { default as ModToolsSection } from './ModToolsSection';
export { default as StatusMessage } from './StatusMessage';
export { default as IndexSelector } from './IndexSelector';

// Utility function for safe HTML text extraction (re-exported for convenience)
export const stripHtmlTags = (text) => {
  if (!text) return '';
  return text
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim();
};
