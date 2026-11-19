/**
 * The Hebrew site's origin for a Library origin, as Django's hreflang alternates write it (DOMAIN_LANGUAGES: www.sefaria.org for
 * English, www.sefaria.org.il for Hebrew). Only sefaria.org / www.sefaria.org get ".il"; another host (localhost, a cauldron) has no
 * Hebrew twin and is returned as it is.
 *
 * @feature CAL-001 Learning Schedules page (its head's hreflang alternates)
 */
export function hebrewSiteOrigin(origin: string): string {
  try {
    const u = new URL(origin);
    if (!/^(www\.)?sefaria\.org$/.test(u.hostname)) return origin.replace(/\/+$/, "");
    u.hostname = `${u.hostname}.il`;
    return u.origin;
  } catch {
    return origin;
  }
}
