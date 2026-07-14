/**
 * Strip HTML tags from a string for safe display
 * Uses regex to remove HTML tags - safe approach without DOM parsing
 *
 * @param {string} text - The string potentially containing HTML tags
 * @returns {string} - The string with HTML tags removed
 */
const stripHtmlTags = (text) => {
  if (!text) return '';
  // Remove HTML tags using regex
  return text
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim();
};

export default stripHtmlTags;
