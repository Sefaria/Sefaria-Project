/**
 * Returns the CSRF token to send in the X-CSRFToken header.
 *
 * Reads the server-rendered `<meta name="csrf-token">` value (see base.html;
 * standalone pages such as edit_text.html render their own copy). We do NOT
 * read the `csrftoken` cookie: it is unreliable when more than one `csrftoken`
 * cookie reaches the browser. That happens on a cauldron
 * (`*.cauldron.sefaria.org`): it inherits the parent-domain `.sefaria.org`
 * cookie set by production in addition to its own host-scoped cookie. js-cookie
 * (and hand-rolled cookie parsers) return the *first* match, while Django's
 * parse_cookie() keeps the *last* — so the header and the token Django
 * validates against disagree, yielding a 403.
 *
 * The meta tag is rendered from Django's own `{{ csrf_token }}`, which derives
 * from the same parsed value Django validates against, so the two always agree
 * regardless of how many duplicate cookies are present.
 *
 * There is intentionally no cookie fallback: every page that submits a token
 * renders the meta tag, and falling back to the cookie would silently
 * reintroduce the exact dual-cookie 403 this fix exists to prevent, on the
 * pages hardest to diagnose. A missing meta tag fails loudly instead.
 */
export function getCsrfToken() {
  if (typeof document !== 'undefined') {
    const meta = document.querySelector('meta[name="csrf-token"]');
    if (meta && meta.content) {
      return meta.content;
    }
  }
  console.warn('csrf-token meta tag missing — POST will likely 403. Add <meta name="csrf-token"> to this page.');
  return '';
}
