import { describe, expect, it } from 'vitest';

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

// [foreground, background, minimum ratio, what it is]
const PAIRS: Array<[string, string, number, string]> = [
  ['#ffffff', '#653259', 9.7, 'white on brand purple (hero, footer, CTA)'],
  ['#ffffff', '#4e2544', 11, 'white on brand purple hover'],
  ['#653259', '#ffffff', 9.7, 'brand purple text and outline on white'],
  ['#ffffff', '#7c416f', 7, 'white on AI & Apps category purple'],
  ['#775d0d', '#fdf8e9', 5.8, 'bug icon on the known-issues notice'],
  ['#3f7653', '#ffffff', 4.5, 'Extensions & API chip text on white'],
  ['#121212', '#fdf8e9', 15, 'text on the known-issues notice'],
];

describe('contrast', () => {
  it.each(PAIRS)('%s on %s is at least %d:1 (%s)', (fg, bg, min) => {
    expect(ratio(fg, bg)).toBeGreaterThanOrEqual(min);
  });

  it('white on #653259 is 9.75:1', () => {
    expect(ratio('#ffffff', '#653259')).toBeCloseTo(9.75, 1);
  });
});
