import { describe, expect, it } from 'vitest';
import { madeWithText } from '../madeWith';

describe('madeWithText', () => {
  it('joins the first two resources', () => {
    expect(madeWithText({ resources: ['/api/calendars', '/api/v3/texts', '/api/related'] })).toBe(
      'Made with /api/calendars · /api/v3/texts'
    );
    expect(madeWithText({ resources: ['Sefaria-Export'] })).toBe('Made with Sefaria-Export');
  });

  it('falls back to "Sefaria texts"', () => {
    expect(madeWithText({ resources: [] })).toBe('Made with Sefaria texts');
  });
});
