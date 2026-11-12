/**
 * The three share targets of the Share view (old ShareBox): Facebook sharer, X, and a mail draft with the old
 * subject. VERIFIED strings: https://www.facebook.com/sharer/sharer.php?u=, https://twitter.com/share?url=,
 * mailto:?&subject=Text on Sefaria&body=<url> (the email body is not encoded, as on the old site).
 *
 * @feature CON-061 Share link and social options
 */
export function shareHrefs(url: string) {
  return {
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
    x: `https://twitter.com/share?url=${encodeURIComponent(url)}`,
    email: `mailto:?&subject=Text on Sefaria&body=${url}`,
  };
}
