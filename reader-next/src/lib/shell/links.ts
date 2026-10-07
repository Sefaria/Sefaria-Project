/**
 * Where the header's destinations live. Pages this client does not have yet (Texts, Topics, search, accounts…) are the
 * old site's, so every link works from day one; as pages arrive here a link stops pointing out.
 *
 * @feature GUI-002 Desktop site header
 * @feature GUI-009 Module switcher
 */
import { PUBLIC_CONFIG, SITE_ORIGIN } from "~/lib/config";
export const LIBRARY = SITE_ORIGIN;
/** The Voices site of this deployment (src/lib/config.ts: PUBLIC_VOICES_ORIGIN). */
export const VOICES = PUBLIC_CONFIG.voicesOrigin;
export const DEVELOPERS = "https://developers.sefaria.org";
export const DONATE = "https://donate.sefaria.org/give/451346/#!/donation/checkout";
export const HELP = { english: "https://help.sefaria.org/hc/en-us", hebrew: "https://help.sefaria.org/hc/he" } as const;

export const donateHref = (source: "Header" | "MobileNavMenu") => `${DONATE}?c_src=${source}`;
export const searchHref = (q: string) => `${LIBRARY}/search?q=${encodeURIComponent(q)}&tab=text`;
/** The server route that sets the interface language and comes back (RTE-034). */
export const interfaceHref = (lang: "english" | "hebrew", next: string) => `/interface/${lang}?next=${encodeURIComponent(next)}`;
