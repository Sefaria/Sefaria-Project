import { describe, expect, it } from 'vitest';
import { formatReach, parseReach } from '../reach';

describe('parseReach', () => {
  it.each([
    ["None, it's mostly a proof of concept", 'poc'],
    ['Proof of Concept', 'poc'],
    ['<10', 'lt10'],
    ['< 10', 'lt10'],
    ['5', 'lt10'],
    ['10', '10'],
    ['~10', '10'],
    ['~50', '10'],
    ['100', '100'],
    ['~100', '100'],
    ['300', '100'],
    ['1000', '1000'],
    ['1,000+', '1000'],
    ['5000', '1000'],
    ['', null],
    ['  ', null],
    [null, null],
    [undefined, null],
    ['None', null],
    ['lots', null],
  ])('%j -> %j', (raw, bucket) => {
    expect(parseReach(raw)).toBe(bucket);
  });
});

describe('formatReach', () => {
  it('labels every bucket', () => {
    expect(formatReach('poc')).toBe('Proof of concept');
    expect(formatReach('lt10')).toBe('Fewer than 10 users');
    expect(formatReach('10')).toBe('About 10 users');
    expect(formatReach('100')).toBe('About 100 users');
    expect(formatReach('1000')).toBe('1,000+ users');
  });
});
