// Class names and attributes shared by <DiscordButton> and the DOM placeholders (mount.ts).

export type DiscordButtonVariant = 'primary' | 'secondary';

export const DISCORD_BUTTON_CLASS = 'dp-discord-button';
export const DISCORD_PLACEMENT_ATTRIBUTE = 'data-discord-placement';
/** "Questions about this endpoint?" (D-3), the request panel's line. */
export const REQUEST_PANEL_PROMPT = 'Questions about this endpoint?';

export function discordButtonClassName(variant: DiscordButtonVariant = 'primary'): string {
  return `${DISCORD_BUTTON_CLASS} ${DISCORD_BUTTON_CLASS}--${variant}`;
}
