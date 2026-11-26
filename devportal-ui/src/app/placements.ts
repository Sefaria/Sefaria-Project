// W11's Discord placements in HTML that React does not render itself: the adopted server HTML of a page (a docs
// or custom page's body, the homepage). Placeholders React renders (DocPage's `discord` slot, the request panel)
// are filled through their slots (slots.tsx, endpoint.tsx), never from outside React.
import type { PagePayload } from '../contracts';
import { enhanceContactPageDiscord, mountDiscordPlacements } from '../discord';
import { BODY_ELEMENT_ID } from '../docs';

/** The custom page that gets the Discord line under its contact form (placement contact_page). */
export const CONTACT_PAGE_SLUG = 'contact-us';

/** The homepage's adopted body (src/home HomePage, devportal/home.html). */
const HOME_MAIN_SELECTOR = 'main#content';

/**
 * Fills any empty `[data-discord-placement]` placeholder in the page's server HTML and, on the contact page, adds
 * the Discord line after the Formstack frame. PortalPage runs it after every page render; both helpers leave
 * filled placements alone.
 */
export function mountPagePlacements(data: PagePayload, doc: Document = document): void {
  if (data.kind === 'home') {
    const main = doc.querySelector(HOME_MAIN_SELECTOR);
    if (main !== null) mountDiscordPlacements(main);
    return;
  }
  if (data.kind !== 'doc') return;
  const body = doc.getElementById(BODY_ELEMENT_ID);
  if (body === null) return;
  mountDiscordPlacements(body);
  if (data.section === 'page' && data.slug === CONTACT_PAGE_SLUG) enhanceContactPageDiscord(body);
}
