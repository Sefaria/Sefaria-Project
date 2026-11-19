// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DISCORD_BODY_KEY,
  DISCORD_LINK_LABEL_KEY,
  DISCORD_SIGNUP_URL_KEY,
  DISCORD_STRINGS,
  discordBodyParts,
} from './strings';

// The portal keeps its own copy of the three interface strings it needs (PLAN Phase 5); they must stay
// equal to the main site's English strings.
const EN_JSON = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../static/js/sefaria/i18n/interface/en.json'
);

describe('Discord strings', () => {
  // en.json is flat: { "developer.common.discord_signup.url": "…", … }.
  const en = JSON.parse(fs.readFileSync(EN_JSON, 'utf8')) as Record<string, unknown>;

  it.each([DISCORD_SIGNUP_URL_KEY, DISCORD_LINK_LABEL_KEY, DISCORD_BODY_KEY] as const)('%s equals en.json', (key) => {
    expect(en[key]).toBe(DISCORD_STRINGS[key]);
  });

  it('links to the Formstack Discord signup form', () => {
    expect(DISCORD_STRINGS[DISCORD_SIGNUP_URL_KEY]).toMatch(
      /^https:\/\/sefaria\.formstack\.com\/forms\/sefaria_developer_discord_community$/
    );
  });

  it('splits the body sentence around the link', () => {
    expect(discordBodyParts()).toEqual(['', 'to talk with other developers building on Sefaria.']);
  });
});
