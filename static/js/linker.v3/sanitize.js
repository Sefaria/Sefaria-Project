import DOMPurify from 'dompurify';

/**
 * Reduces an HTML element to plain text. The element is run through DOMPurify with the html
 * profile first, then re-parsed as inert markup so only text content is returned.
 */
export function sanitizeElem(elem) {
    const cleaned = DOMPurify.sanitize(elem, { USE_PROFILES: { html: true } });
    const cleanedElem = document.createElement("div");
    cleanedElem.innerHTML = cleaned;
    return cleanedElem.textContent;
}
