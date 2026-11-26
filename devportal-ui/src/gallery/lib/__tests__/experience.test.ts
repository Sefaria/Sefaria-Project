import { describe, expect, it } from 'vitest';
import { parseExperience } from '../experience';

describe('parseExperience', () => {
  it.each([
    ['None', 'none'],
    ['<5 years', 'beginner'],
    ['5-10 years', 'intermediate'],
    ['10+ years', 'advanced'],
    ['', null],
    [null, null],
    ['Experience Unspecified', null],
  ])('%j -> %j', (raw, level) => {
    expect(parseExperience(raw)).toBe(level);
  });
});
