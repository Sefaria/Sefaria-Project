/* global module:readonly */
/*
 * Helpers for the legacy sheet page (sheets.js), which builds its DOM from HTML strings.
 * Stored values are escaped where they are plain text (attributes, tag names, option text) and
 * passed through a small allowlist where light formatting is intentionally allowed (titles,
 * highlighter text). Loaded as a plain script before sheets.js; also importable from tests.
 */
(function (root) {
  var ALLOWED_TAGS = {
    B: 1,
    STRONG: 1,
    I: 1,
    EM: 1,
    U: 1,
    BR: 1,
    SPAN: 1,
    P: 1,
    DIV: 1,
    SUP: 1,
    SUB: 1,
    SMALL: 1,
    BIG: 1,
    A: 1,
  };
  var DROP_WITH_CONTENT = { SCRIPT: 1, STYLE: 1, IFRAME: 1, OBJECT: 1, EMBED: 1, TEMPLATE: 1, NOSCRIPT: 1 };

  function escapeHtml(value) {
    if (value === null || value === undefined) {
      return '';
    }
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function isSafeHref(href) {
    return /^(https?:|mailto:|\/(?!\/)|#)/i.test(String(href).trim());
  }

  function cleanNode(node, doc) {
    var out = doc.createDocumentFragment();
    Array.prototype.forEach.call(node.childNodes, function (child) {
      if (child.nodeType === 3) {
        out.appendChild(doc.createTextNode(child.nodeValue));
      } else if (child.nodeType === 1) {
        var tag = child.tagName.toUpperCase();
        if (DROP_WITH_CONTENT[tag]) {
          return;
        }
        if (!ALLOWED_TAGS[tag]) {
          out.appendChild(cleanNode(child, doc));
          return;
        }
        var copy = doc.createElement(tag.toLowerCase());
        if (tag === 'A') {
          var href = child.getAttribute('href');
          if (href && isSafeHref(href)) {
            copy.setAttribute('href', href);
            copy.setAttribute('rel', 'noopener noreferrer');
          }
        }
        copy.appendChild(cleanNode(child, doc));
        out.appendChild(copy);
      }
    });
    return out;
  }

  // Returns markup limited to simple formatting tags: no event handlers, styles or scripts.
  // Parsed with DOMParser, which builds an inert document, so nothing runs while cleaning.
  function sanitizeHtml(value) {
    if (value === null || value === undefined) {
      return '';
    }
    var parsed = new DOMParser().parseFromString('<body>' + String(value) + '</body>', 'text/html');
    var holder = parsed.createElement('div');
    holder.appendChild(cleanNode(parsed.body, parsed));
    return holder.innerHTML;
  }

  var api = { escapeHtml: escapeHtml, sanitizeHtml: sanitizeHtml };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.sheetsSanitize = api;
})(typeof window !== 'undefined' ? window : this);
