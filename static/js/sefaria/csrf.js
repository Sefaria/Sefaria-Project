import Cookies from 'js-cookie';

/**
 * Returns the CSRF token to send in the X-CSRFToken header.
 *
 * Prefers the server-rendered `<meta name="csrf-token">` value (see base.html)
 * over the `csrftoken` cookie. Reading the cookie directly is unreliable when
 * more than one `csrftoken` cookie reaches the browser. That happens on a
 * cauldron (`*.cauldron.sefaria.org`): it inherits the parent-domain
 * `.sefaria.org` cookie set by production in addition to its own host-scoped
 * cookie. js-cookie (and hand-rolled cookie parsers) return the *first* match,
 * while Django's parse_cookie() keeps the *last* — so the header and the token
 * Django validates against disagree, yielding a 403.
 *
 * The meta tag is rendered from Django's own `{{ csrf_token }}`, which derives
 * from the same parsed value Django validates against, so the two always agree
 * regardless of how many duplicate cookies are present.
 */
export function getCsrfToken() {
  if (typeof document !== 'undefined') {
    const meta = document.querySelector('meta[name="csrf-token"]');
    if (meta && meta.content) {
      return meta.content;
    }
  }
  // Fallback for any page that doesn't render the meta tag.
  return Cookies.get('csrftoken');
}
