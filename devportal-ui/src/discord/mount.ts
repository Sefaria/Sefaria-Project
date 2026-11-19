// Filling Discord placeholders that other workstreams left in server-rendered or adopted HTML
// (`<div data-discord-placement="…"></div>`), without React: the button is a plain link, so plain DOM
// gives the same markup as <DiscordButton>. Only empty placeholders are filled, so calling this again,
// or on a placeholder React already filled, changes nothing.
import { DISCORD_CTA_ATTRIBUTE, DISCORD_PLACEMENTS, type DiscordPlacement } from '../analytics';
import {
  DISCORD_PLACEMENT_ATTRIBUTE,
  REQUEST_PANEL_PROMPT,
  discordButtonClassName,
  type DiscordButtonVariant,
} from './markup';
import { DISCORD_LABEL, DISCORD_SIGNUP_URL, discordBodyParts } from './strings';

const FORMSTACK_ORIGIN = 'https://sefaria.formstack.com/';

/** A Discord link element, the same markup as <DiscordButton>. */
export function createDiscordLink(
  doc: Document,
  placement: DiscordPlacement,
  variant: DiscordButtonVariant = 'primary'
): HTMLAnchorElement {
  const link = doc.createElement('a');
  link.className = discordButtonClassName(variant);
  link.href = DISCORD_SIGNUP_URL;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.setAttribute(DISCORD_CTA_ATTRIBUTE, placement);
  link.textContent = DISCORD_LABEL;
  return link;
}

function text(doc: Document, value: string, tag: 'p' | 'span' = 'span'): HTMLElement {
  const element = doc.createElement(tag);
  element.className = 'dp-discord-placement__text';
  element.textContent = value;
  return element;
}

/** Fills one placeholder with the content of its placement. */
function fill(element: Element, placement: DiscordPlacement): void {
  const doc = element.ownerDocument;
  const link = createDiscordLink(doc, placement, placement === 'home_hero' ? 'secondary' : 'primary');
  if (placement === 'reference_request_panel') {
    element.classList.add('dp-discord-placement', 'dp-discord-placement--request-panel');
    element.append(text(doc, REQUEST_PANEL_PROMPT, 'p'), link);
  } else if (placement === 'contact_page') {
    const [before, after] = discordBodyParts();
    element.classList.add('dp-discord-placement', 'dp-discord-placement--contact');
    if (before) element.append(text(doc, before));
    element.append(link);
    if (after) element.append(text(doc, after));
  } else {
    element.append(link);
  }
}

/**
 * Upgrades every empty `[data-discord-placement]` element under `root` (placements of contract C8;
 * unknown values are left alone). Returns the elements it filled.
 */
export function mountDiscordPlacements(root: ParentNode = document): Element[] {
  const filled: Element[] = [];
  for (const element of root.querySelectorAll(`[${DISCORD_PLACEMENT_ATTRIBUTE}]`)) {
    const placement = element.getAttribute(DISCORD_PLACEMENT_ATTRIBUTE);
    if (!(DISCORD_PLACEMENTS as readonly string[]).includes(placement ?? '')) continue;
    if (element.childElementCount > 0 || element.textContent?.trim()) continue;
    fill(element, placement as DiscordPlacement);
    filled.push(element);
  }
  return filled;
}

/**
 * Placement 6 on the contact page (`/page/contact-us`): adds the Discord line after the Formstack
 * contact frame in the page body, unless the body already has one. Returns the placement, or null when
 * the body has no Formstack frame.
 */
export function enhanceContactPageDiscord(body: ParentNode): Element | null {
  const existing = body.querySelector(`[${DISCORD_PLACEMENT_ATTRIBUTE}="contact_page"]`);
  if (existing) {
    mountDiscordPlacements(existing.parentNode ?? body);
    return existing;
  }
  const frame = [...body.querySelectorAll('iframe')].find((f) =>
    (f.getAttribute('src') ?? '').startsWith(FORMSTACK_ORIGIN)
  );
  if (!frame) return null;
  const placement = frame.ownerDocument.createElement('div');
  placement.setAttribute(DISCORD_PLACEMENT_ATTRIBUTE, 'contact_page');
  frame.after(placement);
  fill(placement, 'contact_page');
  return placement;
}
