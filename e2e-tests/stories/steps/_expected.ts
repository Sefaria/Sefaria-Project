// ASSERTION LAYER (locked during implementation): the expected copy the steps check,
// named by translation key. support/copy.ts only looks keys up.
import { LANGUAGES } from '../../globals';
import { copy } from '../support/copy';

export const KEYS = {
  askLabel: 'assistant.floating_button.label',
  searchLabel: 'assistant.floating_button.search_label',
  readyAnnouncement: 'assistant.header.response_ready_announcement',
  openReadyName: 'assistant.header.open_ready_response',
  loadingHistory: 'assistant.messages.loadingHistory',
  limitReached: 'assistant.anon.limit_reached',
  loginButton: 'assistant.anon.login_button',
  headerPill: 'header.library_assistant',
  /** Expected key for the no-results question wrapper once it reaches Weblate (not there yet). */
  searchQuestion: 'assistant.floating_button.search_question',
  nullBody: (tab: string) => `search.null.${tab}.body`,
  nullBodyAssistant: (tab: string) => `search.null.${tab}.body.library_assistant`,
  nullButton: (tab: string) => `search.null.${tab}.button`,
};

/**
 * The no-results question wrapper, from the spec (LA-NULL-6) because it has no key
 * yet. Replace with the key once it reaches Weblate.
 */
export const NULL_SEARCH_QUESTION_WRAPPER_EN = 'I searched for "{query}" on Sefaria and got no results…';

/** The question sent for a search with no results. Hebrew needs the key (CopyKeyMissing until then). */
export const nullSearchQuestion = (query: string, lang: string = LANGUAGES.EN): string => {
  let wrapper: string;
  try { wrapper = copy(KEYS.searchQuestion, lang); }
  catch (e) { if (lang === LANGUAGES.HE) throw e; wrapper = NULL_SEARCH_QUESTION_WRAPPER_EN; }
  return wrapper.replace('{query}', query);
};
