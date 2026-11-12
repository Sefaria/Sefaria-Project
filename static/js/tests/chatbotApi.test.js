/* Testing done using Jest */
import { chatbotApiBaseUrl } from '../chatbotApi';

const BASE = 'https://la.example/api';
const preview = (v) => `https://${v}.ai-server.coolifydev.sefaria.org/api`;
const at = (search) => window.history.pushState({}, '', `/settings/library-assistant${search}`);

describe('chatbotApiBaseUrl', () => {
  afterEach(() => at(''));

  it('uses the version from the props', () => {
    expect(chatbotApiBaseUrl({ chatbot_version: '9298', chatbot_api_base_url: BASE })).toBe(preview(9298));
  });

  it('uses the version from the page URL when the props lack it', () => {
    at('?chatbot_version=9298');
    expect(chatbotApiBaseUrl({ chatbot_api_base_url: BASE })).toBe(preview(9298));
  });

  it('treats clear in the URL as no version', () => {
    at('?chatbot_version=clear');
    expect(chatbotApiBaseUrl({ chatbot_version: '9298', chatbot_api_base_url: BASE })).toBe(BASE);
  });

  it('ignores a non-integer version in the URL and in the props', () => {
    at('?chatbot_version=abc');
    expect(chatbotApiBaseUrl({ chatbot_api_base_url: BASE })).toBe(BASE);
    expect(chatbotApiBaseUrl({ chatbot_version: 'a.b/c', chatbot_api_base_url: BASE })).toBe(BASE);
  });

  it('gives the configured base when there is no version', () => {
    expect(chatbotApiBaseUrl({ chatbot_api_base_url: BASE })).toBe(BASE);
  });

  it('gives null when there is neither', () => {
    expect(chatbotApiBaseUrl({})).toBeNull();
    expect(chatbotApiBaseUrl()).toBeNull();
  });
});
