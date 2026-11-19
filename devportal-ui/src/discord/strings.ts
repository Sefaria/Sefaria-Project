// The portal's own copy of the three interface strings the Discord buttons use (PLAN Phase 5, brief §4.7).
// `strings.test.ts` asserts they equal static/js/sefaria/i18n/interface/en.json, and
// devportal/views/home.py holds the same copy for the server-rendered homepage.

export const DISCORD_SIGNUP_URL_KEY = 'developer.common.discord_signup.url';
export const DISCORD_LINK_LABEL_KEY = 'developer.about_you.community.discord.join_discord_link';
export const DISCORD_BODY_KEY = 'developer.about_you.community.discord.body';

export const DISCORD_STRINGS = {
  [DISCORD_SIGNUP_URL_KEY]: 'https://sefaria.formstack.com/forms/sefaria_developer_discord_community',
  [DISCORD_LINK_LABEL_KEY]: 'Join our Discord',
  [DISCORD_BODY_KEY]: '{join_discord_link} to talk with other developers building on Sefaria.',
} as const;

/** The Formstack Discord signup form (Q23). */
export const DISCORD_SIGNUP_URL = DISCORD_STRINGS[DISCORD_SIGNUP_URL_KEY];
/** The button's label. */
export const DISCORD_LABEL = DISCORD_STRINGS[DISCORD_LINK_LABEL_KEY];

const PLACEHOLDER = '{join_discord_link}';

/** The body sentence split around the link: "{join_discord_link} to talk with …" → ["", "to talk with …"]. */
export function discordBodyParts(): [before: string, after: string] {
  const body: string = DISCORD_STRINGS[DISCORD_BODY_KEY];
  const at = body.indexOf(PLACEHOLDER);
  if (at < 0) return [body.trim(), ''];
  return [body.slice(0, at).trim(), body.slice(at + PLACEHOLDER.length).trim()];
}
