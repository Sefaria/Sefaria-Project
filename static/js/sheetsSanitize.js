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

  // Media URL allowlist. Mirrors sefaria/sheet_media.py (is_safe_media_url): https only (http and
  // protocol-relative URLs are upgraded first), no credentials or markup characters, and either a known
  // embed host with an embeddable path or an image or mp3 file on any host. Every place that builds
  // media markup or an iframe/audio/img src must go through safeMediaUrl first.
  var EMBED_HOSTS = {
    'www.youtube.com': { prefixes: ['/embed/'], kind: 'youtube' },
    'youtube.com': { prefixes: ['/embed/'], kind: 'youtube' },
    'player.vimeo.com': { prefixes: ['/video/'], kind: 'vimeo' },
    'w.soundcloud.com': { prefixes: ['/player/'], kind: 'soundcloud' },
    'open.spotify.com': { prefixes: ['/embed/'], kind: 'spotify' },
    'bandcamp.com': { prefixes: ['/EmbeddedPlayer'], kind: 'bandcamp' },
  };
  var FILE_KINDS = {
    '.png': 'image',
    '.jpg': 'image',
    '.jpeg': 'image',
    '.gif': 'image',
    '.webp': 'image',
    '.mp3': 'audio',
  };
  var FORBIDDEN_MEDIA_CHARS = /[\s"'<>`\\]/;

  function normalizeMediaUrl(url) {
    if (typeof url === 'string') {
      if (url.indexOf('//') === 0) {
        return 'https:' + url;
      }
      if (url.slice(0, 7).toLowerCase() === 'http://') {
        return 'https://' + url.slice(7);
      }
    }
    return url;
  }

  // Returns {url, kind} for an allowed media URL (url is the https-normalised form), else null.
  // kind is one of image, audio, youtube, vimeo, soundcloud, spotify, bandcamp.
  function parseMediaUrl(url) {
    var normalized = normalizeMediaUrl(url);
    if (typeof normalized !== 'string' || !normalized || FORBIDDEN_MEDIA_CHARS.test(normalized)) {
      return null;
    }
    var parsed;
    try {
      parsed = new URL(normalized);
    } catch (e) {
      return null;
    }
    var host = parsed.hostname.toLowerCase();
    if (parsed.protocol !== 'https:' || !host || parsed.username || parsed.password) {
      return null;
    }
    if (Object.prototype.hasOwnProperty.call(EMBED_HOSTS, host)) {
      var embed = EMBED_HOSTS[host];
      var ok = embed.prefixes.some(function (prefix) {
        return parsed.pathname.indexOf(prefix) === 0;
      });
      return ok ? { url: normalized, kind: embed.kind } : null;
    }
    var path = parsed.pathname.toLowerCase();
    for (var ext in FILE_KINDS) {
      if (Object.prototype.hasOwnProperty.call(FILE_KINDS, ext) && path.slice(-ext.length) === ext) {
        return { url: normalized, kind: FILE_KINDS[ext] };
      }
    }
    return null;
  }

  function safeMediaUrl(url) {
    var parsed = parseMediaUrl(url);
    return parsed ? parsed.url : null;
  }

  function isSafeMediaUrl(url) {
    return parseMediaUrl(url) !== null;
  }

  var api = {
    escapeHtml: escapeHtml,
    sanitizeHtml: sanitizeHtml,
    parseMediaUrl: parseMediaUrl,
    safeMediaUrl: safeMediaUrl,
    isSafeMediaUrl: isSafeMediaUrl,
  };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.sheetsSanitize = api;
})(typeof window !== 'undefined' ? window : this);
