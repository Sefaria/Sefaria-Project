// The "Join our Discord" button and its placements (brief §4.7, PLAN I-3; contracts C6 and C8).
// Text only, links to the Formstack Discord signup form in a new tab. Clicks are reported by the
// analytics module from the `data-discord-cta` attribute (C8 `discord_cta_click` with `placement`).
import { DISCORD_CTA_ATTRIBUTE, type DiscordPlacement } from '../analytics';
import {
  DISCORD_PLACEMENT_ATTRIBUTE,
  REQUEST_PANEL_PROMPT,
  discordButtonClassName,
  type DiscordButtonVariant,
} from './markup';
import { DISCORD_LABEL, DISCORD_SIGNUP_URL, discordBodyParts } from './strings';

export interface DiscordButtonProps {
  placement: DiscordPlacement;
  /** `primary` (navy, the default) or `secondary` (white, for purple surfaces: the homepage hero). */
  variant?: DiscordButtonVariant;
}

export function DiscordButton({ placement, variant = 'primary' }: DiscordButtonProps) {
  return (
    <a
      className={discordButtonClassName(variant)}
      href={DISCORD_SIGNUP_URL}
      target="_blank"
      rel="noopener noreferrer"
      {...{ [DISCORD_CTA_ATTRIBUTE]: placement }}
    >
      {DISCORD_LABEL}
    </a>
  );
}

/** Placement 3: the footer of the docs and reference sidebar, where live shows "Powered by ReadMe" (D-2). */
export function SidebarFooterDiscord() {
  return (
    <div
      className="dp-discord-placement dp-discord-sidebar-footer"
      {...{ [DISCORD_PLACEMENT_ATTRIBUTE]: 'sidebar_footer' }}
    >
      <DiscordButton placement="sidebar_footer" />
    </div>
  );
}

/** Placement 4: the end of a docs page, next to the feedback widget (D-7). Goes in DocPage's `discord` slot. */
export function DocsPageEndDiscord() {
  return <DiscordButton placement="docs_page_end" />;
}

/** Placement 5: the reference request panel, "Questions about this endpoint?" (D-3). */
export function RequestPanelDiscord() {
  return (
    <div
      className="dp-discord-placement dp-discord-placement--request-panel"
      {...{ [DISCORD_PLACEMENT_ATTRIBUTE]: 'reference_request_panel' }}
    >
      <p className="dp-discord-placement__text">{REQUEST_PANEL_PROMPT}</p>
      <DiscordButton placement="reference_request_panel" />
    </div>
  );
}

/** Placement 6: the contact page, below the form: "Join our Discord to talk with other developers…". */
export function ContactPageDiscord() {
  const [before, after] = discordBodyParts();
  return (
    <div
      className="dp-discord-placement dp-discord-placement--contact"
      {...{ [DISCORD_PLACEMENT_ATTRIBUTE]: 'contact_page' }}
    >
      {before && <span className="dp-discord-placement__text">{before}</span>}
      <DiscordButton placement="contact_page" />
      {after && <span className="dp-discord-placement__text">{after}</span>}
    </div>
  );
}
