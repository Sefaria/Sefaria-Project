// src/discord (PLAN §2.1, Phase 5; brief §4.7, I-3): the "Join our Discord" button and its six
// placements (C8 `DiscordPlacement`). Wiring for the Integrator:
//   home_hero, home_community   server-rendered in devportal/templates/devportal/home_body.html
//   sidebar_footer              <SidebarFooterDiscord /> at the bottom of the docs/reference sidebar
//   docs_page_end               <DocsPageEndDiscord /> in DocPage's `discord` slot
//   reference_request_panel     <RequestPanelDiscord /> in the request panel
//   contact_page                enhanceContactPageDiscord(body) on /page/contact-us
// mountDiscordPlacements(root) fills any empty [data-discord-placement] placeholder.
import './discord.css';

export {
  ContactPageDiscord,
  DiscordButton,
  DocsPageEndDiscord,
  RequestPanelDiscord,
  SidebarFooterDiscord,
  type DiscordButtonProps,
} from './DiscordButton';
export {
  DISCORD_BUTTON_CLASS,
  DISCORD_PLACEMENT_ATTRIBUTE,
  REQUEST_PANEL_PROMPT,
  discordButtonClassName,
  type DiscordButtonVariant,
} from './markup';
export { createDiscordLink, enhanceContactPageDiscord, mountDiscordPlacements } from './mount';
export {
  DISCORD_BODY_KEY,
  DISCORD_LABEL,
  DISCORD_LINK_LABEL_KEY,
  DISCORD_SIGNUP_URL,
  DISCORD_SIGNUP_URL_KEY,
  DISCORD_STRINGS,
  discordBodyParts,
} from './strings';
